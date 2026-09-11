import type { SupplierNetworkPort } from '../../interfaces/supplier-network-port';
import { SupplierNetwork } from '@otp/domain';

function stubAdapter(network: SupplierNetwork, label: string): SupplierNetworkPort {
  return {
    network,
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
export const LocalRegistryNetworkAdapter = stubAdapter(
  SupplierNetwork.LOCAL_REGISTRY,
  'OTP Local',
);
