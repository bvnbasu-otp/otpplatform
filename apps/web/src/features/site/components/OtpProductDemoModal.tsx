import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { OtpLogo } from '@/components/ui/OtpLogo';

export type DemoPersona = 'INDIVIDUAL' | 'RWA' | 'MSME' | 'SUPPLIER';
export type DemoStep = 'TELL' | 'REVIEW' | 'DECIDE' | 'TRACK';

interface ScenarioData {
  title: string;
  category: string;
  location: string;
  budget: string;
  tellText: string;
  tellHighlights: string[];
  reviewQuotes: Array<{
    alias: string;
    price: string;
    delivery: string;
    warranty: string;
    score: number;
    gstVerified: boolean;
  }>;
  decideSummary: string;
  decideHighlights: string[];
  trackSummary: string;
  trackMilestones: Array<{ title: string; status: 'completed' | 'in_progress' | 'pending' }>;
}

const PERSONA_SCENARIOS: Record<DemoPersona, { label: string; icon: string; role: string; scenario: ScenarioData }> = {
  INDIVIDUAL: {
    label: 'Individual Buyer',
    icon: '👤',
    role: 'Home & Property Owner',
    scenario: {
      title: '10 HP Submersible Borewell Motor Rewinding',
      category: 'Water & Environmental Solutions',
      location: 'Bengaluru (560034)',
      budget: '₹18,000 – ₹25,000',
      tellText:
        'Require urgent 10 HP copper motor rewinding with new bearings, dynamic rotor balancing, and 6 months warranty. Delivery within 4 days.',
      tellHighlights: [
        'Voice dictation or natural typing in vernacular/English',
        'Auto-parser extracts copper grade, horsepower & warranty',
        'Identity & phone number strictly masked from public view',
      ],
      reviewQuotes: [
        { alias: 'Supplier #01', price: '₹19,500', delivery: '3 days', warranty: '6 months', score: 94, gstVerified: true },
        { alias: 'Supplier #02', price: '₹22,000', delivery: '2 days', warranty: '12 months', score: 91, gstVerified: true },
        { alias: 'Supplier #03', price: '₹18,200', delivery: '5 days', warranty: '3 months', score: 82, gstVerified: false },
      ],
      decideSummary: 'Compare sealed quotes side by side. Supplier identities remain anonymous until final decision.',
      decideHighlights: [
        'Mathematical scoring based on price, delivery time & warranty',
        'Direct selection without supplier sales calls or spam',
        'No platform commission or broker markups',
      ],
      trackSummary: 'Digital Work Order issued with frozen specifications and milestone check-in.',
      trackMilestones: [
        { title: 'Work Order Generated & Terms Frozen', status: 'completed' },
        { title: 'Motor Pickup & Rewinding Inspection', status: 'in_progress' },
        { title: 'Testing, Re-installation & Direct UPI Settlement', status: 'pending' },
      ],
    },
  },
  RWA: {
    label: 'RWA / Society',
    icon: '🏢',
    role: 'Management Committee',
    scenario: {
      title: 'Annual Maintenance Contract (AMC) for 250 kVA Diesel Generator',
      category: 'Property & Facility Management',
      location: 'Chennai (600096)',
      budget: '₹1,20,000 / year',
      tellText:
        'Comprehensive AMC for 250 kVA Cummins Silent DG set including monthly B-check servicing, emergency breakdown response within 2 hours, and consumable filter replacements.',
      tellHighlights: [
        'Single registered organizational society address',
        'Custom committee specifications with SLA requirements',
        'Ready for multi-member approval and statutory auditing',
      ],
      reviewQuotes: [
        { alias: 'Supplier #01', price: '₹1,15,000/yr', delivery: '2 hr SLA', warranty: '12 months', score: 96, gstVerified: true },
        { alias: 'Supplier #02', price: '₹1,28,000/yr', delivery: '1 hr SLA', warranty: '12 months', score: 89, gstVerified: true },
        { alias: 'Supplier #03', price: '₹1,08,000/yr', delivery: '4 hr SLA', warranty: '6 months', score: 84, gstVerified: true },
      ],
      decideSummary: 'Governed committee voting with quorum enforcement and conflict-of-interest safeguards.',
      decideHighlights: [
        'Weighted voting (1–4) for President, Secretary & Committee',
        'Anti-self-approval and mandatory quorum rules',
        'Downloadable audit report for Annual General Body Meeting (AGM)',
      ],
      trackSummary: 'Contract execution with milestone inspection and transparent society ledger.',
      trackMilestones: [
        { title: 'Committee Approval & Formal Award', status: 'completed' },
        { title: 'Quarterly Maintenance Schedule Active', status: 'in_progress' },
        { title: 'Direct Society Bank Account Settlement', status: 'pending' },
      ],
    },
  },
  MSME: {
    label: 'MSME Business',
    icon: '🏭',
    role: 'Owner & Procurement Lead',
    scenario: {
      title: 'Precision CNC Turning for 5,000 SS304 Bushings',
      category: 'Machinery & Engineering',
      location: 'Coimbatore (641018)',
      budget: '₹3,50,000',
      tellText:
        'Supply 5,000 precision CNC turned bushes in Stainless Steel 304, tolerance +/- 0.02 mm, surface finish Ra 0.8, with material test certificate (MTC). Required within 15 days.',
      tellHighlights: [
        'Engineering drawing / BoQ attachment & technical attributes',
        'Primary account holder with authorized delegate management',
        'Statutory GST place-of-supply validation',
      ],
      reviewQuotes: [
        { alias: 'Supplier #01', price: '₹3,25,000', delivery: '12 days', warranty: 'MTC included', score: 95, gstVerified: true },
        { alias: 'Supplier #02', price: '₹3,40,000', delivery: '10 days', warranty: 'MTC + CMM report', score: 92, gstVerified: true },
        { alias: 'Supplier #03', price: '₹3,60,000', delivery: '14 days', warranty: 'Standard', score: 79, gstVerified: true },
      ],
      decideSummary: 'Technical & commercial matrix comparison with delegate procurement authority.',
      decideHighlights: [
        'Full GST input tax credit (ITC) compliance verification',
        'Spend-cap enforcement without complex RWA voting rules',
        'Immutable audit snapshot for tax and compliance records',
      ],
      trackSummary: 'Production lot tracking and direct B2B settlement via RTGS/NEFT.',
      trackMilestones: [
        { title: 'Technical Drawing Sign-off & PO Issued', status: 'completed' },
        { title: 'Lot 1 Sample Approval & Machining', status: 'in_progress' },
        { title: 'Final Dispatch, E-Way Bill & Direct Payment', status: 'pending' },
      ],
    },
  },
  SUPPLIER: {
    label: 'Verified Supplier',
    icon: '🤝',
    role: 'Industrial Vendor & Contractor',
    scenario: {
      title: 'Competitive Quoting on Genuine Buyer Requirements',
      category: 'Industrial Supplies & Machinery Spares',
      location: 'Pan-India / Regional Hubs',
      budget: 'High-Value Verified RFQs',
      tellText:
        'Verified suppliers receive instant notifications when genuine, funded buyer requirements match their category, capability, and delivery radius.',
      tellHighlights: [
        'Zero commission on won orders — 100% direct buyer payments',
        'Level playing field: fair evaluation without bribery or middlemen',
        'Instant alerts for verified local and pan-India RFQs',
      ],
      reviewQuotes: [
        { alias: 'Your Quote', price: '₹42,500', delivery: '4 days', warranty: '1 Year Full', score: 96, gstVerified: true },
        { alias: 'Competitor A', price: '₹45,000', delivery: '5 days', warranty: '6 months', score: 88, gstVerified: true },
        { alias: 'Competitor B', price: '₹41,000', delivery: '7 days', warranty: '3 months', score: 85, gstVerified: false },
      ],
      decideSummary: 'Sealed quote protection ensures no competitor sees your price before deadline.',
      decideHighlights: [
        'Strict sealed-quote protocol protects your pricing advantage',
        'Automatic objective scoring against buyer’s published criteria',
        'Award decisions made purely on merit and quality',
      ],
      trackSummary: 'Direct Purchase Order received. Ship goods and collect settlement directly from buyer.',
      trackMilestones: [
        { title: 'Winning Quote Selected by Buyer', status: 'completed' },
        { title: 'Dispatch Goods with Invoice & Delivery Challan', status: 'in_progress' },
        { title: 'Direct Payment Receipt from Buyer Account', status: 'pending' },
      ],
    },
  },
};

const STEPS: Array<{ key: DemoStep; label: string; sub: string; icon: string }> = [
  { key: 'TELL', label: '1. TELL', sub: 'Describe Requirement', icon: '📝' },
  { key: 'REVIEW', label: '2. REVIEW', sub: 'Receive Sealed Quotes', icon: '⚖️' },
  { key: 'DECIDE', label: '3. DECIDE', sub: 'Select & Approve', icon: '🎯' },
  { key: 'TRACK', label: '4. TRACK', sub: 'Deliver & Direct Settle', icon: '🚚' },
];

export interface OtpProductDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPersona?: DemoPersona;
}

export function OtpProductDemoModal({
  isOpen,
  onClose,
  initialPersona = 'INDIVIDUAL',
}: OtpProductDemoModalProps) {
  const [persona, setPersona] = useState<DemoPersona>(initialPersona);
  const [step, setStep] = useState<DemoStep>('TELL');

  useEffect(() => {
    setPersona(initialPersona);
  }, [initialPersona]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const activePersonaData = PERSONA_SCENARIOS[persona];
  const activeScenario = activePersonaData.scenario;

  const handleNextStep = useCallback(() => {
    const order: DemoStep[] = ['TELL', 'REVIEW', 'DECIDE', 'TRACK'];
    const idx = order.indexOf(step);
    if (idx < order.length - 1) {
      setStep(order[idx + 1]!);
    } else {
      setStep('TELL');
    }
  }, [step]);

  const handlePrevStep = useCallback(() => {
    const order: DemoStep[] = ['TELL', 'REVIEW', 'DECIDE', 'TRACK'];
    const idx = order.indexOf(step);
    if (idx > 0) {
      setStep(order[idx - 1]!);
    }
  }, [step]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-demo-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in overflow-y-auto"
      data-testid="otp-product-demo-modal"
    >
      <div className="bg-card border border-border w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b bg-muted/30 shrink-0">
          <div className="flex items-center gap-2.5">
            <OtpLogo size={26} className="shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-extrabold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                  Interactive Demo
                </span>
                <span className="text-[11px] text-muted-foreground hidden sm:inline">
                  TELL → REVIEW → DECIDE → TRACK
                </span>
              </div>
              <h2 id="product-demo-title" className="text-sm sm:text-base font-extrabold text-foreground">
                How OTP Works for You
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition text-xs font-bold cursor-pointer min-h-[36px] min-w-[36px] inline-flex items-center justify-center"
            aria-label="Close interactive demo"
          >
            ✕
          </button>
        </div>

        {/* Persona Switcher Tabs */}
        <div className="px-4 sm:px-6 pt-3 pb-2 border-b bg-background shrink-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Select Your Persona:
            </span>
            <span className="text-[11px] text-primary font-semibold">
              {activePersonaData.icon} {activePersonaData.label} ({activePersonaData.role})
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(PERSONA_SCENARIOS) as DemoPersona[]).map((key) => {
              const p = PERSONA_SCENARIOS[key];
              const isSelected = persona === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPersona(key)}
                  className={`p-2 rounded-xl text-left border transition-all cursor-pointer flex items-center gap-2 ${
                    isSelected
                      ? 'bg-primary/10 border-primary text-foreground shadow-2xs'
                      : 'border-border/60 hover:bg-muted/50 text-muted-foreground'
                  }`}
                >
                  <span className="text-lg shrink-0">{p.icon}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">{p.label}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{p.role}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Journey Step Progress Bar */}
        <div className="px-4 sm:px-6 py-2.5 border-b bg-muted/20 shrink-0">
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {STEPS.map((s) => {
              const isCurrent = step === s.key;
              const order = ['TELL', 'REVIEW', 'DECIDE', 'TRACK'];
              const isPast = order.indexOf(s.key) < order.indexOf(step);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStep(s.key)}
                  className={`px-2.5 py-1.5 rounded-lg text-left transition border cursor-pointer ${
                    isCurrent
                      ? 'bg-primary text-primary-foreground border-primary shadow-xs font-bold'
                      : isPast
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                        : 'bg-card text-muted-foreground border-border hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">{s.icon}</span>
                    <span className="text-xs font-extrabold truncate">{s.label}</span>
                  </div>
                  <p className="text-[10px] opacity-85 truncate hidden sm:block">{s.sub}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Step Content Area */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* Active Scenario Card Header */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-primary">
                Realistic Pilot Scenario
              </span>
              <h3 className="text-sm font-extrabold text-foreground">{activeScenario.title}</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Category: <strong>{activeScenario.category}</strong> · Location: <strong>{activeScenario.location}</strong> · Budget: <strong>{activeScenario.budget}</strong>
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/80 px-2.5 py-1 rounded-full border border-emerald-300">
                <span>🛡️</span> Zero Broker Markup
              </span>
            </div>
          </div>

          {/* STEP 1: TELL */}
          {step === 'TELL' && (
            <div className="space-y-3 animate-in fade-in">
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">Natural Requirement Intake</span>
                  <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded">
                    ⚡ Auto Parser Ready
                  </span>
                </div>
                <div className="rounded-lg bg-muted/40 p-3 font-mono text-xs text-foreground/90 border border-border/60 leading-relaxed">
                  &ldquo;{activeScenario.tellText}&rdquo;
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {activeScenario.tellHighlights.map((hl, i) => (
                  <div key={i} className="rounded-xl border border-border/80 bg-card p-3 space-y-1">
                    <span className="text-primary font-bold text-xs">✓ Point #{i + 1}</span>
                    <p className="text-xs text-muted-foreground leading-snug">{hl}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2: REVIEW */}
          {step === 'REVIEW' && (
            <div className="space-y-3 animate-in fade-in">
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-foreground">Competitive Sealed Quotes (3 Minimum)</h4>
                    <p className="text-[11px] text-muted-foreground">Supplier names hidden to prevent bias and price collusion.</p>
                  </div>
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 px-2 py-0.5 rounded border border-amber-300">
                    🔒 Protected Aliases
                  </span>
                </div>

                <div className="space-y-2">
                  {activeScenario.reviewQuotes.map((q) => (
                    <div
                      key={q.alias}
                      className="rounded-xl border border-border bg-muted/20 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-xs font-extrabold text-foreground bg-card px-2 py-1 rounded border">
                          {q.alias}
                        </span>
                        {q.gstVerified && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.5 rounded">
                            ✓ GST Verified
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {q.delivery} delivery · {q.warranty}
                        </span>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <span className="text-sm font-extrabold text-foreground tabular-nums">{q.price}</span>
                        <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 tabular-nums">
                          Match: {q.score}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: DECIDE */}
          {step === 'DECIDE' && (
            <div className="space-y-3 animate-in fade-in">
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-foreground">Transparent Award &amp; Governance Decision</h4>
                  <span className="text-[10px] font-bold bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 px-2 py-0.5 rounded border border-emerald-300">
                    100% Customer Decides
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{activeScenario.decideSummary}</p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  {activeScenario.decideHighlights.map((hl, i) => (
                    <div key={i} className="rounded-xl border border-border/80 bg-muted/10 p-3 space-y-1">
                      <span className="text-xs font-bold text-foreground">Rule #{i + 1}</span>
                      <p className="text-xs text-muted-foreground leading-snug">{hl}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: TRACK */}
          {step === 'TRACK' && (
            <div className="space-y-3 animate-in fade-in">
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-foreground">Fulfillment &amp; Direct Settlement</h4>
                  <span className="text-[10px] font-bold bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200 px-2 py-0.5 rounded border border-blue-300">
                    No Escrow Lockup
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{activeScenario.trackSummary}</p>

                <div className="space-y-2 pt-1">
                  {activeScenario.trackMilestones.map((m, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-border bg-muted/20 p-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground">Stage {i + 1}:</span>
                        <span className="text-muted-foreground">{m.title}</span>
                      </div>
                      <span
                        className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${
                          m.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : m.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 animate-pulse'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {m.status.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation & Call to Actions */}
        <div className="px-4 sm:px-6 py-3.5 border-t bg-muted/30 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {step !== 'TELL' && (
              <button
                type="button"
                onClick={handlePrevStep}
                className="px-3.5 py-2 text-xs font-bold rounded-lg border border-border bg-card hover:bg-muted transition cursor-pointer min-h-[40px]"
              >
                ← Back
              </button>
            )}
            <button
              type="button"
              onClick={handleNextStep}
              className="px-4 py-2 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-xs cursor-pointer min-h-[40px] flex-1 sm:flex-initial"
            >
              {step === 'TRACK' ? 'Restart Tour ↺' : 'Next Stage →'}
            </button>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <Link
              to="/signup?side=buyer"
              onClick={onClose}
              className="px-4 py-2 text-xs font-extrabold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-xs min-h-[40px] inline-flex items-center justify-center"
            >
              Start Free RFQ →
            </Link>
            <Link
              to="/signup?side=supplier"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold rounded-lg border border-border bg-card text-foreground hover:bg-muted transition min-h-[40px] inline-flex items-center justify-center"
            >
              Register as Supplier
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
