import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchUserOrganization, fetchOrganizationRequirements } from './api/requirements';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
    },
  };
});

vi.mock('@/features/auth/user-role', () => ({
  fetchCurrentProfile: vi.fn().mockResolvedValue({
    profileId: 'prof-buyer-1',
    email: 'procurement@apex.test',
    fullName: 'Rohan Sharma',
    activeOrganizationId: 'org-apex-1',
  }),
}));

describe('Requirement Feature Module Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches active user organization successfully', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                role: 'ADMIN',
                organizations: {
                  id: 'org-apex-1',
                  name: 'Apex Enterprises',
                  org_type: 'MSME',
                },
              },
              error: null,
            }),
          }),
        }),
      }),
    });
    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    const res = await fetchUserOrganization();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.org.organizationId).toBe('org-apex-1');
      expect(res.org.organizationName).toBe('Apex Enterprises');
      expect(res.org.orgType).toBe('MSME');
      expect(res.org.role).toBe('ADMIN');
    }
  });

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

    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockReqRows, error: null }),
        }),
      }),
    });
    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ rfq_id: 'rfq-1', quotes_count: 4 }],
      error: null,
    } as any);

    const res = await fetchOrganizationRequirements('org-apex-1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.requirements).toHaveLength(1);
      const req = res.requirements[0];
      expect(req.id).toBe('req-1');
      expect(req.rfqId).toBe('rfq-1');
      expect(req.quotesCount).toBe(4);
      expect(req.minQuotesRequired).toBe(3);
    }
  });
});
