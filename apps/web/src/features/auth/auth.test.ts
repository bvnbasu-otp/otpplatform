import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isSuperAdminEmail, resolvePortalRole, SUPERADMIN_EMAILS } from './user-role';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(),
    },
  };
});

describe('Auth Feature & Portal Role Resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('correctly identifies superadmin emails', () => {
    for (const email of SUPERADMIN_EMAILS) {
      expect(isSuperAdminEmail(email)).toBe(true);
      expect(isSuperAdminEmail(email.toUpperCase())).toBe(true);
    }
    expect(isSuperAdminEmail('user@regular.com')).toBe(false);
    expect(isSuperAdminEmail(null)).toBe(false);
    expect(isSuperAdminEmail(undefined)).toBe(false);
    expect(isSuperAdminEmail('')).toBe(false);
  });

  it('resolves portal role as admin when isPlatformAdmin is true or superadmin email', async () => {
    const role1 = await resolvePortalRole('prof-1', true, 'regular@corp.com');
    expect(role1).toBe('admin');

    const role2 = await resolvePortalRole('prof-2', false, 'admin@otp.test');
    expect(role2).toBe('admin');
  });

  it('resolves portal role as supplier when linked to supplier_users', async () => {
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'supplier_users') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [{ id: 'su-1' }] }),
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'su-1' } }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [] }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      };
    });
    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    const role = await resolvePortalRole('prof-supp', false, 'vendor@test.com');
    expect(role).toBe('supplier');
  });

  it('resolves portal role as buyer when linked to organization_members', async () => {
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'supplier_users') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [] }),
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            }),
          }),
        };
      }
      if (table === 'organization_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [{ id: 'om-1' }] }),
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'om-1' } }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [] }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      };
    });
    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    const role = await resolvePortalRole('prof-buyer', false, 'buyer@test.com');
    expect(role).toBe('buyer');
  });

  it('resolves portal role as unknown when neither supplier nor buyer org member', async () => {
    const mockFrom = vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [] }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
    }));
    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    const role = await resolvePortalRole('prof-anon', false, 'anon@test.com');
    expect(role).toBe('unknown');
  });
});
