import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ContactUsPage } from './pages/ContactUsPage';
import { ContactUsPrintSheet } from './components/ContactUsPrintSheet';
import { ContactEnquiryFormView } from './components/ContactEnquiryForm';
import { submitContactEnquiry } from './api/submit-contact-enquiry';
import {
  EMPTY_CONTACT_FORM,
  contactFormReducer,
  createSingleFlight,
  initialContactFormState,
  validateContactForm,
  type ContactFormState,
} from './lib/contact-form';
import { OTP_LOGO_SRC } from '@/components/ui/OtpLogo';

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signOut: vi.fn() }, functions: { invoke: vi.fn() } },
}));
vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: null, signOut: vi.fn(), isAuthenticated: false, isLoading: false }),
}));
vi.mock('@/features/roles', () => ({
  useRoleContext: () => ({
    context: {
      signedIn: false, profileId: null, side: 'BUYER', isFounder: false, isPlatformAdmin: false, needsOnboarding: false,
      activeRole: null, roles: [], organizations: [], orgRole: null, organizationId: null, organizationName: null,
      buyerType: null, committeeRfqCount: 0, supplierId: null, fullName: null, title: null, avatarUrl: null, email: null,
    },
    switchTo: vi.fn(),
    switchOrg: vi.fn(),
  }),
}));
vi.mock('@/features/roles/api/roles', () => ({ hasMultipleRoles: () => false, hasMultipleOrganizations: () => false }));
vi.mock('@/features/roles/customer-procurement-access', () => ({
  canOfferCustomerRequirementCreation: () => false,
  isInternalOperatorContext: () => false,
}));
vi.mock('@/features/supplier', () => ({ SupplierCapabilityModal: () => null }));
vi.mock('@/features/portal', () => ({ QuickRegisterModal: () => null }));
vi.mock('@/features/intake', () => ({ VoiceTextRequirementIntakeModal: () => null }));
vi.mock('@/features/profile', () => ({ ProfileEditModal: () => null }));
vi.mock('@/features/roles/components/ChangePasswordModal', () => ({ ChangePasswordModal: () => null }));
vi.mock('@/features/support', () => ({ SupportHelpButtonModal: () => null }));

const SRC = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(SRC, rel), 'utf8');

const INTRO =
  'Have a question about procurement, supplier onboarding, or using OTP? Choose the enquiry type that best describes your question and send us a message.';
const CATEGORY_LABELS = [
  'Buyer enquiry — Individual, RWA or MSME',
  'Supplier onboarding',
  'Business or partnership enquiry',
  'Technical support',
  'Other',
];

function renderPage(): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/contact-us']}>
      <ContactUsPage />
    </MemoryRouter>,
  );
}

function screenPart(html: string): string {
  return html.match(/data-testid="contact-us-page"[\s\S]*?(?=data-testid="contact-us-print-sheet")/)?.[0] ?? '';
}

function decode(html: string): string {
  return html.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
}

function renderView(state: Partial<ContactFormState>): string {
  const full: ContactFormState = { ...initialContactFormState('3f0e6a52-6d1b-4c7a-9a55-1f2b3c4d5e6f'), ...state };
  return renderToStaticMarkup(
    <MemoryRouter>
      <ContactEnquiryFormView state={full} onChange={() => {}} onSubmit={() => {}} onReset={() => {}} />
    </MemoryRouter>,
  );
}

const validValues = {
  ...EMPTY_CONTACT_FORM,
  name: 'Asha Rao',
  email: 'asha@example.com',
  category: 'SUPPLIER_ONBOARDING',
  subject: 'Joining as a supplier',
  message: 'How do I register my plumbing business?',
};

describe('Contact Us page', () => {
  const html = renderPage();
  const screen = screenPart(html);

  it('renders the heading, exact intro and the OTP logo from the approved asset', () => {
    expect(screen).toContain('>Contact Us</h1>');
    expect(decode(screen)).toContain(INTRO);
    expect(screen).toContain(`src="${OTP_LOGO_SRC}"`);
    expect(OTP_LOGO_SRC).toBe('/brand/otp-logo.jpg');
    expect(decode(screen)).toContain('Open Trade & Procurement Platform (OTP)');
  });

  it('shows the exact support email and WhatsApp details', () => {
    expect(screen).toContain('href="mailto:bvnbasu+otp.demo.otp.support@gmail.com"');
    expect(screen).toContain('>bvnbasu+otp.demo.otp.support@gmail.com<');
    expect(screen).toContain('+91 9972967530');
  });

  it('links WhatsApp as a plain external link with an accessible name', () => {
    const link = screen.match(/<a[^>]*data-testid="contact-whatsapp-link"[^>]*>[^<]*<\/a>/)?.[0] ?? '';
    expect(link).toContain('href="https://wa.me/919972967530"');
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener noreferrer"');
    expect(link).toContain('aria-label="Contact us on WhatsApp at +91 9972967530 (opens in a new tab)"');
    expect(link).toContain('>Contact us on WhatsApp</a>');
  });

  it('offers exactly the five enquiry types, required, with no Enterprise option', () => {
    const select = screen.match(/<select[\s\S]*?<\/select>/)?.[0] ?? '';
    const options = [...select.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map((m) => [m[1], decode(m[2]!)]);
    expect(options).toEqual([
      ['', 'Choose an enquiry type'],
      ['BUYER', CATEGORY_LABELS[0]],
      ['SUPPLIER_ONBOARDING', CATEGORY_LABELS[1]],
      ['BUSINESS_PARTNERSHIP', CATEGORY_LABELS[2]],
      ['TECHNICAL_SUPPORT', CATEGORY_LABELS[3]],
      ['OTHER', CATEGORY_LABELS[4]],
    ]);
    expect(select).toContain('required=""');
    expect(select).toContain('aria-required="true"');
    expect(screen).not.toMatch(/enterprise/i);
  });

  it('labels every field and marks only the required ones as required', () => {
    for (const field of ['name', 'email', 'phone', 'organisation', 'category', 'subject', 'message']) {
      expect(screen).toContain(`for="contact-${field}"`);
      expect(screen).toContain(`id="contact-${field}"`);
    }
    for (const field of ['name', 'email', 'subject', 'message']) {
      expect(screen).toMatch(new RegExp(`id="contact-${field}"[^>]*aria-required="true"`));
    }
    for (const field of ['phone', 'organisation']) {
      expect(screen).not.toMatch(new RegExp(`id="contact-${field}"[^>]*required`));
    }
    expect(screen).toMatch(/id="contact-email"[^>]*type="email"/);
    expect(screen).toMatch(/id="contact-phone"[^>]*type="tel"/);
    expect(screen).toContain('aria-describedby="contact-form-required-note"');
  });

  it('shows the privacy notice linked to the existing privacy page, with no pre-ticked or invented consent', () => {
    expect(screen).toContain('data-testid="contact-privacy-notice"');
    expect(screen).toContain('href="/legal/privacy"');
    expect(screen).not.toContain('type="checkbox"');
    expect(screen).not.toContain('checked=""');
  });

  it('asks for no passwords, one-time codes, payment credentials or government IDs', () => {
    expect(screen).not.toMatch(/type="password"/);
    expect(screen).not.toMatch(/name="(otp|password|pan|aadhaar|card|cvv|upi)"/i);
    expect(screen).toContain('Please do not include passwords, one-time codes, payment card details or government ID numbers.');
  });

  it('keeps the honeypot out of the accessibility tree and tab order', () => {
    expect(screen).toMatch(/<div aria-hidden="true"[^>]*><label for="contact-website">/);
    expect(screen).toMatch(/id="contact-website"[^>]*tabindex="-1"/i);
  });

  it('invents nothing: no address, hours, GSTIN, registration or response deadline', () => {
    const text = decode(html);
    expect(text).not.toMatch(/address:|registered office|gstin|business hours|24\s*\/\s*7|within \d+ (hours|days)|guaranteed (reply|response)/i);
    expect(text).toContain('We’ll review your enquiry and respond as soon as we can.');
  });

  it('offers a print / save-as-PDF action that uses the shared print helper', () => {
    expect(screen).toContain('data-testid="contact-print-button"');
    expect(read('features/contact/pages/ContactUsPage.tsx')).toContain("import { triggerPrintDialog } from '@/features/reporting/lib/pdf-generator'");
  });

  it('sends nothing on page load', () => {
    const page = read('features/contact/pages/ContactUsPage.tsx');
    expect(page).not.toMatch(/useEffect|functions\.invoke|fetch\(/);
    expect(page).not.toMatch(/waha/i);
  });
});

describe('form states', () => {
  it('loading: disables the submit button, marks the form busy and says so', () => {
    const html = renderView({ values: validValues, phase: 'submitting' });
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/<button type="submit" disabled=""[^>]*>Sending…<\/button>/);
  });

  it('client validation errors are tied to their fields', () => {
    const errors = validateContactForm({ ...EMPTY_CONTACT_FORM, email: 'nope', phone: '123' });
    expect(Object.keys(errors)).toEqual(['name', 'email', 'phone', 'category', 'subject', 'message']);
    const html = renderView({ errors });
    expect(html).toMatch(/id="contact-email"[^>]*aria-invalid="true"[^>]*aria-describedby="contact-email-error"/);
    expect(html).toContain('id="contact-email-error"');
    expect(html).toContain('Enter a valid email address');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Please correct the 6 highlighted fields below.');
  });

  it('optional fields pass when blank and are validated when present', () => {
    expect(validateContactForm(validValues)).toEqual({});
    expect(validateContactForm({ ...validValues, phone: '+91 98450 12345' })).toEqual({});
    expect(validateContactForm({ ...validValues, phone: 'abc' })).toHaveProperty('phone');
    expect(validateContactForm({ ...validValues, category: 'ENTERPRISE' })).toHaveProperty('category');
    expect(validateContactForm({ ...validValues, message: 'm'.repeat(4001) })).toHaveProperty('message');
  });

  it('success: states the enquiry was recorded with its reference, without claiming an email was sent', () => {
    const html = renderView({ phase: 'success', reference: 'ENQ-ABC123' });
    expect(html).toContain('role="status"');
    expect(html).toContain('your enquiry has been recorded');
    expect(html).toContain('ENQ-ABC123');
    expect(decode(html)).toContain('We’ll review your enquiry and respond as soon as we can.');
    expect(html).not.toMatch(/email (has been|was) sent|delivered/i);
  });

  it('failure: says nothing was recorded and points to email and WhatsApp', () => {
    const html = renderView({ values: validValues, phase: 'error', failure: 'not_recorded' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('We could not record your enquiry, so nothing has been sent.');
    expect(html).toContain('href="mailto:bvnbasu+otp.demo.otp.support@gmail.com"');
    expect(html).toContain('href="https://wa.me/919972967530"');
    expect(html).toContain('value="Asha Rao"');
  });

  it('rate limited: says the enquiry was not recorded', () => {
    const html = renderView({ values: validValues, phase: 'error', failure: 'rate_limited' });
    expect(html).toContain('was not recorded because too many enquiries were sent');
  });

  it('reducer keeps values and the submission id across a failure, ignores edits mid-submit, and resets cleanly', () => {
    let s = initialContactFormState('id-1');
    s = contactFormReducer(s, { type: 'change', field: 'name', value: 'Asha' });
    s = contactFormReducer(s, { type: 'submit' });
    expect(contactFormReducer(s, { type: 'change', field: 'name', value: 'Changed' })).toBe(s);
    s = contactFormReducer(s, { type: 'failed', failure: 'not_recorded' });
    expect(s).toMatchObject({ phase: 'error', submissionId: 'id-1', values: { name: 'Asha' } });
    s = contactFormReducer(s, { type: 'submit' });
    s = contactFormReducer(s, { type: 'recorded', reference: 'ENQ-1' });
    expect(s).toMatchObject({ phase: 'success', reference: 'ENQ-1', submissionId: 'id-1' });
    s = contactFormReducer(s, { type: 'reset', submissionId: 'id-2' });
    expect(s).toEqual(initialContactFormState('id-2'));
  });

  it('duplicate submits while one is in flight are dropped', async () => {
    let release: (v: string) => void = () => {};
    const send = vi.fn(() => new Promise<string>((r) => { release = r; }));
    const flight = createSingleFlight(send);
    const first = flight.run(1);
    const second = flight.run(2);
    expect(flight.busy).toBe(true);
    release('done');
    expect(await first).toBe('done');
    expect(await second).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
    expect(flight.busy).toBe(false);
  });
});

describe('submitContactEnquiry maps server responses truthfully', () => {
  const ID = '3f0e6a52-6d1b-4c7a-9a55-1f2b3c4d5e6f';
  const httpError = (status: number, body: unknown) => ({
    context: { status, json: async () => body } as unknown as Response,
  });

  it('sends only the form fields and submission id, never a recipient', async () => {
    const invoke = vi.fn(async () => ({ data: { ok: true, reference: 'ENQ-1', duplicate: false, notification: 'NOT_CONFIGURED' }, error: null }));
    expect(await submitContactEnquiry(validValues, ID, invoke)).toEqual({ kind: 'recorded', reference: 'ENQ-1', duplicate: false });
    const [name, options] = invoke.mock.calls[0] as unknown as [string, { body: Record<string, unknown> }];
    expect(name).toBe('contact-enquiry');
    expect(Object.keys(options.body).sort()).toEqual(
      ['category', 'email', 'message', 'name', 'organisation', 'phone', 'subject', 'submissionId', 'website'].sort(),
    );
  });

  it('persists only the server-issued client credential and sends it as a header, never as a bucket field', async () => {
    const token = `v1.${'a'.repeat(48)}.${'b'.repeat(64)}`;
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    try {
      const first = vi.fn(async () => ({
        data: { ok: true, reference: 'ENQ-1', duplicate: false, clientToken: token },
        error: null,
      }));
      await submitContactEnquiry(validValues, ID, first);

      const second = vi.fn(async () => ({
        data: { ok: true, reference: 'ENQ-2', duplicate: false, clientToken: token },
        error: null,
      }));
      await submitContactEnquiry(validValues, ID, second);
      const [, options] = second.mock.calls[0] as unknown as [
        string,
        { body: Record<string, unknown>; headers?: Record<string, string> },
      ];
      expect(options.headers).toEqual({ 'x-otp-contact-client-token': token });
      expect(options.body).not.toHaveProperty('clientToken');
      expect(options.body).not.toHaveProperty('clientKey');
      expect(options.body).not.toHaveProperty('bucketId');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('persists the server-issued client credential from a rate-limit response and reuses it', async () => {
    const token = `v1.${'a'.repeat(48)}.${'b'.repeat(64)}`;
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });

    try {
      const limited = vi.fn(async () => ({
        data: null,
        error: httpError(429, { ok: false, code: 'RATE_LIMITED', clientToken: token }),
      }));

      expect(await submitContactEnquiry(validValues, ID, limited)).toEqual({ kind: 'rate_limited' });
      expect(values.get('otp.contact.client-token.v1')).toBe(token);

      const next = vi.fn(async () => ({
        data: { ok: true, reference: 'ENQ-2', duplicate: false, clientToken: token },
        error: null,
      }));

      await submitContactEnquiry(validValues, ID, next);

      const [, options] = next.mock.calls[0] as unknown as [
        string,
        { headers?: Record<string, string>; body: Record<string, unknown> },
      ];
      expect(options.headers).toEqual({ 'x-otp-contact-client-token': token });
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('maps rate limiting, field errors, unavailability, a missing function and network failure', async () => {
    expect(await submitContactEnquiry(validValues, ID, async () => ({ data: null, error: httpError(429, { ok: false, code: 'RATE_LIMITED' }) })))
      .toEqual({ kind: 'rate_limited' });
    const invalid = await submitContactEnquiry(validValues, ID, async () => ({
      data: null,
      error: httpError(400, { ok: false, code: 'INVALID', fieldErrors: { email: 'INVALID' } }),
    }));
    expect(invalid).toMatchObject({ kind: 'invalid', errors: { email: expect.stringContaining('valid email') } });
    expect(await submitContactEnquiry(validValues, ID, async () => ({ data: null, error: httpError(503, { ok: false, code: 'NOT_RECORDED' }) })))
      .toEqual({ kind: 'not_recorded' });
    expect(await submitContactEnquiry(validValues, ID, async () => ({ data: null, error: { message: 'Function not found' } })))
      .toEqual({ kind: 'not_recorded' });
    expect(await submitContactEnquiry(validValues, ID, async () => { throw new Error('offline'); }))
      .toEqual({ kind: 'not_recorded' });
    expect(await submitContactEnquiry(validValues, ID, async () => ({ data: { ok: true }, error: null })))
      .toEqual({ kind: 'not_recorded' });
  });
});

describe('A4 print / PDF sheet', () => {
  const sheet = renderToStaticMarkup(<ContactUsPrintSheet />);
  const text = decode(sheet);

  it('is an A4 portrait sheet hidden on screen and shown in print', () => {
    expect(sheet).toContain('hidden print:block');
    expect(sheet).toContain('data-print-document="contact-us"');
    expect(sheet).toContain('data-format="a4"');
    expect(sheet).toContain('data-orientation="portrait"');
  });

  it('carries the logo, platform name, title, contact details and all five categories', () => {
    expect(sheet).toContain(`src="${OTP_LOGO_SRC}"`);
    expect(text).toContain('Open Trade & Procurement Platform (OTP)');
    expect(sheet).toContain('>Contact Us</h1>');
    expect(text).toContain('bvnbasu+otp.demo.otp.support@gmail.com');
    expect(text).toContain('+91 9972967530');
    for (const label of CATEGORY_LABELS) expect(text).toContain(label);
  });

  it('has writing space for every field, a privacy reference and a restrained footer', () => {
    for (const label of ['Name *', 'Email *', 'Phone (optional)', 'Organisation (optional)', 'Subject *', 'Message *']) {
      expect(text).toContain(label);
    }
    expect((sheet.match(/contact-print-line/g) ?? []).length).toBeGreaterThanOrEqual(13);
    expect(text).toContain('/legal/privacy');
    expect(text).toContain('We’ll review your enquiry and respond as soon as we can.');
    expect(sheet).toMatch(/<footer class="contact-print-footer"[^>]*>/);
    expect(text).toContain('does not collect, hold, settle, or guarantee');
  });

  it('excludes navigation, buttons, form controls and invented details', () => {
    expect(sheet).not.toMatch(/<(nav|header|button|form|input|select|textarea)\b/);
    expect(text).not.toMatch(/address:|gstin|24\s*\/\s*7|within \d+ (hours|days)/i);
  });

  it('has a dedicated print stylesheet: A4 portrait page, margins, sheet-only output, no clipping', () => {
    const css = read('features/contact/contact-us-print.css');
    expect(css).toMatch(/@page contact-us\s*{[^}]*size: A4 portrait;[^}]*margin: 14mm/);
    expect(css).toContain('page: contact-us;');
    expect(css).toContain('@media print');
    expect(css).toMatch(/:not\(:has\(\[data-print-document='contact-us'\]\)\)[\s\S]*display: none !important/);
    expect(css).toMatch(/overflow: visible !important/);
    expect(css).toMatch(/break-inside: avoid/);
    expect(css).not.toMatch(/color: #(?!000000|333333|ffffff)[0-9a-f]{6}/i);
    expect(read('index.css')).toMatch(/@page\s*{\s*size: A4 portrait;/);
  });
});

describe('routing and navigation', () => {
  it('registers /contact-us as a public route outside the authenticated shell', () => {
    const app = read('App.tsx');
    expect(app).toContain("import('@/features/contact').then((m) => ({ default: m.ContactUsPage }))");
    const route = app.indexOf('<Route path="/contact-us" element={<ContactUsPage />} />');
    expect(route).toBeGreaterThan(-1);
    expect(route).toBeLessThan(app.indexOf('<RequireAuth>'));
    expect(app).toContain('<Route path="/contact" element={<Navigate to="/contact-us" replace />} />');
  });

  it('is linked from the public footer and treated as a public page by the mobile nav', () => {
    expect(read('components/layout/SiteFooter.tsx')).toContain('<Link to="/contact-us"');
    expect(read('components/MobileBottomNav.tsx')).toContain("'/contact-us'");
  });
});

describe('no secrets in client code', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return walk(full);
      return /\.(tsx?|css)$/.test(entry) && !/\.test\./.test(entry) ? [full] : [];
    });

  it('the contact feature holds no service-role key, secret or direct provider call', () => {
    const files = walk(resolve(SRC, 'features/contact'));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/service[_-]?role|SUPABASE_SERVICE|secret|api[_-]?key|import\.meta\.env|waha|twilio|smtp/i);
      expect(source, file).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    }
  });
});
