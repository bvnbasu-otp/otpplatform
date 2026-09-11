/**
 * External supplier networks OTP connects to — discovery adapters only.
 * OTP does not own these networks; it normalizes them into a common supplier model.
 */
export const SupplierNetwork = {
  ONDC: 'ONDC',
  BNI: 'BNI',
  ASSOCIATION: 'ASSOCIATION',
  DIRECT: 'DIRECT',
  LOCAL_REGISTRY: 'LOCAL_REGISTRY',
} as const;

export type SupplierNetwork =
  (typeof SupplierNetwork)[keyof typeof SupplierNetwork];
