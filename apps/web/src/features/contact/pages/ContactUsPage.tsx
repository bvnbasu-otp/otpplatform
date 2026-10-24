import { OtpLogo } from '@/components/ui/OtpLogo';
import { PRODUCT_NAME, PRODUCT_PLATFORM_NAME } from '@/lib/brand';
import { triggerPrintDialog } from '@/features/reporting/lib/pdf-generator';
import { SiteLayout } from '@/features/site/components/SiteLayout';
import {
  CONTACT_COPY,
  CONTACT_EMAIL,
  CONTACT_WHATSAPP_DISPLAY,
  CONTACT_WHATSAPP_HREF,
} from '../contact-details';
import { ContactEnquiryForm } from '../components/ContactEnquiryForm';
import { ContactUsPrintSheet } from '../components/ContactUsPrintSheet';

export function ContactUsPage() {
  return (
    <SiteLayout>
      <div className="print:hidden mx-auto w-full max-w-3xl px-4 py-8 sm:py-12 overflow-x-hidden" data-testid="contact-us-page">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <OtpLogo size={40} />
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.14em] text-action">
              {PRODUCT_PLATFORM_NAME} ({PRODUCT_NAME})
            </p>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground leading-tight tracking-tight">
            {CONTACT_COPY.heading}
          </h1>
          <p className="text-sm md:text-base leading-relaxed text-muted-foreground">{CONTACT_COPY.intro}</p>
        </div>

        <section aria-labelledby="contact-methods-title" className="mt-6 rounded-2xl border bg-card p-4 sm:p-5 shadow-2xs">
          <h2 id="contact-methods-title" className="sr-only">Other ways to reach us</h2>
          <dl className="grid gap-4 sm:grid-cols-2 text-sm">
            <div className="min-w-0">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Email</dt>
              <dd className="mt-1">
                <a href={`mailto:${CONTACT_EMAIL}`} className="font-bold text-action underline break-all" data-testid="contact-email-link">
                  {CONTACT_EMAIL}
                </a>
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">WhatsApp</dt>
              <dd className="mt-1 space-y-2">
                <p className="font-bold text-foreground">{CONTACT_WHATSAPP_DISPLAY}</p>
                <a
                  href={CONTACT_WHATSAPP_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${CONTACT_COPY.whatsappLabel} at ${CONTACT_WHATSAPP_DISPLAY} (opens in a new tab)`}
                  className="inline-flex w-full sm:w-auto items-center justify-center rounded-xl border border-emerald-600 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200 min-h-[44px]"
                  data-testid="contact-whatsapp-link"
                >
                  {CONTACT_COPY.whatsappLabel}
                </a>
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-6 rounded-2xl border bg-card p-4 sm:p-6 shadow-2xs">
          <ContactEnquiryForm />
        </section>

        <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => triggerPrintDialog()}
            className="rounded-xl border border-border bg-card px-4 py-2 font-semibold text-foreground hover:bg-muted min-h-[44px]"
            data-testid="contact-print-button"
          >
            Print or save as PDF (A4)
          </button>
          <span>A printable copy of this form, without the website menus.</span>
        </div>
      </div>

      <ContactUsPrintSheet />
    </SiteLayout>
  );
}
