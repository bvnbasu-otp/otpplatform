import { supabase } from '@/lib/supabase';

export interface AuditPingRecord {
  id: string;
  rfqId: string;
  supplierId: string | null;
  organizationId: string;
  scheduledFor: string;
  pingChannel: 'WHATSAPP' | 'EMAIL' | 'IN_APP';
  buyerResponse: string | null;
  supplierResponse: string | null;
  discrepancyDetected: boolean;
  discrepancyNotes: string | null;
  status: 'PENDING' | 'SENT' | 'RESPONDED' | 'EXPIRED';
  createdAt: string;
}

export async function recordAuditPingResponse(
  pingId: string,
  partySide: 'BUYER' | 'SUPPLIER',
  responseCode: string,
  notes?: string,
): Promise<{ ok: true; discrepancyDetected: boolean } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('record_audit_ping_response', {
    p_ping_id: pingId,
    p_party_side: partySide,
    p_response_code: responseCode,
    p_notes: notes ?? null,
  });

  if (error) return { ok: false, error: error.message };
  const res = (data ?? {}) as { discrepancy_detected?: boolean };
  return { ok: true, discrepancyDetected: Boolean(res.discrepancy_detected) };
}
