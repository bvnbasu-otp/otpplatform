import { OtpLogo } from '@/components/ui/OtpLogo';
import { PLATFORM_DISCLAIMER_LINES, PRODUCT_NAME, PRODUCT_PLATFORM_NAME } from '@/lib/brand';
import {
  CONTACT_CATEGORIES,
  CONTACT_COPY,
  CONTACT_EMAIL,
  CONTACT_WHATSAPP_DISPLAY,
  CONTACT_WHATSAPP_HREF,
} from '../contact-details';
import '../contact-us-print.css';

const WRITING_FIELDS = [
  { label: 'Name', required: true },
  { label: 'Email', required: true },
  { label: 'Phone', required: false },
  { label: 'Organisation', required: false },
  { label: 'Subject', required: true },
] as const;

const MESSAGE_LINES = 8;

function privacyAddress(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/legal/privacy`;
}

/**
 * A4 portrait, printable Contact Us form. Hidden on screen; when printing or
 * saving as PDF only this sheet is shown (see contact-us-print.css).
 */
export function ContactUsPrintSheet() {
  return (
    <div
      className="contact-print-sheet hidden print:block"
      data-print-document="contact-us"
      data-format="a4"
      data-orientation="portrait"
      data-testid="contact-us-print-sheet"
    >
      <div className="contact-print-brand" data-section="brand">
        <OtpLogo size={44} />
        <div>
          <p className="contact-print-platform">{PRODUCT_PLATFORM_NAME} ({PRODUCT_NAME})</p>
          <h1 className="contact-print-title">{CONTACT_COPY.heading}</h1>
        </div>
      </div>

      <p className="contact-print-intro">{CONTACT_COPY.intro}</p>

      <dl className="contact-print-details" data-section="contact-details">
        <div>
          <dt>Email</dt>
          <dd>{CONTACT_EMAIL}</dd>
        </div>
        <div>
          <dt>WhatsApp</dt>
          <dd>
            {CONTACT_WHATSAPP_DISPLAY} · {CONTACT_WHATSAPP_HREF.replace(/^https:\/\//, '')}
          </dd>
        </div>
      </dl>

      <section className="contact-print-section" data-section="categories">
        <h2>Enquiry type (tick one) *</h2>
        <ul className="contact-print-categories">
          {CONTACT_CATEGORIES.map((c) => (
            <li key={c.code}>
              <span className="contact-print-box" aria-hidden="true" />
              {c.label}
            </li>
          ))}
        </ul>
      </section>

      <section className="contact-print-section" data-section="fields">
        <h2>Your details</h2>
        {WRITING_FIELDS.map((f) => (
          <div key={f.label} className="contact-print-field">
            <span className="contact-print-label">
              {f.label}
              {f.required ? ' *' : ' (optional)'}
            </span>
            <span className="contact-print-line" />
          </div>
        ))}
        <div className="contact-print-message">
          <span className="contact-print-label">Message *</span>
          {Array.from({ length: MESSAGE_LINES }, (_, i) => (
            <span key={i} className="contact-print-line contact-print-line-block" />
          ))}
        </div>
        <p className="contact-print-note">* Required</p>
      </section>

      <section className="contact-print-section contact-print-privacy" data-section="privacy">
        <h2>Privacy</h2>
        <p>
          Before you send, please read our Privacy page to see how {PRODUCT_NAME} handles the information you share:{' '}
          {privacyAddress()}
        </p>
        <p>{CONTACT_COPY.sensitiveDataGuidance}</p>
        <p>{CONTACT_COPY.response}</p>
      </section>

      <footer className="contact-print-footer" data-section="footer">
        {PLATFORM_DISCLAIMER_LINES.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </footer>
    </div>
  );
}
