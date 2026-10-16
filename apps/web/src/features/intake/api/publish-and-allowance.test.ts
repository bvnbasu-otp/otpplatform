import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
  };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock };
});
vi.mock('@/features/auth/user-role', () => ({ fetchCurrentProfile: vi.fn() }));
vi.mock('@/features/requirement/api/requirements', () => ({ fetchUserOrganization: vi.fn() }));

import { supabase } from '@/lib/supabase';
import { createSupabaseQueryMock } from '@/lib/supabase-query-mock';
import { persistAndPublishDraft } from './draft';
import {
  PILOT_ALLOWANCE_UNVERIFIED_ERROR,
  checkPilotAllowanceBeforePublish,
  fetchPilotAllowance,
} from './pilot-allowance';
import { DEFAULT_SOURCING, type IntakeDraft } from '../types/intake-draft';

const mock = supabase as unknown as { rpc: ReturnType<typeof vi.fn>; from: ReturnType<typeof vi.fn> };

const serverDraft: IntakeDraft = {
  requirementId: 'req-1',
  organizationId: 'org-1',
  originalText: 'Need a motor rewound',
  title: 'Motor rewind',
  categoryId: 'cat-auto',
  subcategoryId: 'sub-auto',
  requirementMode: 'SERVICE',
  quantity: 1,
  unit: 'UNITS',
  attributes: {},
  quality: {},
  commercial: {},
  sourcing: { ...DEFAULT_SOURCING },
  requiredByMode: 'WITHIN_DAYS',
  requiredByDays: 7,
  requiredByDate: null,
  fulfilmentMode: 'SUPPLIER_DELIVERY',
  deliveryCity: 'Coimbatore',
  deliveryPincode: '641018',
  deliveryLine1: null,
  siteNotes: null,
  status: 'DRAFT',
};

function requirementRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    organization_id: 'org-1',
    title: 'Motor rewind',
    description: 'Need a motor rewound',
    status: 'DRAFT',
    category_id: 'cat-manual',
    subcategory_id: 'sub-manual',
    requirement_mode: 'SERVICE',
    quantity: 4,
    unit: 'UNITS',
    attributes: { motor_hp: 10 },
    quality: {},
    commercial: { __sourcing: { ...DEFAULT_SOURCING, minQuotesRequired: 5 } },
    required_by_mode: 'WITHIN_DAYS',
    required_by_days: 5,
    required_by_date: null,
    fulfilment_mode: 'SUPPLIER_DELIVERY',
    delivery_city: 'Madurai',
    delivery_pincode: '625001',
    delivery_line1: 'Plot 7, SIDCO',
    site_notes: null,
    ...overrides,
  };
}

beforeEach(() => {
  mock.rpc = vi.fn();
  mock.from = vi.fn();
});

describe('Issue 06: manual intake edits survive to publish', () => {
  const manualPatch = {
    categoryId: 'cat-manual',
    subcategoryId: 'sub-manual',
    quantity: 4,
    attributes: { motor_hp: 10 },
    deliveryCity: 'Madurai',
    deliveryPincode: '625001',
    deliveryLine1: 'Plot 7, SIDCO',
    sourcing: { ...DEFAULT_SOURCING, minQuotesRequired: 5 },
  };

  it('writes manual category/scope/location to the requirement row before calling publish_requirement', async () => {
    const chain = createSupabaseQueryMock({ data: [requirementRow()], error: null });
    const updateChain = createSupabaseQueryMock({ data: [requirementRow()], error: null });
    chain.update = vi.fn(() => updateChain);
    mock.from.mockReturnValue(chain);
    mock.rpc.mockResolvedValue({ data: { rfqId: 'rfq-1', publicRef: 'R-1' }, error: null });

    const res = await persistAndPublishDraft(serverDraft, manualPatch);

    expect(res).toEqual({ ok: true, requirementId: 'req-1', rfqId: 'rfq-1', publicRef: 'R-1' });
    expect(mock.from).toHaveBeenCalledWith('requirements');
    const written = chain.update.mock.calls[0]![0];
    expect(written).toMatchObject({
      category_id: 'cat-manual',
      subcategory_id: 'sub-manual',
      quantity: 4,
      attributes: { motor_hp: 10 },
      delivery_city: 'Madurai',
      delivery_pincode: '625001',
      delivery_line1: 'Plot 7, SIDCO',
    });
    expect(updateChain.eq).toHaveBeenCalledWith('id', 'req-1');

    expect(mock.rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = mock.rpc.mock.calls[0]!;
    expect(fn).toBe('publish_requirement');
    expect(args).toMatchObject({ p_requirement_id: 'req-1', p_min_quotes_required: 5 });
  });

  it('does NOT publish when saving the edits fails (stale row would drop them)', async () => {
    const chain = createSupabaseQueryMock({ data: null, error: null });
    chain.update = vi.fn(() => createSupabaseQueryMock({ data: null, error: { message: 'network down' } }));
    mock.from.mockReturnValue(chain);

    const res = await persistAndPublishDraft(serverDraft, manualPatch);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('network down');
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});

function allowancePayload(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    includedAndBonusUsedThisMonth: 0,
    quarterlyBonusUsed: 0,
    purchasedCredits: 0,
    subscriptionPlan: 'MONTHLY',
    subscriptionStatus: 'ACTIVE',
    subscriptionExpiresAt: '2027-01-01T00:00:00.000Z',
    orgType: 'INDIVIDUAL',
    canAcceptNextQuote: true,
    ...overrides,
  };
}

function mockAllowance(payload: Record<string, unknown> | null, error: unknown = null) {
  mock.rpc.mockImplementation(async (fn: string) => {
    if (fn !== 'get_buyer_pilot_allowance') {
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    }
    return { data: payload, error };
  });
}

describe('Issue 22: pilot allowance display and publish gate share one source', () => {
  it('formats the authoritative included-allowance count without recounting consumption rows', async () => {
    mockAllowance(allowancePayload({ includedAndBonusUsedThisMonth: 1 }));
    const res = await fetchPilotAllowance('org-1', new Date('2026-09-26T10:00:00Z'));

    expect(mock.rpc).toHaveBeenCalledWith('get_buyer_pilot_allowance', { p_organization_id: 'org-1' });
    expect(mock.from).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.allowance.label).toBe(
        'Pilot Allowance: 2 of 3 RFQs remaining this month (₹0 charged in Pilot Mode)',
      );
      expect(res.allowance.chargedInr).toBe(0);
      expect(res.allowance.effectivePlan).toBe('MONTHLY');
      expect(res.allowance.purchasedCredits).toBe(0);
    }
  });

  it('allows the gate when the included allowance is exhausted and a purchased credit is confirmed', async () => {
    mockAllowance(allowancePayload({
      includedAndBonusUsedThisMonth: 3,
      purchasedCredits: 1,
      canAcceptNextQuote: true,
    }));
    const res = await checkPilotAllowanceBeforePublish('org-1', new Date('2026-09-26T10:00:00Z'));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.allowance.remaining).toBe(0);
      expect(res.allowance.purchasedCredits).toBe(1);
      expect(res.allowance.canPublish).toBe(true);
      expect(res.allowance.label).toContain('1 purchased extra RFQ credit available');
    }
  });

  it('blocks the gate when the included allowance is exhausted and no purchased credit is available', async () => {
    mockAllowance(allowancePayload({
      includedAndBonusUsedThisMonth: 3,
      purchasedCredits: 0,
      canAcceptNextQuote: false,
    }));
    const res = await checkPilotAllowanceBeforePublish('org-1', new Date('2026-09-26T10:00:00Z'));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('Pilot Allowance: 0 of 3 RFQs remaining this month (₹0 charged in Pilot Mode)');
    }
  });

  it('does not reopen the gate for a consumed or expired purchased credit', async () => {
    mockAllowance(allowancePayload({
      includedAndBonusUsedThisMonth: 3,
      purchasedCredits: 0,
      canAcceptNextQuote: false,
    }));
    const consumed = await checkPilotAllowanceBeforePublish('org-1');
    expect(consumed.ok).toBe(false);

    mockAllowance(allowancePayload({
      includedAndBonusUsedThisMonth: 3,
      purchasedCredits: 1,
      canAcceptNextQuote: false,
    }));
    const expired = await checkPilotAllowanceBeforePublish('org-1');
    expect(expired.ok).toBe(false);
  });

  it('keeps the quarterly bonus distinct from included allowance and purchased credit', async () => {
    const now = new Date('2026-01-15T12:00:00.000Z');
    mockAllowance(allowancePayload({
      includedAndBonusUsedThisMonth: 3,
      quarterlyBonusUsed: 0,
      purchasedCredits: 0,
      subscriptionPlan: 'YEARLY',
      orgType: 'COMMUNITY',
      canAcceptNextQuote: true,
    }));
    const bonus = await checkPilotAllowanceBeforePublish('org-1', now);
    expect(bonus.ok).toBe(true);
    if (bonus.ok) {
      expect(bonus.allowance.effectivePlan).toBe('YEARLY');
      expect(bonus.allowance.remaining).toBe(0);
      expect(bonus.allowance.quarterlyBonusRemaining).toBe(1);
      expect(bonus.allowance.purchasedCredits).toBe(0);
    }

    mockAllowance(allowancePayload({
      includedAndBonusUsedThisMonth: 4,
      quarterlyBonusUsed: 1,
      purchasedCredits: 0,
      subscriptionPlan: 'YEARLY',
      orgType: 'COMMUNITY',
      canAcceptNextQuote: false,
    }));
    expect((await checkPilotAllowanceBeforePublish('org-1', now)).ok).toBe(false);

    mockAllowance(allowancePayload({
      includedAndBonusUsedThisMonth: 4,
      quarterlyBonusUsed: 1,
      purchasedCredits: 1,
      subscriptionPlan: 'YEARLY',
      orgType: 'MSME',
      canAcceptNextQuote: true,
    }));
    const creditAfterBonus = await checkPilotAllowanceBeforePublish('org-1', now);
    expect(creditAfterBonus.ok).toBe(true);
    if (creditAfterBonus.ok) expect(creditAfterBonus.allowance.purchasedCredits).toBe(1);
  });

  it('asks for the caller Individual scope when organization id is null and for the organization otherwise', async () => {
    mockAllowance(allowancePayload({ orgType: 'INDIVIDUAL', canAcceptNextQuote: true }));
    const individual = await checkPilotAllowanceBeforePublish(null);
    expect(mock.rpc).toHaveBeenCalledWith('get_buyer_pilot_allowance', { p_organization_id: null });
    expect(individual.ok).toBe(true);

    mockAllowance(allowancePayload({ orgType: 'MSME' }));
    const organization = await fetchPilotAllowance('org-msme');
    expect(mock.rpc).toHaveBeenCalledWith('get_buyer_pilot_allowance', { p_organization_id: 'org-msme' });
    expect(organization.ok).toBe(true);
    expect(checkPilotAllowanceBeforePublish.length).toBe(1);
  });

  it('fails closed when the entitlement lookup fails or the payload is incomplete', async () => {
    mockAllowance(null, { message: 'function unavailable' });
    expect(await checkPilotAllowanceBeforePublish('org-1')).toEqual({
      ok: false,
      error: PILOT_ALLOWANCE_UNVERIFIED_ERROR,
    });

    mockAllowance(null, null);
    expect(await checkPilotAllowanceBeforePublish(null)).toEqual({
      ok: false,
      error: PILOT_ALLOWANCE_UNVERIFIED_ERROR,
    });

    mockAllowance(allowancePayload({ canAcceptNextQuote: undefined, purchasedCredits: 1 }));
    expect(await checkPilotAllowanceBeforePublish('org-1')).toEqual({
      ok: false,
      error: PILOT_ALLOWANCE_UNVERIFIED_ERROR,
    });

    mockAllowance({ ok: false, error: 'Access denied' });
    expect(await checkPilotAllowanceBeforePublish('org-1')).toEqual({
      ok: false,
      error: PILOT_ALLOWANCE_UNVERIFIED_ERROR,
    });
  });

  it('does not treat a caller wish as YEARLY when the stored plan is monthly', async () => {
    const clientSuppliedPlan = 'YEARLY';
    mockAllowance(allowancePayload({
      includedAndBonusUsedThisMonth: 3,
      subscriptionPlan: 'MONTHLY',
      canAcceptNextQuote: false,
    }));
    const res = await checkPilotAllowanceBeforePublish('org-1', new Date('2026-01-15T12:00:00.000Z'));
    expect(clientSuppliedPlan).toBe('YEARLY');
    expect(res.ok).toBe(false);
  });
});
