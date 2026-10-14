/**
 * Narrow @otp/domain entry for the ondc-on-search Supabase Edge bundle.
 * Re-exports only the callback graph. The Edge import map must not target the domain barrel.
 */

export {
  OndcDispatchFailureClass,
  OndcDispatchStatus,
  admitOndcDiscoveryDispatch,
  buildOndcCanonicalSearch,
  classifyOndcTransportFailure,
  commitOndcDispatchCallback,
  createOndcDispatchLedger,
  evaluateOndcDispatchCallback,
  findIssuedOndcDispatch,
  isLiveOndcCallbackUrl,
  isProductionOndcHost,
  noteOndcDispatchCallbackTimeout,
  ondcDispatchIdempotencyKey,
  rememberOndcDispatch,
  toOndcDispatchAudit,
  toOndcDispatchBuyerView,
  toOndcDispatchUserMessage,
  validateOndcSearchPayload,
} from '../ondc/ondc-dispatch.ts';

export {
  OndcObservationSource,
  OndcRuntimeEnvironment,
  parseOndcRuntimeEnvironment,
  resolveOndcEnvironmentGate,
  toPublicOndcEnvironmentDecision,
} from '../ondc/ondc-environment.ts';

export { admitOndcOnSearchCallback } from '../ondc/ondc-callback-guard.ts';

export {
  createOndcDiscoveryStore,
  ondcDiscoveryIdentityKey,
  ondcDiscoveryProcurementCounts,
  retainOndcDiscoveryObservation,
} from '../ondc/ondc-discovery-persistence.ts';

export { normalizeOndcOnSearchRecord } from '../ondc/ondc-provider-foundation.ts';
