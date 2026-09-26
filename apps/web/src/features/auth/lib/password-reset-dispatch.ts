import { describeNotificationStatus, type NotificationStatusResolution } from '@otp/domain';
import { supabase } from '@/lib/supabase';
import { dispatchWhatsAppText } from '@/features/notifications/lib/outbound-dispatch';

export interface WhatsAppPasswordResetResult {
  ok: boolean;
  phone?: string;
  email?: string;
  error?: string;
  delivery?: NotificationStatusResolution;
}

/**
 * Asks the server for a reset code and hands it to the WhatsApp gateway.
 * `ok: true` means the gateway took the message (SUBMITTED/ACCEPTED); it is not a delivery receipt.
 */
export async function requestWhatsAppPasswordReset(
  identifier: string,
  options: { origin?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<WhatsAppPasswordResetResult> {
  try {
    const { data, error } = await supabase.rpc('request_whatsapp_password_reset', {
      p_identifier: identifier.trim(),
    });
    if (error) return { ok: false, error: error.message };
    const res = (data ?? {}) as {
      ok?: boolean;
      error?: string;
      phone?: string;
      email?: string;
      full_name?: string;
      otp_code?: string;
    };
    if (!res.ok) {
      return { ok: false, error: res.error || 'User not found' };
    }

    if (!res.phone || !res.otp_code) {
      return { ok: false, error: 'No WhatsApp number is registered for this account. Use email instead.' };
    }

    const origin = options.origin ?? (typeof window !== 'undefined' ? window.location.origin : 'https://otp.market');
    const resetLink = new URL('/reset-password', origin);
    resetLink.searchParams.set('identifier', res.phone);

    const delivery = await dispatchWhatsAppText({
      phone: res.phone,
      text:
        `[OTP Platform] Password Reset Verification\n\n` +
        `Hello ${res.full_name || 'User'},\n` +
        `Your password reset verification code is:\n\n` +
        `*${res.otp_code}*\n\n` +
        `Valid for 15 minutes. Enter this code on the password reset screen to set your new password:\n` +
        `${resetLink.toString()}\n\n` +
        `If you did not request this, you can safely ignore this message.`,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
    });

    if (delivery.status === 'FAILED' || delivery.status === 'NOT_ATTEMPTED') {
      return { ok: false, delivery, error: describeNotificationStatus(delivery, 'PASSWORD_RESET').message };
    }
    return { ok: true, phone: res.phone, email: res.email, delivery };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
