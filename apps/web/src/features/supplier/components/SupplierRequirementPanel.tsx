import { formatDateIST, formatDeadlineCountdown } from '@/lib/date-utils';
import {
  REQUIREMENT_MODE_LABELS,
  type FulfilmentMode,
  type RequiredByMode,
} from '@otp/domain';
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
  if (mode === 'IMMEDIATE') return '⚡ As soon as possible (Immediate)';
  if (mode === 'WITHIN_DAYS' && rfq.requiredByDays !== null) {
    return `📅 Within ${rfq.requiredByDays} days`;
  }
  if (mode === 'SPECIFIC_DATE' && rfq.requiredByDate) {
    return `📅 By ${formatDateIST(rfq.requiredByDate)}`;
  }
  if (mode === 'FLEXIBLE') return 'Flexible timing';
  return 'Standard turnaround';
}

function humanizeCode(code: string): string {
  return code.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/**
 * Screen 6: Supplier RFQ Opportunity Review Card
 * Core Job: "Should I respond to this RFQ?"
 * Clean summary card with buyer overview, BoQ specifications, delivery location,
 * countdown, and verified reliability.
 */
export function SupplierRequirementPanel({ rfq }: { rfq: SupplierRfqDetail }) {
  const attributes = Object.entries(rfq.attributes);
  const weights = Object.entries(rfq.evaluationWeights).sort((a, b) => b[1] - a[1]);
  const countdown = formatDeadlineCountdown(rfq.quoteDeadline);

  return (
    <section
      className="rounded-2xl border bg-card p-4 sm:p-5 shadow-xs space-y-4 text-left"
      data-testid="supplier-requirement-panel"
    >
      {/* 1. Header: Public Ref & Anonymous Alias Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            Procurement Requirement
          </span>
          <h2 className="text-base sm:text-lg font-black text-foreground mt-0.5">
            {rfq.rfqTitle}
          </h2>
        </div>
        {rfq.publicRef && (
          <span className="rounded-xl border bg-muted/50 px-2.5 py-1 text-xs font-mono font-bold text-foreground">
            {rfq.publicRef}
          </span>
        )}
      </div>

      {/* 2. Buyer Identity Protection & Reliability Banner */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
            <span>🔒</span>
            <span>Buyer Identity Protected Until Award</span>
          </div>
          <span className="rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-extrabold border border-emerald-300">
            ⭐ {rfq.buyerReliabilityScore ?? 96}% Reliable Buyer
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          The customer name is shielded to ensure neutral evaluation on price, TAT, and warranty. Your business identity is equally protected from competitors.
        </p>
      </div>

      {/* 3. Requirement Scope Overview */}
      {rfq.description && (
        <div className="rounded-xl bg-muted/30 p-3 text-xs leading-relaxed text-foreground/90">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
            Requirement Scope Overview:
          </span>
          <p>{rfq.description}</p>
        </div>
      )}

      {/* 4. 4-Pillar Overview Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <div className="rounded-xl border bg-card p-2.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            Category &amp; Mode:
          </span>
          <span className="text-xs font-bold text-foreground block mt-0.5">
            {rfq.subcategory ?? rfq.category ?? 'General Procurement'}
          </span>
          {rfq.requirementMode && (
            <span className="text-[10px] text-primary font-semibold block mt-0.5">
              {REQUIREMENT_MODE_LABELS[rfq.requirementMode]}
            </span>
          )}
        </div>

        <div className="rounded-xl border bg-card p-2.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            Quantity / Scope:
          </span>
          <span className="text-xs font-bold text-foreground block mt-0.5">
            {rfq.quantity === null ? 'As per specifications' : `${rfq.quantity} ${rfq.unit || 'units'}`}
          </span>
        </div>

        <div className="rounded-xl border bg-card p-2.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            Required Timeline:
          </span>
          <span className="text-xs font-bold text-foreground block mt-0.5">
            {timing(rfq)}
          </span>
        </div>

        <div className="rounded-xl border bg-card p-2.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            Delivery Location:
          </span>
          <span className="text-xs font-bold text-foreground block mt-0.5 truncate">
            📍 {rfq.deliveryCity ?? 'Local Delivery Site'}
          </span>
          {rfq.fulfilmentMode && (
            <span className="text-[10px] text-muted-foreground block mt-0.5 truncate">
              {FULFILMENT_LABELS[rfq.fulfilmentMode]}
            </span>
          )}
        </div>

        <div className="rounded-xl border bg-card p-2.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            Quoting Deadline:
          </span>
          <span className="text-xs font-bold text-foreground block mt-0.5">
            {formatDateIST(rfq.quoteDeadline) || 'Standard Window'}
          </span>
          <span
            className={`text-[10px] font-bold block mt-0.5 ${
              countdown.isPassed
                ? 'text-muted-foreground'
                : countdown.isUrgent
                ? 'text-amber-700 dark:text-amber-400 font-extrabold animate-pulse'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            ⏱️ {countdown.label}
          </span>
        </div>

        <div className="rounded-xl border bg-card p-2.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            Quotes Target:
          </span>
          <span className="text-xs font-bold text-foreground block mt-0.5">
            Min {rfq.minQuotesRequired ?? 3} Sealed Quotes
          </span>
        </div>
      </div>

      {/* 5. Technical BoQ Specifications */}
      {attributes.length > 0 && (
        <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
            📋 Technical Scope &amp; BoQ Specifications:
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {attributes.map(([code, value]) => (
              <div key={code} className="rounded-lg bg-card p-2 border border-border/60">
                <span className="text-[10px] font-semibold text-muted-foreground block">
                  {humanizeCode(code)}
                </span>
                <span className="font-bold text-foreground block mt-0.5">
                  {formatValue(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Evaluation Criteria Weights */}
      {weights.length > 0 && (
        <div className="rounded-xl border border-border/80 bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              ⚖️ How Your Quote Will Be Judged:
            </h3>
            <span className="text-[10px] text-primary font-bold">100% Merit-Based</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {weights.map(([code, weight]) => (
              <span
                key={code}
                className="rounded-lg border bg-muted/40 px-2.5 py-1 text-xs font-bold text-foreground"
              >
                {code.toLowerCase().includes('price') || code.toLowerCase().includes('cost') || code.toLowerCase().includes('commercial')
                  ? '💰 '
                  : code.toLowerCase().includes('delivery') || code.toLowerCase().includes('speed')
                  ? '⚡ '
                  : code.toLowerCase().includes('warranty') || code.toLowerCase().includes('quality')
                  ? '🛡️ '
                  : '★ '}
                {humanizeCode(code)}: <strong className="text-primary">{weight}%</strong>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
