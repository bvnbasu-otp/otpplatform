import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchUserOrganization, fetchOrganizationRequirements } from './api/requirements';
import { supabase } from '@/lib/supabase';
import * as userRole from '@/features/auth/user-role';

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
      auth: {
        getUser: vi.fn(),
      },
    },
  };
});

function createSupabaseQueryMock(resolvedResult: { data: any; error: any }) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn().mockResolvedValue(resolvedResult),
    single: vi.fn().mockResolvedValue(resolvedResult),
    then: (resolve: (val: any) => any, reject?: (err: any) => any) =>
      Promise.resolve(resolvedResult).then(resolve, reject),
  };
  return chain;
}

describe('Requirement Feature Module Tests', () => {
  let profileSpy: any;

  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
    profileSpy = vi.spyOn(userRole, 'fetchCurrentProfile').mockResolvedValue({
      profileId: 'prof-buyer-1',
      email: 'procurement@apex.test',
      fullName: 'Rohan Sharma',
      activeOrganizationId: 'org-apex-1',
    });
  });

  afterEach(() => {
    profileSpy?.mockRestore();
  });

  describe('fetchUserOrganization', () => {
    it('fetches active user organization successfully', async () => {
      const mockChain = createSupabaseQueryMock({
        data: {
          role: 'ADMIN',
          organizations: {
            id: 'org-apex-1',
            name: 'Apex Enterprises',
            org_type: 'MSME',
          },
        },
        error: null,
      });
      vi.mocked(supabase.from).mockImplementation(() => mockChain);

      const res = await fetchUserOrganization();
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.org.organizationId).toBe('org-apex-1');
        expect(res.org.organizationName).toBe('Apex Enterprises');
        expect(res.org.orgType).toBe('MSME');
        expect(res.org.role).toBe('ADMIN');
      }
    });

    it('handles organizations returned as an array from join relation', async () => {
      const mockChain = createSupabaseQueryMock({
        data: {
          role: 'MANAGER',
          organizations: [
            {
              id: 'org-apex-1',
              name: 'Apex Enterprises',
              org_type: 'ENTERPRISE',
            },
          ],
        },
        error: null,
      });
      vi.mocked(supabase.from).mockImplementation(() => mockChain);

      const res = await fetchUserOrganization();
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.org.organizationId).toBe('org-apex-1');
        expect(res.org.organizationName).toBe('Apex Enterprises');
        expect(res.org.orgType).toBe('ENTERPRISE');
        expect(res.org.role).toBe('MANAGER');
      }
    });

    it('falls back to default membership if active organization query yields no org', async () => {
      vi.spyOn(userRole, 'fetchCurrentProfile').mockResolvedValueOnce({
        profileId: 'prof-buyer-2',
        email: 'buyer2@apex.test',
        fullName: 'Anita Roy',
        activeOrganizationId: undefined,
      });

      const mockChain = createSupabaseQueryMock({
        data: {
          role: 'BUYER',
          organizations: {
            id: 'org-fallback-1',
            name: 'Fallback Industries',
            org_type: 'MID_MARKET',
          },
        },
        error: null,
      });
      vi.mocked(supabase.from).mockImplementation(() => mockChain);

      const res = await fetchUserOrganization();
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.org.organizationId).toBe('org-fallback-1');
        expect(res.org.organizationName).toBe('Fallback Industries');
        expect(res.org.role).toBe('BUYER');
      }
    });

    it('returns error when user is not authenticated', async () => {
      vi.spyOn(userRole, 'fetchCurrentProfile').mockResolvedValueOnce(null as any);

      const res = await fetchUserOrganization();
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe('Not authenticated');
      }
    });

    it('returns error when supabase query fails in fallback path', async () => {
      vi.spyOn(userRole, 'fetchCurrentProfile').mockResolvedValueOnce({
        profileId: 'prof-buyer-3',
        email: 'buyer3@apex.test',
        fullName: 'Suresh Kumar',
        activeOrganizationId: undefined,
      });

      const mockChain = createSupabaseQueryMock({
        data: null,
        error: { message: 'Database query timeout' },
      });
      vi.mocked(supabase.from).mockImplementation(() => mockChain);

      const res = await fetchUserOrganization();
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe('Database query timeout');
      }
    });
  });

  describe('fetchOrganizationRequirements', () => {
    it('fetches and maps organization requirement list with quote counts', async () => {
      const mockReqRows = [
        {
          id: 'req-1',
          title: 'CNC Lathe Components',
          requirement_type: 'PRODUCTS',
          status: 'PUBLISHED',
          created_at: '2026-09-10T10:00:00Z',
          published_at: '2026-09-10T11:00:00Z',
          rfqs: [
            {
              id: 'rfq-1',
              status: 'OPEN',
              reveal_status: 'MASKED',
              min_quotes_required: 3,
              purchase_orders: [],
            },
          ],
        },
      ];

      const mockChain = createSupabaseQueryMock({ data: mockReqRows, error: null });
      vi.mocked(supabase.from).mockImplementation(() => mockChain);

      vi.mocked(supabase.rpc).mockResolvedValue({
        data: [{ rfq_id: 'rfq-1', quotes_count: 4 }],
        error: null,
      } as any);

      const res = await fetchOrganizationRequirements('org-apex-1');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.requirements).toHaveLength(1);
        const req = res.requirements[0];
        expect(req).toBeDefined();
        expect(req?.id).toBe('req-1');
        expect(req?.rfqId).toBe('rfq-1');
        expect(req?.quotesCount).toBe(4);
        expect(req?.minQuotesRequired).toBe(3);
        expect(req?.isSettled).toBe(false);
        expect(req?.effectiveStatus).toBe('PUBLISHED');
      }
    });

    it('correctly identifies completed and settled requirement with 100% work order progress', async () => {
      const mockReqRows = [
        {
          id: 'req-2',
          title: 'Precision Machining Order',
          requirement_type: 'SERVICES',
          status: 'IN_PROGRESS',
          created_at: '2026-09-01T08:00:00Z',
          published_at: '2026-09-01T09:00:00Z',
          rfqs: {
            id: 'rfq-2',
            status: 'AWARDED',
            reveal_status: 'REVEALED',
            min_quotes_required: 3,
            purchase_orders: {
              id: 'po-2',
              status: 'IN_PROGRESS',
              work_orders: {
                id: 'wo-2',
                status: 'IN_PROGRESS',
                progress_percent: 100,
                buyer_accepted_at: '2026-09-12T14:00:00Z',
              },
            },
          },
        },
      ];

      const mockChain = createSupabaseQueryMock({ data: mockReqRows, error: null });
      vi.mocked(supabase.from).mockImplementation(() => mockChain);

      vi.mocked(supabase.rpc).mockResolvedValue({
        data: [{ rfq_id: 'rfq-2', quotes_count: 5 }],
        error: null,
      } as any);

      const res = await fetchOrganizationRequirements('org-apex-1');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.requirements).toHaveLength(1);
        const req = res.requirements[0];
        expect(req).toBeDefined();
        expect(req?.id).toBe('req-2');
        expect(req?.rfqId).toBe('rfq-2');
        expect(req?.quotesCount).toBe(5);
        expect(req?.isSettled).toBe(true);
        expect(req?.effectiveStatus).toBe('COMPLETED');
        expect(req?.workOrderProgressPercent).toBe(100);
      }
    });

    it('returns error when requirements query fails', async () => {
      const mockChain = createSupabaseQueryMock({
        data: null,
        error: { message: 'Failed to fetch requirements' },
      });
      vi.mocked(supabase.from).mockImplementation(() => mockChain);

      const res = await fetchOrganizationRequirements('org-apex-1');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe('Failed to fetch requirements');
      }
    });

    it('returns error when rpc quotes count query fails', async () => {
      const mockChain = createSupabaseQueryMock({ data: [], error: null });
      vi.mocked(supabase.from).mockImplementation(() => mockChain);

      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: 'RPC execution failed' },
      } as any);

      const res = await fetchOrganizationRequirements('org-apex-1');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe('RPC execution failed');
      }
    });
  });
});
