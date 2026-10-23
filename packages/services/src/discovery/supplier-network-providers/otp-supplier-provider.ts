import {
  SupplierDiscoverySourceKind,
  SUPPLIER_DISCOVERY_BUYER_LABELS,
  SupplierDiscoveryLifecycleTier,
  SupplierNetwork,
  type SupplierDiscoveryRequest,
  type SupplierNetworkProvider,
  type SupplierNetworkProviderResult,
} from '@otp/domain';
import type { SupplierRepository } from '../../repositories/interfaces';
import type { SupplierNetworkPort, NetworkDiscoveryCandidate } from '../../interfaces/supplier-network-port';

function stringList(...values: unknown[]): string[] {
  const out = new Set<string>();
  for (const value of values) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === 'string' && item.trim()) out.add(item.trim());
    }
  }
  return [...out];
}

function declaredServiceArea(area: Record<string, unknown> | undefined): {
  pins: string[];
  cities: string[];
} {
  if (!area) return { pins: [], cities: [] };
  return {
    pins: stringList(area.pinCode, area.pincode, area.pins, area.pincodes),
    cities: stringList(area.city, area.cities),
  };
}

function mapSupplierToCandidate(s: {
  id: string;
  businessName: string;
  gstin?: string;
  contactPhone?: string;
  verificationStatus?: string;
  lifecycleState?: string;
  categories: string[];
  serviceArea?: Record<string, unknown>;
}): NetworkDiscoveryCandidate {
  const verified =
    (s.verificationStatus || '').toUpperCase() === 'VERIFIED' ||
    (s.lifecycleState || '').toUpperCase() === 'VERIFIED';
  const coverage = declaredServiceArea(s.serviceArea);

  return {
    externalRef: `otp-supplier:${s.id}`,
    network: SupplierNetwork.LOCAL_REGISTRY,
    businessName: s.businessName,
    canonicalSupplierId: s.id,
    gstin: s.gstin,
    capability: {
      categories: s.categories,
      ...(coverage.pins[0] || coverage.cities[0]
        ? { serviceArea: { pinCode: coverage.pins[0], city: coverage.cities[0] } }
        : {}),
      verificationStatus: verified ? 'PLATFORM_VERIFIED' : 'UNVERIFIED',
    },
    servicePins: coverage.pins,
    serviceCities: coverage.cities,
    matchScore: verified ? 88 : 70,
    matchReasons: [
      `provenance:${SupplierDiscoverySourceKind.OTP_SUPPLIER}`,
      verified ? 'otp:lifecycle:OTP_VERIFIED' : 'otp:lifecycle:OTP_REGISTERED',
    ],
    canReceiveRfq: true,
    canSubmitQuote: verified,
  };
}

export class OtpSupplierProvider implements SupplierNetworkProvider {
  readonly sourceKind = SupplierDiscoverySourceKind.OTP_SUPPLIER;

  constructor(private readonly suppliers?: SupplierRepository) {}

  async discover(request: SupplierDiscoveryRequest): Promise<SupplierNetworkProviderResult> {
    if (!this.suppliers) {
      return { sourceKind: this.sourceKind, candidates: [] };
    }

    const rows = await this.suppliers.findActiveByCategory(request.category);
    const candidates = rows.map((s) => ({
      sourceKind: this.sourceKind,
      externalRef: `otp:${s.id}`,
      displayAliasSeed: s.id,
      businessName: s.businessName,
      matchFactors: [{ code: 'otp_registry', label: 'OTP supplier registry match' }],
      canReceiveRfq: true,
      canSubmitQuote:
        (s.verificationStatus || '').toUpperCase() === 'VERIFIED' ||
        (s.lifecycleState || '').toUpperCase() === 'VERIFIED',
      lifecycleTier:
        (s.verificationStatus || '').toUpperCase() === 'VERIFIED'
          ? SupplierDiscoveryLifecycleTier.OTP_VERIFIED
          : SupplierDiscoveryLifecycleTier.OTP_REGISTERED,
      provenanceLabel: SUPPLIER_DISCOVERY_BUYER_LABELS.OTP_SUPPLIER,
      gstin: s.gstin,
      phone: s.contactPhone,
      otpSupplierId: s.id,
    }));

    return { sourceKind: this.sourceKind, candidates };
  }
}

/** Bridges legacy SupplierNetworkPort to OTP registry (no synthetic rows). */
export class OtpSupplierNetworkAdapter implements SupplierNetworkPort {
  readonly network = SupplierNetwork.LOCAL_REGISTRY;
  readonly isTruthfulLive = true;

  constructor(private readonly suppliers?: SupplierRepository) {}

  async discover(criteria: Parameters<SupplierNetworkPort['discover']>[0]) {
    if (!this.suppliers) {
      return [];
    }
    const rows = await this.suppliers.findActiveByCategory(criteria.category);
    return rows.map(mapSupplierToCandidate);
  }
}

export function createOtpSupplierNetworkAdapter(
  suppliers?: SupplierRepository,
): SupplierNetworkPort {
  return new OtpSupplierNetworkAdapter(suppliers);
}
