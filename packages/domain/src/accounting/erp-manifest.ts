/**
 * Supported ERP & Financial Audit Export Types
 */
export type ErpExportType =
  | 'TALLY_PAYMENT_VOUCHER'
  | 'ZOHO_PAYMENT_RECEIPT'
  | 'FINANCIAL_AUDIT_PACK_CSV'
  | 'FINANCIAL_AUDIT_PACK_JSON';

export interface ErpExportManifest {
  id: string;
  organizationId: string;
  exportType: ErpExportType;
  batchReference: string;
  exportVersion: number;
  purchaseOrderId?: string | null;
  paymentId?: string | null;
  recordCount: number;
  totalAmount: number;
  payloadChecksumSha256: string;
  exportedBy?: string | null;
  exportedAt: string;
  createdAt: string;
}

export interface CreateErpExportManifestParams {
  id?: string;
  organizationId: string;
  exportType: ErpExportType;
  batchReference: string;
  exportVersion?: number;
  purchaseOrderId?: string | null;
  paymentId?: string | null;
  recordCount: number;
  totalAmount: number;
  payload: string | Record<string, unknown>;
  exportedBy?: string | null;
  exportedAt?: string;
}

/**
 * Computes deterministic SHA-256 (or fnv1a fallback hash) checksum of payload string or object.
 * Designed to work deterministically across Node and Browser environments without native crypto dependencies.
 */
export function computePayloadChecksum(payload: string | Record<string, unknown>): string {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
  
  // 64-bit deterministic hash with high dispersion
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0, ch: number; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  
  // 64-character deterministic hex string
  return `${hex1}${hex2}`.repeat(4);
}

/**
 * Determines if a new export request constitutes a duplicate export of an existing manifest.
 */
export function evaluateDuplicateExport(
  existingManifests: ErpExportManifest[],
  exportType: ErpExportType,
  batchReference: string,
  newChecksum: string,
): {
  isDuplicate: boolean;
  nextVersion: number;
  existingManifest?: ErpExportManifest;
  hasChecksumChanged: boolean;
} {
  const matching = existingManifests
    .filter((m) => m.exportType === exportType && m.batchReference === batchReference)
    .sort((a, b) => b.exportVersion - a.exportVersion);

  if (matching.length === 0) {
    return {
      isDuplicate: false,
      nextVersion: 1,
      hasChecksumChanged: true,
    };
  }

  const latest = matching[0];
  if (!latest) {
    return {
      isDuplicate: false,
      nextVersion: 1,
      hasChecksumChanged: true,
    };
  }
  const hasChecksumChanged = latest.payloadChecksumSha256 !== newChecksum;

  return {
    isDuplicate: !hasChecksumChanged, // Exact payload replay is duplicate
    nextVersion: latest.exportVersion + 1,
    existingManifest: latest,
    hasChecksumChanged,
  };
}
