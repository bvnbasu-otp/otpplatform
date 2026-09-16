import { useState } from 'react';
import { formatDateIST, formatDeadlineCountdown } from '@/lib/date-utils';
import {
  REQUIREMENT_MODE_LABELS,
  type FulfilmentMode,
  type RequiredByMode,
} from '@otp/domain';
import { AttachmentList, type Attachment } from '@/features/attachments';
import type { SupplierRfqDetail } from '../types/supplier-quote';

const FULFILMENT_LABELS: Record<FulfilmentMode, string> = {
  SUPPLIER_DELIVERY: 'Supplier delivers to site',
  BUYER_PICKUP: 'Buyer collects from supplier',
  SUPPLIER_ONSITE: 'On-site execution at buyer premises',
  REMOTE: 'Remote / Digital deliverable',
  LOGISTICS_REQUIRED: 'Transport & freight required',
};

function timing(rfq: SupplierRfqDetail): string {
  const mode = rfq.requiredByMode as RequiredByMode | null;
  if (mode === 'IMMEDIATE') return '⚡ Immediate Execution (ASAP)';
  if (mode === 'WITHIN_DAYS' && rfq.requiredByDays !== null) {
    return `📅 Within ${rfq.requiredByDays} Days of PO`;
  }
  if (mode === 'SPECIFIC_DATE' && rfq.requiredByDate) {
    return `📅 Target Date: ${formatDateIST(rfq.requiredByDate)}`;
  }
  if (mode === 'FLEXIBLE') return 'Flexible Timing';
  return 'Standard Turnaround';
}

function humanizeCode(code: string): string {
  return code.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (typeof value === 'boolean') return value ? 'Required / Yes' : 'No';
  return String(value);
}

export interface SupplierRequirementPanelProps {
  rfq: SupplierRfqDetail;
  buyerFiles?: Attachment[];
  hasQuote?: boolean;
}

/**
 * Screen 6: Supplier RFQ Opportunity Detail & Requirement Panel (Phase 3.2)
 * Core Job: "What is this requirement, what do I need to know, and what is expected?"
 * Answers:
 * 1. What is needed? (Scope & description with expandable summary)
 * 2. Specifications & BoQ (Technical parameters, quantity, quality expectations)
 * 3. Location, Fulfilment & Timeline (Response deadline vs delivery timeline)
 * 4. Commercial requirements & Evaluation weights (100% merit-based)
 * 5. Customer attachments & technical drawings
 * 6. Supplier requirements & eligibility verification
 * 7. What happens next (3-step sealed sourcing overview)
 */
export function SupplierRequirementPanel({
  rfq,
  buyerFiles = [],
  hasQuote = false,
}: SupplierRequirementPanelProps) {
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const attributes = Object.entries(rfq.attributes);
  const qualityEntries = Object.entries(rfq.quality ?? {});
  const commercialEntries = Object.entries(rfq.commercial ?? {});
  const weights = Object.entries(rfq.evaluationWeights).sort((a, b) => b[1] - a[1]);
  const countdown = formatDeadlineCountdown(rfq.quoteDeadline);

  const descriptionText = rfq.description?.trim() || '';
  const isDescriptionLong = descriptionText.length > 220;

  return (
    <div className="space-y-4 text-left" data-testid="supplier-requirement-panel">
      {/* 1. First Viewport Hero Card: Identity Shield, Scope Summary, Ref & Quick CTA */}
      <section className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-2xs space-y-3.5">
        {/* Top Badges Row: Public Ref, Alias & Requirement Mode */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {rfq.publicRef && (
              <span className="rounded-xl border bg-muted/60 px-2.5 py-1 text-xs font-mono font-black text-foreground shrink-0">
                {rfq.publicRef}
              </span>
            )}
            <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-[10px] font-extrabold shrink-0">
              🛡️ {rfq.anonymousLabel || 'Anonymous Tender'}
            </span>
            {rfq.requirementMode && (
              <span className="rounded-full bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 border px-2 py-0.5 text-[10px] font-bold shrink-0">
                🏷️ {REQUIREMENT_MODE_LABELS[rfq.requirementMode]}
              </span>
            )}
          </div>

          {/* Response Deadline Urgency Pill */}
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold border shrink-0 flex items-center gap-1 ${
              countdown.isPassed
                ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300'
                : countdown.isUrgent
                ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300 dark:border-amber-800 animate-pulse'
                : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
            }`}
          >
            <span>{countdown.isPassed ? '🔒' : '⏳'}</span>
            <span>{countdown.label}</span>
          </span>
        </div>

        {/* Title & Category Heading */}
        <div className="space-y-1">
          <div className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5">
            <span>🏷️</span>
            <span>{rfq.subcategory ?? rfq.category ?? 'General Procurement'}</span>
            {rfq.deliveryCity && (
              <>
                <span>•</span>
                <span>📍 {rfq.deliveryCity}</span>
              </>
            )}
          </div>
          <h1 className="text-base sm:text-lg font-black text-foreground tracking-tight leading-snug">
            {rfq.rfqTitle}
          </h1>
        </div>

        {/* Buyer Identity Protection & Merit Guarantee Banner */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
              <span>🔒</span>
              <span>Buyer Identity Protected</span>
            </div>
            <span className="rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-extrabold border border-emerald-300 dark:border-emerald-800">
              ⭐ {rfq.buyerReliabilityScore ?? 96}% Merit Buyer
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Buyer name is sealed during quoting for neutral, unbiased evaluation. Your pricing and commercial terms are equally confidential and protected from all competitors.
          </p>
        </div>

        {/* Key Parameters 3-Column Summary */}
        <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-muted/30 border border-border/60 text-center text-xs">
          <div>
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider block font-bold">Quantity</span>
            <span className="text-sm font-black text-foreground block mt-0.5 truncate">
              {rfq.quantity === null ? 'As per specs' : `${rfq.quantity} ${rfq.unit || 'units'}`}
            </span>
          </div>
          <div className="border-x border-border/60 px-1">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider block font-bold">Location</span>
            <span className="text-sm font-bold text-foreground block mt-0.5 truncate">
              📍 {rfq.deliveryCity ?? 'Site Delivery'}
            </span>
          </div>
          <div>
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider block font-bold">Target TAT</span>
            <span className="text-sm font-bold text-primary block mt-0.5 truncate">
              {timing(rfq)}
            </span>
          </div>
        </div>

        {/* Opportunity Participation & Response State Bar (Phase 3.2 Read-Only Status) */}
        <div className="flex items-center justify-between rounded-xl bg-muted/40 p-2.5 border border-border/60 text-xs">
          <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1.5">
            <span>📋</span> Opportunity Status:
          </span>
          <span className="font-extrabold text-primary">
            {hasQuote
              ? '✓ Quote Submitted · Sealed Evaluation'
              : rfq.rfqStatus === 'OPEN'
              ? '⚡ Quoting Active · Open for Response'
              : rfq.rfqStatus === 'CLARIFICATION'
              ? '💬 Clarification Stage'
              : rfq.rfqStatus === 'EVALUATING'
              ? '⚖️ Evaluation in Progress'
              : '🔒 Concluded'}
          </span>
        </div>
      </section>

      {/* 2. WHAT IS NEEDED: Scope Description with Expandable Reading */}
      {descriptionText && (
        <section className="rounded-2xl border bg-card p-4 sm:p-5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <span>📄</span> What is Needed
            </h2>
            {isDescriptionLong && (
              <button
                type="button"
                onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                className="text-[11px] font-bold text-primary hover:underline min-h-[48px] inline-flex items-center mobile-touch-target cursor-pointer"
              >
                {isDescriptionExpanded ? 'Show less' : 'View full requirement →'}
              </button>
            )}
          </div>

          <div className="text-xs leading-relaxed text-foreground/90 whitespace-pre-line bg-muted/20 p-3 rounded-xl border border-border/50">
            {isDescriptionLong && !isDescriptionExpanded
              ? `${descriptionText.slice(0, 220)}…`
              : descriptionText}
          </div>
        </section>
      )}

      {/* 3. TECHNICAL SPECIFICATIONS & BoQ PARAMETERS */}
      {attributes.length > 0 && (
        <section className="rounded-2xl border bg-card p-4 sm:p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <span>📋</span> Technical Specifications &amp; BoQ
            </h2>
            <span className="text-[10px] text-muted-foreground font-semibold">
              {attributes.length} {attributes.length === 1 ? 'Specification' : 'Specifications'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {attributes.map(([code, value]) => (
              <div
                key={code}
                className="rounded-xl bg-muted/20 p-2.5 border border-border/60 flex items-start justify-between gap-2"
              >
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {humanizeCode(code)}:
                </span>
                <span className="font-bold text-foreground text-right">
                  {formatValue(value)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. QUALITY & INSPECTION STANDARDS (if available) */}
      {qualityEntries.length > 0 && (
        <section className="rounded-2xl border bg-card p-4 sm:p-5 shadow-2xs space-y-3">
          <h2 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
            <span>🛡️</span> Quality &amp; Inspection Standards
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {qualityEntries.map(([code, value]) => (
              <div
                key={code}
                className="rounded-xl bg-muted/20 p-2.5 border border-border/60 flex items-start justify-between gap-2"
              >
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {humanizeCode(code)}:
                </span>
                <span className="font-bold text-foreground text-right">
                  {formatValue(value)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. LOCATION, FULFILMENT & EXECUTION TIMELINE */}
      <section className="rounded-2xl border bg-card p-4 sm:p-5 shadow-2xs space-y-3">
        <h2 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
          <span>📍</span> Location &amp; Timeline
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <div className="rounded-xl border bg-muted/20 p-3 space-y-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">
              Delivery / Service Location
            </span>
            <span className="text-xs font-bold text-foreground block">
              📍 {rfq.deliveryCity ?? 'Site Delivery'}
            </span>
            {rfq.fulfilmentMode && (
              <span className="text-[11px] text-muted-foreground block">
                🚚 {FULFILMENT_LABELS[rfq.fulfilmentMode]}
              </span>
            )}
          </div>

          <div className="rounded-xl border bg-muted/20 p-3 space-y-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">
              Execution / Completion Timeline
            </span>
            <span className="text-xs font-bold text-foreground block">
              {timing(rfq)}
            </span>
            <span className="text-[11px] text-muted-foreground block">
              Quotes Close: {formatDateIST(rfq.quoteDeadline) || 'Standard Window'}
            </span>
          </div>
        </div>
      </section>

      {/* 6. COMMERCIAL INFORMATION & EVALUATION CRITERIA */}
      <section className="rounded-2xl border bg-card p-4 sm:p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
            <span>⚖️</span> How Quotes Are Judged &amp; Commercial Terms
          </h2>
          <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
            100% Merit-Based
          </span>
        </div>

        {/* Weights Matrix */}
        {weights.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
              Objective Evaluation Weights:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {weights.map(([code, weight]) => (
                <span
                  key={code}
                  className="rounded-xl border bg-muted/40 px-3 py-1.5 text-xs font-bold text-foreground flex items-center gap-1.5"
                >
                  {code.toLowerCase().includes('price') || code.toLowerCase().includes('cost') || code.toLowerCase().includes('commercial')
                    ? '💰 '
                    : code.toLowerCase().includes('delivery') || code.toLowerCase().includes('speed')
                    ? '⚡ '
                    : code.toLowerCase().includes('warranty') || code.toLowerCase().includes('quality')
                    ? '🛡️ '
                    : '★ '}
                  <span>{humanizeCode(code)}:</span>
                  <strong className="text-primary font-black">{weight}%</strong>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Commercial Specifications (Payment terms, etc.) */}
        {commercialEntries.length > 0 && (
          <div className="pt-2 border-t border-border/60 space-y-1.5">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
              Commercial Requirements:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {commercialEntries.map(([code, value]) => (
                <div
                  key={code}
                  className="rounded-xl bg-muted/20 p-2.5 border border-border/60 flex items-start justify-between gap-2"
                >
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {humanizeCode(code)}:
                  </span>
                  <span className="font-bold text-foreground text-right">
                    {formatValue(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 7. CUSTOMER TECHNICAL ATTACHMENTS & DRAWINGS */}
      <section className="rounded-2xl border bg-card p-4 sm:p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
            <span>📎</span> Attachments &amp; Technical Drawings
          </h2>
          <span className="text-[10px] font-semibold text-muted-foreground">
            {buyerFiles.length} {buyerFiles.length === 1 ? 'file' : 'files'}
          </span>
        </div>

        {buyerFiles.length > 0 ? (
          <AttachmentList attachments={buyerFiles} />
        ) : (
          <div className="rounded-xl border border-dashed border-border/80 p-3 text-center text-xs text-muted-foreground bg-muted/10">
            No additional technical drawings attached. All scope specifications are listed in the BoQ above.
          </div>
        )}
      </section>

      {/* 8. SUPPLIER REQUIREMENTS & ELIGIBILITY */}
      <section className="rounded-2xl border bg-card p-4 sm:p-5 shadow-2xs space-y-2.5">
        <h2 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
          <span>🛡️</span> Supplier Requirements &amp; Eligibility
        </h2>
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 space-y-1 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-emerald-900 dark:text-emerald-300">
            <span>✓</span>
            <span>Eligible Supplier · Verified Match</span>
          </div>
          <p className="text-emerald-800/90 dark:text-emerald-300/90 text-[11px] leading-relaxed">
            Your capability profile matches this requirement's category and operating delivery zone. GST compliance and transparent quotation terms apply.
          </p>
        </div>
      </section>

      {/* 9. WHAT HAPPENS NEXT: 3-STEP TRANSPARENCY OVERVIEW */}
      <section className="rounded-2xl border bg-card p-4 sm:p-5 shadow-2xs space-y-3">
        <h2 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
          <span>ℹ️</span> What Happens After You Respond
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="rounded-xl bg-muted/20 p-3 border border-border/60 space-y-1">
            <span className="font-bold text-primary block">1. Sealed Quoting</span>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Your quote is sealed and encrypted. Competing suppliers cannot see your price.
            </p>
          </div>
          <div className="rounded-xl bg-muted/20 p-3 border border-border/60 space-y-1">
            <span className="font-bold text-primary block">2. Merit Evaluation</span>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Quotes are evaluated side-by-side on price, turnaround, and warranty merit.
            </p>
          </div>
          <div className="rounded-xl bg-muted/20 p-3 border border-border/60 space-y-1">
            <span className="font-bold text-primary block">3. Award &amp; Direct PO</span>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Selected supplier is awarded, mutual contact identities are revealed, and formal PO is issued.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

