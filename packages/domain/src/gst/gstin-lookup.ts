import { validateGstin } from './gstin-validator';
import type { GstTaxpayerInfo, GstVerificationResult } from './types';

/**
 * Kept as an empty map so older imports still resolve.
 * Checksum-valid GSTINs are not a taxpayer registry. This module does not
 * store or return fabricated legal names, cities, or PINs.
 */
export const KNOWN_GSTIN_REGISTRY: Record<string, GstTaxpayerInfo> = {};

/**
 * Format check only.
 * A checksum-valid GSTIN is not GST verification and does not identify a taxpayer.
 * GST_VERIFIED is earned only when an authoritative GSTN verification actually
 * returns an active taxpayer record. This function does not call that registry.
 */
export async function lookupGstinBusinessDetails(rawGstin: string): Promise<GstVerificationResult> {
  if (!rawGstin || typeof rawGstin !== 'string') {
    return {
      verified: false,
      verifiedAt: new Date().toISOString(),
      source: 'FORMAT_ONLY',
      error: 'GSTIN is required',
    };
  }

  const validation = validateGstin(rawGstin.trim());
  if (!validation.valid) {
    return {
      verified: false,
      verifiedAt: new Date().toISOString(),
      source: 'FORMAT_ONLY',
      error: validation.error ?? 'Invalid GSTIN',
    };
  }

  const stateLabel = validation.stateName ?? validation.stateCode ?? 'the state code in the number';
  return {
    verified: false,
    verifiedAt: new Date().toISOString(),
    source: 'FORMAT_ONLY',
    error: `GSTIN format is valid (${stateLabel}). This is not a government registry lookup, so no taxpayer name, city, or PIN is returned.`,
  };
}
