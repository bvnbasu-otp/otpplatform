import { useState } from 'react';
import { AttachmentScope } from '@otp/domain';
import { AttachmentUploader } from '@/features/attachments';
import type { QuoteSnapshotInput } from '../types/supplier-quote';
import { computeTotalCost } from '../types/supplier-quote';

const DEFAULT_INPUT: QuoteSnapshotInput = {
  basePrice: 8000,
  gstAmount: 1440,
  transportCost: 0,
  deliveryDays: 3,
  warrantyMonths: 12,
  currency: 'INR',
  notes: '',
};

export const GST_SLABS = [
  { rate: 18, label: '18% (Standard Services & Industrial Goods)', short: '18% GST' },
  { rate: 12, label: '12% (Standard Construction & Fabrication)', short: '12% GST' },
  { rate: 5, label: '5% (Essential Goods, Transport & Concessional)', short: '5% GST' },
  { rate: 28, label: '28% (Heavy Machinery & Automotive)', short: '28% GST' },
  { rate: 0, label: '0% (Exempt / Nil / Composite Scheme)', short: '0% (Exempt)' },
] as const;

export function QuoteForm({
  initial,
  submitLabel = 'Submit Sealed Quote',
  onSubmit,
  disabled,
  quoteId,
}: {
  initial?: Partial<QuoteSnapshotInput>;
  submitLabel?: string;
  onSubmit: (input: QuoteSnapshotInput) => Promise<{ error: string | null }>;
  disabled?: boolean;
  /** Absent on the first quote: there is no row to hang a file off yet. */
  quoteId?: string;
}) {
  const [pricingMode, setPricingMode] = useState<'INCLUSIVE' | 'ITEMIZED'>('INCLUSIVE');
  const [gstRate, setGstRate] = useState<number>(() => {
    if (initial?.basePrice && initial?.gstAmount != null && initial.basePrice > 0) {
      const computed = Math.round((initial.gstAmount / initial.basePrice) * 100);
      if ([0, 5, 12, 18, 28].includes(computed)) return computed;
    }
    return 18;
  });

  const [form, setForm] = useState<QuoteSnapshotInput>(() => {
    const merged = { ...DEFAULT_INPUT, ...initial };
    if (initial?.gstAmount == null && merged.basePrice > 0) {
      merged.gstAmount = Math.round(merged.basePrice * (18 / 100));
    }
    return merged;
  });

  const [inclusiveTotal, setInclusiveTotal] = useState<number>(() => {
    const b = initial?.basePrice ?? DEFAULT_INPUT.basePrice;
    const g = initial?.gstAmount ?? Math.round(b * 0.18);
    const t = initial?.transportCost ?? 0;
    return b + g + t;
  });

  // Compliance checkbox
  const [complianceConfirmed, setComplianceConfirmed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const total = computeTotalCost(form);

  const handleBasePriceChange = (rawBase: string) => {
    const num = Number(rawBase);
    const base = Number.isFinite(num) ? Math.max(0, num) : 0;
    const calculatedGst = Math.round(base * (gstRate / 100));

    setForm((f) => {
      const next = { ...f, basePrice: base, gstAmount: calculatedGst };
      setInclusiveTotal(next.basePrice + next.gstAmount + (next.transportCost || 0));
      return next;
    });
  };

  const handleGstRateChange = (rate: number) => {
    setGstRate(rate);
    if (pricingMode === 'INCLUSIVE') {
      const base = Math.round(inclusiveTotal / (1 + rate / 100));
      const gst = inclusiveTotal - base;
      setForm((f) => ({
        ...f,
        basePrice: base,
        gstAmount: gst,
        transportCost: 0,
      }));
    } else {
      const calculatedGst = Math.round(form.basePrice * (rate / 100));
      setForm((f) => {
        const next = { ...f, gstAmount: calculatedGst };
        setInclusiveTotal(next.basePrice + next.gstAmount + (next.transportCost || 0));
        return next;
      });
    }
  };

  const handleInclusiveChange = (rawTotal: string) => {
    const num = Number(rawTotal);
    const validTotal = Number.isFinite(num) ? Math.max(0, num) : 0;
    setInclusiveTotal(validTotal);

    const base = Math.round(validTotal / (1 + gstRate / 100));
    const gst = validTotal - base;

    setForm((f) => ({
      ...f,
      basePrice: base,
      gstAmount: gst,
      transportCost: 0,
    }));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return; // double-submission guard
    if (!complianceConfirmed) {
      setError('Please confirm 100% compliance with the technical BoQ specifications.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    const result = await onSubmit(form);
    setIsSubmitting(false);
    if (result.error) setError(result.error);
  }

  function setNum<K extends keyof QuoteSnapshotInput>(key: K, raw: string) {
    const num = Number(raw);
    setForm((f) => {
      const next = { ...f, [key]: Number.isFinite(num) ? num : 0 };
      setInclusiveTotal(next.basePrice + next.gstAmount + (next.transportCost || 0));
      return next;
    });
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" data-testid="supplier-quote-form">
      {/* 1. Pricing Mode Switcher */}
      <div className="rounded-xl border bg-muted/40 p-1 flex items-center gap-1 text-xs">
        <button
          type="button"
          onClick={() => setPricingMode('INCLUSIVE')}
          className={`flex-1 min-h-[38px] rounded-lg py-1.5 px-3 font-bold transition flex items-center justify-center gap-1.5 ${
            pricingMode === 'INCLUSIVE'
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>⚡ 1-Tap All-Inclusive Price</span>
          <span className="rounded bg-emerald-100 text-emerald-800 text-[10px] px-1 font-bold">Fast</span>
        </button>
        <button
          type="button"
          onClick={() => setPricingMode('ITEMIZED')}
          className={`flex-1 min-h-[38px] rounded-lg py-1.5 px-3 font-bold transition flex items-center justify-center gap-1.5 ${
            pricingMode === 'ITEMIZED'
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>📋 Itemized (Base + GST)</span>
        </button>
      </div>

      {/* FIELD 1: Total Price / Base Price + GST Breakdown */}
      {pricingMode === 'INCLUSIVE' ? (
        <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-3.5 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="inclusive-total-input" className="text-xs font-extrabold uppercase tracking-wider text-primary block">
              💰 Field 1: Total Price (₹ All-inclusive)
            </label>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground font-semibold">Tax:</span>
              <select
                value={gstRate}
                onChange={(e) => handleGstRateChange(Number(e.target.value))}
                className="rounded-lg border bg-background px-2 py-1 text-xs font-bold text-foreground focus:ring-1 focus:ring-primary"
              >
                {GST_SLABS.map((slab) => (
                  <option key={slab.rate} value={slab.rate}>
                    {slab.short}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="relative mt-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-lg font-bold text-muted-foreground">
              ₹
            </span>
            <input
              id="inclusive-total-input"
              type="number"
              min={1}
              value={inclusiveTotal || ''}
              onChange={(e) => handleInclusiveChange(e.target.value)}
              placeholder="e.g. 45000"
              className="w-full min-h-[48px] rounded-xl border-2 border-primary/60 bg-background pl-8 pr-4 py-2.5 text-lg font-black text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary shadow-xs"
              disabled={disabled || isSubmitting}
              required
              autoFocus
            />
          </div>

          {/* Real-time Calculated Tax Split */}
          {inclusiveTotal > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-background/90 p-2.5 rounded-xl border border-primary/20">
              <div className="flex items-center gap-3 font-mono">
                <span className="text-muted-foreground">
                  Base: <strong className="text-foreground">₹{form.basePrice.toLocaleString('en-IN')}</strong>
                </span>
                <span className="text-muted-foreground">
                  + {gstRate}% GST: <strong className="text-emerald-700 dark:text-emerald-400">₹{form.gstAmount.toLocaleString('en-IN')}</strong>
                </span>
              </div>
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold border border-emerald-300 dark:border-emerald-700">
                ✓ Auto-Split
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border bg-card p-3.5 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="block text-xs sm:col-span-1">
              <span className="font-bold text-foreground">Base Price (₹)</span>
              <input
                type="number"
                min={0}
                value={form.basePrice}
                onChange={(e) => handleBasePriceChange(e.target.value)}
                placeholder="e.g. 10000"
                className="mt-1 w-full min-h-[44px] rounded-lg border bg-background px-3 py-2 text-xs font-semibold"
                disabled={disabled || isSubmitting}
                required
              />
            </label>

            <label className="block text-xs sm:col-span-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground">GST Slab</span>
                <span className="text-[10px] text-emerald-600 font-bold">Auto</span>
              </div>
              <select
                value={gstRate}
                onChange={(e) => handleGstRateChange(Number(e.target.value))}
                className="mt-1 w-full min-h-[44px] rounded-lg border bg-background px-2.5 py-2 text-xs font-bold text-foreground"
                disabled={disabled || isSubmitting}
              >
                {GST_SLABS.map((slab) => (
                  <option key={slab.rate} value={slab.rate}>
                    {slab.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs sm:col-span-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground">GST Amount (₹)</span>
                <span className="text-[10px] text-muted-foreground font-mono">{gstRate}%</span>
              </div>
              <input
                type="number"
                min={0}
                value={form.gstAmount}
                onChange={(e) => setNum('gstAmount', e.target.value)}
                className="mt-1 w-full min-h-[44px] rounded-lg border bg-background px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 font-mono"
                disabled={disabled || isSubmitting}
                required
              />
            </label>

            <label className="block text-xs sm:col-span-1">
              <span className="font-bold text-foreground">Freight &amp; Handling (₹)</span>
              <input
                type="number"
                min={0}
                value={form.transportCost}
                onChange={(e) => setNum('transportCost', e.target.value)}
                className="mt-1 w-full min-h-[44px] rounded-lg border bg-background px-3 py-2 text-xs font-semibold"
                disabled={disabled || isSubmitting}
              />
            </label>
          </div>

          <div className="rounded-xl border border-muted bg-muted/20 p-2.5 text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3 text-muted-foreground font-mono">
              <span>Base: ₹{form.basePrice.toLocaleString('en-IN')}</span>
              <span>+ GST: ₹{form.gstAmount.toLocaleString('en-IN')}</span>
              {form.transportCost > 0 && <span>+ Freight: ₹{form.transportCost.toLocaleString('en-IN')}</span>}
            </div>
            <strong className="text-sm font-black text-foreground font-mono">
              Total: ₹{total.toLocaleString('en-IN')}
            </strong>
          </div>
        </div>
      )}

      {/* FIELD 2 & FIELD 3: Delivery Lead Time (Days TAT) + Warranty SLA (Months) */}
      <div className="grid gap-3 sm:grid-cols-2">
        {/* FIELD 2: Delivery Lead Time (Days TAT) */}
        <div className="rounded-xl border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-extrabold uppercase tracking-wider text-foreground">
              ⚡ Field 2: Delivery Lead Time
            </label>
            <span className="font-mono text-xs font-bold text-primary">
              {form.deliveryDays} Days
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1">
            {[
              { days: 1, label: '1 Day' },
              { days: 3, label: '3 Days' },
              { days: 7, label: '7 Days' },
              { days: 15, label: '15 Days' },
            ].map((chip) => (
              <button
                key={chip.days}
                type="button"
                onClick={() => setForm((f) => ({ ...f, deliveryDays: chip.days }))}
                className={`min-h-[40px] rounded-lg text-xs font-bold transition border flex items-center justify-center ${
                  form.deliveryDays === chip.days
                    ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                    : 'border-muted bg-muted/30 text-muted-foreground hover:text-foreground'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] text-muted-foreground">Custom:</span>
            <input
              type="number"
              min={1}
              value={form.deliveryDays}
              onChange={(e) => setNum('deliveryDays', e.target.value)}
              className="w-20 min-h-[38px] rounded-lg border bg-background px-2 py-1 text-xs font-bold text-center"
              disabled={disabled || isSubmitting}
              required
            />
            <span className="text-xs text-muted-foreground">days turnaround</span>
          </div>
        </div>

        {/* FIELD 3: Warranty SLA (Months) */}
        <div className="rounded-xl border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-extrabold uppercase tracking-wider text-foreground">
              🛡️ Field 3: Warranty SLA
            </label>
            <span className="font-mono text-xs font-bold text-primary">
              {form.warrantyMonths === 0 ? 'None' : `${form.warrantyMonths} Mo`}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1">
            {[
              { months: 0, label: 'None' },
              { months: 6, label: '6 Mo' },
              { months: 12, label: '1 Year' },
              { months: 24, label: '2 Years' },
            ].map((chip) => (
              <button
                key={chip.months}
                type="button"
                onClick={() => setForm((f) => ({ ...f, warrantyMonths: chip.months }))}
                className={`min-h-[40px] rounded-lg text-xs font-bold transition border flex items-center justify-center ${
                  form.warrantyMonths === chip.months
                    ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                    : 'border-muted bg-muted/30 text-muted-foreground hover:text-foreground'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] text-muted-foreground">Custom:</span>
            <input
              type="number"
              min={0}
              value={form.warrantyMonths}
              onChange={(e) => setNum('warrantyMonths', e.target.value)}
              className="w-20 min-h-[38px] rounded-lg border bg-background px-2 py-1 text-xs font-bold text-center"
              disabled={disabled || isSubmitting}
              required
            />
            <span className="text-xs text-muted-foreground">months warranty</span>
          </div>
        </div>
      </div>

      {/* Scope Compliance Confirmation Toggle */}
      <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 p-3">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={complianceConfirmed}
            onChange={(e) => setComplianceConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500"
            disabled={disabled || isSubmitting}
          />
          <span className="text-xs font-bold text-emerald-950 dark:text-emerald-200 leading-snug">
            ✓ I confirm 100% compliance with technical BoQ specifications and delivery terms.
          </span>
        </label>
      </div>

      {/* Optional Notes */}
      <label className="block text-xs">
        <span className="font-semibold text-muted-foreground">Commercial Clarifications / Inclusions (Optional)</span>
        <textarea
          value={form.notes ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="e.g. Rate includes loading/unloading. Standard test certificate attached."
          className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          rows={2}
          disabled={disabled || isSubmitting}
        />
      </label>

      {/* Optional Attachments */}
      {quoteId && (
        <section className="rounded-xl border bg-muted/20 p-3 space-y-1.5">
          <h3 className="text-xs font-bold text-foreground">Attach Quotation PDF / Drawing (Optional)</h3>
          <p className="text-[11px] text-muted-foreground">
            The buyer sees this anonymously as &ldquo;Document 1&rdquo; to protect your identity until you are selected.
          </p>
          <AttachmentUploader
            scope={AttachmentScope.QUOTE}
            quoteId={quoteId}
            label="Upload PDF / Image quotation"
            hint="Files are safely stripped of metadata."
            disabled={disabled || isSubmitting}
          />
        </section>
      )}

      {/* Roll-up Summary Card & Sticky Single Primary CTA */}
      <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-3.5 space-y-3 shadow-sm">
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-[11px] text-muted-foreground uppercase font-bold block">
              Final Sealed Quote Amount:
            </span>
            <span className="text-xl font-black text-foreground font-mono">
              ₹{total.toLocaleString('en-IN')}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground text-right">
            ⚡ {form.deliveryDays}d TAT · 🛡️ {form.warrantyMonths}m SLA
          </span>
        </div>

        <button
          type="submit"
          disabled={disabled || isSubmitting || total <= 0 || !complianceConfirmed}
          className="w-full min-h-[48px] rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground shadow-md hover:bg-primary/90 transition disabled:opacity-50 flex items-center justify-center gap-2 active:scale-98"
          data-testid="submit-sealed-quote-btn"
        >
          <span>🚀</span>
          <span>{isSubmitting ? 'Submitting Sealed Quote…' : submitLabel}</span>
        </button>
      </div>

      {error && (
        <p className="text-xs font-bold text-red-600 dark:text-red-300 rounded-xl bg-red-50 dark:bg-red-950/40 p-3 border border-red-200 dark:border-red-900/60" data-testid="quote-form-error">
          ⚠️ {error}
        </p>
      )}
    </form>
  );
}
