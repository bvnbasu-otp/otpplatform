import { useEffect, useReducer, useRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  CONTACT_CATEGORIES,
  CONTACT_COPY,
  CONTACT_EMAIL,
  CONTACT_LIMITS,
  CONTACT_WHATSAPP_HREF,
} from '../contact-details';
import {
  CONTACT_FIELD_ORDER,
  contactFormReducer,
  createSingleFlight,
  createSubmissionId,
  initialContactFormState,
  validateContactForm,
  type ContactFormState,
  type ContactFormValues,
} from '../lib/contact-form';
import { submitContactEnquiry, type ContactSubmitOutcome } from '../api/submit-contact-enquiry';

const INPUT_CLASS =
  'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary aria-[invalid=true]:border-red-500 disabled:opacity-60 min-h-[44px]';
const LABEL_CLASS = 'block text-xs font-bold text-foreground mb-1';
const ERROR_CLASS = 'mt-1 text-xs font-medium text-red-700 dark:text-red-400';

function fieldId(field: string): string {
  return `contact-${field}`;
}

function Required() {
  return (
    <>
      <span aria-hidden="true" className="text-red-600"> *</span>
      <span className="sr-only"> (required)</span>
    </>
  );
}

function Optional() {
  return <span className="font-normal text-muted-foreground"> (optional)</span>;
}

function describedBy(state: ContactFormState, field: keyof ContactFormValues, hint?: string): string | undefined {
  const ids = [hint, field !== 'website' && state.errors[field] ? `${fieldId(field)}-error` : undefined].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

function FieldError({ state, field }: { state: ContactFormState; field: keyof ContactFormValues }) {
  if (field === 'website') return null;
  const message = state.errors[field];
  if (!message) return null;
  return (
    <p id={`${fieldId(field)}-error`} className={ERROR_CLASS}>
      {message}
    </p>
  );
}

function FallbackContacts() {
  return (
    <>
      {' '}
      Please email us at{' '}
      <a href={`mailto:${CONTACT_EMAIL}`} className="font-bold underline">
        {CONTACT_EMAIL}
      </a>{' '}
      or{' '}
      <a href={CONTACT_WHATSAPP_HREF} target="_blank" rel="noopener noreferrer" className="font-bold underline">
        {CONTACT_COPY.whatsappLabel}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      .
    </>
  );
}

export interface ContactEnquiryFormViewProps {
  state: ContactFormState;
  onChange: (field: keyof ContactFormValues, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
}

export function ContactEnquiryFormView({ state, onChange, onSubmit, onReset }: ContactEnquiryFormViewProps) {
  const submitting = state.phase === 'submitting';
  const { values } = state;

  if (state.phase === 'success') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100 space-y-3"
        data-testid="contact-success"
      >
        <h2 className="text-base font-bold">Thank you — your enquiry has been recorded.</h2>
        {state.reference && (
          <p>
            Reference: <span className="font-mono font-bold">{state.reference}</span>
          </p>
        )}
        <p>{CONTACT_COPY.response}</p>
        <button
          type="button"
          onClick={onReset}
          className="rounded-xl border border-emerald-400 bg-card px-4 py-2 text-xs font-bold text-foreground hover:bg-muted min-h-[44px]"
        >
          Send another enquiry
        </button>
      </div>
    );
  }

  const errorCount = Object.keys(state.errors).length;

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-labelledby="contact-form-title"
      aria-describedby="contact-form-required-note"
      aria-busy={submitting}
      className="space-y-4"
      data-testid="contact-enquiry-form"
    >
      <div>
        <h2 id="contact-form-title" className="text-base font-bold text-foreground">Send us a message</h2>
        <p id="contact-form-required-note" className="mt-1 text-xs text-muted-foreground">
          Fields marked <span aria-hidden="true">*</span><span className="sr-only">as required</span> are required.
        </p>
      </div>

      {state.phase === 'error' && state.failure && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
          data-testid="contact-failure"
        >
          {state.failure === 'invalid' && 'Your enquiry was not sent. Please correct the highlighted fields and try again.'}
          {state.failure === 'rate_limited' && (
            <>
              Your enquiry was not recorded because too many enquiries were sent from this connection recently. Please
              try again later.
              <FallbackContacts />
            </>
          )}
          {state.failure === 'not_recorded' && (
            <>
              We could not record your enquiry, so nothing has been sent. Your details are still in the form if you
              want to try again.
              <FallbackContacts />
            </>
          )}
        </div>
      )}

      {state.phase !== 'error' && errorCount > 0 && (
        <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
          Please correct the {errorCount === 1 ? 'highlighted field' : `${errorCount} highlighted fields`} below.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={fieldId('name')} className={LABEL_CLASS}>Name<Required /></label>
          <input
            id={fieldId('name')}
            name="name"
            type="text"
            autoComplete="name"
            required
            aria-required="true"
            aria-invalid={Boolean(state.errors.name)}
            aria-describedby={describedBy(state, 'name')}
            maxLength={CONTACT_LIMITS.name}
            value={values.name}
            disabled={submitting}
            onChange={(e) => onChange('name', e.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError state={state} field="name" />
        </div>

        <div>
          <label htmlFor={fieldId('email')} className={LABEL_CLASS}>Email<Required /></label>
          <input
            id={fieldId('email')}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            aria-required="true"
            aria-invalid={Boolean(state.errors.email)}
            aria-describedby={describedBy(state, 'email')}
            maxLength={CONTACT_LIMITS.email}
            value={values.email}
            disabled={submitting}
            onChange={(e) => onChange('email', e.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError state={state} field="email" />
        </div>

        <div>
          <label htmlFor={fieldId('phone')} className={LABEL_CLASS}>Phone<Optional /></label>
          <input
            id={fieldId('phone')}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            aria-invalid={Boolean(state.errors.phone)}
            aria-describedby={describedBy(state, 'phone')}
            maxLength={CONTACT_LIMITS.phone}
            value={values.phone}
            disabled={submitting}
            onChange={(e) => onChange('phone', e.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError state={state} field="phone" />
        </div>

        <div>
          <label htmlFor={fieldId('organisation')} className={LABEL_CLASS}>Organisation<Optional /></label>
          <input
            id={fieldId('organisation')}
            name="organisation"
            type="text"
            autoComplete="organization"
            aria-invalid={Boolean(state.errors.organisation)}
            aria-describedby={describedBy(state, 'organisation')}
            maxLength={CONTACT_LIMITS.organisation}
            value={values.organisation}
            disabled={submitting}
            onChange={(e) => onChange('organisation', e.target.value)}
            className={INPUT_CLASS}
          />
          <FieldError state={state} field="organisation" />
        </div>
      </div>

      <div>
        <label htmlFor={fieldId('category')} className={LABEL_CLASS}>Enquiry type<Required /></label>
        <select
          id={fieldId('category')}
          name="category"
          required
          aria-required="true"
          aria-invalid={Boolean(state.errors.category)}
          aria-describedby={describedBy(state, 'category')}
          value={values.category}
          disabled={submitting}
          onChange={(e) => onChange('category', e.target.value)}
          className={INPUT_CLASS}
        >
          <option value="">Choose an enquiry type</option>
          {CONTACT_CATEGORIES.map((c) => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
        <FieldError state={state} field="category" />
      </div>

      <div>
        <label htmlFor={fieldId('subject')} className={LABEL_CLASS}>Subject<Required /></label>
        <input
          id={fieldId('subject')}
          name="subject"
          type="text"
          required
          aria-required="true"
          aria-invalid={Boolean(state.errors.subject)}
          aria-describedby={describedBy(state, 'subject')}
          maxLength={CONTACT_LIMITS.subject}
          value={values.subject}
          disabled={submitting}
          onChange={(e) => onChange('subject', e.target.value)}
          className={INPUT_CLASS}
        />
        <FieldError state={state} field="subject" />
      </div>

      <div>
        <label htmlFor={fieldId('message')} className={LABEL_CLASS}>Message<Required /></label>
        <textarea
          id={fieldId('message')}
          name="message"
          rows={6}
          required
          aria-required="true"
          aria-invalid={Boolean(state.errors.message)}
          aria-describedby={describedBy(state, 'message', 'contact-message-hint')}
          maxLength={CONTACT_LIMITS.message}
          value={values.message}
          disabled={submitting}
          onChange={(e) => onChange('message', e.target.value)}
          className={`${INPUT_CLASS} leading-relaxed`}
        />
        <p id="contact-message-hint" className="mt-1 text-xs text-muted-foreground">
          {CONTACT_LIMITS.messageMin}–{CONTACT_LIMITS.message} characters. {CONTACT_COPY.sensitiveDataGuidance}
        </p>
        <FieldError state={state} field="message" />
      </div>

      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={fieldId('website')}>Website</label>
        <input
          id={fieldId('website')}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={values.website}
          onChange={(e) => onChange('website', e.target.value)}
        />
      </div>

      <p id="contact-privacy-notice" className="rounded-xl border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground" data-testid="contact-privacy-notice">
        Before you send, please read our{' '}
        <Link to="/legal/privacy" className="font-bold text-action underline">Privacy</Link>{' '}
        page to see how OTP handles the information you share.
      </p>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">{CONTACT_COPY.response}</p>
        <button
          type="submit"
          disabled={submitting}
          aria-describedby="contact-privacy-notice"
          className="w-full sm:w-auto rounded-xl bg-action px-5 py-2.5 text-sm font-bold text-action-foreground hover:bg-action-hover shadow-xs disabled:opacity-60 min-h-[44px]"
          data-testid="contact-submit"
        >
          {submitting ? 'Sending…' : 'Send enquiry'}
        </button>
      </div>
    </form>
  );
}

export function ContactEnquiryForm({
  submit = submitContactEnquiry,
}: {
  submit?: (values: ContactFormValues, submissionId: string) => Promise<ContactSubmitOutcome>;
}) {
  const [state, dispatch] = useReducer(contactFormReducer, undefined, () => initialContactFormState(createSubmissionId()));
  const flight = useRef(createSingleFlight((args: { values: ContactFormValues; submissionId: string }) => submit(args.values, args.submissionId)));
  const focusFirstError = useRef(false);

  useEffect(() => {
    if (!focusFirstError.current) return;
    focusFirstError.current = false;
    const first = CONTACT_FIELD_ORDER.find((field) => state.errors[field]);
    if (first) document.getElementById(fieldId(first))?.focus();
  }, [state.errors]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (flight.current.busy || state.phase === 'submitting') return;

    const errors = validateContactForm(state.values);
    if (Object.keys(errors).length > 0) {
      focusFirstError.current = true;
      dispatch({ type: 'invalid', errors });
      return;
    }

    dispatch({ type: 'submit' });
    const outcome = await flight.current.run({ values: state.values, submissionId: state.submissionId });
    if (!outcome) return;
    if (outcome.kind === 'recorded') dispatch({ type: 'recorded', reference: outcome.reference });
    else if (outcome.kind === 'invalid') {
      focusFirstError.current = true;
      dispatch({ type: 'failed', failure: 'invalid', errors: outcome.errors });
    } else dispatch({ type: 'failed', failure: outcome.kind });
  }

  return (
    <ContactEnquiryFormView
      state={state}
      onChange={(field, value) => dispatch({ type: 'change', field, value })}
      onSubmit={(event) => void handleSubmit(event)}
      onReset={() => dispatch({ type: 'reset', submissionId: createSubmissionId() })}
    />
  );
}
