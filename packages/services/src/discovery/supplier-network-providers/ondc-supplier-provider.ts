import {
  SupplierDiscoverySourceKind,
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
    const decision = this.service.getEnvironmentDecision();
    if (integrationState === OndcIntegrationState.NOT_CONFIGURED || !decision.realClientAllowed) {
      return {
        sourceKind: this.sourceKind,
        integrationState: OndcIntegrationState.NOT_CONFIGURED,
        candidates: [],
        errorMessage:
          decision.error ??
          'ONDC subscriber keys and gateway whitelist are not configured; OTP + Google discovery continue.',
      };
    }

    void request;
    return {
      sourceKind: this.sourceKind,
      integrationState: OndcIntegrationState.ONDC_INTEGRATION_CONFIGURED,
      candidates: [],
      errorMessage: 'ONDC /search is not dispatched from supplier discovery. Signed search stays on broadcastRfqToOndc.',
    };
  }
}
