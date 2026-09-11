import { useState } from 'react';
import { formatDateTimeIST } from '@/lib/date-utils';
import { acceptDeliveryInspection } from '../api/work-orders';
import type { WorkOrderSummary } from '../types/fulfillment';

interface DeliveryInspectionPanelProps {
  workOrder: WorkOrderSummary;
  role: 'buyer' | 'supplier';
  onAccepted?: () => void;
}

const RATING_LABELS: Record<number, string> = {
  1: '1 Star — Non-compliant / Major Deficiencies',
  2: '2 Stars — Below Expectations / Delays Encountered',
  3: '3 Stars — Satisfactory (Met Required Specifications)',
  4: '4 Stars — Very Good (High Quality & On-time Delivery)',
  5: '5 Stars — Exceptional (Exceeded All Quality & SLA Metrics)',
};

const PRESET_INSPECTION_OBSERVATIONS = [
  'Full physical quantity & packaging verified intact on-site',
  'Technical specification & material compliance verified',
  'Operational / functional performance testing completed successfully',
  'Turnaround achieved within committed delivery timeline',
  'Warranty documentation, test certificates & invoice received',
];

export function DeliveryInspectionPanel({
  workOrder,
  role,
  onAccepted,
}: DeliveryInspectionPanelProps) {
  const [rating, setRating] = useState<number>(workOrder.rating ?? 5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [selectedObservations, setSelectedObservations] = useState<string[]>([]);
  const [notes, setNotes] = useState(workOrder.reviewText ?? workOrder.inspectionNotes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (workOrder.status !== 'COMPLETED' && workOrder.progressPercent < 100) {
    return (
      <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-xs text-muted-foreground">
        <strong className="font-semibold text-foreground">Phase 3: Execution in Progress ({workOrder.progressPercent}%)</strong>
        <p className="mt-1">
          The supplier is actively executing the order. Delivery &amp; quality inspection acknowledgment unlocks once the supplier marks progress at 100%.
        </p>
      </div>
    );
  }

  if (workOrder.buyerAcceptedAt) {
    const verifiedRating = workOrder.rating ?? 5;
    return (
      <div className="mt-4 rounded-lg border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200 dark:border-emerald-800/40 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">✓</span>
            <p className="font-bold text-emerald-950 dark:text-emerald-200">100% Mutual Delivery &amp; Quality Inspection Acknowledged</p>
          </div>
          <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            {formatDateTimeIST(workOrder.buyerAcceptedAt)}
          </span>
        </div>

        {/* Verified Star Rating Display */}
        <div className="mt-3.5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 text-amber-500 text-lg">
            {[1, 2, 3, 4, 5].map((star) => (
              <span key={star} className={star <= verifiedRating ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}>
                ★
              </span>
            ))}
          </div>
          <span className="rounded-full bg-amber-100 dark:bg-amber-950/60 px-2.5 py-0.5 text-xs font-bold text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60">
            {verifiedRating}.0 / 5.0 Star Rating
          </span>
          <span className="text-xs font-medium text-emerald-900 dark:text-emerald-300">
            {RATING_LABELS[verifiedRating] ?? 'Verified Buyer Rating'}
          </span>
        </div>

        {/* Verified Review Notes */}
        {(workOrder.reviewText || workOrder.inspectionNotes) && (
          <div className="mt-3 rounded-md border border-emerald-200 dark:border-emerald-800/60 bg-card p-3 text-xs text-emerald-950 dark:text-emerald-200">
            <strong className="font-bold text-emerald-900 dark:text-emerald-300">Buyer Review &amp; Quality Notes: </strong>
            <p className="mt-1 whitespace-pre-wrap text-foreground">
              {workOrder.reviewText ?? workOrder.inspectionNotes}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (role === 'supplier') {
    return (
      <div className="mt-4 rounded-md border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 p-4 text-xs text-amber-900 dark:text-amber-200 shadow-sm">
        <strong className="font-semibold text-amber-950 dark:text-amber-200">✓ 100% Completion Reported by Supplier</strong>
        <p className="mt-1 text-amber-900 dark:text-amber-300">
          Awaiting Buyer on-site quality inspection, star rating, and formal sign-off. Once acknowledged by the buyer, you can generate and submit the GST invoice for UPI settlement.
        </p>
      </div>
    );
  }

  async function handleAccept() {
    if (!rating || rating < 1) {
      setError('Mandatory Rating: Please select a 1 to 5 star rating for this supplier before submitting sign-off.');
      return;
    }
    const combinedNotes = [...selectedObservations, notes.trim()].filter(Boolean).join('. ');
    const finalNotes = combinedNotes || 'Delivery verified and quality inspection approved.';

    setBusy(true);
    setError(null);
    const result = await acceptDeliveryInspection(workOrder.id, rating, finalNotes);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess('100% Delivery and quality inspection successfully acknowledged! Rating submitted to supplier performance score.');
    onAccepted?.();
  }

  const activeRating = hoverRating || rating;
  const hasObservations = selectedObservations.length > 0 || notes.trim().length > 0;
  const canSubmit = !busy && rating >= 1 && hasObservations;

  return (
    <section className="mt-5 rounded-lg border border-primary/30 bg-card p-5 shadow-sm" data-testid="delivery-inspection-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">Buyer Delivery &amp; Inspection Acknowledgment (100%)</h3>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
          Action Required
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        The supplier has reported 100% work completion. Please verify on-site delivery, rate the supplier experience, and acknowledge acceptance.
      </p>

      {/* Star Rating Section */}
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="block text-xs font-bold text-amber-950">
            Supplier Star Rating <span className="text-red-600 font-bold">*</span>
          </label>
          <span className="text-[11px] font-semibold text-amber-800">
            {activeRating ? RATING_LABELS[activeRating] : 'Click stars to rate (1–5)'}
          </span>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((star) => {
            const isFilled = star <= activeRating;
            return (
              <button
                key={star}
                type="button"
                onClick={() => {
                  setRating(star);
                  setError(null);
                }}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                className="group p-1 text-2xl transition-transform hover:scale-125 focus:outline-none"
                title={`${star} Star${star > 1 ? 's' : ''}`}
              >
                <span
                  className={`transition-colors ${
                    isFilled ? 'text-amber-500 drop-shadow-xs' : 'text-slate-300 group-hover:text-amber-300'
                  }`}
                >
                  ★
                </span>
              </button>
            );
          })}
          {rating > 0 && (
            <span className="ml-2 text-xs font-bold text-amber-900">
              {rating}.0 / 5.0
            </span>
          )}
        </div>

        <p className="mt-2 text-[11px] text-amber-900/80">
          ⭐ <strong>Reputation &amp; Future Award Impact:</strong> Your rating and review directly builds this supplier’s platform trust record, boosting their merit score for future competitive quotes.
        </p>
      </div>

      {/* Review Observations Section with Pre-test Checkboxes */}
      <div className="mt-4 space-y-2.5">
        <label className="block text-xs font-bold text-foreground" htmlFor="inspection-notes">
          Inspection Observations &amp; Review Notes:
          <span className="ml-1 text-[11px] font-normal text-muted-foreground">
            (Select pre-defined checks, add custom notes, or both)
          </span>
        </label>

        {/* Multiple Pre-test Checkboxes (Select one, all, or none) */}
        <div className="grid sm:grid-cols-2 gap-2">
          {PRESET_INSPECTION_OBSERVATIONS.map((obs) => {
            const isChecked = selectedObservations.includes(obs);
            return (
              <label
                key={obs}
                className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs cursor-pointer transition ${
                  isChecked
                    ? 'border-primary bg-primary/5 font-medium text-foreground'
                    : 'border-muted bg-card text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedObservations((prev) => [...prev, obs]);
                    } else {
                      setSelectedObservations((prev) => prev.filter((o) => o !== obs));
                    }
                    if (error) setError(null);
                  }}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span className="leading-tight">{obs}</span>
              </label>
            );
          })}
        </div>

        <textarea
          id="inspection-notes"
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            if (error) setError(null);
          }}
          rows={2}
          placeholder="e.g. Verified on-site delivery of goods/services, technical parameters inspected, quality verified. Prompt and professional execution."
          className="w-full rounded-md border p-2.5 text-xs bg-background focus:ring-2 focus:ring-primary focus:outline-none"
        />
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-2.5 text-xs font-semibold text-red-800 dark:text-red-300">
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div className="mt-3 rounded-md border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
          ✓ {success}
        </div>
      )}

      {!success && (
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void handleAccept()}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition"
        >
          {busy ? 'Submitting Sign-off & Rating…' : '✓ Submit Rating & Acknowledge 100% Delivery →'}
        </button>
      )}
    </section>
  );
}
