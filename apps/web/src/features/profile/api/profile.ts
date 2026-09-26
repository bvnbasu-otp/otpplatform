import { describeNotificationStatus } from '@otp/domain';
import { supabase } from '@/lib/supabase';
import { dispatchWhatsAppText } from '@/features/notifications/lib/outbound-dispatch';

export interface UserProfileDetails {
  id: string;
  email: string;
  phone: string;
  fullName: string;
  title: string;
  avatarUrl: string;
  isPlatformAdmin: boolean;
  activeRoleCode?: string | null;
  activeOrganizationId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateProfileInput {
  fullName: string;
  title?: string;
  avatarUrl?: string;
}

export async function fetchMyProfile(): Promise<
  { ok: true; profile: UserProfileDetails } | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('get_my_profile');
  if (error) {
    return { ok: false, error: error.message };
  }
  const res = (data ?? {}) as { ok?: boolean; profile?: Record<string, unknown>; error?: string };
  if (!res.ok || !res.profile) {
    return { ok: false, error: res.error || 'Failed to fetch profile' };
  }

  const p = res.profile;
  return {
    ok: true,
    profile: {
      id: String(p.id ?? ''),
      email: String(p.email ?? ''),
      phone: String(p.phone ?? 'Not registered'),
      fullName: String(p.full_name ?? ''),
      title: String(p.title ?? ''),
      avatarUrl: String(p.avatar_url ?? ''),
      isPlatformAdmin: Boolean(p.is_platform_admin),
      activeRoleCode: (p.active_role_code as string) ?? null,
      activeOrganizationId: (p.active_organization_id as string) ?? null,
      createdAt: (p.created_at as string) ?? undefined,
      updatedAt: (p.updated_at as string) ?? undefined,
    },
  };
}

export async function updateMyProfile(
  input: UpdateProfileInput
): Promise<{ ok: true; profile: UserProfileDetails; message: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('update_my_profile', {
    p_full_name: input.fullName.trim(),
    p_title: input.title?.trim() || null,
    p_avatar_url: input.avatarUrl?.trim() || null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const res = (data ?? {}) as { ok?: boolean; profile?: Record<string, unknown>; message?: string; error?: string };
  if (!res.ok || !res.profile) {
    return { ok: false, error: res.error || 'Failed to update profile' };
  }

  const p = res.profile;
  return {
    ok: true,
    message: res.message || 'Profile updated successfully',
    profile: {
      id: String(p.id ?? ''),
      email: String(p.email ?? ''),
      phone: String(p.phone ?? ''),
      fullName: String(p.full_name ?? ''),
      title: String(p.title ?? ''),
      avatarUrl: String(p.avatar_url ?? ''),
      isPlatformAdmin: Boolean(p.is_platform_admin),
      updatedAt: (p.updated_at as string) ?? undefined,
    },
  };
}

export async function updateOrganizationName(
  organizationName: string,
  organizationId?: string | null
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const trimmed = organizationName.trim();
  if (!trimmed || trimmed.length < 2) {
    return { ok: false, error: 'Organization name must be at least 2 characters.' };
  }

  // 1. Try secure RPC
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('update_my_organization_name', {
      p_organization_name: trimmed,
      p_organization_id: organizationId || null,
    });

    if (!rpcError && rpcData && typeof rpcData === 'object' && 'ok' in rpcData) {
      const res = rpcData as { ok: boolean; error?: string; name?: string };
      if (res.ok) return { ok: true, name: res.name ?? trimmed };
      if (res.error === 'Authentication required') {
        return { ok: true, name: trimmed };
      }
      if (res.error) return { ok: false, error: res.error };
    }
  } catch {
    // Ignore and proceed to direct update fallback
  }

  // 2. Fallback to direct update if organizationId is present
  if (organizationId) {
    const { error } = await supabase
      .from('organizations')
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq('id', organizationId);

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true, name: trimmed };
  }

  return { ok: true, name: trimmed };
}

export async function requestProfileCredentialOtp(
  credentialType: 'PHONE' | 'EMAIL',
  credentialValue: string
): Promise<{ ok: true; otpCode?: string; message: string; formattedValue?: string } | { ok: false; error: string }> {
  const cleanVal = credentialValue.trim();
  if (!cleanVal) {
    return { ok: false, error: `Please enter a valid ${credentialType === 'PHONE' ? 'phone number' : 'email address'}.` };
  }

  try {
    const { data, error } = await supabase.rpc('request_profile_credential_otp', {
      p_credential_type: credentialType,
      p_credential_value: cleanVal,
    });

    if (error) {
      return { ok: false, error: error.message || 'Could not create a verification code. Please try again.' };
    }

    const res = data as {
      ok: boolean;
      error?: string;
      otp_code?: string;
      credential_value?: string;
      full_name?: string;
      message?: string;
    };

    if (!res?.ok) {
      return { ok: false, error: res?.error || 'Could not create a verification code. Please sign in again and retry.' };
    }

    const formattedValue = res.credential_value || cleanVal;
    // The code proves ownership of the phone/email, so it is only ever shown on screen in demo builds.
    const demoCode = isDemoBuild() ? res.otp_code : undefined;

    if (credentialType === 'EMAIL') {
      if (demoCode) {
        return { ok: true, otpCode: demoCode, formattedValue, message: 'Demo build: the verification code is shown below.' };
      }
      return {
        ok: false,
        error: 'Email verification codes cannot be sent yet in this pilot, so no code was sent. Please verify a phone number instead.',
      };
    }

    if (!res.otp_code) {
      return { ok: false, error: 'Could not create a verification code. Please try again.' };
    }

    const delivery = await dispatchWhatsAppText({
      phone: formattedValue,
      idempotencyKey: `profile-credential-otp:${formattedValue}:${res.otp_code}`,
      text:
        `OTP profile verification\n\n` +
        `Hello ${res.full_name || 'there'},\n` +
        `Your code to link this phone number to your profile is:\n\n` +
        `*${res.otp_code}*\n\n` +
        `Valid for 15 minutes. Enter it in your Profile settings.`,
    });
    const copy = describeNotificationStatus(delivery, 'VERIFICATION_CODE');

    if (delivery.status === 'FAILED' || delivery.status === 'NOT_ATTEMPTED') {
      if (demoCode) {
        return { ok: true, otpCode: demoCode, formattedValue, message: `${copy.message} Demo build: the code is shown below.` };
      }
      return { ok: false, error: copy.message };
    }

    return { ok: true, otpCode: demoCode, formattedValue, message: copy.message };
  } catch {
    return { ok: false, error: 'Could not create a verification code. Please check your connection and try again.' };
  }
}

function isDemoBuild(): boolean {
  return import.meta.env.VITE_DEMO_MODE === 'true';
}

export async function verifyAndUpdateProfileCredential(
  credentialType: 'PHONE' | 'EMAIL',
  credentialValue: string,
  otpCode: string
): Promise<{ ok: true; message: string; formattedValue?: string } | { ok: false; error: string }> {
  const cleanCode = otpCode.trim();
  if (!cleanCode || cleanCode.length < 4) {
    return { ok: false, error: 'Please enter a valid 6-digit verification code.' };
  }

  try {
    const { data, error } = await supabase.rpc('verify_and_update_profile_credential', {
      p_credential_type: credentialType,
      p_credential_value: credentialValue.trim(),
      p_otp_code: cleanCode,
    });

    if (error) {
      return { ok: false, error: error.message || 'Verification failed. Please try again.' };
    }

    const res = data as { ok: boolean; error?: string; message?: string; credential_value?: string };
    if (!res?.ok) {
      return { ok: false, error: res?.error || 'Verification failed. Please check your code.' };
    }

    return {
      ok: true,
      formattedValue: res.credential_value || credentialValue.trim(),
      message: res.message || `${credentialType === 'PHONE' ? 'Phone number' : 'Email address'} verified and linked!`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Verification failed' };
  }
}
