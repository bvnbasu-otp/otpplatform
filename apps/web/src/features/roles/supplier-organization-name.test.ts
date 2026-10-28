import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchRoleContext } from './api/roles';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

describe('fetchRoleContext supplier organizationName resolution', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('populates context.organizationName and reconciles side when supplier logs in via RPC', async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
      data: {
        user: {
          id: 'user-supp-1',
          email: 'supplier01@otpdemo.test',
          user_metadata: { business_name: 'Aqua Prime Borewell Works' },
        } as any,
      },
      error: null,
    });

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: {
        signedIn: true,
        profileId: 'prof-supp-1',
        activeRole: {
          code: 'SUPPLIER_FOUNDER',
          side: 'SUPPLIER',
          label: 'Supplier Founder',
        },
        organizationName: 'Aqua Prime Borewell Works',
      },
      error: null,
    } as any);

    const res = await fetchRoleContext();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.context.organizationName).toBe('Aqua Prime Borewell Works');
      expect(res.context.side).toBe('SUPPLIER');
    }
  });

  it('resolves supplier organizationName from suppliers join in fallback query when RPC fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'RPC failure' },
    } as any);

    vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
      data: {
        user: {
          id: 'user-supp-2',
          email: 'supplier32@otpdemo.test',
        } as any,
      },
      error: null,
    });

    const mockProfileMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'prof-supp-2',
        email: 'supplier32@otpdemo.test',
        status: 'ACTIVE',
        active_role_code: 'SUPPLIER_FOUNDER',
        active_portal_side: 'SUPPLIER',
      },
      error: null,
    });

    const mockSuppUsersLimit = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'su-1',
          supplier_id: 'sup-32',
          suppliers: { business_name: 'Erode Turmeric Traders' },
        },
      ],
      error: null,
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({ maybeSingle: mockProfileMaybeSingle }),
          }),
        } as any;
      }
      if (table === 'supplier_users') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({ limit: mockSuppUsersLimit }),
          }),
        } as any;
      }
      return {
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
          eq: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
        }),
      } as any;
    });

    const res = await fetchRoleContext();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.context.side).toBe('SUPPLIER');
      expect(res.context.organizationName).toBe('Erode Turmeric Traders');
      expect(res.context.supplierId).toBe('sup-32');
    }
  });

  it('falls back to user_metadata business_name when supplier table relation has no name', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'RPC failure' },
    } as any);

    vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
      data: {
        user: {
          id: 'user-supp-3',
          email: 'supplier40@otpdemo.test',
          user_metadata: { business_name: 'SunVolt Solar Solutions' },
        } as any,
      },
      error: null,
    });

    const mockProfileMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'prof-supp-3',
        email: 'supplier40@otpdemo.test',
        status: 'ACTIVE',
        active_role_code: 'SUPPLIER_FOUNDER',
        active_portal_side: 'SUPPLIER',
      },
      error: null,
    });

    const mockSuppUsersLimit = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({ maybeSingle: mockProfileMaybeSingle }),
          }),
        } as any;
      }
      if (table === 'supplier_users') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({ limit: mockSuppUsersLimit }),
          }),
        } as any;
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      } as any;
    });

    const res = await fetchRoleContext();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.context.side).toBe('SUPPLIER');
      expect(res.context.organizationName).toBe('SunVolt Solar Solutions');
    }
  });
});
