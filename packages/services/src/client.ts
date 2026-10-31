/**
 * @file client.ts
 * Browser-safe client entrypoint for @otp/services.
 * Excludes Node-specific modules (ONDC crypto, server dispatch, node:crypto)
 * so that Vite/Rollup bundles cleanly in client web applications.
 */

export * from './types/actor-context';
export * from './types/errors';
export * from './types/result';
export * from './contracts';
export * from './adapters';
