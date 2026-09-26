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

function rfqCountChain(count: number | null, error: unknown = null) {
  const chain: any = createSupabaseQueryMock({ data: null, error: null });
  chain.gte = vi.fn(() => chain);
  chain.lte = vi.fn(() => chain);
  chain.then = (resolveFn: (v: unknown) => unknown, rejectFn?: (e: unknown) => unknown) =>
    Promise.resolve({ data: null, count, error }).then(resolveFn, rejectFn);
  return chain;
}

describe('Issue 22: pilot allowance display and publish gate share one source', () => {
  it('counts this UTC month\'s RFQs for the org and returns the exact label', async () => {
    const chain = rfqCountChain(1);
    mock.from.mockReturnValue(chain);
    const res = await fetchPilotAllowance('org-1', new Date('2026-09-26T10:00:00Z'));

    expect(mock.from).toHaveBeenCalledWith('rfqs');
    expect(chain.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(chain.eq).toHaveBeenCalledWith('organization_id', 'org-1');
    expect(chain.gte).toHaveBeenCalledWith('created_at', '2026-09-01T00:00:00.000Z');
    expect(chain.lte).toHaveBeenCalledWith('created_at', '2026-09-30T23:59:59.999Z');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.allowance.label).toBe(
        'Pilot Allowance: 2 of 3 RFQs remaining this month (₹0 charged in Pilot Mode)',
      );
      expect(res.allowance.chargedInr).toBe(0);
    }
  });

  it('gate blocks publishing when the allowance is used up, using the same label', async () => {
    mock.from.mockReturnValue(rfqCountChain(3));
    const res = await checkPilotAllowanceBeforePublish('org-1');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('Pilot Allowance: 0 of 3 RFQs remaining this month (₹0 charged in Pilot Mode)');
    }
  });

  it('gate fails closed when the count cannot be read', async () => {
    mock.from.mockReturnValue(rfqCountChain(null, { message: 'rls' }));
    const res = await checkPilotAllowanceBeforePublish('org-1');
    expect(res).toEqual({ ok: false, error: PILOT_ALLOWANCE_UNVERIFIED_ERROR });
  });

  it('gate allows publishing with remaining allowance', async () => {
    mock.from.mockReturnValue(rfqCountChain(2));
    const res = await checkPilotAllowanceBeforePublish('org-1');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.allowance?.remaining).toBe(1);
  });
});
