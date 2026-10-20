import { supabase } from '@/lib/supabase';

export async function changePasswordSecure(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('change_password_secure', {
    p_current_password: currentPassword,
    p_new_password: newPassword,
  });
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean; error?: string } | null;
  if (!row?.ok) return { ok: false, error: row?.error ?? 'Password could not be updated.' };
  return { ok: true };
}

export async function setPasswordSecure(newPassword: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('set_password_secure', {
    p_new_password: newPassword,
  });
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean; error?: string } | null;
  if (!row?.ok) return { ok: false, error: row?.error ?? 'Password could not be updated.' };
  return { ok: true };
}
