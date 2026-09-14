import { supabase } from '@/lib/supabase';

export type PortalRole = 'admin' | 'buyer' | 'supplier' | 'unknown';

export interface UserProfile {
  profileId: string;
  email: string;
  fullName: string | null;
  isPlatformAdmin?: boolean;
  activeOrganizationId?: string | null;
}

export const SUPERADMIN_EMAILS = [
  'bvnbasu@gmail.com',
  'admin@otp.test',
  'ops@otp.test',
];

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return SUPERADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export async function fetchCurrentProfile(): Promise<UserProfile | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, is_platform_admin, active_organization_id')
    .or(`auth_user_id.eq.${auth.user.id},id.eq.${auth.user.id}`)
    .maybeSingle();

  if (error || !data) {
    if (auth.user.email) {
      const { data: fallbackData } = await supabase
        .from('profiles')
        .select('id, email, full_name, is_platform_admin, active_organization_id')
        .eq('email', auth.user.email)
        .maybeSingle();
      if (fallbackData) {
        const isAdmin = Boolean(
          fallbackData.is_platform_admin ||
            isSuperAdminEmail(fallbackData.email) ||
            isSuperAdminEmail(auth.user.email)
        );
        return {
          profileId: fallbackData.id,
          email: fallbackData.email,
          fullName: fallbackData.full_name,
          isPlatformAdmin: isAdmin,
          activeOrganizationId: (fallbackData.active_organization_id as string | null) ?? null,
        };
      }
    }
    return null;
  }

  const isAdmin = Boolean(
    data.is_platform_admin ||
      isSuperAdminEmail(data.email) ||
      isSuperAdminEmail(auth.user.email)
  );

  return {
    profileId: data.id,
    email: data.email,
    fullName: data.full_name,
    isPlatformAdmin: isAdmin,
    activeOrganizationId: (data.active_organization_id as string | null) ?? null,
  };
}

export async function resolvePortalRole(
  profileId: string,
  isPlatformAdmin?: boolean,
  email?: string | null,
): Promise<PortalRole> {
  if (isPlatformAdmin || isSuperAdminEmail(email)) return 'admin';

  try {
    // 1. Check supplier_users by profileId
    const { data: supplierRows } = await supabase
      .from('supplier_users')
      .select('id, supplier_id')
      .eq('profile_id', profileId)
      .limit(1);

    if (supplierRows && (Array.isArray(supplierRows) ? supplierRows.length > 0 : Boolean(supplierRows))) {
      return 'supplier';
    }
  } catch {
    // Fall through to next check
  }

  // 2. Check suppliers table directly by contact_email
  if (email) {
    try {
      const { data: directSuppliers } = await supabase
        .from('suppliers')
        .select('id')
        .eq('contact_email', email)
        .limit(1);

      if (directSuppliers && (Array.isArray(directSuppliers) ? directSuppliers.length > 0 : Boolean(directSuppliers))) {
        return 'supplier';
      }
    } catch {
      // Fall through to next check
    }
  }

  // 3. Check profile role code
  try {
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('active_role_code')
      .eq('id', profileId)
      .maybeSingle();

    if (profileRow?.active_role_code && profileRow.active_role_code.startsWith('SUPPLIER')) {
      return 'supplier';
    }
  } catch {
    // Fall through to next check
  }

  // 4. Check organization members for buyer
  try {
    const { data: orgRows } = await supabase
      .from('organization_members')
      .select('id')
      .eq('profile_id', profileId)
      .limit(1);

    if (orgRows && (Array.isArray(orgRows) ? orgRows.length > 0 : Boolean(orgRows))) {
      return 'buyer';
    }
  } catch {
    // Fall through to next check
  }

  // 5. Heuristic check on email domain / prefix for demo supplier accounts
  if (email) {
    const normalized = email.toLowerCase();
    if (
      normalized.includes('solar') ||
      normalized.includes('furniture') ||
      normalized.includes('cctv') ||
      normalized.includes('water') ||
      normalized.includes('borewell') ||
      normalized.includes('supplier') ||
      normalized.includes('royalteak') ||
      normalized.includes('urbanspace') ||
      normalized.includes('societycomfort') ||
      (normalized.startsWith('contact') && normalized.endsWith('@otpdemo.test'))
    ) {
      return 'supplier';
    }
  }

  return 'unknown';
}
