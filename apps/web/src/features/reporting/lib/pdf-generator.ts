/**
 * Client-Side Decision Receipt & Procurement Audit Report Generator
 * Uses standard browser print media rendering and cryptographic hash seals.
 */

export interface ReceiptDocumentData {
  rfqPublicRef: string;
  rfqTitle: string;
  winnerBusinessName: string;
  winnerAlias: string;
  awardedAmountInr: number;
  awardedAt: string;
  auditHash: string;
}

export async function computeReceiptAuditHash(data: Omit<ReceiptDocumentData, 'auditHash'>): Promise<string> {
  const encoder = new TextEncoder();
  const serialized = `${data.rfqPublicRef}|${data.winnerBusinessName}|${data.awardedAmountInr}|${data.awardedAt}`;
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(serialized));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function triggerPrintDialog(): void {
  if (typeof window !== 'undefined' && typeof window.print === 'function') {
    window.print();
  }
}
