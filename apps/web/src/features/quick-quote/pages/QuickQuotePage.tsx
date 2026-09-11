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
 * Finishing a quote that started as a text message.
 *
 * The person on this page is a contractor who replied to an SMS on a phone, has
 * no account, and may never have used OTP before. So it is one screen, no
 * navigation, no sign-in, and the price they already sent is filled in — they
 * should never have to type a number twice.
 *
 * It shows them exactly what the enquiry is and nothing about who is asking,
 * because that is the same protection that keeps their own quote private.
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
    // Redemption is single-use, so this must run exactly once per token.
  }, [token]);

  if (isLoading) {
    return (
      <QuickQuoteShell>
        <p className="text-sm text-slate">Opening Your Enquiry…</p>
      </QuickQuoteShell>
    );
  }

  if (failure || !context || !session) {
    const described = describeQuickQuoteFailure(failure ?? 'UNAVAILABLE');
    return (
      <QuickQuoteShell>
        <h1 className="text-lg font-semibold text-navy">{described.title}</h1>
        <p className="mt-2 text-sm text-slate">{described.detail}</p>
        <Link
          to="/signup?side=supplier"
          className="mt-6 inline-block text-sm font-medium text-action underline"
        >
          Create a supplier account instead
        </Link>
      </QuickQuoteShell>
    );
  }

  if (submitted) {
    return (
      <QuickQuoteShell>
        <h1 className="text-lg font-semibold text-navy">Your quote is in</h1>
        <p className="mt-2 text-sm text-slate">
          {submitted.reference
            ? `Quote submitted for ${submitted.reference}.`
            : 'Quote submitted.'}{' '}
          The buying committee will compare it against the other quotes without
          seeing your name.
        </p>
        <p className="mt-4 text-sm text-slate">
          To change your price before the deadline, just reply to our message with
          the new figure.
        </p>
        <Link
          to="/signup?side=supplier"
          className="mt-6 inline-block text-sm font-medium text-action underline"
        >
          Create an account to track this and future enquiries
        </Link>
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
  const [deliveryDays, setDeliveryDays] = useState(String(prefilled.deliveryDays ?? ''));
  const [warrantyMonths, setWarrantyMonths] = useState(String(prefilled.warrantyMonths ?? ''));
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBasePriceChange = (val: string) => {
    setBasePrice(val);
    const b = num(val);
    if (b > 0) {
      setGstAmount(String(Math.round(b * (gstRate / 100))));
    }
  };

  const handleGstRateChange = (rate: number) => {
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

  const canSubmit = num(basePrice) > 0 && num(deliveryDays) > 0 && !isSubmitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
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

    // A closed enquiry or a dead session replaces the form; a bad number is
    // fixable in place, so it stays inline.
    if (result.reason === 'INVALID_AMOUNT') {
      setError(describeQuickQuoteFailure(result.reason).detail);
    } else {
      onFailure(result.reason);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-6">
      <header>
        {rfq.isDemo && (
          <span className="mb-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
            Demo enquiry
          </span>
        )}
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Enquiry {rfq.publicRef}
        </p>
        <h1 className="mt-1 text-xl font-semibold text-navy">
          {rfq.title ?? rfq.subcategory ?? rfq.category ?? 'Enquiry'}
        </h1>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <Fact label="Quantity" value={quantityLabel(rfq.quantity, rfq.unit)} />
          <Fact label="Location" value={rfq.location} />
          <Fact label="Needed by" value={neededBy(rfq)} />
          <Fact label="Quotes close" value={formatDate(rfq.quoteDeadline)} />
          {/* Named only if the buyer chose to be. */}
          <Fact label="Buyer" value={rfq.buyerDisplay} />
          <Fact label="You are quoting as" value={rfq.alias} />
        </dl>
      </header>

      {quote?.snapshot.basePrice != null && !quote.submitted && (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate">
          We filled in the ₹{Number(quote.snapshot.basePrice).toLocaleString('en-IN')} you
          sent us. Change it here if it needs changing — nothing is submitted until you
          press the button below.
        </p>
      )}

      {quote?.submitted && (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate">
          You have already submitted a quote for this enquiry. Sending this form again
          replaces it with a new version, and the buyer sees only the latest.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Money
          label="Your Base Price (₹)"
          value={basePrice}
          onChange={handleBasePriceChange}
          required
          autoFocus
        />

        <div>
          <label className="block text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-navy">GST % Slab</span>
              <span className="text-xs text-emerald-600 font-semibold">Auto-calculate</span>
            </div>
            <select
              value={gstRate}
              onChange={(e) => handleGstRateChange(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-navy"
            >
              <option value={18}>18% GST (Standard)</option>
              <option value={12}>12% GST (Construction / Fabrication)</option>
              <option value={5}>5% GST (Essentials / Concessional)</option>
              <option value={28}>28% GST (Heavy Equipment)</option>
              <option value={0}>0% GST (Exempt / Nil)</option>
            </select>
          </label>
        </div>

        <Money label={`GST Amount (₹ at ${gstRate}%)`} value={gstAmount} onChange={setGstAmount} />
        <Money label="Transport (₹)" value={transportCost} onChange={setTransportCost} />
        <Count
          label="Delivery in (days)"
          value={deliveryDays}
          onChange={setDeliveryDays}
          required
        />
        <Count label="Warranty (months)" value={warrantyMonths} onChange={setWarrantyMonths} />
      </div>

      {/* Line-item Roll-up */}
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-600 space-x-3">
          <span>Base: <strong>₹{num(basePrice).toLocaleString('en-IN')}</strong></span>
          <span>+ GST ({gstRate}%): <strong>₹{num(gstAmount).toLocaleString('en-IN')}</strong></span>
          {num(transportCost) > 0 && (
            <span>+ Transport: <strong>₹{num(transportCost).toLocaleString('en-IN')}</strong></span>
          )}
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-500 block">Final Billable Amount:</span>
          <strong className="text-base text-navy font-bold">
            ₹{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </strong>
        </div>
      </div>

      <label className="block text-sm">
        <span className="font-medium text-navy">Anything the buyer should know (optional)</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          placeholder="Ex-warehouse, includes fitting, etc."
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-md bg-action px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
      >
        {isSubmitting ? 'Submitting…' : 'Submit my quote'}
      </button>

      <p className="text-xs text-slate-500">
        Your price and your name are not shown to other quoting suppliers, and the buying
        committee compares your quote without knowing which business it came from.
      </p>
    </form>
  );
}

function QuickQuoteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-slate-200 px-4 py-3">
        <Link to="/" className="text-sm font-semibold text-navy hover:underline">
          {PRODUCT_NAME}
        </Link>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-slate-200 px-4 py-4">
        <p className="mx-auto max-w-2xl text-[0.65rem] leading-relaxed text-slate-500">
          {PLATFORM_DISCLAIMER}
        </p>
      </footer>
    </div>
  );
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="text-slate-500">{label}:</dt>
      <dd className="font-medium text-navy">{value}</dd>
    </div>
  );
}

function Money({
  label,
  value,
  onChange,
  required,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-navy">{label}</span>
      <input
        type="number"
        min={0}
        step="0.01"
        // Opens the numeric keypad, because this is filled in on a phone.
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        required={required}
        autoFocus={autoFocus}
      />
    </label>
  );
}

function Count({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-navy">{label}</span>
      <input
        type="number"
        min={0}
        step="1"
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        required={required}
      />
    </label>
  );
}

function num(raw: string): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
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
