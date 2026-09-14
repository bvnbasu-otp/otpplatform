import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PLATFORM_DISCLAIMER, PRODUCT_NAME } from '@/lib/brand';
import {
  describeQuickQuoteFailure,
  fetchQuickQuoteContext,
  redeemQuickQuoteLink,
  submitQuickQuote,
  type QuickQuoteContext,
  type QuickQuoteFailure,
} from '../api/quick-quote';

/**
 * Finishing a quote that started as a WhatsApp / SMS message.
 *
 * Designed specifically for ultra-compact mobile viewports (sub-360px) and busy,
 * hands-on technicians on job sites. Includes large tap targets (44px+), one-tap
 * numeric presets for GST, delivery, and warranty, and an automatic billable calculator.
 */
export function QuickQuotePage() {
  const { token } = useParams<{ token: string }>();

  const [session, setSession] = useState<string | null>(null);
  const [context, setContext] = useState<QuickQuoteContext | null>(null);
  const [failure, setFailure] = useState<QuickQuoteFailure | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [submitted, setSubmitted] = useState<{ reference: string | null } | null>(null);

  useEffect(() => {
    if (!token) {
      setFailure('INVALID');
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      const redeemed = await redeemQuickQuoteLink(token);

      if (cancelled) return;

      if (!redeemed.ok) {
        setFailure(redeemed.reason);
        setIsLoading(false);
        return;
      }

      const loaded = await fetchQuickQuoteContext(redeemed.value.sessionToken);

      if (cancelled) return;

      if (!loaded.ok) {
        setFailure(loaded.reason);
      } else {
        setSession(redeemed.value.sessionToken);
        setContext(loaded.value);
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (isLoading) {
    return (
      <QuickQuoteShell>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Opening your WhatsApp Enquiry…
          </p>
        </div>
      </QuickQuoteShell>
    );
  }

  if (failure || !context || !session) {
    const described = describeQuickQuoteFailure(failure ?? 'UNAVAILABLE');
    return (
      <QuickQuoteShell>
        <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 dark:border-red-900/60 dark:bg-red-950/30">
          <h1 className="text-base font-bold text-red-900 dark:text-red-200">{described.title}</h1>
          <p className="mt-1.5 text-xs leading-relaxed text-red-800 dark:text-red-300">{described.detail}</p>
          <Link
            to="/signup?side=supplier"
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90"
          >
            Create Supplier Account Instead
          </Link>
        </div>
      </QuickQuoteShell>
    );
  }

  if (submitted) {
    return (
      <QuickQuoteShell>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-center dark:border-emerald-900/60 dark:bg-emerald-950/30">
          <span className="text-3xl">✅</span>
          <h1 className="mt-2 text-lg font-black text-emerald-900 dark:text-emerald-200">Quote Submitted!</h1>
          <p className="mt-1.5 text-xs leading-relaxed text-emerald-800 dark:text-emerald-300">
            {submitted.reference
              ? `Your quote (${submitted.reference}) has been securely recorded.`
              : 'Your quote has been securely recorded.'}{' '}
            The buyer and committee will compare it anonymously on merit.
          </p>
          <div className="mt-3 rounded-lg border border-emerald-200 bg-card p-2.5 text-left text-xs text-muted-foreground">
            💡 <strong>Need to update your quote?</strong> Just tap the WhatsApp link again or reply with a new price before the deadline.
          </div>
          <Link
            to="/signup?side=supplier"
            className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90"
          >
            Create Free Account to Track Future Enquiries
          </Link>
        </div>
      </QuickQuoteShell>
    );
  }

  return (
    <QuickQuoteShell>
      <QuickQuoteForm
        context={context}
        sessionToken={session}
        onSubmitted={(reference) => setSubmitted({ reference })}
        onFailure={setFailure}
      />
    </QuickQuoteShell>
  );
}

function QuickQuoteForm({
  context,
  sessionToken,
  onSubmitted,
  onFailure,
}: {
  context: QuickQuoteContext;
  sessionToken: string;
  onSubmitted: (reference: string | null) => void;
  onFailure: (reason: QuickQuoteFailure) => void;
}) {
  const { rfq, quote } = context;
  const prefilled = quote?.snapshot ?? {};

  const [gstRate, setGstRate] = useState<number>(() => {
    if (prefilled.basePrice && prefilled.gstAmount != null && prefilled.basePrice > 0) {
      const computed = Math.round((prefilled.gstAmount / prefilled.basePrice) * 100);
      if ([0, 5, 12, 18, 28].includes(computed)) return computed;
    }
    return 18;
  });

  const [basePrice, setBasePrice] = useState(String(prefilled.basePrice ?? ''));
  const [gstAmount, setGstAmount] = useState(() => {
    if (prefilled.gstAmount != null) return String(prefilled.gstAmount);
    if (prefilled.basePrice) return String(Math.round(prefilled.basePrice * 0.18));
    return '0';
  });
  const [transportCost, setTransportCost] = useState(String(prefilled.transportCost ?? 0));
  const [deliveryDays, setDeliveryDays] = useState(String(prefilled.deliveryDays ?? '3'));
  const [warrantyMonths, setWarrantyMonths] = useState(String(prefilled.warrantyMonths ?? '0'));
  const [notes, setNotes] = useState('');
  const [complianceConfirmed, setComplianceConfirmed] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBasePriceChange = (val: string) => {
    setBasePrice(val);
    const b = num(val);
    if (b > 0) {
      setGstAmount(String(Math.round(b * (gstRate / 100))));
    } else {
      setGstAmount('0');
    }
  };

  const handleGstRateSelect = (rate: number) => {
    setGstRate(rate);
    const b = num(basePrice);
    if (b > 0) {
      setGstAmount(String(Math.round(b * (rate / 100))));
    }
  };

  const total = useMemo(
    () => num(basePrice) + num(gstAmount) + num(transportCost),
    [basePrice, gstAmount, transportCost],
  );

  const canSubmit = num(basePrice) > 0 && num(deliveryDays) > 0 && complianceConfirmed && !isSubmitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!complianceConfirmed) {
      setError('Please confirm 100% compliance with technical BoQ specifications.');
      return;
    }
    setIsSubmitting(true);
    setError(null);

    const result = await submitQuickQuote(sessionToken, {
      basePrice: num(basePrice),
      gstAmount: num(gstAmount),
      transportCost: num(transportCost),
      deliveryDays: num(deliveryDays),
      warrantyMonths: num(warrantyMonths),
      notes: notes.trim() || undefined,
    });

    setIsSubmitting(false);

    if (result.ok) {
      onSubmitted(result.value.reference);
      return;
    }

    if (result.reason === 'INVALID_AMOUNT') {
      setError(describeQuickQuoteFailure(result.reason).detail);
    } else {
      onFailure(result.reason);
    }
  }

  const GST_SLABS = [
    { label: '18% Std', rate: 18 },
    { label: '12% Fab', rate: 12 },
    { label: '5% Basic', rate: 5 },
    { label: '0% Nil', rate: 0 },
    { label: '28% Hvy', rate: 28 },
  ];

  const DELIVERY_PRESETS = ['1', '2', '3', '5', '7', '14'];
  const WARRANTY_PRESETS = [
    { label: 'None', months: '0' },
    { label: '3 Mo', months: '3' },
    { label: '6 Mo', months: '6' },
    { label: '1 Yr', months: '12' },
  ];

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
      {/* 1. Job Summary Card - High Contrast & Compact */}
      <header className="rounded-xl border bg-card p-3 shadow-2xs">
        <div className="flex items-center justify-between gap-1.5 border-b pb-2">
          <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
            Ref: {rfq.publicRef}
          </span>
          <span className="rounded-full bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800 dark:text-emerald-300 border border-emerald-300">
            🛡️ {rfq.alias || 'Anonymous Supplier'}
          </span>
        </div>

        <h1 className="mt-2 text-sm font-extrabold text-foreground leading-snug">
          {rfq.title ?? rfq.subcategory ?? rfq.category ?? 'Procurement Enquiry'}
        </h1>

        <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-lg bg-muted/40 p-2 text-[11px]">
          <div>
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Quantity:</span>
            <span className="font-bold text-foreground">{quantityLabel(rfq.quantity, rfq.unit) || 'As specified'}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Location:</span>
            <span className="font-bold text-foreground truncate block">{rfq.location || 'Local cluster'}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Needed By:</span>
            <span className="font-bold text-foreground">{neededBy(rfq) || 'Immediate'}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Buyer:</span>
            <span className="font-bold text-foreground truncate block">{rfq.buyerDisplay || 'Verified Buyer'}</span>
          </div>
        </div>
      </header>

      {/* 2. Base Price Input - Big & Finger Friendly */}
      <div className="rounded-xl border bg-card p-3 shadow-2xs space-y-2">
        <label className="block">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground uppercase tracking-wider">
              1. Your Base Quote Amount (₹) <span className="text-red-500">*</span>
            </span>
            <span className="text-[10px] text-muted-foreground">Excl. GST</span>
          </div>
          <div className="relative mt-1.5">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-base font-bold text-muted-foreground">
              ₹
            </span>
            <input
              type="number"
              min={1}
              step="any"
              inputMode="decimal"
              placeholder="e.g. 15000"
              value={basePrice}
              onChange={(e) => handleBasePriceChange(e.target.value)}
              className="w-full rounded-xl border-2 border-primary/40 bg-background py-3 pl-8 pr-3 text-lg font-black text-foreground shadow-2xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[48px]"
              required
              autoFocus
            />
          </div>
        </label>

        {/* GST Slab Selector Chips (44px min tap targets) */}
        <div>
          <span className="text-[11px] font-semibold text-muted-foreground block mb-1">
            GST % Slab (Auto-Calculates):
          </span>
          <div className="grid grid-cols-5 gap-1">
            {GST_SLABS.map((slab) => {
              const active = gstRate === slab.rate;
              return (
                <button
                  key={slab.rate}
                  type="button"
                  onClick={() => handleGstRateSelect(slab.rate)}
                  className={`min-h-[40px] rounded-lg text-center text-xs font-bold transition flex items-center justify-center border ${
                    active
                      ? 'bg-primary text-primary-foreground border-primary shadow-2xs'
                      : 'bg-muted/50 text-foreground border-border hover:bg-muted'
                  }`}
                >
                  {slab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Delivery & Warranty One-Tap Presets */}
      <div className="rounded-xl border bg-card p-3 shadow-2xs space-y-3">
        {/* Delivery Days */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-foreground uppercase tracking-wider">
              2. Delivery Turnaround <span className="text-red-500">*</span>
            </span>
            <span className="text-xs font-bold text-primary">{deliveryDays ? `${deliveryDays} Days` : '—'}</span>
          </div>
          <div className="grid grid-cols-6 gap-1">
            {DELIVERY_PRESETS.map((days) => {
              const active = deliveryDays === days;
              return (
                <button
                  key={days}
                  type="button"
                  onClick={() => setDeliveryDays(days)}
                  className={`min-h-[40px] rounded-lg text-xs font-bold transition flex items-center justify-center border ${
                    active
                      ? 'bg-primary text-primary-foreground border-primary shadow-2xs'
                      : 'bg-muted/50 text-foreground border-border hover:bg-muted'
                  }`}
                >
                  {days}d
                </button>
              );
            })}
          </div>
        </div>

        {/* Warranty Presets */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-foreground uppercase tracking-wider">
              3. Warranty SLA
            </span>
            <span className="text-xs font-bold text-primary">{warrantyMonths === '0' ? 'None' : `${warrantyMonths} Months`}</span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {WARRANTY_PRESETS.map((w) => {
              const active = warrantyMonths === w.months;
              return (
                <button
                  key={w.months}
                  type="button"
                  onClick={() => setWarrantyMonths(w.months)}
                  className={`min-h-[40px] rounded-lg text-xs font-bold transition flex items-center justify-center border ${
                    active
                      ? 'bg-primary text-primary-foreground border-primary shadow-2xs'
                      : 'bg-muted/50 text-foreground border-border hover:bg-muted'
                  }`}
                >
                  {w.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional Transport & Notes Accordion / Inputs */}
        <div className="pt-2 border-t space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground block">
                Transport / Freight (₹):
              </label>
              <input
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={transportCost}
                onChange={(e) => setTransportCost(e.target.value)}
                className="mt-1 w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs font-bold text-foreground min-h-[40px]"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground block">
                Notes / Inclusions (Optional):
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs text-foreground min-h-[40px]"
                placeholder="e.g. includes fitting"
              />
            </div>
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
            disabled={isSubmitting}
          />
          <span className="text-xs font-bold text-emerald-950 dark:text-emerald-200 leading-snug">
            ✓ I confirm 100% compliance with technical BoQ specifications and delivery terms.
          </span>
        </label>
      </div>

      {/* 4. Live Billable Roll-Up Summary Card */}
      <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3 shadow-xs">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-extrabold uppercase tracking-wide text-foreground">
            Total Final Quoted:
          </span>
          <span className="text-xl font-black text-primary tabular-nums">
            ₹{total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between text-[11px] text-muted-foreground border-t border-primary/20 pt-1.5">
          <span>Base: ₹{num(basePrice).toLocaleString('en-IN')}</span>
          <span>+ GST ({gstRate}%): ₹{num(gstAmount).toLocaleString('en-IN')}</span>
          {num(transportCost) > 0 && <span>+ Trnsp: ₹{num(transportCost).toLocaleString('en-IN')}</span>}
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/50 p-2.5 text-xs font-bold text-red-700 dark:text-red-300">
          ⚠️ {error}
        </p>
      )}

      {/* 5. Big Submit CTA Button (Min-height 48px for thumb tap) */}
      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full min-h-[50px] rounded-xl bg-primary px-4 py-3 text-base font-extrabold text-primary-foreground shadow-md hover:bg-primary/90 disabled:opacity-50 transition active:scale-[0.98] flex items-center justify-center gap-2"
        data-testid="submit-quick-quote-btn"
      >
        <span>⚡</span>
        <span>{isSubmitting ? 'Sending Sealed Quote…' : 'Submit Sealed Quote to Buyer'}</span>
      </button>

      <p className="text-[10px] text-center text-muted-foreground leading-tight px-1">
        🔒 Identity protected. Your quote is compared strictly on price, timeline, and SLA without revealing your business name to competitors.
      </p>
    </form>
  );
}

function QuickQuoteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background flex flex-col justify-between">
      <header className="border-b bg-card/90 px-3 py-2.5 sticky top-0 z-10 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <Link to="/" className="text-sm font-black tracking-tight text-primary flex items-center gap-1">
            <span>⚡</span>
            <span>{PRODUCT_NAME} WhatsApp Direct</span>
          </Link>
          <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            Sealed Quote
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-2.5 py-4 sm:px-4 sm:py-6">{children}</main>

      <footer className="border-t bg-muted/30 px-3 py-3">
        <p className="mx-auto max-w-lg text-[10px] leading-relaxed text-muted-foreground text-center">
          {PLATFORM_DISCLAIMER}
        </p>
      </footer>
    </div>
  );
}

function quantityLabel(quantity?: number, unit?: string): string | null {
  if (quantity == null) return null;
  return unit ? `${quantity} ${unit}` : String(quantity);
}

function neededBy(rfq: QuickQuoteContext['rfq']): string | null {
  if (rfq.requiredByDate) return formatDate(rfq.requiredByDate);
  if (rfq.requiredByDays != null) return `${rfq.requiredByDays} days`;
  return null;
}

function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function num(raw: string): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}
