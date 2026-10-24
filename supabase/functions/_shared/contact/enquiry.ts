/**
 * Public Contact Us enquiries: validation, normalisation, the notice sent to
 * the support inbox, and the record-then-notify step of the `contact-enquiry`
 * function.
 *
 * Kept free of Deno and Node globals so the same file is exercised by the web
 * test suite and served by the edge function.
 *
 * The recipient is a constant here, never a request field. Nothing a visitor
 * submits can change who is notified.
 */

export const CONTACT_SUPPORT_EMAIL = 'bvnbasu+otp.demo.otp.support@gmail.com';
export const CONTACT_NOTIFICATION_RECIPIENT = CONTACT_SUPPORT_EMAIL;

export const CONTACT_ENQUIRY_CATEGORIES = [
  { code: 'BUYER', label: 'Buyer enquiry — Individual, RWA or MSME' },
  { code: 'SUPPLIER_ONBOARDING', label: 'Supplier onboarding' },
  { code: 'BUSINESS_PARTNERSHIP', label: 'Business or partnership enquiry' },
  { code: 'TECHNICAL_SUPPORT', label: 'Technical support' },
  { code: 'OTHER', label: 'Other' },
] as const;

export type ContactEnquiryCategory = (typeof CONTACT_ENQUIRY_CATEGORIES)[number]['code'];

export const CONTACT_FIELD_LIMITS = {
  name: 120,
  email: 254,
  phone: 20,
  organisation: 160,
  subject: 160,
  messageMin: 10,
  message: 4000,
} as const;

/** Upper bound on the raw request body; comfortably above every field at its limit. */
export const CONTACT_MAX_REQUEST_BYTES = 16 * 1024;

export const CONTACT_RATE_LIMIT = {
  endpoint: 'contact-enquiry',
  perClientMaxRequests: 5,
  emergencyMaxRequests: 200,
  windowSeconds: 3600,
} as const;

export type ContactField = 'name' | 'email' | 'phone' | 'category' | 'organisation' | 'subject' | 'message';
export type ContactFieldError = 'REQUIRED' | 'INVALID' | 'TOO_LONG' | 'TOO_SHORT';

export interface NormalizedContactEnquiry {
  submissionId: string;
  category: ContactEnquiryCategory;
  name: string;
  email: string;
  phone: string | null;
  organisation: string | null;
  subject: string;
  message: string;
}

export type ContactValidationResult =
  | { ok: true; value: NormalizedContactEnquiry }
  | { ok: false; code: 'INVALID'; fieldErrors: Partial<Record<ContactField, ContactFieldError>> };

const SUBMISSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>()[\]",;:\\]+@[^\s@<>()[\]",;:\\]+\.[^\s@<>()[\]",;:\\]{2,}$/;
const PHONE_CHARS = /^\+?[0-9 ()-]+$/;
// deno-lint-ignore no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f\u2028\u2029]/g;
// deno-lint-ignore no-control-regex
const MESSAGE_CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** One line: CR, LF and every other control character become a space, then whitespace collapses. */
export function toSingleLine(value: string): string {
  return value.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
}

function toMessage(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n')
    .replace(MESSAGE_CONTROL_CHARS, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function text(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  return typeof value === 'string' ? value : '';
}

export function isContactCategory(value: unknown): value is ContactEnquiryCategory {
  return CONTACT_ENQUIRY_CATEGORIES.some((c) => c.code === value);
}

export function categoryLabel(code: ContactEnquiryCategory): string {
  return CONTACT_ENQUIRY_CATEGORIES.find((c) => c.code === code)?.label ?? 'Other';
}

export function validateContactEnquiry(body: unknown): ContactValidationResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 'INVALID', fieldErrors: {} };
  }
  const input = body as Record<string, unknown>;

  // Hidden honeypot field. People never see it; form-filling bots usually do.
  if (text(input, 'website').trim() !== '') {
    return { ok: false, code: 'INVALID', fieldErrors: {} };
  }

  const fieldErrors: Partial<Record<ContactField, ContactFieldError>> = {};
  const L = CONTACT_FIELD_LIMITS;

  const name = toSingleLine(text(input, 'name'));
  if (!name) fieldErrors.name = 'REQUIRED';
  else if (name.length > L.name) fieldErrors.name = 'TOO_LONG';

  const email = toSingleLine(text(input, 'email')).toLowerCase();
  if (!email) fieldErrors.email = 'REQUIRED';
  else if (email.length > L.email) fieldErrors.email = 'TOO_LONG';
  else if (!EMAIL.test(email)) fieldErrors.email = 'INVALID';

  const rawPhone = toSingleLine(text(input, 'phone'));
  let phone: string | null = null;
  if (rawPhone) {
    const digits = rawPhone.replace(/\D/g, '');
    if (rawPhone.length > L.phone) fieldErrors.phone = 'TOO_LONG';
    else if (!PHONE_CHARS.test(rawPhone) || digits.length < 10 || digits.length > 15) fieldErrors.phone = 'INVALID';
    else phone = rawPhone.trim().startsWith('+') ? `+${digits}` : digits;
  }

  const category = input.category;
  if (category === undefined || category === null || category === '') fieldErrors.category = 'REQUIRED';
  else if (!isContactCategory(category)) fieldErrors.category = 'INVALID';

  const organisation = toSingleLine(text(input, 'organisation'));
  if (organisation.length > L.organisation) fieldErrors.organisation = 'TOO_LONG';

  const subject = toSingleLine(text(input, 'subject'));
  if (!subject) fieldErrors.subject = 'REQUIRED';
  else if (subject.length > L.subject) fieldErrors.subject = 'TOO_LONG';

  const message = toMessage(text(input, 'message'));
  if (!message) fieldErrors.message = 'REQUIRED';
  else if (message.length < L.messageMin) fieldErrors.message = 'TOO_SHORT';
  else if (message.length > L.message) fieldErrors.message = 'TOO_LONG';

  const submissionId = text(input, 'submissionId').trim();
  if (!SUBMISSION_ID.test(submissionId)) {
    return { ok: false, code: 'INVALID', fieldErrors };
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, code: 'INVALID', fieldErrors };
  }

  return {
    ok: true,
    value: {
      submissionId: submissionId.toLowerCase(),
      category: category as ContactEnquiryCategory,
      name,
      email,
      phone,
      organisation: organisation || null,
      subject,
      message,
    },
  };
}

export interface ContactNotificationEmail {
  to: typeof CONTACT_NOTIFICATION_RECIPIENT;
  replyTo: string;
  subject: string;
  text: string;
}

/**
 * The notice for the support inbox. Every header value is forced onto one line
 * so a visitor cannot add headers; Reply-To is only set to an address that has
 * already passed validation.
 */
export function composeContactNotification(
  enquiry: NormalizedContactEnquiry,
  reference: string,
): ContactNotificationEmail {
  const subject = toSingleLine(`[OTP Contact ${reference}] ${categoryLabel(enquiry.category)}: ${enquiry.subject}`).slice(0, 200);
  const replyTo = EMAIL.test(enquiry.email) ? toSingleLine(enquiry.email) : '';
  return {
    to: CONTACT_NOTIFICATION_RECIPIENT,
    replyTo,
    subject,
    text: [
      `Reference: ${reference}`,
      `Enquiry type: ${categoryLabel(enquiry.category)}`,
      `Name: ${enquiry.name}`,
      `Email: ${enquiry.email}`,
      `Phone: ${enquiry.phone ?? 'Not given'}`,
      `Organisation: ${enquiry.organisation ?? 'Not given'}`,
      `Subject: ${enquiry.subject}`,
      '',
      enquiry.message,
    ].join('\n'),
  };
}

export interface ContactEmailTransport {
  send(email: ContactNotificationEmail): Promise<{ ok: boolean }>;
}

export type ContactNotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'NOT_CONFIGURED';

export interface RecordedContactEnquiry {
  id: string;
  reference: string;
  created: boolean;
  notificationStatus: ContactNotificationStatus;
}

/** The submission id was already used for a different normalized payload; nothing was recorded. */
export interface ContactSubmissionConflict {
  conflict: true;
}

export interface ContactEnquiryDeps {
  /** null means the record could not be written; the caller must not report success. */
  recordEnquiry(enquiry: NormalizedContactEnquiry): Promise<RecordedContactEnquiry | ContactSubmissionConflict | null>;
  markNotification(id: string, status: Exclude<ContactNotificationStatus, 'PENDING'>): Promise<void>;
  /** null when the email relay is not configured; the notice is then recorded as NOT_CONFIGURED. */
  transport: ContactEmailTransport | null;
}

export type ContactEnquiryResponse =
  | {
    ok: true;
    reference: string;
    duplicate: boolean;
    notification: ContactNotificationStatus;
  }
  | {
    ok: false;
    code: 'INVALID' | 'RATE_LIMITED' | 'NOT_RECORDED' | 'SUBMISSION_CONFLICT';
    fieldErrors?: Partial<Record<ContactField, ContactFieldError>>;
  };

/**
 * Validates, records and notifies. The caller has already charged the request
 * against the rate limit (see http-handler.ts), so this never consults it.
 */
export async function handleContactEnquiry(
  body: unknown,
  deps: ContactEnquiryDeps,
): Promise<{ httpStatus: number; body: ContactEnquiryResponse }> {
  const validated = validateContactEnquiry(body);
  if (!validated.ok) {
    return { httpStatus: 400, body: { ok: false, code: validated.code, fieldErrors: validated.fieldErrors } };
  }

  const recorded = await Promise.resolve()
    .then(() => deps.recordEnquiry(validated.value))
    .catch(() => null);
  if (!recorded) return { httpStatus: 503, body: { ok: false, code: 'NOT_RECORDED' } };

  // A reused submission id with different contents is refused, never treated as a retry.
  if ('conflict' in recorded) return { httpStatus: 409, body: { ok: false, code: 'SUBMISSION_CONFLICT' } };

  // A retry of the same submission returns the first outcome and never notifies twice.
  if (!recorded.created) {
    return {
      httpStatus: 200,
      body: { ok: true, reference: recorded.reference, duplicate: true, notification: recorded.notificationStatus },
    };
  }

  // Once recorded, a failing (even synchronously throwing) send or mark must not
  // turn the response into "not recorded".
  let notification: Exclude<ContactNotificationStatus, 'PENDING'> = 'NOT_CONFIGURED';
  const transport = deps.transport;
  if (transport) {
    const sent = await Promise.resolve()
      .then(() => transport.send(composeContactNotification(validated.value, recorded.reference)))
      .catch(() => ({ ok: false }));
    notification = sent.ok ? 'SENT' : 'FAILED';
  }
  await Promise.resolve()
    .then(() => deps.markNotification(recorded.id, notification))
    .catch(() => undefined);

  return {
    httpStatus: 200,
    body: { ok: true, reference: recorded.reference, duplicate: false, notification },
  };
}
