import { CONTACT_CATEGORIES, CONTACT_LIMITS } from '../contact-details';

export type ContactFormField = 'name' | 'email' | 'phone' | 'category' | 'organisation' | 'subject' | 'message';

export interface ContactFormValues {
  name: string;
  email: string;
  phone: string;
  category: string;
  organisation: string;
  subject: string;
  message: string;
  /** Honeypot. Hidden from people and assistive technology; must stay empty. */
  website: string;
}

export type ContactFieldErrors = Partial<Record<ContactFormField, string>>;

export const EMPTY_CONTACT_FORM: ContactFormValues = {
  name: '',
  email: '',
  phone: '',
  category: '',
  organisation: '',
  subject: '',
  message: '',
  website: '',
};

export const CONTACT_FIELD_ORDER: ContactFormField[] = ['name', 'email', 'phone', 'category', 'organisation', 'subject', 'message'];

const EMAIL = /^[^\s@<>()[\]",;:\\]+@[^\s@<>()[\]",;:\\]+\.[^\s@<>()[\]",;:\\]{2,}$/;
const PHONE_CHARS = /^\+?[0-9 ()-]+$/;

/** Server field error codes, worded for people. */
export function fieldErrorMessage(field: ContactFormField, code: string): string {
  const L = CONTACT_LIMITS;
  switch (field) {
    case 'name':
      return code === 'TOO_LONG' ? `Name must be ${L.name} characters or fewer.` : 'Enter your name.';
    case 'email':
      return code === 'REQUIRED' ? 'Enter your email address.' : 'Enter a valid email address, like name@example.com.';
    case 'phone':
      return 'Enter a valid phone number with 10 to 15 digits, or leave it blank.';
    case 'category':
      return 'Choose an enquiry type.';
    case 'organisation':
      return `Organisation must be ${L.organisation} characters or fewer.`;
    case 'subject':
      return code === 'TOO_LONG' ? `Subject must be ${L.subject} characters or fewer.` : 'Enter a subject.';
    case 'message':
      if (code === 'TOO_SHORT') return `Message must be at least ${L.messageMin} characters.`;
      if (code === 'TOO_LONG') return `Message must be ${L.message} characters or fewer.`;
      return 'Enter your message.';
  }
}

export function validateContactForm(values: ContactFormValues): ContactFieldErrors {
  const L = CONTACT_LIMITS;
  const codes: Partial<Record<ContactFormField, string>> = {};
  const name = values.name.trim();
  const email = values.email.trim();
  const phone = values.phone.trim();
  const organisation = values.organisation.trim();
  const subject = values.subject.trim();
  const message = values.message.trim();

  if (!name) codes.name = 'REQUIRED';
  else if (name.length > L.name) codes.name = 'TOO_LONG';

  if (!email) codes.email = 'REQUIRED';
  else if (email.length > L.email || !EMAIL.test(email)) codes.email = 'INVALID';

  if (phone) {
    const digits = phone.replace(/\D/g, '');
    if (phone.length > L.phone || !PHONE_CHARS.test(phone) || digits.length < 10 || digits.length > 15) codes.phone = 'INVALID';
  }

  if (!CONTACT_CATEGORIES.some((c) => c.code === values.category)) codes.category = 'REQUIRED';

  if (organisation.length > L.organisation) codes.organisation = 'TOO_LONG';

  if (!subject) codes.subject = 'REQUIRED';
  else if (subject.length > L.subject) codes.subject = 'TOO_LONG';

  if (!message) codes.message = 'REQUIRED';
  else if (message.length < L.messageMin) codes.message = 'TOO_SHORT';
  else if (message.length > L.message) codes.message = 'TOO_LONG';

  const errors: ContactFieldErrors = {};
  for (const field of CONTACT_FIELD_ORDER) {
    const code = codes[field];
    if (code) errors[field] = fieldErrorMessage(field, code);
  }
  return errors;
}

export function createSubmissionId(): string {
  return crypto.randomUUID();
}

export type ContactSubmitPhase = 'idle' | 'submitting' | 'success' | 'error';
export type ContactSubmitFailure = 'invalid' | 'rate_limited' | 'not_recorded';

export interface ContactFormState {
  values: ContactFormValues;
  errors: ContactFieldErrors;
  phase: ContactSubmitPhase;
  failure: ContactSubmitFailure | null;
  reference: string | null;
  /** Kept across retries of the same enquiry so the server can recognise a repeat. */
  submissionId: string;
}

export type ContactFormAction =
  | { type: 'change'; field: keyof ContactFormValues; value: string }
  | { type: 'invalid'; errors: ContactFieldErrors }
  | { type: 'submit' }
  | { type: 'recorded'; reference: string }
  | { type: 'failed'; failure: ContactSubmitFailure; errors?: ContactFieldErrors }
  | { type: 'reset'; submissionId: string };

export function initialContactFormState(submissionId: string): ContactFormState {
  return { values: EMPTY_CONTACT_FORM, errors: {}, phase: 'idle', failure: null, reference: null, submissionId };
}

export function contactFormReducer(state: ContactFormState, action: ContactFormAction): ContactFormState {
  switch (action.type) {
    case 'change': {
      if (state.phase === 'submitting') return state;
      const errors = { ...state.errors };
      if (action.field !== 'website') delete errors[action.field];
      return { ...state, values: { ...state.values, [action.field]: action.value }, errors };
    }
    case 'invalid':
      return { ...state, errors: action.errors, phase: 'idle', failure: null };
    case 'submit':
      return { ...state, phase: 'submitting', failure: null, errors: {} };
    case 'recorded':
      return { ...state, phase: 'success', reference: action.reference, failure: null };
    case 'failed':
      return { ...state, phase: 'error', failure: action.failure, errors: action.errors ?? {} };
    case 'reset':
      return initialContactFormState(action.submissionId);
  }
}

/**
 * Wraps a send function so a second submit while one is in flight is ignored
 * rather than sent again.
 */
export function createSingleFlight<A, R>(send: (arg: A) => Promise<R>) {
  let inFlight = false;
  return {
    get busy() {
      return inFlight;
    },
    async run(arg: A): Promise<R | null> {
      if (inFlight) return null;
      inFlight = true;
      try {
        return await send(arg);
      } finally {
        inFlight = false;
      }
    },
  };
}
