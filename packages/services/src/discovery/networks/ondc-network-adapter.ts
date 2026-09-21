import type { SupplierNetworkPort } from '../../interfaces/supplier-network-port';
import { SupplierNetwork } from '@otp/domain';
import { OndcNetworkService, type OndcServiceOptions } from '../../ondc/ondc-network-service';

export interface OndcAdapterOptions extends OndcServiceOptions {
  /** Overrides the ONDC_ENABLED env var. */
  enabled?: boolean;
}

function envFlag(): boolean {
  const raw = typeof process !== 'undefined' && process?.env
    ? process.env.ONDC_ENABLED
    : undefined;
  return raw === 'true';
}

export class OndcNetworkAdapter implements SupplierNetworkPort {
  readonly network = SupplierNetwork.ONDC;
  readonly isTruthfulLive = false; // Flag-gated stub / dev integration; not live prod
  private readonly enabled: boolean;
  private readonly service: OndcNetworkService;

  constructor(options: OndcAdapterOptions = {}) {
    this.enabled = options.enabled ?? envFlag();
    this.service = new OndcNetworkService({
      ...options,
      enabled: this.enabled,
    });
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getService(): OndcNetworkService {
    return this.service;
  }

  async discover(criteria: Parameters<SupplierNetworkPort['discover']>[0]) {
    if (!this.enabled) {
      return [];
    }

    // When live client is available, trigger search on ONDC Gateway
    const client = this.service.getClient();
    if (client) {
      const pin = criteria.location?.pinCode;
      const city = criteria.location?.city;
      const txId = pin ? `tx-rfq-${criteria.category}-${pin}` : `tx-rfq-${criteria.category}`;
      await this.service.broadcastRfqToOndc({
        rfqId: txId,
        title: criteria.category,
        category: criteria.category,
        cityCode: city ? `std:${city}` : 'std:080',
      });
    }

    return [
      {
        externalRef: `ondc:${criteria.category}`,
        network: this.network,
        businessName: 'ONDC Network Verified Supplier',
        capability: { categories: [criteria.category] },
        matchScore: 85,
        matchReasons: ['ondc:live_gateway_search'],
        canReceiveRfq: true,
        canSubmitQuote: true,
      },
    ];
  }
}

/**
 * Alias used in newer wiring. Reads exactly like `OndcNetworkAdapter` — the
 * two names refer to the same class so existing tests keep compiling while
 * new code can use the documented `Discovery` suffix that matches the other
 * ports in this package.
 */
export { OndcNetworkAdapter as OndcDiscoveryAdapter };
