import { supabase } from '@/lib/supabase';

export type PortalRole = 'founder' | 'admin' | 'buyer' | 'supplier' | 'unknown';

export interface UserProfile {
  profileId: string;
  email: string;
  fullName: string | null;
  isFounder?: boolean;
  isPlatformAdmin?: boolean;
  activeOrganizationId?: string | null;
}

export const FOUNDER_EMAILS = [
  'bvnbasu@gmail.com',
  'founder@otp.test',
];

export const OPERATIONS_EMAILS = [
  'admin@otp.test',
  'ops@otp.test',
];

export const SUPERADMIN_EMAILS = [
  ...FOUNDER_EMAILS,
  ...OPERATIONS_EMAILS,
];

export function isFounderEmail(email?: string | null): boolean {
  if (!email) return false;
  return FOUNDER_EMAILS.includes(email.trim().toLowerCase());
}

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return SUPERADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export async function fetchCurrentProfile(): Promise<UserProfile | null> {
  const authRes = await supabase.auth.getUser();
  const authUser = authRes?.data?.user;
  if (!authUser) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, is_founder, is_platform_admin, active_organization_id')
    .or(`auth_user_id.eq.${authUser.id},id.eq.${authUser.id}`)
    .maybeSingle();

  if (error || !data) {
    if (authUser.email) {
      const { data: fallbackData } = await supabase
        .from('profiles')
        .select('id, email, full_name, is_founder, is_platform_admin, active_organization_id')
        .eq('email', authUser.email)
        .maybeSingle();
      if (fallbackData) {
        const isFounder = Boolean(
          fallbackData.is_founder || isFounderEmail(fallbackData.email) || isFounderEmail(authUser.email)
        );
        const isAdmin = Boolean(
          isFounder ||
            fallbackData.is_platform_admin ||
            isSuperAdminEmail(fallbackData.email) ||
            isSuperAdminEmail(authUser.email)
        );
        return {
          profileId: fallbackData.id,
          email: fallbackData.email,
          fullName: fallbackData.full_name,
          isFounder,
          isPlatformAdmin: isAdmin,
          activeOrganizationId: (fallbackData.active_organization_id as string | null) ?? null,
        };
      }
    }
    return null;
  }

  const isFounder = Boolean(
    data.is_founder || isFounderEmail(data.email) || isFounderEmail(authUser.email)
  );
  const isAdmin = Boolean(
    isFounder ||
      data.is_platform_admin ||
      isSuperAdminEmail(data.email) ||
      isSuperAdminEmail(authUser.email)
  );

  return {
    profileId: data.id,
    email: data.email,
    fullName: data.full_name,
    isFounder,
    isPlatformAdmin: isAdmin,
    activeOrganizationId: (data.active_organization_id as string | null) ?? null,
  };
}

export async function resolvePortalRole(
  profileId: string,
  isPlatformAdmin?: boolean,
  email?: string | null,
  isFounder?: boolean,
): Promise<PortalRole> {
  if (isFounder || isFounderEmail(email)) return 'founder';
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
