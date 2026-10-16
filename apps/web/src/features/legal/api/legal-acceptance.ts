import { supabase } from '@/lib/supabase';

export type AgreementType = 'CUSTOMER_EULA' | 'SUPPLIER_EULA';

export interface CurrentAgreement {
  agreementType: AgreementType;
  version: string;
  documentHash: string;
  title: string;
}

export interface AgreementStatus {
  agreementType: AgreementType;
  audience: 'BUYER' | 'SUPPLIER';
  title: string;
  currentVersion: string;
  documentHash: string;
  legalApprovalStatus: 'PENDING_LEGAL_APPROVAL' | 'APPROVED';
  accepted: boolean;
  acceptedAt: string | null;
  /** Decided by the database from its own clock and the recorded rollout. */
  status: 'ACCEPTED' | 'GRACE' | 'REQUIRED' | 'NOT_ENFORCED' | 'MISCONFIGURED';
  graceEndsAt: string | null;
}

export interface LegalAcceptanceStatus {
  requiresAcceptance: boolean;
  enforcementActive: boolean;
  agreements: AgreementStatus[];
}

export type LegalResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function agreementTypeForSide(side: 'BUYER' | 'SUPPLIER'): AgreementType {
  return side === 'SUPPLIER' ? 'SUPPLIER_EULA' : 'CUSTOMER_EULA';
}

/** The version and hash the server will accept; the single source of truth shown to applicants. */
export async function fetchCurrentAgreement(
  agreementType: AgreementType,
): Promise<LegalResult<CurrentAgreement>> {
  const { data, error } = await supabase
    .from('legal_document_versions')
    .select('agreement_type, version, document_hash, title')
    .eq('agreement_type', agreementType)
    .is('retired_at', null)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'No current agreement is published.' };
  return {
    ok: true,
    value: {
      agreementType: data.agreement_type as AgreementType,
      version: data.version as string,
      documentHash: data.document_hash as string,
      title: data.title as string,
    },
  };
}

export async function fetchLegalAcceptanceStatus(): Promise<LegalResult<LegalAcceptanceStatus>> {
  const { data, error } = await supabase.rpc('my_legal_acceptance_status');
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: data as LegalAcceptanceStatus };
}

export async function acceptLegalAgreement(
  agreement: Pick<AgreementStatus, 'agreementType' | 'currentVersion' | 'documentHash'>,
): Promise<LegalResult<LegalAcceptanceStatus>> {
  const { data, error } = await supabase.rpc('accept_legal_agreement', {
    p_agreement_type: agreement.agreementType,
    p_version: agreement.currentVersion,
    p_document_hash: agreement.documentHash,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: data as LegalAcceptanceStatus };
}
