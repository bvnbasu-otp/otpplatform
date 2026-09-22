import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isSuperAdminEmail,
  resolvePortalRole,
  fetchCurrentProfile,
  SUPERADMIN_EMAILS,
} from '@/features/auth/user-role';
import { SignInForm } from '@/features/auth/components/SignInForm';
import { supabase } from '@/lib/supabase';
import { createSupabaseQueryMock } from '@/lib/supabase-query-mock';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock };
});

const createMockQueryBuilder = createSupabaseQueryMock;

describe('Auth Feature & Portal Role Resolution', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
    vi.mocked(supabase.auth.getUser).mockReset();
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: null }, error: null } as any);
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any);
    vi.mocked(supabase.from).mockImplementation(() => createMockQueryBuilder([]));
  });

  afterEach(() => {
    vi.mocked(supabase.from).mockImplementation(() => createMockQueryBuilder([]));
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any);
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: null }, error: null } as any);
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
        return createMockQueryBuilder([{ id: 'su-1', supplier_id: 'supp-1', profile_id: 'prof-supp' }]);
      }
      return createMockQueryBuilder([]);
    });
    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    const role = await resolvePortalRole('prof-supp', false, 'vendor@test.com');
    expect(role).toBe('supplier');
  });

  it('resolves portal role as buyer when linked to organization_members', async () => {
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'supplier_users') {
        return createMockQueryBuilder([]);
      }
      if (table === 'organization_members') {
        return createMockQueryBuilder([{ id: 'om-1', organization_id: 'org-1', profile_id: 'prof-buyer' }]);
      }
      return createMockQueryBuilder([]);
    });
    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    const role = await resolvePortalRole('prof-buyer', false, 'buyer@test.com');
    expect(role).toBe('buyer');
  });

  it('resolves portal role as supplier when matched by contact_email in suppliers table', async () => {
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'suppliers') {
        return createMockQueryBuilder([{ id: 'supp-direct-1', business_name: 'Acme Direct' }]);
      }
      return createMockQueryBuilder([]);
    });
    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    const role = await resolvePortalRole('prof-unknown-id', false, 'contact@acmedirect.com');
    expect(role).toBe('supplier');
  });

  it('resolves portal role as supplier when profile has active_role_code starting with SUPPLIER', async () => {
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return createMockQueryBuilder({ id: 'prof-supp-role', active_role_code: 'SUPPLIER_FOUNDER' });
      }
      return createMockQueryBuilder([]);
    });
    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    const role = await resolvePortalRole('prof-supp-role', false, 'user@domain.com');
    expect(role).toBe('supplier');
  });

  it('resolves portal role as supplier for demo/heuristic supplier emails', async () => {
    const mockFrom = vi.fn().mockImplementation(() => createMockQueryBuilder([]));
    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    const role1 = await resolvePortalRole('prof-heuristic-1', false, 'solar_power@enterprise.com');
    expect(role1).toBe('supplier');

    const role2 = await resolvePortalRole('prof-heuristic-2', false, 'contact01@otpdemo.test');
    expect(role2).toBe('supplier');
  });

  it('resolves portal role as unknown when neither supplier nor buyer org member', async () => {
    const mockFrom = vi.fn().mockImplementation(() => createMockQueryBuilder([]));
    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    const role = await resolvePortalRole('prof-anon', false, 'anon@test.com');
    expect(role).toBe('unknown');
  });

  it('fetches current profile with admin status and active organization', async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: {
        user: {
          id: 'auth-usr-1',
          email: 'admin@corp.test',
        } as any,
      },
      error: null,
    });

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return createMockQueryBuilder({
          id: 'prof-usr-1',
          email: 'admin@corp.test',
          full_name: 'Admin User',
          is_platform_admin: true,
          active_organization_id: 'org-main-1',
        });
      }
      return createMockQueryBuilder([]);
    });
    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    const profile = await fetchCurrentProfile();
    expect(profile).not.toBeNull();
    expect(profile?.profileId).toBe('prof-usr-1');
    expect(profile?.email).toBe('admin@corp.test');
    expect(profile?.fullName).toBe('Admin User');
    expect(profile?.isPlatformAdmin).toBe(true);
    expect(profile?.activeOrganizationId).toBe('org-main-1');
  });

  it('returns null when user is not authenticated', async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: null },
      error: null,
    } as any);

    const profile = await fetchCurrentProfile();
    expect(profile).toBeNull();
  });
});

describe('SignInForm Component & Demo Personas', () => {
  it('exports SignInForm authentication component', () => {
    expect(SignInForm).toBeDefined();
    expect(typeof SignInForm).toBe('function');
  });

  it('correctly maps demo community secretary to buyer portal role', async () => {
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'supplier_users') {
        return createMockQueryBuilder([]);
      }
      if (table === 'organization_members') {
        return createMockQueryBuilder([
          { id: 'om-ramesh', organization_id: 'org-durga-rainbow', profile_id: 'prof-ramesh' },
        ]);
      }
      return createMockQueryBuilder([]);
    });
    vi.mocked(supabase.from).mockImplementation(mockFrom as any);

    // Ramesh (Durga Rainbow RWA secretary demo account)
    const role = await resolvePortalRole('prof-ramesh', false, 'secretary@sunrise.test');
    expect(role).toBe('buyer');
  });
});
