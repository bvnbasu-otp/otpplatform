import { supabase } from '@/lib/supabase';
import type { CoiStatus } from '@otp/domain';
import type { CoiDeclaration } from '../types/governance';

interface CoiRow {
  id: string;
  rfq_id: string;
  profile_id: string;
  status: CoiStatus;
  description: string | null;
  declared_at: string;
}

function mapCoi(row: CoiRow): CoiDeclaration {
  return {
    id: row.id,
    rfqId: row.rfq_id,
    profileId: row.profile_id,
    status: row.status,
    description: row.description,
    declaredAt: row.declared_at,
  };
}

export async function fetchCoi(rfqId: string): Promise<
  { ok: true; declarations: CoiDeclaration[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('conflict_of_interest_declarations')
    .select('id, rfq_id, profile_id, status, description, declared_at')
    .eq('rfq_id', rfqId)
    .order('declared_at', { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, declarations: (data as CoiRow[]).map(mapCoi) };
}

export async function declareCoi(
  rfqId: string,
  profileId: string,
  status: CoiStatus,
  description?: string,
): Promise<{ ok: true; declaration: CoiDeclaration } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('conflict_of_interest_declarations')
    .insert({
      rfq_id: rfqId,
      profile_id: profileId,
      status,
      description: description ?? null,
    })
    .select('id, rfq_id, profile_id, status, description, declared_at')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, declaration: mapCoi(data as CoiRow) };
}
