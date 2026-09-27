import { describeNotificationStatus, type NotificationStatusResolution } from '@otp/domain';
import { invokeEdgeFunction } from '@/features/notifications/lib/edge-dispatch';

export interface WhatsAppPasswordResetResult {
  ok: boolean;
  error?: string;
  delivery?: NotificationStatusResolution;
}

/**
 * Asks the server to generate and send a password-reset code over WhatsApp.
 *
 * D-21/A-30: this used to call `request_whatsapp_password_reset` directly
 * from the browser, receive the plaintext code back in the RPC response,
 * and build + send the WhatsApp message itself via a `/waha` gateway that
 * only ever existed in dev/preview. The RPC is now service_role-only (it
 * would simply be refused if called from here), and the code never reaches
 * the browser: `otp-dispatch` generates it, sends it, and reports back only
 * success or failure — the same generic outcome regardless of whether the
 * identifier was unknown, had no phone on file, or the provider rejected
 * the send, so no destination detail is ever exposed.
 */
export async function requestWhatsAppPasswordReset(identifier: string): Promise<WhatsAppPasswordResetResult> {
  const trimmed = identifier.trim();
  if (!trimmed) {
    return { ok: false, error: 'Enter your email or phone number.' };
  }

  const { result, delivery } = await invokeEdgeFunction('otp-dispatch', {
    purpose: 'PASSWORD_RESET',
    identifier: trimmed,
  });

  if (!result.ok) {
    return {
      ok: false,
      delivery,
      error: result.error || describeNotificationStatus(delivery, 'PASSWORD_RESET').message,
    };
  }

  return { ok: true, delivery };
}
