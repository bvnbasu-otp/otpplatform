/**
 * Provider execution status semantics for Supplier Network Engine.
 */
export const ProviderExecutionStatus = {
  SUCCESS: 'SUCCESS',
  EMPTY: 'EMPTY',
  TIMEOUT: 'TIMEOUT',
  UNAVAILABLE: 'UNAVAILABLE',
  DISABLED: 'DISABLED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ProviderExecutionStatus =
  (typeof ProviderExecutionStatus)[keyof typeof ProviderExecutionStatus];

/**
 * Truthful provider operational indicator.
 * Prevents simulated/stubbed providers from claiming live production connectivity.
 */
export const TruthfulProviderStatus = {
  LIVE_ACTIVE: 'LIVE_ACTIVE',
  PRODUCTION_READY: 'PRODUCTION_READY',
  ACTIVATION_BLOCKED: 'ACTIVATION_BLOCKED',
  STUBBED_SIMULATION: 'STUBBED_SIMULATION',
  DISABLED_GATE: 'DISABLED_GATE',
  DISABLED: 'DISABLED',
  UNAVAILABLE: 'UNAVAILABLE',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  DEGRADED: 'DEGRADED',
  FAILED: 'FAILED',
} as const;

export type TruthfulProviderStatus =
  (typeof TruthfulProviderStatus)[keyof typeof TruthfulProviderStatus];

/**
 * Provider execution strategy mode.
 */
export const ProviderExecutionMode = {
  PARALLEL: 'PARALLEL',
  SEQUENTIAL: 'SEQUENTIAL',
  FAIL_FAST: 'FAIL_FAST',
} as const;

export type ProviderExecutionMode =
  (typeof ProviderExecutionMode)[keyof typeof ProviderExecutionMode];
