/**
 * The guaranteed external notice for the two onboarding legs that need one.
 *
 * B-01: before this function existed, the only external notice on the
 * registration journey was whatever the applicant's or admin's own browser
 * tab happened to do — a client-side WhatsApp send gated on the applicant
 * having chosen the WHATSAPP acknowledgement channel (EMAIL-channel
 * applicants got nothing at all), and, on approval, a *second* independent
 * best-effort browser call (resetPasswordForEmail + a WhatsApp message
 * containing a shared literal password) that the bulk "Approve All" path
 * skipped entirely. This function is the single guaranteed, server-owned
 * send for both legs, on both sides of the fence:
 *
 *   kind: 'SUBMITTED' — "we received your registration" (fires for every
 *   applicant, regardless of verification_channel, because both signup
 *   forms require a phone number; that phone is what carries every
 *   guaranteed notice this program builds).
 *
 *   kind: 'APPROVED' — issues a fresh single-use activation code (A-29;
 *   see public.issue_activation_credential_otp) and sends it. The applicant
 *   redeems it on the existing "reset password" screen — there is no shared
 *   literal password to fall back to; if this send fails, the account's
 *   password is an unusable random value and stays that way until a
 *   retry succeeds.
 *
 * Called synchronously by the client immediately after the corresponding
 * RPC succeeds (submit_signup_request / admin_review_signup_request), and —
 * for bulk approval — once per item, awaited before the bulk loop moves on
 * to the next item, so a failed notice cannot be masked by a "N approved"
 * summary that silently skipped sending anything for one of them.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { resolveProvider, MessagingConfigError } from '../_shared/messaging/providers/resolve.ts';
import { renderRegistrationReceivedNotice, renderApprovalActivationNotice } from '../_shared/messaging/templates.ts';
import { normalizePhone } from '../_shared/messaging/phone.ts';
import type { MessagingProvider } from '../_shared/messaging/types.ts';

type Kind = 'SUBMITTED' | 'APPROVED';

interface NotifyRequest {
  requestId?: string;
  kind?: Kind;
}

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
}

function messagingEnv() {
  return {
    MESSAGING_PROVIDER: Deno.env.get('MESSAGING_PROVIDER') ?? undefined,
    TWILIO_ACCOUNT_SID: Deno.env.get('TWILIO_ACCOUNT_SID') ?? undefined,
    TWILIO_AUTH_TOKEN: Deno.env.get('TWILIO_AUTH_TOKEN') ?? undefined,
    TWILIO_SMS_FROM: Deno.env.get('TWILIO_SMS_FROM') ?? undefined,
    TWILIO_WHATSAPP_FROM: Deno.env.get('TWILIO_WHATSAPP_FROM') ?? undefined,
    TWILIO_WEBHOOK_URL: Deno.env.get('TWILIO_WEBHOOK_URL') ?? undefined,
    META_PHONE_NUMBER_ID: Deno.env.get('META_PHONE_NUMBER_ID') ?? undefined,
    META_ACCESS_TOKEN: Deno.env.get('META_ACCESS_TOKEN') ?? undefined,
    META_APP_SECRET: Deno.env.get('META_APP_SECRET') ?? undefined,
    WAHA_BASE_URL: Deno.env.get('WAHA_BASE_URL') ?? undefined,
    WAHA_SESSION: Deno.env.get('WAHA_SESSION') ?? undefined,
    MESSAGING_MOCK_SECRET: Deno.env.get('MESSAGING_MOCK_SECRET') ?? undefined,
  };
}

function referenceFor(id: string): string {
  return 'REG-' + id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  let payload: NotifyRequest;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('Body must be JSON', 400);
  }

  const { requestId, kind } = payload;
  if (!requestId || (kind !== 'SUBMITTED' && kind !== 'APPROVED')) {
    return errorResponse('requestId and a valid kind are required', 400);
  }

  const db = serviceClient();

  const { data: sr, error: srError } = await db
    .from('signup_requests')
    .select('id, email, phone, contact_first_name, contact_last_name, business_name, status')
    .eq('id', requestId)
    .maybeSingle();

  if (srError) return errorResponse(srError.message, 400);
  if (!sr) return errorResponse('Signup request not found', 404);

  if (kind === 'APPROVED' && sr.status !== 'ONBOARDED') {
    // Fail closed: never send an "approved" credential for a request that
    // is not actually in an onboarded state.
    return jsonResponse({ ok: false, error: 'Request is not in an onboarded state' }, 409);
  }

  const e164 = normalizePhone(sr.phone ?? '');
  if (!e164) {
    // Every registration form requires a phone number; reaching this means
    // the row itself is malformed. Fail closed rather than pretend a notice
    // was sent.
    return jsonResponse({ ok: false, error: 'No usable phone number on file for this applicant' }, 422);
  }

  const fullName = `${sr.contact_first_name ?? ''} ${sr.contact_last_name ?? ''}`.trim() || 'there';
  const businessName = sr.business_name || 'your registration';
  const reference = referenceFor(sr.id as string);

  let provider: MessagingProvider;
  try {
    provider = resolveProvider(messagingEnv());
  } catch (error) {
    if (error instanceof MessagingConfigError) {
      console.error('onboarding-notify: messaging not configured —', error.message);
      return jsonResponse({ ok: false, error: 'Messaging is not configured', status: 'FAILED' }, 503);
    }
    throw error;
  }

  if (kind === 'SUBMITTED') {
    const rendered = renderRegistrationReceivedNotice({ fullName, businessName, reference });
    const receipt = await provider.send({ to: e164, channel: 'WHATSAPP', body: rendered.body });
    if (receipt.status === 'FAILED') {
      return jsonResponse({ ok: false, status: 'FAILED', error: 'Could not send the registration notice' });
    }
    return jsonResponse({ ok: true, status: receipt.status });
  }

  // kind === 'APPROVED': issue the single-use activation code now, so the
  // plaintext only ever exists inside this request and inside the message
  // about to be sent — never returned to any client.
  const { data: otpData, error: otpErr } = await db.rpc('issue_activation_credential_otp', {
    p_email: sr.email,
    p_phone: sr.phone,
    p_full_name: fullName,
  });

  if (otpErr || !otpData?.ok || !otpData?.otp_code) {
    return jsonResponse({ ok: false, status: 'FAILED', error: 'Could not prepare activation credentials' }, 500);
  }

  const rendered = renderApprovalActivationNotice({
    fullName,
    businessName,
    code: otpData.otp_code as string,
    minutesValid: 7 * 24 * 60,
  });
  const receipt = await provider.send({ to: e164, channel: 'WHATSAPP', body: rendered.body });

  if (receipt.status === 'FAILED') {
    // Fail closed: invalidate the code we just issued so it can never be
    // redeemed even though a message describing it was never delivered.
    await db
      .from('password_reset_otps')
      .delete()
      .eq('email', String(sr.email).toLowerCase())
      .eq('purpose', 'ACTIVATION')
      .is('used_at', null);
    return jsonResponse({ ok: false, status: 'FAILED', error: 'Could not send the activation notice' });
  }

  return jsonResponse({ ok: true, status: receipt.status });
});
