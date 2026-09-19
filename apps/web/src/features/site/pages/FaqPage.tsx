import { useState, useEffect } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import { SiteLayout } from '../components/SiteLayout';
import {
  BUYER_FAQS,
  GENERAL_FAQS,
  SUPPLIER_FAQS,
  type FaqEntry,
} from '../content/site-content';

type Audience = 'general' | 'buyers' | 'suppliers';

const TABS: [Audience, string][] = [
  ['general', 'General Architecture'],
  ['buyers', 'For Buyers & RWAs'],
  ['suppliers', 'For Verified Suppliers'],
];

const ENTRIES: Record<Audience, FaqEntry[]> = {
  general: GENERAL_FAQS,
  buyers: BUYER_FAQS,
  suppliers: SUPPLIER_FAQS,
};

export function FaqPage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const requested = params.get('for');
  const audience: Audience =
    requested === 'suppliers' ? 'suppliers' : requested === 'buyers' ? 'buyers' : 'general';
  const entries = ENTRIES[audience];

  // Accordion state for the 4 core architectural sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    workflow: true,
    identity: true,
    channels: false,
    governance: false,
  });

  useEffect(() => {
    if (location.hash === '#workflow') {
      setOpenSections((prev) => ({ ...prev, workflow: true }));
    } else if (location.hash === '#identity') {
      setOpenSections((prev) => ({ ...prev, identity: true }));
    } else if (location.hash === '#channels') {
      setOpenSections((prev) => ({ ...prev, channels: true }));
    } else if (location.hash === '#governance') {
      setOpenSections((prev) => ({ ...prev, governance: true }));
    }
  }, [location.hash]);

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  function select(next: Audience) {
    const updated = new URLSearchParams(params);
    if (next === 'general') updated.delete('for');
    else updated.set('for', next);
    setParams(updated, { replace: true });
  }

  return (
    <SiteLayout>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14 space-y-10">
        {/* Page Hero Header */}
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider">
            <span>🛡️</span> Complete Architecture &amp; FAQs
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">
            How OTP Works &amp; FAQ
          </h1>
          <p className="text-xs sm:text-sm md:text-base text-muted-foreground leading-relaxed">
            Understand the complete 7-screen mobile procurement pipeline, cryptographic alias protection, multi-channel vendor reach, and direct settlement rules.
          </p>
        </div>

        {/* 4 CORE ARCHITECTURAL ACCORDION SECTIONS */}
        <div className="space-y-4" id="workflow">
          {/* SECTION 1: THE 7-SCREEN PROCUREMENT WORKFLOW */}
          <div className="rounded-2xl border bg-card shadow-xs overflow-hidden transition">
            <button
              type="button"
              onClick={() => toggleSection('workflow')}
              className="w-full flex items-center justify-between p-4 sm:p-5 text-left bg-card hover:bg-muted/30 transition border-b border-border/60"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-black text-xs">
                  01
                </span>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-foreground">
                    01. The 7-Screen Procurement Workflow
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    End-to-end visual breakdown from plain-text intake to digital GST Purchase Order.
                  </p>
                </div>
              </div>
              <span className="text-xl font-bold text-muted-foreground transition-transform">
                {openSections.workflow ? '−' : '+'}
              </span>
            </button>

            {openSections.workflow && (
              <div className="p-4 sm:p-6 space-y-4 bg-muted/10 text-xs">
                <p className="text-sm text-foreground leading-relaxed">
                  The OTP Platform streamlines procurement into a mobile-first, 7-screen pipeline replacing convoluted desktop portals with high-velocity thumb interactions:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                  <div className="rounded-xl border bg-card p-3.5 space-y-1.5 shadow-2xs">
                    <span className="rounded bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-bold px-2 py-0.5 text-[10px]">
                      Screen 01 · Sourcing Cockpit
                    </span>
                    <h3 className="font-bold text-foreground text-xs">1-Tap Sourcing Launch</h3>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Launch requirements in seconds via popular template tiles or voice search. Real-time 3-state glance bar (Active, Action, Settled).
                    </p>
                  </div>

                  <div className="rounded-xl border bg-card p-3.5 space-y-1.5 shadow-2xs">
                    <span className="rounded bg-purple-500/10 text-purple-700 dark:text-purple-300 font-bold px-2 py-0.5 text-[10px]">
                      Screen 02 · Voice Intake
                    </span>
                    <h3 className="font-bold text-foreground text-xs">Conversational Dictation</h3>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Speak requirement in Tamil, Hindi, or English. Rule-based parser auto-extracts technical capacity, delivery radius, and timeline.
                    </p>
                  </div>

                  <div className="rounded-xl border bg-card p-3.5 space-y-1.5 shadow-2xs">
                    <span className="rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 font-bold px-2 py-0.5 text-[10px]">
                      Screen 03 · Supplier Radar
                    </span>
                    <h3 className="font-bold text-foreground text-xs">Multi-Channel Broadcast</h3>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Scans verified regional suppliers within 15 km and broadcasts sealed RFQ invitations across WhatsApp, ONDC, and SMS.
                    </p>
                  </div>

                  <div className="rounded-xl border bg-card p-3.5 space-y-1.5 shadow-2xs">
                    <span className="rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 font-bold px-2 py-0.5 text-[10px]">
                      Screen 04 · Supplier Quoting
                    </span>
                    <h3 className="font-bold text-foreground text-xs">30-Minute Quoting</h3>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Suppliers quote base price, 1-tap GST (+0%, +18%, +28%), turnaround days, and warranty directly on mobile keyboards.
                    </p>
                  </div>

                  <div className="rounded-xl border bg-card p-3.5 space-y-1.5 shadow-2xs">
                    <span className="rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 text-[10px]">
                      Screen 05 · Sealed Matrix
                    </span>
                    <h3 className="font-bold text-foreground text-xs">4-Pillar Zero-Bias Cards</h3>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Side-by-side vertical metric cards comparing ₹ Price, TAT, Warranty, and Merit Score under anonymous aliases (e.g. Supplier A7K3).
                    </p>
                  </div>

                  <div className="rounded-xl border bg-card p-3.5 space-y-1.5 shadow-2xs">
                    <span className="rounded bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 font-bold px-2 py-0.5 text-[10px]">
                      Screen 06 · Committee Vote
                    </span>
                    <h3 className="font-bold text-foreground text-xs">Democratic Decision Room</h3>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      1-Tap preset justification chips, live committee quorum meters, and fast-track solo approvals for individual owners.
                    </p>
                  </div>

                  <div className="rounded-xl border bg-card p-3.5 space-y-1.5 shadow-2xs sm:col-span-2 lg:col-span-3">
                    <span className="rounded bg-teal-500/10 text-teal-700 dark:text-teal-300 font-bold px-2 py-0.5 text-[10px]">
                      Screen 07 · Digital PO &amp; Tracking
                    </span>
                    <h3 className="font-bold text-foreground text-xs">Winner Reveal &amp; Procure-to-Pay</h3>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Winning supplier is unmasked, verified GSTIN credentials revealed, instant PDF Purchase Order issued, and live milestone stepper tracks delivery.
                    </p>
                  </div>
                </div>

                <div className="pt-2 text-right">
                  <Link to="/showcase" className="text-xs font-bold text-primary hover:underline">
                    Experience Interactive Screen Simulator →
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 2: IDENTITY PROTECTION & ZERO-BIAS EVALUATION */}
          <div className="rounded-2xl border bg-card shadow-xs overflow-hidden transition" id="identity">
            <button
              type="button"
              onClick={() => toggleSection('identity')}
              className="w-full flex items-center justify-between p-4 sm:p-5 text-left bg-card hover:bg-muted/30 transition border-b border-border/60"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-black text-xs">
                  02
                </span>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-foreground">
                    02. Identity Protection &amp; Zero-Bias Evaluation
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cryptographic alias sealing pre-award, unmasking upon PO issuance.
                  </p>
                </div>
              </div>
              <span className="text-xl font-bold text-muted-foreground transition-transform">
                {openSections.identity ? '−' : '+'}
              </span>
            </button>

            {openSections.identity && (
              <div className="p-4 sm:p-6 space-y-3 bg-muted/10 text-xs leading-relaxed">
                <p className="text-sm text-foreground">
                  Conventional procurement fails because decisions are influenced by vendor familiarity, brand perceptions, or personal kickbacks before prices and SLAs are objectively scored. OTP removes this bias at the protocol level:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="rounded-xl border bg-card p-3 space-y-1">
                    <h4 className="font-bold text-foreground text-xs">🔒 Cryptographic Salting</h4>
                    <p className="text-[11px] text-muted-foreground">
                      Each enquiry generates a random cryptographic salt. Supplier identities are hashed into masked aliases (e.g. <code>Supplier A7K3</code>, <code>Supplier B2M9</code>), so the same supplier has a completely different alias on every quote.
                    </p>
                  </div>

                  <div className="rounded-xl border bg-card p-3 space-y-1">
                    <h4 className="font-bold text-foreground text-xs">🛡️ Backend Data Decoupling</h4>
                    <p className="text-[11px] text-muted-foreground">
                      The database evaluation view contains zero company names, phone numbers, email addresses, or tax IDs. The frontend never receives identifying vendor data prior to award lock.
                    </p>
                  </div>

                  <div className="rounded-xl border bg-card p-3 space-y-1">
                    <h4 className="font-bold text-foreground text-xs">📄 Attachment Sanitization</h4>
                    <p className="text-[11px] text-muted-foreground">
                      Uploaded technical spec sheets, brochures, or photos are sanitized to strip EXIF GPS coordinates, camera models, author metadata, and original filenames.
                    </p>
                  </div>

                  <div className="rounded-xl border bg-card p-3 space-y-1">
                    <h4 className="font-bold text-foreground text-xs">🔓 Irreversible Unmasking</h4>
                    <p className="text-[11px] text-muted-foreground">
                      Only after committee quorum is reached and a recorded justification is locked does the database unmask the winning vendor’s verified GST credentials and contact details.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 3: MULTI-CHANNEL SOURCING */}
          <div className="rounded-2xl border bg-card shadow-xs overflow-hidden transition" id="channels">
            <button
              type="button"
              onClick={() => toggleSection('channels')}
              className="w-full flex items-center justify-between p-4 sm:p-5 text-left bg-card hover:bg-muted/30 transition border-b border-border/60"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-700 dark:text-blue-300 font-black text-xs">
                  03
                </span>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-foreground">
                    03. Multi-Channel Sourcing
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Reaching vendors via WhatsApp, SMS, Direct Registry, and pluggable ONDC discovery.
                  </p>
                </div>
              </div>
              <span className="text-xl font-bold text-muted-foreground transition-transform">
                {openSections.channels ? '−' : '+'}
              </span>
            </button>

            {openSections.channels && (
              <div className="p-4 sm:p-6 space-y-3 bg-muted/10 text-xs leading-relaxed">
                <p className="text-sm text-foreground">
                  OTP eliminates the marketplace bottleneck where sourcing requires every supplier to have pre-installed a specific proprietary desktop software. We meet Indian MSMEs where they already do business:
                </p>

                <div className="space-y-2 pt-2">
                  <div className="rounded-xl border bg-card p-3 flex items-start gap-2.5">
                    <span className="text-base">💬</span>
                    <div>
                      <h4 className="font-bold text-foreground text-xs">WhatsApp &amp; SMS Fast Quoting (Live)</h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Suppliers receive sealed RFQ notifications via WhatsApp, reply with pricing and delivery days, and get single-use mobile links to submit detailed quotes without complex portal passwords.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-card p-3 flex items-start gap-2.5">
                    <span className="text-base">⚡</span>
                    <div>
                      <h4 className="font-bold text-foreground text-xs">Direct Buyer Vendor Invitations (Live)</h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Buyers can invite their existing trusted contractors and vendors via phone or email link, subjecting them to zero-bias sealed evaluation alongside other market participants.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-card p-3 flex items-start gap-2.5">
                    <span className="text-base">🌐</span>
                    <div>
                      <h4 className="font-bold text-foreground text-xs">ONDC Open Network Interoperability (Planned / Adaptable)</h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Integrated B2B ONDC discovery adapter protocols to broadcast RFQs and aggregate quotes across India’s open digital commerce infrastructure.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 4: TECHNICAL ARCHITECTURE, GOVERNANCE & DIRECT SETTLEMENT RULES */}
          <div className="rounded-2xl border bg-card shadow-xs overflow-hidden transition" id="governance">
            <button
              type="button"
              onClick={() => toggleSection('governance')}
              className="w-full flex items-center justify-between p-4 sm:p-5 text-left bg-card hover:bg-muted/30 transition border-b border-border/60"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-700 dark:text-purple-300 font-black text-xs">
                  04
                </span>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-foreground">
                    04. Technical Architecture, Governance &amp; Direct Settlement Rules
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Direct bilateral settlement, milestone releases, transparent platform fee, immutable audit logging.
                  </p>
                </div>
              </div>
              <span className="text-xl font-bold text-muted-foreground transition-transform">
                {openSections.governance ? '−' : '+'}
              </span>
            </button>

            {openSections.governance && (
              <div className="p-4 sm:p-6 space-y-3 bg-muted/10 text-xs leading-relaxed">
                <p className="text-sm text-foreground">
                  OTP is designed as an institutional facilitation operating system, not a middleman payment processor:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="rounded-xl border bg-card p-3 space-y-1">
                    <h4 className="font-bold text-foreground text-xs">💸 Direct Settlement &amp; Zero Commission</h4>
                    <p className="text-[11px] text-muted-foreground">
                      Buyers contract and pay suppliers directly via RTGS/NEFT/UPI. OTP takes zero cut of the transaction value and charges zero lead fees, keeping our platform 100% neutral.
                    </p>
                  </div>

                  <div className="rounded-xl border bg-card p-3 space-y-1">
                    <h4 className="font-bold text-foreground text-xs">🛡️ Immutable Audit Ledger</h4>
                    <p className="text-[11px] text-muted-foreground">
                      Every requirement update, quote submission, committee vote, rationale chip, and milestone sign-off is permanently stamped into an append-only SHA-256 audit ledger.
                    </p>
                  </div>

                  <div className="rounded-xl border bg-card p-3 space-y-1">
                    <h4 className="font-bold text-foreground text-xs">🏛️ Segregation of Duties</h4>
                    <p className="text-[11px] text-muted-foreground">
                      Strict role-based permissions (Admin, Approver, Voter, Viewer) ensure committee members only access the actions authorized by society bylaws and corporate governance.
                    </p>
                  </div>

                  <div className="rounded-xl border bg-card p-3 space-y-1">
                    <h4 className="font-bold text-foreground text-xs">📦 Milestone-Driven Execution</h4>
                    <p className="text-[11px] text-muted-foreground">
                      Purchase orders progress through structured milestones (Pickup, In Progress, Ready for Delivery, Invoiced, Settled) with digital proof verification.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CATEGORIZED DETAILED FAQ SECTION */}
        <div className="pt-6 border-t border-border/80 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-foreground">Frequently Asked Questions</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Detailed Q&amp;A by user role and institutional requirements.
              </p>
            </div>

            {/* Audience Tabs */}
            <div
              role="tablist"
              aria-label="Audience"
              className="inline-flex rounded-xl border bg-muted/40 p-1 text-xs font-bold shrink-0"
            >
              {TABS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={audience === value}
                  onClick={() => select(value)}
                  data-testid={`faq-tab-${value}`}
                  className={`rounded-lg px-3 py-1.5 transition ${
                    audience === value
                      ? 'bg-card text-foreground shadow-xs font-black'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-border/60 rounded-2xl border bg-card shadow-xs" data-testid="faq-list">
            {entries.map((entry) => (
              <FaqItem key={entry.question} entry={entry} />
            ))}
          </div>

          <div className="rounded-2xl border bg-gradient-to-r from-primary/10 via-card to-primary/5 p-6 text-center space-y-3">
            <h3 className="text-sm font-bold text-foreground">Have a specific question about your organisation?</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Our team helps housing societies, MSMEs, and enterprises configure custom governance weights and supplier invitation channels.
            </p>
            <div className="flex items-center justify-center gap-3 pt-1">
              <Link
                to="/signup"
                className="rounded-xl bg-primary text-primary-foreground font-bold px-4 py-2 text-xs shadow-xs hover:bg-primary/90 transition"
              >
                Start Free Enquiry →
              </Link>
              <Link
                to="/about-us"
                className="rounded-xl border bg-card px-4 py-2 text-xs font-semibold hover:bg-muted transition"
              >
                Read About Us
              </Link>
            </div>
          </div>
        </div>
      </div>
    </SiteLayout>
  );
}

function FaqItem({ entry }: { entry: FaqEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-start justify-between gap-4 p-4 sm:p-5 text-left hover:bg-muted/20 transition"
        >
          <span className="text-xs sm:text-sm font-bold text-foreground">{entry.question}</span>
          <span
            aria-hidden="true"
            className={`mt-0.5 shrink-0 text-base font-bold text-primary transition-transform ${
              open ? 'rotate-45' : ''
            }`}
          >
            +
          </span>
        </button>
      </h2>
      {open && (
        <div className="px-4 sm:px-5 pb-5 text-xs leading-relaxed text-muted-foreground border-t border-border/40 pt-3 bg-muted/5">
          <p className="whitespace-pre-line">{entry.answer}</p>
        </div>
      )}
    </div>
  );
}
