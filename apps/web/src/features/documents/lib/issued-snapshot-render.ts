import {
  parseIssuedDocumentPayload,
  type CanonicalDecisionReceipt,
  verifyDecisionReceiptIntegrity,
} from '@otp/domain';
import type { IssuedDocumentSnapshotRow } from '../api/fetch-issued-document-snapshot';
import { buildProcurementDocumentModel, type ProcurementDocumentInput } from '@/features/reporting/lib/procurement-document';

export function procurementInputFromIssuedSnapshot(
  snapshot: IssuedDocumentSnapshotRow,
): ProcurementDocumentInput | null {
  const payload = snapshot.payload_json ?? parseIssuedDocumentPayload(snapshot.payload_json);
  if (!payload) return null;
  return payload.procurementDocumentInput as ProcurementDocumentInput;
}

export function canonicalReceiptFromIssuedSnapshot(
  snapshot: IssuedDocumentSnapshotRow,
): CanonicalDecisionReceipt | null {
  const payload = snapshot.payload_json;
  if (!payload?.canonicalDecisionReceipt) return null;
  return payload.canonicalDecisionReceipt;
}

export function buildPrintModelFromIssuedSnapshot(snapshot: IssuedDocumentSnapshotRow) {
  const input = procurementInputFromIssuedSnapshot(snapshot);
  if (!input) return null;
  const canonical = canonicalReceiptFromIssuedSnapshot(snapshot);
  if (canonical) {
    const check = verifyDecisionReceiptIntegrity(canonical);
    if (!check.valid) return null;
  }
  return buildProcurementDocumentModel(input);
}
