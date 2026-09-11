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
  submitLabel,
  onSubmit,
  disabled,
  quoteId,
}: {
  initial?: Partial<QuoteSnapshotInput>;
  submitLabel: string;
  onSubmit: (input: QuoteSnapshotInput) => Promise<{ error: string | null }>;
  disabled?: boolean;
  /** Absent on the first quote: there is no row to hang a file off yet. */
  quoteId?: string;
}) {
  const [pricingMode, setPricingMode] = useState<'INCLUSIVE' | 'ITEMIZED'>('ITEMIZED');
  const [gstRate, setGstRate] = useState<number>(() => {
    if (initial?.basePrice && initial?.gstAmount != null && initial.basePrice > 0) {
      const computed = Math.round((initial.gstAmount / initial.basePrice) * 100);
      if ([0, 5, 12, 18, 28].includes(computed)) return computed;
    }
    return 18;
  });

  const [form, setForm] = useState<QuoteSnapshotInput>(() => {
    const merged = { ...DEFAULT_INPUT, ...initial };
    // Ensure standard 18% GST if not provided
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
      // Re-split inclusive total using new rate
      const base = Math.round(inclusiveTotal / (1 + rate / 100));
      const gst = inclusiveTotal - base;
      setForm((f) => ({
        ...f,
        basePrice: base,
        gstAmount: gst,
        transportCost: 0,
      }));
    } else {
      // Re-calculate GST from existing base price
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

    // Auto-calculate Base Price & GST based on selected slab
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
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5" data-testid="supplier-quote-form">
      {/* Fast Mode / Itemized Mode Switcher */}
      <div className="rounded-xl border bg-muted/30 p-1 flex items-center gap-1 text-xs">
        <button
          type="button"
          onClick={() => setPricingMode('INCLUSIVE')}
          className={`flex-1 rounded-lg py-1.5 px-3 font-bold transition flex items-center justify-center gap-1.5 ${
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
          className={`flex-1 rounded-lg py-1.5 px-3 font-bold transition flex items-center justify-center gap-1.5 ${
            pricingMode === 'ITEMIZED'
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>📋 Itemized Breakdown (Base + GST)</span>
        </button>
      </div>

      {/* Mode 1: Fast Inclusive Pricing Input */}
      {pricingMode === 'INCLUSIVE' && (
        <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-primary block">
              Total Deal Amount (₹ All-inclusive of GST &amp; Transport)
            </span>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground font-semibold">Tax Slab:</span>
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
              type="number"
              min={1}
              value={inclusiveTotal || ''}
              onChange={(e) => handleInclusiveChange(e.target.value)}
              placeholder="e.g. 45000"
              className="w-full rounded-xl border-2 border-primary/60 bg-background pl-8 pr-4 py-2.5 text-lg font-black text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary shadow-xs"
              disabled={disabled || isSubmitting}
              required
              autoFocus
            />
          </div>

          {/* Real-time Calculated Tax Split Indicator */}
          {inclusiveTotal > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-background/80 p-2.5 rounded-xl border border-primary/20">
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">
                  Base: <strong className="text-foreground">₹{form.basePrice.toLocaleString('en-IN')}</strong>
                </span>
                <span className="text-muted-foreground">
                  + {gstRate}% GST: <strong className="text-emerald-700 dark:text-emerald-400">₹{form.gstAmount.toLocaleString('en-IN')}</strong>
                </span>
              </div>
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold border border-emerald-300 dark:border-emerald-700">
                ✓ Auto-Calculated ({gstRate}%)
              </span>
            </div>
          )}
        </div>
      )}

      {/* Mode 2: Detailed Itemized Inputs with Auto-Tax Calculation */}
      {pricingMode === 'ITEMIZED' && (
        <div className="space-y-3 rounded-2xl border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="block text-xs sm:col-span-1">
              <span className="font-bold text-foreground">Base Unit Price (₹)</span>
              <input
                type="number"
                min={0}
                value={form.basePrice}
                onChange={(e) => handleBasePriceChange(e.target.value)}
                placeholder="e.g. 10000"
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-xs font-semibold"
                disabled={disabled || isSubmitting}
                required
              />
            </label>

            <label className="block text-xs sm:col-span-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground">GST % Slab</span>
                <span className="text-[10px] text-emerald-600 font-bold">Auto</span>
              </div>
              <select
                value={gstRate}
                onChange={(e) => handleGstRateChange(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border bg-background px-2.5 py-2 text-xs font-bold text-foreground focus:ring-1 focus:ring-primary"
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
                <span className="text-[10px] text-muted-foreground">{gstRate}%</span>
              </div>
              <input
                type="number"
                min={0}
                value={form.gstAmount}
                onChange={(e) => setNum('gstAmount', e.target.value)}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 font-mono"
                disabled={disabled || isSubmitting}
                required
              />
            </label>

            <label className="block text-xs sm:col-span-1">
              <span className="font-bold text-foreground">Transport &amp; Handling (₹)</span>
              <input
                type="number"
                min={0}
                value={form.transportCost}
                onChange={(e) => setNum('transportCost', e.target.value)}
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-xs font-semibold"
                disabled={disabled || isSubmitting}
              />
            </label>
          </div>

          {/* Line-Item Roll-up Summary */}
          <div className="rounded-xl border border-muted bg-muted/20 p-3 text-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
              <span>
                Base: <strong className="text-foreground">₹{form.basePrice.toLocaleString('en-IN')}</strong>
              </span>
              <span>
                + GST ({gstRate}%): <strong className="text-emerald-700 dark:text-emerald-400">₹{form.gstAmount.toLocaleString('en-IN')}</strong>
              </span>
              {form.transportCost > 0 && (
                <span>
                  + Transport: <strong className="text-foreground">₹{form.transportCost.toLocaleString('en-IN')}</strong>
                </span>
              )}
            </div>
            <div className="text-right">
              <span className="text-[11px] text-muted-foreground block">Final Billable Amount:</span>
              <strong className="text-sm font-black text-foreground">
                ₹{total.toLocaleString('en-IN')}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* Turnaround & Warranty Presets */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Delivery Days with 1-Tap Chips */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-foreground">
            Delivery / Readiness Time:
          </label>
          <div className="flex flex-wrap gap-1.5">
            {[
              { days: 1, label: '⚡ Tomorrow (1d)' },
              { days: 3, label: '📅 3 Days' },
              { days: 7, label: '📅 1 Week' },
              { days: 15, label: '📅 15 Days' },
            ].map((chip) => (
              <button
                key={chip.days}
                type="button"
                onClick={() => setForm((f) => ({ ...f, deliveryDays: chip.days }))}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition border ${
                  form.deliveryDays === chip.days
                    ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                    : 'border-muted bg-card text-muted-foreground hover:text-foreground'
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
              className="w-20 rounded-md border bg-background px-2 py-1 text-xs font-semibold text-center"
              disabled={disabled || isSubmitting}
              required
            />
            <span className="text-xs text-muted-foreground">days</span>
          </div>
        </div>

        {/* Warranty with 1-Tap Chips */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-foreground">
            Warranty Period:
          </label>
          <div className="flex flex-wrap gap-1.5">
            {[
              { months: 0, label: 'None' },
              { months: 6, label: '6 Months' },
              { months: 12, label: '⭐ 1 Year' },
              { months: 24, label: '2 Years' },
            ].map((chip) => (
              <button
                key={chip.months}
                type="button"
                onClick={() => setForm((f) => ({ ...f, warrantyMonths: chip.months }))}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition border ${
                  form.warrantyMonths === chip.months
                    ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                    : 'border-muted bg-card text-muted-foreground hover:text-foreground'
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
              className="w-20 rounded-md border bg-background px-2 py-1 text-xs font-semibold text-center"
              disabled={disabled || isSubmitting}
              required
            />
            <span className="text-xs text-muted-foreground">months</span>
          </div>
        </div>
      </div>

      {/* Notes / Special Inclusions */}
      <label className="block text-xs">
        <span className="font-bold text-foreground">Clarifications / Commercial Terms (Optional)</span>
        <textarea
          value={form.notes ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="e.g. Price includes loading/unloading. Standard testing certificate provided."
          className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          rows={2}
          disabled={disabled || isSubmitting}
        />
      </label>

      {/* Attachments Section */}
      <section className="rounded-xl border bg-muted/20 p-4 space-y-2">
        <h3 className="text-xs font-bold text-foreground">Attach Formal Quotation PDF / Drawing (Optional)</h3>
        {quoteId ? (
          <>
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
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground italic">
            You can attach your formal PDF quotation immediately after submitting this price.
          </p>
        )}
      </section>

      {/* Total Confirmation Card & Submit Button */}
      <div className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div>
          <span className="text-xs text-muted-foreground font-semibold block">Final Quote to Buyer:</span>
          <span className="text-xl font-black text-emerald-800 dark:text-emerald-300">
            {new Intl.NumberFormat('en-IN', {
              style: 'currency',
              currency: 'INR',
              maximumFractionDigits: 0,
            }).format(total)}
          </span>
          <span className="text-[11px] text-muted-foreground block">
            Includes delivery in {form.deliveryDays} day{form.deliveryDays === 1 ? '' : 's'} · {form.warrantyMonths}m warranty
          </span>
        </div>

        <button
          type="submit"
          disabled={disabled || isSubmitting || total <= 0}
          className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-extrabold text-white shadow-md hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-2"
        >
          <span>🚀</span> {isSubmitting ? 'Submitting Quote…' : submitLabel || 'Submit Quote Now'}
        </button>
      </div>

      {error && (
        <p className="text-xs font-bold text-red-600 rounded-lg bg-red-50 p-3 border border-red-200" data-testid="quote-form-error">
          ⚠️ {error}
        </p>
      )}
    </form>
  );
}
