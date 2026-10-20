import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/lib/supabase';
import {
  fetchRfqReviewData,
  runExplicitSupplierDiscovery,
  publishRfq,
} from './api/rfq-lifecycle';
import { createSupabaseQueryMock } from '@/lib/supabase-query-mock';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    functions: { invoke: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }) },
    auth: { getUser: vi.fn() },
  };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock };
});

describe('explicit supplier discovery and side-effect-safe publish', () => {
  it('DiscoverSuppliersPage does not call discoverForRequirement on initial refresh', () => {
    const src = readFileSync(
      resolve(__dirname, 'pages/DiscoverSuppliersPage.tsx'),
      'utf8',
    );
    expect(src).not.toContain('discoverForRequirement');
    expect(src).toContain('runExplicitSupplierDiscovery');
    expect(src).toContain('refreshSupplierInvitationPool');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { success: true, invited: 2, total: 2 }, error: null } as any);
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { ok: true }, error: null } as any);
  });

  it('runExplicitSupplierDiscovery tries OTP then Google Places and dedupes in-flight calls', async () => {
    const rpcCalls: string[] = [];
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      rpcCalls.push(fn);
      return Promise.resolve({ data: { success: true, invited: 1, total: 1 }, error: null });
    }) as any);

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'rfq_supplier_networks') {
        return createSupabaseQueryMock({ data: [{ invited_count: rpcCalls.length > 1 ? 1 : 0 }], error: null });
      }
      if (table === 'rfq_invitations_manager') {
        return createSupabaseQueryMock({
          data: rpcCalls.length > 1
            ? [{ invitation_id: 'inv-1', anonymous_label: 'Supplier #01', status: 'INVITED', match_score: 80, match_reasons: ['otp_registered'] }]
            : [],
          error: null,
        });
      }
      if (table === 'rfqs') {
        return createSupabaseQueryMock({ data: { id: 'rfq-1', requirement_id: 'req-1', status: 'DRAFT' }, error: null });
      }
      if (table === 'requirements') {
        return createSupabaseQueryMock({
          data: {
            id: 'req-1',
            title: 'Motors',
            description: 'Rewind',
            delivery_city: 'Bengaluru',
            delivery_pincode: '560001',
            delivery_state: 'Karnataka',
            category_id: 'cat-1',
            subcategory_id: 'sub-1',
          },
          error: null,
        });
      }
      if (table === 'requirement_categories') {
        return createSupabaseQueryMock({ data: { name: 'Electrical' }, error: null });
      }
      if (table === 'requirement_subcategories') {
        return createSupabaseQueryMock({ data: { name: 'Motors' }, error: null });
      }
      return createSupabaseQueryMock({ data: null, error: null });
    });

    const [a, b] = await Promise.all([
      runExplicitSupplierDiscovery('rfq-1'),
      runExplicitSupplierDiscovery('rfq-1'),
    ]);
    expect(a).toEqual(b);
    expect(rpcCalls.filter((fn) => fn === 'discover_and_invite_for_rfq').length).toBeGreaterThanOrEqual(1);
  });

  it('fetchRfqReviewData does not call discover_and_invite when the pool is empty', async () => {
    const rpcCalls: string[] = [];
    vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
      rpcCalls.push(fn);
      return Promise.resolve({ data: null, error: null });
    }) as any);

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'requirements') {
        return createSupabaseQueryMock({
          data: {
            id: 'req-empty',
            title: 'Generator',
            description: 'Service',
            delivery_city: 'Bengaluru',
            delivery_pincode: '560001',
            commercial: {},
            status: 'RFQ_CREATED',
          },
          error: null,
        });
      }
      if (table === 'rfqs') {
        return createSupabaseQueryMock({
          data: { id: 'rfq-empty', status: 'DRAFT', quote_deadline: new Date(Date.now() + 86400000).toISOString() },
          error: null,
        });
      }
      if (table === 'rfq_invitations_manager') return createSupabaseQueryMock({ data: [], error: null });
      return createSupabaseQueryMock({ data: null, error: null });
    });

    await fetchRfqReviewData('req-empty', 'rfq-empty');
    expect(rpcCalls).not.toContain('discover_and_invite_for_rfq');
  });

  it('publishRfq surfaces invitation count load failures distinctly from zero invitations', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'rfq_supplier_networks') {
        return createSupabaseQueryMock({ data: null, error: { message: 'network down' } });
      }
      return createSupabaseQueryMock({ data: { id: 'rfq-x', status: 'DRAFT' }, error: null });
    });

    const res = await publishRfq({ rfqId: 'rfq-x', requirementId: 'req-x' });
    expect(res).toEqual({ ok: false, error: 'Could not load invitation count: network down' });
  });
});
