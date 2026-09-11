import { supplierSourceToNetwork, type SupplierNetwork } from '@otp/domain';

const NETWORK_LABELS: Record<SupplierNetwork, string> = {
  ONDC: 'ONDC',
  BNI: 'BNI',
  ASSOCIATION: 'Trade associations',
  DIRECT: 'Direct suppliers',
  LOCAL_REGISTRY: 'OTP Local registry',
};

export function networkLabel(network: SupplierNetwork): string {
  return NETWORK_LABELS[network];
}

export { supplierSourceToNetwork };
