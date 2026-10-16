import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { supabase } from '@/lib/supabase';
import {
  acceptLegalAgreement,
  agreementTypeForSide,
  fetchCurrentAgreement,
  fetchLegalAcceptanceStatus,
  type AgreementStatus,
} from './api/legal-acceptance';
import { blockingAgreements, LegalAcceptanceGate, pendingAgreements } from './components/LegalAcceptanceGate';
import { useCurrentAgreement } from './hooks/use-current-agreement';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { signOut: vi.fn() },
  },
}));

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;
const from = supabase.from as unknown as ReturnType<typeof vi.fn>;

function agreementRow(result: { data: unknown; error: { message: string } | null }) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    maybeSingle: () => Promise.resolve(result),
  };
  return chain;
}

function agreement(overrides: Partial<AgreementStatus> = {}): AgreementStatus {
  return {
    agreementType: 'CUSTOMER_EULA',
    audience: 'BUYER',
    title: 'Customer EULA',
    currentVersion: 'v-current',
    documentHash: 'sha256:abc',
    legalApprovalStatus: 'APPROVED',
    accepted: false,
    acceptedAt: null,
    status: 'REQUIRED',
    graceEndsAt: null,
    ...overrides,
  };
}

describe('legal acceptance', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
  });

  it('selects the Buyer EULA for buyers and the Supplier EULA for suppliers', () => {
    expect(agreementTypeForSide('BUYER')).toBe('CUSTOMER_EULA');
    expect(agreementTypeForSide('SUPPLIER')).toBe('SUPPLIER_EULA');
  });

  it('reads the current published agreement and fails when none is available', async () => {
    from.mockReturnValueOnce(agreementRow({
      data: {
        agreement_type: 'SUPPLIER_EULA',
        version: 'v-supplier',
        document_hash: 'sha256:def',
        title: 'Supplier EULA',
      },
      error: null,
    }));
    await expect(fetchCurrentAgreement('SUPPLIER_EULA')).resolves.toEqual({
      ok: true,
      value: {
        agreementType: 'SUPPLIER_EULA',
        version: 'v-supplier',
        documentHash: 'sha256:def',
        title: 'Supplier EULA',
      },
    });

    from.mockReturnValueOnce(agreementRow({ data: null, error: null }));
    await expect(fetchCurrentAgreement('CUSTOMER_EULA')).resolves.toEqual({
      ok: false,
      error: 'No current agreement is published.',
    });
  });

  it('records acceptance with the server version and hash', async () => {
    const status = { requiresAcceptance: false, enforcementActive: true, agreements: [] };
    rpc.mockResolvedValueOnce({ data: status, error: null });
    const current = agreement();
    await expect(acceptLegalAgreement(current)).resolves.toEqual({ ok: true, value: status });
    expect(rpc).toHaveBeenCalledWith('accept_legal_agreement', {
      p_agreement_type: 'CUSTOMER_EULA',
      p_version: 'v-current',
      p_document_hash: 'sha256:abc',
    });
  });

  it('keeps a failed status check from looking like acceptance', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });
    await expect(fetchLegalAcceptanceStatus()).resolves.toEqual({ ok: false, error: 'permission denied' });
  });

  it('separates pending review from writes the database will reject', () => {
    const required = agreement({ status: 'REQUIRED' });
    const grace = agreement({
      agreementType: 'SUPPLIER_EULA',
      audience: 'SUPPLIER',
      status: 'GRACE',
      graceEndsAt: '2026-11-15T00:00:00.000Z',
    });
    const accepted = agreement({ accepted: true, status: 'ACCEPTED' });
    expect(pendingAgreements({
      requiresAcceptance: true,
      enforcementActive: true,
      agreements: [required, grace, accepted],
    })).toEqual([required, grace]);
    expect(blockingAgreements({
      requiresAcceptance: true,
      enforcementActive: true,
      agreements: [required, grace, accepted],
    })).toEqual([required]);
  });

  it('starts agreement lookup in a loading state for the registration side', () => {
    function Probe() {
      const state = useCurrentAgreement('SUPPLIER');
      return <p>{`${state.phase} ${typeof state.reload}`}</p>;
    }
    expect(renderToStaticMarkup(<Probe />)).toContain('loading function');
  });

  it('hides the protected workspace until agreement status is known', () => {
    const html = renderToStaticMarkup(
      <LegalAcceptanceGate>
        <p>protected workspace</p>
      </LegalAcceptanceGate>,
    );
    expect(html).toContain('Checking agreement status');
    expect(html).not.toContain('protected workspace');
  });
});
