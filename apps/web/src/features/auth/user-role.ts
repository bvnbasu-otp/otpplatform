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
    .eq('auth_user_id', auth.user.id)
    .maybeSingle();

  if (error || !data) return null;

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

  const { data: supplierRows } = await supabase
    .from('supplier_users')
    .select('id')
    .eq('profile_id', profileId)
    .limit(1);

  if (supplierRows && supplierRows.length > 0) return 'supplier';

  const { data: orgRows } = await supabase
    .from('organization_members')
    .select('id')
    .eq('profile_id', profileId)
    .limit(1);

  if (orgRows && orgRows.length > 0) return 'buyer';

  return 'unknown';
}
