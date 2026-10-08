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

const MONTHLY_ORG = {
  subscription_plan: 'MONTHLY',
  subscription_status: 'ACTIVE',
  subscription_expires_at: '2027-01-01T00:00:00.000Z',
  org_type: 'INDIVIDUAL',
};

function rfqChain(rows: { created_at: string }[] | null, error: unknown = null) {
  const chain: any = createSupabaseQueryMock({ data: rows, error });
  chain.gte = vi.fn(() => chain);
  chain.lte = vi.fn(() => chain);
  return chain;
}

function orgChain(row: Record<string, unknown> | null, error: unknown = null) {
  return createSupabaseQueryMock({ data: row, error });
}

function mockAllowanceTables(options: {
  rfqs?: { created_at: string }[] | null;
  rfqError?: unknown;
  org?: Record<string, unknown> | null;
  orgError?: unknown;
}) {
  const rfqs = rfqChain(options.rfqs ?? [], options.rfqError ?? null);
  const org = orgChain(options.org === undefined ? MONTHLY_ORG : options.org, options.orgError ?? null);
  mock.from.mockImplementation((table: string) => {
    if (table === 'rfqs') return rfqs;
    if (table === 'organizations') return org;
    throw new Error(`unexpected table ${table}`);
  });
  return { rfqs, org };
}

describe('Issue 22: pilot allowance display and publish gate share one source', () => {
  it('counts this UTC month\'s RFQs for the org and returns the exact label', async () => {
    const { rfqs, org } = mockAllowanceTables({
      rfqs: [{ created_at: '2026-09-10T00:00:00.000Z' }],
    });
    const res = await fetchPilotAllowance('org-1', new Date('2026-09-26T10:00:00Z'));

    expect(mock.from).toHaveBeenCalledWith('rfqs');
    expect(mock.from).toHaveBeenCalledWith('organizations');
    expect(rfqs.select).toHaveBeenCalledWith('created_at');
    expect(rfqs.eq).toHaveBeenCalledWith('organization_id', 'org-1');
    expect(rfqs.gte).toHaveBeenCalledWith('created_at', '2026-07-01T00:00:00.000Z');
    expect(rfqs.lte).toHaveBeenCalledWith('created_at', '2026-09-30T23:59:59.999Z');
    expect(org.select).toHaveBeenCalledWith(
      'subscription_plan, subscription_status, subscription_expires_at, org_type',
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.allowance.label).toBe(
        'Pilot Allowance: 2 of 3 RFQs remaining this month (₹0 charged in Pilot Mode)',
      );
      expect(res.allowance.chargedInr).toBe(0);
      expect(res.allowance.effectivePlan).toBe('MONTHLY');
    }
  });

  it('gate blocks publishing when the allowance is used up, using the same label', async () => {
    const now = new Date('2026-09-26T10:00:00Z');
    mockAllowanceTables({
      rfqs: [1, 2, 3].map((day) => ({ created_at: `2026-09-${10 + day}T00:00:00.000Z` })),
    });
    const res = await checkPilotAllowanceBeforePublish('org-1', now);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('Pilot Allowance: 0 of 3 RFQs remaining this month (₹0 charged in Pilot Mode)');
    }
  });

  it('gate fails closed when the count cannot be read', async () => {
    mockAllowanceTables({ rfqs: null, rfqError: { message: 'rls' } });
    const res = await checkPilotAllowanceBeforePublish('org-1');
    expect(res).toEqual({ ok: false, error: PILOT_ALLOWANCE_UNVERIFIED_ERROR });
  });

  it('gate fails closed when the stored plan cannot be read', async () => {
    mockAllowanceTables({ org: null, orgError: { message: 'rls' } });
    const res = await checkPilotAllowanceBeforePublish('org-1', new Date('2026-09-26T10:00:00Z'));
    expect(res).toEqual({ ok: false, error: PILOT_ALLOWANCE_UNVERIFIED_ERROR });
  });

  it('gate allows publishing with remaining allowance', async () => {
    const now = new Date('2026-09-26T10:00:00Z');
    mockAllowanceTables({
      rfqs: [
        { created_at: '2026-09-02T00:00:00.000Z' },
        { created_at: '2026-09-03T00:00:00.000Z' },
      ],
    });
    const res = await checkPilotAllowanceBeforePublish('org-1', now);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.allowance?.remaining).toBe(1);
  });

  it('reads the stored YEARLY plan and allows the one quarterly bonus', async () => {
    const now = new Date('2026-01-15T12:00:00.000Z');
    mockAllowanceTables({
      org: { ...MONTHLY_ORG, subscription_plan: 'YEARLY', org_type: 'COMMUNITY' },
      rfqs: [5, 6, 7].map((day) => ({ created_at: `2026-01-0${day}T00:00:00.000Z` })),
    });
    const res = await checkPilotAllowanceBeforePublish('org-1', now);
    expect(checkPilotAllowanceBeforePublish.length).toBe(1);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.allowance?.effectivePlan).toBe('YEARLY');
      expect(res.allowance?.quarterlyBonusRemaining).toBe(1);
    }
  });

  it('does not treat a caller wish as YEARLY when the stored plan is monthly', async () => {
    const clientSuppliedPlan = 'YEARLY';
    const now = new Date('2026-01-15T12:00:00.000Z');
    mockAllowanceTables({
      rfqs: [5, 6, 7].map((day) => ({ created_at: `2026-01-0${day}T00:00:00.000Z` })),
    });
    const res = await checkPilotAllowanceBeforePublish('org-1', now);
    expect(clientSuppliedPlan).toBe('YEARLY');
    expect(res.ok).toBe(false);
  });
});
