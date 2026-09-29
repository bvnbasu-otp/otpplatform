import {
  SupplierDiscoverySourceKind,
  SUPPLIER_DISCOVERY_BUYER_LABELS,
  OndcIntegrationState,
  type SupplierDiscoveryRequest,
  type SupplierNetworkProvider,
  type SupplierNetworkProviderResult,
} from '@otp/domain';
import { OndcNetworkService, type OndcServiceOptions } from '../../ondc/ondc-network-service';

export interface OndcSupplierProviderOptions extends OndcServiceOptions {
  enabled?: boolean;
}

function resolveIntegrationState(service: OndcNetworkService, enabled: boolean): OndcIntegrationState {
  if (!enabled) {
    return OndcIntegrationState.NOT_CONFIGURED;
  }
  const client = service.getClient();
  if (!client) {
    return OndcIntegrationState.NOT_CONFIGURED;
  }
  return OndcIntegrationState.ONDC_INTEGRATION_CONFIGURED;
}

/**
 * Real ONDC boundary — never returns fixture sellers.
 * Callback/search results must be ingested via OndcBapReceiver before surfacing candidates.
 */
export class OndcSupplierProvider implements SupplierNetworkProvider {
  readonly sourceKind = SupplierDiscoverySourceKind.ONDC_SELLER;
  private readonly enabled: boolean;
  private readonly service: OndcNetworkService;

  constructor(options: OndcSupplierProviderOptions = {}) {
    const envEnabled = typeof process !== 'undefined' && process?.env?.ONDC_ENABLED === 'true';
    this.enabled = options.enabled ?? envEnabled;
    this.service = new OndcNetworkService({ ...options, enabled: this.enabled });
  }

  getIntegrationState(): OndcIntegrationState {
    return resolveIntegrationState(this.service, this.enabled);
  }

  async discover(request: SupplierDiscoveryRequest): Promise<SupplierNetworkProviderResult> {
    const integrationState = this.getIntegrationState();
    if (integrationState === OndcIntegrationState.NOT_CONFIGURED) {
      return {
        sourceKind: this.sourceKind,
        integrationState,
        candidates: [],
        errorMessage:
          'ONDC subscriber keys and gateway whitelist are not configured; OTP + Google discovery continue.',
      };
    }

    const pin = request.location?.pinCode;
    const city = request.location?.city;
    const txId = pin ? `tx-rfq-${request.category}-${pin}` : `tx-rfq-${request.category}`;
    const broadcast = await this.service.broadcastRfqToOndc({
      rfqId: txId,
      title: request.category,
      category: request.category,
      cityCode: city ? `std:${city}` : 'std:080',
    });

    if (!broadcast.ok) {
      return {
        sourceKind: this.sourceKind,
        integrationState: OndcIntegrationState.UNAVAILABLE,
        candidates: [],
        errorMessage: broadcast.error,
      };
    }

    const normalized = this.service.getReceiver().listPendingCandidates(txId);
    const candidates = normalized.map((n) => ({
      sourceKind: this.sourceKind,
      externalRef: n.externalRef,
      displayAliasSeed: n.providerId,
      businessName: n.businessName,
      matchFactors: [{ code: 'ondc_callback', label: 'ONDC network callback (Beckn)' }],
      canReceiveRfq: true,
      canSubmitQuote: false,
      lifecycleTier: 'ONDC_DISCOVERED' as const,
      provenanceLabel: SUPPLIER_DISCOVERY_BUYER_LABELS.ONDC_SELLER,
      ondcProviderId: n.providerId,
    }));

    return {
      sourceKind: this.sourceKind,
      integrationState: candidates.length
        ? OndcIntegrationState.PREPROD
        : OndcIntegrationState.NO_RESULTS,
      candidates,
    };
  }
}
