import { Link, useParams } from 'react-router-dom';
import { PLATFORM_DISCLAIMER, PRODUCT_FULL_NAME, PRODUCT_NAME } from '@/lib/brand';
import { SiteLayout } from '@/features/site/components/SiteLayout';

/**
 * Terms, privacy and the disclaimer, reachable without a session.
 *
 * These are placeholders for counsel-approved copy, and they say so rather than
 * pretending to be binding text. What is not a placeholder is the disclaimer:
 * it is the same string the footer carries, from one constant, so the two can
 * never disagree about whether the platform touches money.
 */

type Topic = 'terms' | 'privacy' | 'disclaimer';

const TOPICS: Record<Topic, { title: string; intro: string }> = {
  terms: {
    title: 'Terms of use',
    intro: `Your agreement with ${PRODUCT_FULL_NAME} for access to the procurement, execution and governance platform.`,
  },
  privacy: {
    title: 'Privacy',
    intro: `What ${PRODUCT_NAME} records about you, why, and who can see it.`,
  },
  disclaimer: {
    title: 'Platform disclaimer',
    intro: 'What the platform does, and what it deliberately does not do.',
  },
};

export function LegalPage() {
  const { topic } = useParams<{ topic: string }>();
  const key: Topic =
    topic === 'privacy' ? 'privacy' : topic === 'disclaimer' ? 'disclaimer' : 'terms';
  const page = TOPICS[key];

  return (
    <SiteLayout>
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 sm:py-10 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] overflow-x-hidden">
        <h1 className="text-2xl sm:text-3xl font-semibold text-navy">{page.title}</h1>
        <p className="mt-3 text-sm sm:text-base text-slate">{page.intro}</p>

        <section className="mt-8 rounded-lg border-l-4 border-action bg-action-soft p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-navy">
            Payments
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate">{PLATFORM_DISCLAIMER}</p>
        </section>

        {key === 'privacy' && (
          <section className="mt-10 space-y-6 text-sm leading-relaxed text-slate">
            <div>
              <h2 className="text-lg font-semibold text-navy">Data We Collect</h2>
              <p className="mt-2">
                We collect information necessary to operate the procurement platform:
                organization details, user profiles, requirements, quotes, evaluation
                scores, committee votes, purchase orders, and communication logs.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-navy">Identity Protection During Evaluation</h2>
              <p className="mt-2">
                During the identity-protected evaluation phase, supplier identities are
                hidden from the buying committee. Each supplier appears under an
                anonymous, request-specific alias generated from a cryptographic salt
                unique to that RFQ. This prevents tracking the same supplier across
                different requests.
              </p>
              <p className="mt-2">
                The buyer's identity may also be hidden from suppliers until award,
                protecting both parties from bias and ensuring merit-based evaluation.
              </p>
              <p className="mt-2">
                Identity disclosure occurs only after award is locked through a separate,
                deliberate action. All revelations are recorded in an immutable audit trail
                with timestamps and actor identification.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-navy">Communication Logging</h2>
              <p className="mt-2">
                All platform communications (clarification Q&A, committee discussions,
                supplier messages via SMS/WhatsApp) are logged for audit and compliance
                purposes. Contact information (phone numbers, email addresses, URLs) in
                pre-award communications is automatically redacted to maintain identity
                protection.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-navy">Data Security & File Protection</h2>
              <p className="mt-2">
                Files uploaded to the platform have metadata automatically stripped
                (EXIF GPS coordinates, author names, company metadata) to prevent
                identity leaks during evaluation. Original filenames are replaced with
                neutral labels. All data is encrypted in transit (TLS 1.2+) and at rest.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-navy">Data Retention & Deletion</h2>
              <p className="mt-2">
                Procurement records are retained for 7 years as required by Indian
                accounting and tax regulations. Users may request data export or account
                deletion by contacting privacy@on-the-process.com. Audit trails
                and legal compliance records are retained per statutory requirements.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-navy">Third-Party Services</h2>
              <p className="mt-2">
                We use Supabase (database & auth), Twilio/Meta (messaging), and optional
                analytics tools. No data is sold to third parties. Service providers
                process data only as necessary to provide platform functionality.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-navy">Your Rights (GDPR/DPDP Compliance)</h2>
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>Right to access your personal data</li>
                <li>Right to rectification of inaccurate data</li>
                <li>Right to erasure (subject to legal retention requirements)</li>
                <li>Right to data portability (export in machine-readable format)</li>
                <li>Right to object to processing for marketing purposes</li>
                <li>Right to withdraw consent at any time</li>
              </ul>
              <p className="mt-2">
                To exercise these rights, contact: privacy@on-the-process.com
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-navy">Cookies & Tracking</h2>
              <p className="mt-2">
                We use essential cookies for authentication (session tokens). Optional
                analytics cookies may be used to improve platform performance. You can
                disable non-essential cookies in your browser settings without affecting
                core functionality.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-navy">Updates to Privacy Policy</h2>
              <p className="mt-2">
                We may update this policy to reflect legal or operational changes. Material
                changes will be notified via email and in-app notifications 30 days before
                taking effect. Continued use constitutes acceptance of updated terms.
              </p>
            </div>

            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs text-amber-900">
                <strong>⚠️ Legal Review Required:</strong> This privacy policy is based on
                GDPR and India's Digital Personal Data Protection Act (DPDP) 2023 requirements
                but must be reviewed and approved by legal counsel before production deployment.
                Last updated: 2026-09-01.
              </p>
            </div>
          </section>
        )}

        {key === 'terms' && (
          <section className="mt-10 space-y-6 text-sm leading-relaxed text-slate">
            <div>
              <h2 className="text-lg font-semibold text-navy">Platform Services</h2>
              <p className="mt-2">
                {PRODUCT_FULL_NAME} provides a cloud-based procurement management platform
                enabling organizations to create requirements, discover suppliers, conduct
                identity-protected evaluations, manage committee voting, issue purchase orders,
                and maintain audit trails. Access is provided on a subscription basis.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-navy">Eligibility & Account Registration</h2>
              <p className="mt-2">
                You must be 18+ years old and authorized to bind your organization to contracts.
                By registering, you represent that all information provided is accurate and that
                you have authority to act on behalf of your organization. One individual may not
                create multiple accounts to circumvent platform rules.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-navy">User Responsibilities</h2>
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>Maintain confidentiality of login credentials</li>
                <li>Promptly notify us of unauthorized access</li>
                <li>Provide accurate requirement specifications</li>
                <li>Submit quotes in good faith with genuine commercial intent</li>
                <li>Respect identity protection during evaluation (no attempts to identify suppliers)</li>
                <li>Comply with committee voting procedures and quorum requirements</li>
                <li>Honor awarded contracts as per agreed terms</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-navy">Prohibited Conduct</h2>
              <p className="mt-2">Users may not:</p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>Attempt to identify suppliers during identity-protected evaluation</li>
                <li>Collude with other parties to manipulate evaluations or votes</li>
                <li>Submit fraudulent quotes or misrepresent capabilities</li>
                <li>Use automated tools to scrape platform data</li>
                <li>Reverse engineer or decompile platform software</li>
                <li>Upload malicious files or attempt to breach security</li>
                <li>Harass, threaten, or abuse other users</li>
              </ul>
              <p className="mt-2">
                Violations may result in account suspension or termination without refund.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-navy">Contracting & Settlement</h2>
              <p className="mt-2">
                {PRODUCT_NAME} facilitates procurement processes but does not enter into
                contracts on behalf of users. All purchase orders, work orders, and payment
                obligations are between the buyer and supplier. The platform records agreements
                and tracks delivery stages but does not guarantee performance, handle payments, or
                mediate disputes.
              </p>
              <p className="mt-2 font-semibold">
                {PLATFORM_DISCLAIMER}
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-navy">Intellectual Property</h2>
              <p className="mt-2">
                The platform, its design, logos, and original content are owned by
                {' '}{PRODUCT_FULL_NAME} and protected by copyright, trademark, and other
                intellectual property laws. Users retain ownership of content they upload
                but grant us a license to host, display, and process that content as necessary
                to provide platform services.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-navy">Service Availability & Modifications</h2>
              <p className="mt-2">
                We strive for 99.9% uptime but do not guarantee uninterrupted access. We may
                perform scheduled maintenance with advance notice. We reserve the right to modify,
                suspend, or discontinue features with 30 days' notice. Critical security updates
                may be applied immediately.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-navy">Limitation of Liability</h2>
              <p className="mt-2">
                {PRODUCT_NAME} is not liable for: (a) indirect, incidental, or consequential
                damages; (b) loss of profits, data, or business opportunities; (c) conduct of
                other users; (d) failure of suppliers to perform awarded contracts; (e) technical
                issues beyond our reasonable control. Maximum liability for any claim is limited
                to the subscription fees paid in the 12 months preceding the claim.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-navy">Indemnification</h2>
              <p className="mt-2">
                You agree to indemnify and hold harmless {PRODUCT_NAME}, its officers, and
                employees from claims arising from: (a) your use of the platform; (b) your
                violation of these terms; (c) your violation of third-party rights; (d) disputes
                with other users or suppliers.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-navy">Dispute Resolution & Governing Law</h2>
              <p className="mt-2">
                These terms are governed by the laws of India. Any disputes shall be resolved
                through arbitration in Bangalore, Karnataka under the Indian Arbitration and
                Conciliation Act, 1996. The arbitrator's decision is final and binding. Courts
                in Bangalore have exclusive jurisdiction for enforcement of awards or injunctive
                relief.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-navy">Termination</h2>
              <p className="mt-2">
                Either party may terminate with 30 days' written notice. We may terminate
                immediately for: (a) violation of these terms; (b) fraudulent activity;
                (c) non-payment of subscription fees. Upon termination, you may export your
                data within 30 days. After 90 days, data is permanently deleted except as
                required for legal compliance.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-navy">Changes to Terms</h2>
              <p className="mt-2">
                We may update these terms with 30 days' notice via email and in-app notification.
                Continued use after changes take effect constitutes acceptance. Material changes
                affecting pricing or core functionality will require explicit consent.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-navy">Contact & Legal Notices</h2>
              <p className="mt-2">
                For legal inquiries: legal@on-the-process.com<br />
                For support: support@on-the-process.com<br />
                Address: [Insert Registered Business Address]
              </p>
            </div>

            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs text-amber-900">
                <strong>⚠️ Legal Review Required:</strong> These terms of use provide a framework
                but must be reviewed and approved by legal counsel before production deployment.
                Specific clauses should be tailored to your jurisdiction and business model.
                Last updated: 2026-09-01.
              </p>
            </div>
          </section>
        )}

        <div className="mt-10 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-5">
          <p className="text-xs leading-relaxed text-amber-900">
            <strong>⚠️ Legal Notice:</strong> The content on this page has been drafted to comply
            with GDPR, India's Digital Personal Data Protection Act (DPDP) 2023, and general best
            practices for SaaS platforms. However, this is <strong>NOT final legal text</strong> and
            must be reviewed and approved by qualified legal counsel before production deployment.
            Counsel should verify compliance with all applicable laws in your jurisdiction and tailor
            language to your specific business model and risk tolerance.
          </p>
        </div>
      </div>
    </SiteLayout>
  );
}
