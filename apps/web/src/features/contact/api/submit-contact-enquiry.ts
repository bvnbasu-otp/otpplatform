import { supabase } from '@/lib/supabase';
import { fieldErrorMessage, type ContactFieldErrors, type ContactFormField, type ContactFormValues } from '../lib/contact-form';

export type ContactSubmitOutcome =
  | { kind: 'recorded'; reference: string; duplicate: boolean }
  | { kind: 'invalid'; errors: ContactFieldErrors }
  | { kind: 'rate_limited' }
  | { kind: 'not_recorded' };

interface EnquiryResponseBody {
  ok?: boolean;
  code?: string;
  reference?: string;
  duplicate?: boolean;
  fieldErrors?: Partial<Record<ContactFormField, string>>;
  clientToken?: string;
}

type Invoke = (
  name: string,
  options: { body: Record<string, unknown>; headers?: Record<string, string> },
) => Promise<{ data: unknown; error: unknown }>;

const CLIENT_TOKEN_STORAGE_KEY = 'otp.contact.client-token.v1';
const CLIENT_TOKEN_PATTERN = /^v1\.[0-9a-f]{48}\.[0-9a-f]{64}$/;

function storedClientToken(): string | null {
  try {
    const token = globalThis.localStorage?.getItem(CLIENT_TOKEN_STORAGE_KEY) ?? null;
    return token && CLIENT_TOKEN_PATTERN.test(token) ? token : null;
  } catch {
    return null;
  }
}

function rememberClientToken(body: EnquiryResponseBody | null): void {
  if (!body?.clientToken || !CLIENT_TOKEN_PATTERN.test(body.clientToken)) return;
  try {
    globalThis.localStorage?.setItem(CLIENT_TOKEN_STORAGE_KEY, body.clientToken);
  } catch {
    // Storage can be unavailable in private browsing; the endpoint will issue a fresh identity.
  }
}

async function errorBody(error: unknown): Promise<EnquiryResponseBody | null> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (!ctx || typeof ctx.json !== 'function') return null;
  try {
    const body = await ctx.json();
    return body && typeof body === 'object' ? (body as EnquiryResponseBody) : null;
  } catch {
    return null;
  }
}

function toOutcome(body: EnquiryResponseBody | null): ContactSubmitOutcome {
  if (body?.ok === true && typeof body.reference === 'string' && body.reference) {
    return { kind: 'recorded', reference: body.reference, duplicate: body.duplicate === true };
  }
  if (body?.code === 'RATE_LIMITED') return { kind: 'rate_limited' };
  if (body?.code === 'INVALID' && body.fieldErrors && Object.keys(body.fieldErrors).length > 0) {
    const errors: ContactFieldErrors = {};
    for (const [field, code] of Object.entries(body.fieldErrors)) {
      errors[field as ContactFormField] = fieldErrorMessage(field as ContactFormField, String(code));
    }
    return { kind: 'invalid', errors };
  }
  return { kind: 'not_recorded' };
}

/**
 * Sends the enquiry to the `contact-enquiry` edge function. Anything other than
 * an explicit recorded response — a missing function, a network error, a
 * rejected honeypot — is reported as not recorded.
 */
export async function submitContactEnquiry(
  values: ContactFormValues,
  submissionId: string,
  invoke: Invoke = (name, options) => supabase.functions.invoke(name, options),
): Promise<ContactSubmitOutcome> {
  try {
    const clientToken = storedClientToken();
    const { data, error } = await invoke('contact-enquiry', {
      headers: clientToken ? { 'x-otp-contact-client-token': clientToken } : undefined,
      body: {
        submissionId,
        name: values.name,
        email: values.email,
        phone: values.phone,
        category: values.category,
        organisation: values.organisation,
        subject: values.subject,
        message: values.message,
        website: values.website,
      },
    });
    if (error) {
      const body = await errorBody(error);
      rememberClientToken(body);
      return toOutcome(body);
    }
    const body = (data ?? null) as EnquiryResponseBody | null;
    rememberClientToken(body);
    return toOutcome(body);
  } catch {
    return { kind: 'not_recorded' };
  }
}
