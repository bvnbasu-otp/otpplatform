import type { SupplierNetworkPort } from '../../interfaces/supplier-network-port';
import { SupplierNetwork, OndcIntegrationState } from '@otp/domain';
import { OndcSupplierProvider } from '../supplier-network-providers/ondc-supplier-provider';

export interface OndcAdapterOptions {
  enabled?: boolean;
  subscriberId?: string;
  signingPrivateKeyPem?: string;
}

function envFlag(): boolean {
  const raw = typeof process !== 'undefined' && process?.env ? process.env.ONDC_ENABLED : undefined;
  return raw === 'true';
}

/**
 * Legacy SupplierNetworkPort wrapper over the real ONDC supplier provider boundary.
 * Never fabricates production sellers when integration is NOT_CONFIGURED.
 */
export class OndcNetworkAdapter implements SupplierNetworkPort {
  readonly network = SupplierNetwork.ONDC;
  readonly isTruthfulLive = false;
  private readonly enabled: boolean;
  private readonly provider: OndcSupplierProvider;

  constructor(options: OndcAdapterOptions = {}) {
    this.enabled = options.enabled ?? envFlag();
    this.provider = new OndcSupplierProvider({
      enabled: this.enabled,
      subscriberId: options.subscriberId,
      signingPrivateKeyPem: options.signingPrivateKeyPem,
    });
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getIntegrationState(): OndcIntegrationState {
    return this.provider.getIntegrationState();
  }

  async discover(criteria: Parameters<SupplierNetworkPort['discover']>[0]) {
    const result = await this.provider.discover(criteria);
    return result.candidates.map((c) => ({
      externalRef: c.externalRef,
      network: this.network,
      businessName: c.businessName,
      capability: { categories: [criteria.category] },
      matchScore: 0,
      matchReasons: [`provenance:ONDC_SELLER`, `ondc_state:${result.integrationState || OndcIntegrationState.NOT_CONFIGURED}`],
      canReceiveRfq: c.canReceiveRfq,
      canSubmitQuote: c.canSubmitQuote,
      canonicalSupplierId: c.ondcProviderId,
    }));
  }
}

export { OndcNetworkAdapter as OndcDiscoveryAdapter };
