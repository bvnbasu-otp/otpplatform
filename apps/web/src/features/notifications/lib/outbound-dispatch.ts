import {
  resolveNotificationStatus,
  type NotificationStatusResolution,
} from '@otp/domain';

/**
 * What is left of the client-side outbound dispatch module after D-21/A-30.
 *
 * This file used to also `fetch()` a relative `/waha/api/sendText` path
 * directly from the browser to send WhatsApp messages. That path only ever
 * resolved in dev/preview (vite.config.ts's `/waha` proxy to a developer's
 * local WAHA instance) — in production there was no server listening on
 * `/waha/*` at all, so every WhatsApp OTP/password-reset/welcome send
 * silently reported "submitted" while nothing was ever delivered anywhere.
 * WhatsApp/SMS sends are now server-side only, via the `otp-dispatch` and
 * `onboarding-notify` Supabase Edge Functions, which use the same real
 * Twilio/Meta provider abstraction `messaging-outbound` already uses. There
 * is deliberately no client-callable WhatsApp send left in this file.
 *
 * Supabase Auth's own email endpoints are unaffected by that change — they
 * answer "no error" once GoTrue queues the mail, which is still not a
 * delivery receipt, so `resolveSupabaseEmailDispatch` stays here.
 */

/** Strictly sanitizes input string to 7-bit ASCII plain text. */
export function sanitizeToAscii(text: string): string {
  return text
    .replace(/\u2014|\u2013/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2022/g, '*')
    .replace(/\u20B9/g, 'Rs. ')
    .replace(/[^\x20-\x7E\r\n\t]/g, '')
    .trim();
}

/**
 * Maps a Supabase Auth mail call (signInWithOtp / resetPasswordForEmail) onto the status scale.
 * "No error" means GoTrue took the request; it is SUBMITTED, not delivered.
 */
export function resolveSupabaseEmailDispatch(error: { message?: string; status?: number } | string | null | undefined): NotificationStatusResolution {
  if (!error) {
    return resolveNotificationStatus({ channel: 'EMAIL', observation: { kind: 'HTTP_RESPONSE', httpStatus: 200 } });
  }
  const message = typeof error === 'string' ? error : error.message ?? 'Email request failed';
  const status = typeof error === 'string' ? 400 : error.status ?? 400;
  return resolveNotificationStatus({
    channel: 'EMAIL',
    observation: { kind: 'HTTP_RESPONSE', httpStatus: status, errorMessage: message },
  });
}
