import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaxonomySnapshot } from '@otp/domain';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
  };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock };
});

const taxonomy: TaxonomySnapshot = {
  categories: [{ id: 'cat-f', code: 'furniture', name: 'Furniture', description: null, sortOrder: 1 }],
  subcategories: [
    {
      id: 'sub-chairs',
      categoryId: 'cat-f',
      categoryCode: 'furniture',
      code: 'office_chairs',
      name: 'Office Chairs',
      description: null,
      matchKeywords: ['chair'],
      requiredAttributeCodes: [],
      defaultRequirementMode: 'PRODUCT_MATERIAL',
      sortOrder: 1,
    },
  ],
  capabilities: [],
  attributes: [],
  criteria: [],
  cities: [],
};

const createDraft = vi.fn();
const publishDraft = vi.fn();
const discoverAndInvite = vi.fn();

vi.mock('./taxonomy', () => ({
  fetchTaxonomy: vi.fn(async () => ({ ok: true, taxonomy })),
}));
vi.mock('./draft', () => ({
  createDraft: (...args: unknown[]) => createDraft(...args),
  publishDraft: (...args: unknown[]) => publishDraft(...args),
}));
vi.mock('@/features/requirement/api/rfq-lifecycle', () => ({
  discoverAndInvite: (...args: unknown[]) => discoverAndInvite(...args),
}));

import { supabase } from '@/lib/supabase';
import { FAST_TRACK_LOCATION_REQUIRED_ERROR, fastTrackExpressIntake } from './fast-track-intake';
import { pickPrimaryAddress, resolveLocationPrefill } from './primary-address';

const mock = supabase as unknown as { rpc: ReturnType<typeof vi.fn>; from: ReturnType<typeof vi.fn> };

beforeEach(() => {
  mock.rpc = vi.fn();
  mock.from = vi.fn();
  createDraft.mockReset();
  publishDraft.mockReset();
  discoverAndInvite.mockReset();
  createDraft.mockResolvedValue({ ok: true, draft: { requirementId: 'req-1' } });
  publishDraft.mockResolvedValue({ ok: true, requirementId: 'req-1', rfqId: 'rfq-1', publicRef: 'R-1' });
  discoverAndInvite.mockResolvedValue({ ok: true });
});

describe('Issue 06: fast-track intake never invents a location', () => {
  it('has no hard-coded Tiruppur fallback or hard-coded PIN code in the source', () => {
    const src = readFileSync(resolve(__dirname, 'fast-track-intake.ts'), 'utf8');
    // The old unconditional fallback was the last statement of resolveDeliveryCity.
    expect(src).not.toMatch(/return 'Tiruppur';\r?\n\}/);
    expect(src).not.toMatch(/['"][1-9][0-9]{5}['"]/);
  });

  it('refuses to create a draft when no city/PIN is known and no primary address exists', async () => {
    mock.rpc.mockResolvedValue({ data: { ok: true, addresses: [] }, error: null });
    const res = await fastTrackExpressIntake('Need 50 ergonomic chairs');
    expect(res).toEqual({ ok: false, error: FAST_TRACK_LOCATION_REQUIRED_ERROR });
    expect(createDraft).not.toHaveBeenCalled();
    expect(publishDraft).not.toHaveBeenCalled();
  });

  it('prefills city and PIN from the PRIMARY address only (org first, then personal)', async () => {
    mock.rpc.mockImplementation(async (_fn: string, args: { p_org_id: string | null }) => {
      if (args.p_org_id === 'org-1') {
        return {
          data: {
            ok: true,
            addresses: [
              { id: 'a-other', is_primary: false, city: 'Salem', pincode: '636001' },
              { id: 'a-prim', is_primary: true, city: 'Coimbatore', pincode: '641018' },
            ],
          },
          error: null,
        };
      }
      return { data: { ok: true, addresses: [] }, error: null };
    });

    const res = await fastTrackExpressIntake('Need 50 ergonomic chairs', { organizationId: 'org-1' });
    expect(res.ok).toBe(true);
    const parsed = createDraft.mock.calls[0]![0].parsed;
    expect(parsed.deliveryCity).toBe('Coimbatore');
    expect(parsed.deliveryPincode).toBe('641018');
    expect(mock.rpc).toHaveBeenCalledWith('get_buyer_addresses', { p_org_id: 'org-1' });
  });

  it('a city typed in the requirement wins over the primary address', async () => {
    mock.rpc.mockResolvedValue({
      data: { ok: true, addresses: [{ id: 'a', is_primary: true, city: 'Coimbatore', pincode: '641018' }] },
      error: null,
    });
    await fastTrackExpressIntake('Need 50 ergonomic chairs in Chennai 600040');
    const parsed = createDraft.mock.calls[0]![0].parsed;
    expect(parsed.deliveryCity).toBe('Chennai');
    expect(parsed.deliveryPincode).toBe('600040');
  });
});

describe('Issue 06: primary-address prefill helpers', () => {
  it('ignores non-primary addresses (no "first address" guess)', () => {
    expect(pickPrimaryAddress([{ id: 'x', is_primary: false, city: 'Salem', pincode: '636001' }])).toBeNull();
    expect(pickPrimaryAddress(null)).toBeNull();
  });

  it('only fills empty fields so manual / draft values survive', () => {
    const primary = { addressId: 'a', city: 'Coimbatore', pincode: '641018', line1: null };
    expect(resolveLocationPrefill({ city: '', pincode: '' }, primary)).toEqual({
      city: 'Coimbatore',
      pincode: '641018',
    });
    expect(resolveLocationPrefill({ city: 'Madurai', pincode: '' }, primary)).toEqual({ pincode: '641018' });
    expect(resolveLocationPrefill({ city: 'Madurai', pincode: '625001' }, primary)).toEqual({});
    expect(resolveLocationPrefill({ city: '', pincode: '' }, null)).toEqual({});
  });
});
