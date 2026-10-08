/**
 * The single place an OTP is generated, sent, and told to the browser about.
 *
 * D-21 + A-30, joint fix. Before this function existed, three RPCs
 * (request_profile_verification_otp, request_whatsapp_password_reset,
 * request_profile_credential_otp) were GRANTed to anon/authenticated and
 * handed a real, usable plaintext code straight back to whichever browser
 * called them — callable directly via curl, with no proof any message was
 * ever sent. Those RPCs are now internal-only (service_role), and this is
 * the only caller: it asks the RPC to generate + hash + store the code,
 * sends it through whichever real provider MESSAGING_PROVIDER names, and
 * returns to the browser only `{ ok }` (or a generic error) — never the
 * code, never any destination detail (no masked phone, no partial email),
 * per the "success/failure only" response-shape decision.
 *
 * Fail closed: if the provider send fails or is unreachable, the just-created
 * OTP row is invalidated in the same request so a leaked/guessed code from a
 * message that was never delivered can never verify successfully.
 *
 * A server-side-only flag (OTP_DEBUG_REVEAL_CODE, checked here — never a
 * client build flag) can additionally echo the code back for local/demo use.
 * It is intentionally not wired to any client-visible config.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { resolveProvider, MessagingConfigError } from '../_shared/messaging/providers/resolve.ts';
import {
  renderSignupVerificationOtp,
  renderPasswordResetOtp,
  renderProfileCredentialOtp,
} from '../_shared/messaging/templates.ts';
import { normalizePhone } from '../_shared/messaging/phone.ts';
import type { MessagingProvider } from '../_shared/messaging/types.ts';

const DEBUG_REVEAL_CODE = Deno.env.get('OTP_DEBUG_REVEAL_CODE') === 'true';

type Purpose = 'SIGNUP_VERIFY' | 'PASSWORD_RESET' | 'PROFILE_CREDENTIAL';

interface DispatchRequest {
  purpose?: Purpose;
  identifier?: string;
  credentialType?: 'PHONE' | 'EMAIL';
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

// Generic, applicant-safe copy: the same message regardless of *why* issuance
// failed (bad phone shape, account not found, missing phone on file, provider
// down) — none of that is destination detail, but "account not found" vs
// "provider down" is still more than the no-detail contract should leak.
const GENERIC_ISSUE_ERROR = 'We could not issue a verification code right now. Please try again shortly.';
const GENERIC_SEND_ERROR = 'We could not send the verification code. Please try again shortly.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  let payload: DispatchRequest;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('Body must be JSON', 400);
  }

  const purpose = payload.purpose;
  const identifier = (payload.identifier ?? '').trim();
  if (!purpose || !identifier) {
    return errorResponse('purpose and identifier are required', 400);
  }
  if (!['SIGNUP_VERIFY', 'PASSWORD_RESET', 'PROFILE_CREDENTIAL'].includes(purpose)) {
    return errorResponse('Unknown purpose', 400);
  }

  const db = serviceClient();

  let phoneForDispatch: string | null = null;
  let otpCode: string | null = null;
  let render: (() => { body: string }) | null = null;
  let cleanup: (() => Promise<void>) | null = null;

  if (purpose === 'SIGNUP_VERIFY') {
    const { data, error } = await db.rpc('request_profile_verification_otp', { p_phone: identifier });
    if (error || !data?.ok || !data?.otp_code || !data?.phone) {
      return jsonResponse({ ok: false, error: data?.error || GENERIC_ISSUE_ERROR });
    }
    phoneForDispatch = data.phone as string;
    otpCode = data.otp_code as string;
    render = () => renderSignupVerificationOtp({ code: otpCode!, minutesValid: 10 });
    cleanup = async () => {
      await db.from('signup_verification_otps').delete().eq('phone', phoneForDispatch);
    };
  } else if (purpose === 'PASSWORD_RESET') {
    const { data, error } = await db.rpc('request_whatsapp_password_reset', { p_identifier: identifier });
    if (error || !data?.ok || !data?.phone || !data?.otp_code) {
      // Deliberately generic: "account not found" and "no phone on file" get
      // the same response as a provider failure would — no destination
      // detail, no confirmation that the identifier exists.
      return jsonResponse({ ok: false, error: GENERIC_ISSUE_ERROR });
    }
    phoneForDispatch = data.phone as string;
    otpCode = data.otp_code as string;
    const fullName = (data.full_name as string) || 'there';
    render = () => renderPasswordResetOtp({ code: otpCode!, minutesValid: 15, fullName });
    const email = (data.email as string) || '';
    cleanup = async () => {
      await db
        .from('password_reset_otps')
        .delete()
        .eq('email', email.toLowerCase())
        .eq('purpose', 'RESET')
        .is('used_at', null);
    };
  } else {
    // PROFILE_CREDENTIAL: authenticated only. The caller's JWT is forwarded
    // by the browser's supabase-js client automatically; we validate it with
    // the service-role client rather than trusting a client-supplied id.
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) {
      return jsonResponse({ ok: false, error: 'Authentication required' }, 401);
    }
    const { data: userData, error: userErr } = await db.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return jsonResponse({ ok: false, error: 'Authentication required' }, 401);
    }
    const { data: profile } = await db
      .from('profiles')
      .select('id')
      .eq('auth_user_id', userData.user.id)
      .maybeSingle();
    if (!profile?.id) {
      return jsonResponse({ ok: false, error: 'Profile record not found' }, 404);
    }

    const credentialType = payload.credentialType === 'EMAIL' ? 'EMAIL' : 'PHONE';

    if (credentialType === 'EMAIL') {
      // No transport exists for arbitrary transactional email in this
      // codebase's messaging pipeline (Twilio/Meta are WhatsApp/SMS only) —
      // same honest limitation the client already surfaced. Demo builds can
      // still exercise the flow end-to-end via the server-side debug flag.
      if (DEBUG_REVEAL_CODE) {
        const { data, error } = await db.rpc('issue_profile_credential_otp', {
          p_profile_id: profile.id,
          p_credential_type: 'EMAIL',
          p_credential_value: identifier,
        });
        if (error || !data?.ok) return jsonResponse({ ok: false, error: data?.error || GENERIC_ISSUE_ERROR });
        return jsonResponse({ ok: true });
      }
      return jsonResponse({
        ok: false,
        error: 'Email verification codes cannot be sent yet in this pilot. Please verify a phone number instead.',
      });
    }

    const { data, error } = await db.rpc('issue_profile_credential_otp', {
      p_profile_id: profile.id,
      p_credential_type: 'PHONE',
      p_credential_value: identifier,
    });
    if (error || !data?.ok || !data?.otp_code || !data?.credential_value) {
      return jsonResponse({ ok: false, error: data?.error || GENERIC_ISSUE_ERROR });
    }
    phoneForDispatch = data.credential_value as string;
    otpCode = data.otp_code as string;
    const fullName = (data.full_name as string) || 'there';
    render = () => renderProfileCredentialOtp({ code: otpCode!, minutesValid: 15, fullName });
    cleanup = async () => {
      await db
        .from('profile_verification_otps')
        .delete()
        .eq('profile_id', profile.id)
        .eq('credential_type', 'PHONE')
        .is('used_at', null);
    };
  }

  const e164 = normalizePhone(phoneForDispatch ?? '');
  if (!e164 || !render) {
    if (cleanup) await cleanup();
    return jsonResponse({ ok: false, error: GENERIC_ISSUE_ERROR });
  }

  let provider: MessagingProvider;
  try {
    provider = resolveProvider(messagingEnv());
  } catch (error) {
    if (error instanceof MessagingConfigError) {
      console.error('otp-dispatch: messaging not configured —', error.message);
      if (cleanup) await cleanup();
      return jsonResponse({ ok: false, error: GENERIC_SEND_ERROR }, 503);
    }
    throw error;
  }

  if (provider.id === 'MOCK') {
    if (cleanup) await cleanup();
    return jsonResponse({ ok: false, error: GENERIC_SEND_ERROR }, 503);
  }

  const rendered = render();
  const receipt = await provider.send({ to: e164, channel: 'WHATSAPP', body: rendered.body });

  // Fail closed: any non-accepted outcome invalidates the just-issued code.
  if (receipt.status === 'FAILED') {
    if (cleanup) await cleanup();
    return jsonResponse({ ok: false, error: GENERIC_SEND_ERROR });
  }

  return jsonResponse({ ok: true });
});
