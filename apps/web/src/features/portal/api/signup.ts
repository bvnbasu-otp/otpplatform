import type { NotificationStatusResolution } from '@otp/domain';
import { supabase } from '@/lib/supabase';
import {
  resolveSupabaseEmailDispatch,
  sanitizeToAscii as sanitizeOutboundAscii,
} from '@/features/notifications/lib/outbound-dispatch';
import { invokeEdgeFunction } from '@/features/notifications/lib/edge-dispatch';
import type { PortalSide } from '../types/portal';

/**
 * Registration from the public side of the fence.
 *
 * Everything here is callable without a session, and everything here is
 * write-only or published reference data. There is deliberately no way to read
 * the registration queue from the client: the list of businesses signing up is
 * a lead list, and a public form that could read its own table would publish it.
 */

export type VerificationChannel = 'EMAIL' | 'WHATSAPP';

export interface ServiceCategory {
  code: string;
  name: string;
  description: string | null;
}

export interface SignupSubmission {
  side: PortalSide;
  businessName: string;
  contactFirstName: string;
  contactLastName: string;
  designation?: string;
  email: string;
  phone: string;
  verificationChannel: VerificationChannel;
  /**
   * The job role the applicant says they hold. A preference applied when the
   * account is activated, not a grant - see 00040_signup_role_choice.
   */
  roleCode?: string;
  /** Buyer side. */
  buyerType?: string;
  referralCode?: string;
  /** Supplier side. */
  categoryCodes?: string[];
  taxRegistrationId?: string;
  coverageCity?: string;
  coveragePincode?: string;
}

export interface SignupResult {
  /** What the applicant quotes when they follow up. */
  reference: string;
  /** The row's own id — used only to ask onboarding-notify for a guaranteed
   * server-side acknowledgement; never used to read the row back. */
  requestId?: string;
  status: string;
  alreadySubmitted: boolean;
  autoApproved?: boolean;
  side?: 'BUYER' | 'SUPPLIER';
  email?: string;
  freeRfqCredits?: number;
  /** Outcome of the registration confirmation message, kept separate from the registration itself. */
  notification?: NotificationStatusResolution;
  /** Applicant's stated verification channel (Email vs WhatsApp for codes). */
  verificationChannel?: VerificationChannel;
  /** Server-side WhatsApp notice, only when WhatsApp was an explicit fallback after email. */
  guaranteedNotice?: NotificationStatusResolution;
  /** True only when WhatsApp was attempted because the selected email channel could not be used. */
  whatsappFallbackAttempted?: boolean;
}

export async function fetchServiceCategories(): Promise<
  { ok: true; categories: ServiceCategory[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('service_categories');

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    categories: ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      code: row.code as string,
      name: row.name as string,
      description: (row.description as string | null) ?? null,
    })),
  };
}

export async function fetchServedCities(): Promise<string[]> {
  const { data, error } = await supabase.rpc('served_cities');
  if (error || !data) return [];
  return ((data ?? []) as { city: string }[]).map((row) => row.city).filter(Boolean);
}

/**
 * Submits the registration, then requests confirmation on the channel the
 * applicant selected.
 *
 * Email does not also fire a WhatsApp acknowledgement. A WhatsApp failure is
 * recorded only when WhatsApp was the selected channel, or when a later
 * explicit email fallback sets `whatsappFallbackAttempted`.
 */
export async function submitSignupRequest(
  input: SignupSubmission,
): Promise<{ ok: true; result: SignupResult } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('submit_signup_request', {
    p_request: {
      side: input.side,
      business_name: input.businessName,
      contact_first_name: input.contactFirstName,
      contact_last_name: input.contactLastName,
      designation: input.designation ?? null,
      email: input.email,
      phone: input.phone,
      verification_channel: input.verificationChannel,
      role_code: input.roleCode ?? null,
      buyer_type: input.buyerType ?? null,
      referral_code: input.referralCode ?? null,
      category_codes: input.categoryCodes ?? [],
      tax_registration_id: input.taxRegistrationId ?? null,
      coverage_city: input.coverageCity ?? null,
      coverage_pincode: input.coveragePincode ?? null,
    },
  });

  if (error) return { ok: false, error: humanizeSignupError(error.message) };

  const row = (data ?? {}) as Record<string, unknown>;
  const requestId = typeof row.requestId === 'string' ? row.requestId : undefined;
  const alreadySubmitted = Boolean(row.already_submitted);
  const autoApproved = Boolean(row.auto_approved || row.status === 'ONBOARDED');

  let notification: NotificationStatusResolution | undefined;
  let guaranteedNotice: NotificationStatusResolution | undefined;
  const whatsappFallbackAttempted = false;
  if (requestId && !alreadySubmitted) {
    if (input.verificationChannel === 'EMAIL') {
      const redirectUrl =
        typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined;
      const { error: emailErr } = await supabase.auth.signInWithOtp({
        email: input.email.trim(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: redirectUrl,
        },
      });
      notification = resolveSupabaseEmailDispatch(emailErr);
    } else {
      const notifyKind = autoApproved ? 'APPROVED' : 'SUBMITTED';
      const { delivery: waDelivery } = await invokeEdgeFunction('onboarding-notify', {
        requestId,
        kind: notifyKind,
      });
      notification = waDelivery;
    }
  }

  return {
    ok: true,
    result: {
      reference: (row.reference as string) ?? '',
      requestId,
      status: (row.status as string) ?? 'PENDING',
      alreadySubmitted,
      autoApproved,
      side: (row.side as 'BUYER' | 'SUPPLIER') ?? input.side,
      email: (row.email as string) ?? input.email,
      freeRfqCredits: typeof row.free_rfq_credits === 'number' ? row.free_rfq_credits : undefined,
      notification,
      verificationChannel: input.verificationChannel,
      guaranteedNotice,
      whatsappFallbackAttempted,
    },
  };
}

/**
 * Turns a constraint name into something an applicant can act on.
 *
 * The database says what it will not accept; a person filling in a form needs
 * to know which box to go back to.
 */
export function humanizeSignupError(message: string): string {
  if (/signup_requests_phone_shape/.test(message)) {
    return 'That phone number does not look complete. Include the full number, with country code if it is outside India.';
  }
  if (/signup_requests_email_shape/.test(message)) {
    return 'That email address does not look right.';
  }
  if (/signup_requests_pincode_shape/.test(message)) {
    return 'A pin code is six digits.';
  }
  if (/signup_requests_supplier_needs_category/.test(message)) {
    return 'Pick at least one category, otherwise no request can reach you.';
  }
  if (/signup_requests_supplier_needs_coverage/.test(message)) {
    return 'Tell us the city or pin code you work in.';
  }
  if (/invalid input value for enum org_type/.test(message)) {
    return 'Choose the kind of organisation you are buying for.';
  }
  // F-RUN2-VAL-01: submit_signup_request casts `side` to the signup_side
  // enum before either registration form's own hardcoded 'BUYER'/'SUPPLIER'
  // literal is normally what arrives here; a missing or malformed value
  // (e.g. a direct RPC/API call that bypasses the UI) otherwise surfaces
  // Postgres's raw "invalid input value for enum signup_side" message.
  if (/invalid input value for enum signup_side/.test(message)) {
    return 'Choose whether you are registering as a buyer or a supplier.';
  }
  return message;
}

/**
 * Sends the one-time code using server-side OTP generation.
 *
 * D-21/A-30: neither the code nor the WhatsApp message it goes in is ever
 * built here — otp-dispatch does both, and this function is told success or
 * failure, never the code. Per product decision, this registration-time
 * phone-verification pair stays unwired from the registration UI (no
 * component calls this function), but the RPCs it depends on are fixed
 * to the same standard as every other OTP family, since they are directly
 * callable regardless of UI wiring.
 */
export async function sendVerificationCode(
  channel: VerificationChannel,
  contact: { email: string; phone: string },
): Promise<
  | { ok: true; delivery: NotificationStatusResolution }
  | { ok: false; error: string; delivery?: NotificationStatusResolution }
> {
  if (channel === 'WHATSAPP') {
    const { result, delivery } = await invokeEdgeFunction('otp-dispatch', {
      purpose: 'SIGNUP_VERIFY',
      identifier: contact.phone,
    });

    if (!result.ok) {
      return {
        ok: false,
        delivery,
        error: result.error || 'We could not send the code by WhatsApp. Choose Email and we will send your code there.',
      };
    }

    return { ok: true, delivery };
  }

  const redirectUrl = typeof window !== 'undefined' ? `${window.location.origin}/dashboard` : undefined;
  const { error } = await supabase.auth.signInWithOtp({
    email: contact.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectUrl,
    },
  });

  const delivery = resolveSupabaseEmailDispatch(error);
  if (error) return { ok: false, error: error.message, delivery };
  return { ok: true, delivery };
}

/** Strictly sanitizes input string to 7-bit ASCII plain text. */
export const sanitizeToAscii = sanitizeOutboundAscii;

/** E.164, assuming India when no country code was given. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

/** Resolves the canonical organisation name based on buyer category. Defaults to 'Self' for individuals. */
export function resolveBuyerOrganisation(buyerType: string, enteredOrg: string): string {
  if (buyerType === 'INDIVIDUAL') {
    return enteredOrg.trim() || 'Self';
  }
  return enteredOrg.trim();
}

/** Resolves role code based on buyer category. Defaults to 'PROPERTY_OWNER' for individuals. */
export function resolveBuyerRoleCode(buyerType: string, selectedRole?: string): string | undefined {
  if (buyerType === 'INDIVIDUAL') {
    return 'PROPERTY_OWNER';
  }
  return selectedRole || undefined;
}
