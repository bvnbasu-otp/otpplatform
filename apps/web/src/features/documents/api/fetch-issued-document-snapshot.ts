import type { IssuedDocumentPayloadJson } from '@otp/domain';
import { parseIssuedDocumentPayload } from '@otp/domain';
import { supabase } from '@/lib/supabase';

export interface IssuedDocumentSnapshotRow {
  id: string;
  document_id: string;
  organization_id: string;
  document_kind: string;
  document_number: string;
  source_entity_type: string;
  source_entity_id: string;
  source_supplier_id: string | null;
  identity_state: string;
  perspective: string;
  payload_json: IssuedDocumentPayloadJson;
  verification_digest: string;
  verification_algorithm: string;
  verification_ref: string | null;
  idempotency_key: string;
  generated_at: string;
  status: string;
}

export async function fetchIssuedSnapshotByDocumentId(documentId: string): Promise<
  | { ok: true; snapshot: IssuedDocumentSnapshotRow }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('issued_document_snapshots')
    .select(
      'id, document_id, organization_id, document_kind, document_number, source_entity_type, source_entity_id, source_supplier_id, identity_state, perspective, payload_json, verification_digest, verification_algorithm, verification_ref, idempotency_key, generated_at, status',
    )
    .eq('document_id', documentId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Issued document not found' };
  const payload = parseIssuedDocumentPayload(data.payload_json);
  if (!payload) return { ok: false, error: 'Invalid issued payload' };
  return {
    ok: true,
    snapshot: { ...(data as Omit<IssuedDocumentSnapshotRow, 'payload_json'>), payload_json: payload },
  };
}

export async function fetchActiveIssuedSnapshotForSource(params: {
  organizationId: string;
  documentKind: string;
  sourceEntityType: string;
  sourceEntityId: string;
  identityState: string;
  perspective: string;
}): Promise<{ ok: true; snapshot: IssuedDocumentSnapshotRow | null } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('issued_document_snapshots')
    .select(
      'id, document_id, organization_id, document_kind, document_number, source_entity_type, source_entity_id, source_supplier_id, identity_state, perspective, payload_json, verification_digest, verification_algorithm, verification_ref, idempotency_key, generated_at, status',
    )
    .eq('organization_id', params.organizationId)
    .eq('document_kind', params.documentKind)
    .eq('source_entity_type', params.sourceEntityType)
    .eq('source_entity_id', params.sourceEntityId)
    .eq('identity_state', params.identityState)
    .eq('perspective', params.perspective)
    .eq('status', 'ISSUED')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, snapshot: null };
  const payload = parseIssuedDocumentPayload(data.payload_json);
  if (!payload) return { ok: false, error: 'Invalid issued payload' };
  return {
    ok: true,
    snapshot: { ...(data as Omit<IssuedDocumentSnapshotRow, 'payload_json'>), payload_json: payload },
  };
}

export async function verifyIssuedDocumentDigest(documentId: string): Promise<
  | { ok: true; valid: boolean; algorithm: string; stored: string; calculated: string }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('verify_issued_document_digest', {
    p_document_id: documentId,
  });
  if (error) return { ok: false, error: error.message };
  const row = data as {
    ok?: boolean;
    valid?: boolean;
    algorithm?: string;
    stored_digest?: string;
    calculated_digest?: string;
  };
  return {
    ok: true,
    valid: Boolean(row.valid),
    algorithm: row.algorithm ?? '',
    stored: row.stored_digest ?? '',
    calculated: row.calculated_digest ?? '',
  };
}
