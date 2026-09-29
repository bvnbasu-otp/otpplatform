import type { SupplierNetworkPort } from '../../interfaces/supplier-network-port';
import { SupplierNetwork } from '@otp/domain';
import { GooglePlacesDiscoveryAdapter } from '../../gis/google-places-discovery-adapter';
import { createOtpSupplierNetworkAdapter } from '../supplier-network-providers/otp-supplier-provider';
import type { SupplierRepository } from '../../repositories/interfaces';

function stubAdapter(network: SupplierNetwork, label: string): SupplierNetworkPort {
  return {
    network,
    isTruthfulLive: false,
    async discover(criteria) {
      return [
        {
          externalRef: `${network.toLowerCase()}:${criteria.category}`,
          network,
          businessName: `${label} match`,
          capability: { categories: [criteria.category] },
          matchScore: 72,
          matchReasons: [`${network.toLowerCase()}:discovery`],
          canReceiveRfq: true,
          canSubmitQuote: true,
        },
      ];
    },
  };
}

export const BniNetworkAdapter = stubAdapter(SupplierNetwork.BNI, 'BNI');
export const AssociationNetworkAdapter = stubAdapter(SupplierNetwork.ASSOCIATION, 'Association');
export const DirectNetworkAdapter = stubAdapter(SupplierNetwork.DIRECT, 'Direct');

/** OTP registry adapter — returns only real suppliers when a repository is wired. */
export function createLocalRegistryNetworkAdapter(
  suppliers?: SupplierRepository,
): SupplierNetworkPort {
  return createOtpSupplierNetworkAdapter(suppliers);
}

/** @deprecated Use createLocalRegistryNetworkAdapter(repos.suppliers) — default returns no synthetic rows. */
export const LocalRegistryNetworkAdapter = createOtpSupplierNetworkAdapter();

export const GooglePlacesNetworkAdapter: SupplierNetworkPort = new GooglePlacesDiscoveryAdapter();
