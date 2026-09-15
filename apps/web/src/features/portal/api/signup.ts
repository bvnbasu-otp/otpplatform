import { supabase } from '@/lib/supabase';
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
  status: string;
  alreadySubmitted: boolean;
  autoApproved?: boolean;
  side?: 'BUYER' | 'SUPPLIER';
  email?: string;
  temporaryPassword?: string;
  freeRfqCredits?: number;
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
  return {
    ok: true,
    result: {
      reference: (row.reference as string) ?? '',
      status: (row.status as string) ?? 'PENDING',
      alreadySubmitted: Boolean(row.already_submitted),
      autoApproved: Boolean(row.auto_approved || row.status === 'ONBOARDED'),
      side: (row.side as 'BUYER' | 'SUPPLIER') ?? input.side,
      email: (row.email as string) ?? input.email,
      temporaryPassword: (row.temporary_password as string) ?? 'Welcome@OTP2026!',
      freeRfqCredits: typeof row.free_rfq_credits === 'number' ? row.free_rfq_credits : 1,
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
  return message;
}

/**
 * Sends the one-time code.
 *
 * Email works wherever the platform is deployed. WhatsApp is what this market
 * actually uses, and whether it is available depends on a messaging provider
 * being configured for the environment - so the caller is told plainly rather
 * than shown a code that will never arrive.
 */
export async function sendVerificationCode(
  channel: VerificationChannel,
  contact: { email: string; phone: string },
): Promise<{ ok: true; sentTo: string } | { ok: false; error: string }> {
  if (channel === 'WHATSAPP') {
    try {
      const cleanPhone = normalizePhone(contact.phone).replace(/\D/g, '');
      const chatId = `${cleanPhone}@c.us`;
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      sessionStorage.setItem(`otp_wa_${cleanPhone}`, otpCode);

      const cleanText =
        `[OTP Platform] Verification Code\n\n` +
        `Your 6-digit verification code is: *${otpCode}*\n\n` +
        `Valid for 10 minutes. Enter this code on the registration page to proceed.`;

      const res = await fetch('/waha/api/sendText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          session: 'default',
          chatId,
          text: sanitizeToAscii(cleanText),
        }),
      });

      if (!res.ok) {
        throw new Error('WhatsApp gateway returned non-200');
      }
      return { ok: true, sentTo: contact.phone };
    } catch {
      return {
        ok: false,
        error:
          'WhatsApp Gateway is currently busy. Choose Email and we will send your code there.',
      };
    }
  }

  const redirectUrl = typeof window !== 'undefined' ? `${window.location.origin}/dashboard` : undefined;
  const { error } = await supabase.auth.signInWithOtp({
    email: contact.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectUrl,
    },
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, sentTo: contact.email };
}

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

/** Sends a direct WhatsApp notification via the local WAHA gateway. */
export async function sendWhatsAppNotification(
  phone: string,
  text: string,
): Promise<boolean> {
  try {
    const cleanPhone = normalizePhone(phone).replace(/\D/g, '');
    const chatId = `${cleanPhone}@c.us`;
    const cleanText = sanitizeToAscii(text);
    const res = await fetch('/waha/api/sendText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        session: 'default',
        chatId,
        text: cleanText,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

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

