import {
  SupplierDiscoverySourceKind,
  SUPPLIER_DISCOVERY_BUYER_LABELS,
  SupplierDiscoveryLifecycleTier,
  type SupplierDiscoveryRequest,
  type SupplierNetworkProvider,
  type SupplierNetworkProviderResult,
} from '@otp/domain';
import { GooglePlacesDiscoveryAdapter } from '../../gis/google-places-discovery-adapter';

export class GoogleDiscoveryProvider implements SupplierNetworkProvider {
  readonly sourceKind = SupplierDiscoverySourceKind.GOOGLE_DISCOVERY;
  private readonly adapter: GooglePlacesDiscoveryAdapter;

  constructor(options?: ConstructorParameters<typeof GooglePlacesDiscoveryAdapter>[0]) {
    this.adapter = new GooglePlacesDiscoveryAdapter(options);
  }

  async discover(request: SupplierDiscoveryRequest): Promise<SupplierNetworkProviderResult> {
    const result = await this.adapter.discoverWithFallbackLadder(request);
    const candidates = result.candidates.map((c) => ({
      sourceKind: this.sourceKind,
      externalRef: c.externalRef,
      displayAliasSeed: c.externalRef,
      businessName: c.businessName,
      matchFactors: c.matchReasons.map((r) => ({ code: r.split(':')[0] || 'match', label: r })),
      canReceiveRfq: c.canReceiveRfq,
      canSubmitQuote: false,
      lifecycleTier: SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA,
      provenanceLabel: SUPPLIER_DISCOVERY_BUYER_LABELS.GOOGLE_DISCOVERY,
      placeId: c.externalRef,
      phone: (c as { phone?: string }).phone,
    }));

    return {
      sourceKind: this.sourceKind,
      candidates,
      errorMessage: result.explanation,
    };
  }
}
