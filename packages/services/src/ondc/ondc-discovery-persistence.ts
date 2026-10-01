/**
 * Persistence path: Beckn /on_search → canonical normalizer → discovery store.
 * Does not import the BAP receiver and does not create procurement rows.
 */
import {
  createOndcDiscoveryStore,
  ondcDiscoveryProcurementCounts,
  retainOndcDiscoveryObservation,
  type OndcDiscoveryRequestScope,
  type OndcDiscoveryRetainMeta,
  type OndcDiscoveryStore,
  type OndcNormalizedCandidate,
} from '@otp/domain';
import { normalizeBecknOnSearchCatalog } from './ondc-on-search-normalizer';
import type { OndcCatalog, OndcPayload } from './types/ondc-beckn';

export function persistNormalizedOndcOnSearch(input: {
  payload: OndcPayload<{ catalog?: OndcCatalog }>;
  observedAt: string;
  scope?: OndcDiscoveryRequestScope;
  meta: OndcDiscoveryRetainMeta;
  store?: OndcDiscoveryStore;
}): {
  store: OndcDiscoveryStore;
  candidates: OndcNormalizedCandidate[];
  identityCount: number;
  suppliersInserted: number;
  invitations: number;
  quotes: number;
  awards: number;
  purchaseOrders: number;
  payments: number;
} {
  const store = input.store ?? createOndcDiscoveryStore();
  const candidates = normalizeBecknOnSearchCatalog(input.payload, input.observedAt, input.scope);
  for (const candidate of candidates) {
    retainOndcDiscoveryObservation(store, candidate, input.meta);
  }
  return {
    store,
    candidates,
    identityCount: store.identities.size,
    ...ondcDiscoveryProcurementCounts(store),
  };
}
