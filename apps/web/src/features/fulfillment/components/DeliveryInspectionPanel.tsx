import { useState } from 'react';
import { formatDateTimeIST } from '@/lib/date-utils';
import { translateError } from '@/lib/error-translator';
import { acceptDeliveryInspection } from '../api/work-orders';
import type { WorkOrderSummary } from '../types/fulfillment';

export interface DeliveryInspectionPanelProps {
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
  const [selectedObservations, setSelectedObservations] = useState<string[]>([
    'Full physical quantity & packaging verified intact on-site',
    'Technical specification & material compliance verified',
  ]);
  const [notes, setNotes] = useState(workOrder.reviewText ?? workOrder.inspectionNotes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (workOrder.status !== 'COMPLETED' && workOrder.progressPercent < 100) {
    return (
      <div className="rounded-2xl border border-border bg-muted/20 p-4 text-xs text-muted-foreground space-y-1">
        <strong className="font-bold text-foreground flex items-center gap-1.5">
          <span>⚙️</span> Execution in Progress ({workOrder.progressPercent}%)
        </strong>
        <p className="text-[11px] leading-snug">
          The supplier is actively executing the milestone scope. Mutual delivery &amp; quality sign-off unlocks once the supplier reports 100% completion.
        </p>
      </div>
    );
  }

  if (workOrder.buyerAcceptedAt) {
    const verifiedRating = workOrder.rating ?? 5;
    return (
      <div className="rounded-2xl border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200 dark:border-emerald-800/40 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-black text-white">✓</span>
            <p className="font-black text-xs text-emerald-950 dark:text-emerald-200">
              100% Mutual Delivery &amp; Quality Inspection Acknowledged
            </p>
          </div>
          <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
            {formatDateTimeIST(workOrder.buyerAcceptedAt)}
          </span>
        </div>

        {/* Verified Star Rating Display */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 text-amber-500 text-lg">
            {[1, 2, 3, 4, 5].map((star) => (
              <span key={star} className={star <= verifiedRating ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}>
                ★
              </span>
            ))}
          </div>
          <span className="rounded-full bg-amber-100 dark:bg-amber-950/60 px-2.5 py-0.5 text-xs font-black text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60">
            {verifiedRating}.0 / 5.0
          </span>
          <span className="text-[11px] font-semibold text-emerald-900 dark:text-emerald-300">
            {RATING_LABELS[verifiedRating] ?? 'Verified Buyer Rating'}
          </span>
        </div>

        {/* Verified Review Notes */}
        {(workOrder.reviewText || workOrder.inspectionNotes) && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-card p-3 text-xs text-emerald-950 dark:text-emerald-200">
            <strong className="font-bold text-emerald-900 dark:text-emerald-300">Buyer Review &amp; Quality Notes: </strong>
            <p className="mt-1 whitespace-pre-wrap text-foreground text-[11px]">
              {workOrder.reviewText ?? workOrder.inspectionNotes}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (role === 'supplier') {
    return (
      <div className="rounded-2xl border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 p-4 text-xs text-amber-900 dark:text-amber-200 shadow-2xs space-y-1">
        <strong className="font-extrabold text-amber-950 dark:text-amber-200 block">
          ✓ 100% Completion Reported by Supplier
        </strong>
        <p className="text-[11px] text-amber-900 dark:text-amber-300 leading-snug">
          Awaiting buyer on-site quality inspection, star rating, and formal sign-off. Once acknowledged by the buyer, official tax invoice submission and milestone payment release will unlock.
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
      setError(translateError(result.error));
      return;
    }
    setSuccess('✓ 100% Delivery & quality inspection successfully acknowledged! Rating submitted to supplier performance score.');
    onAccepted?.();
  }

  const activeRating = hoverRating || rating;
  const hasObservations = selectedObservations.length > 0 || notes.trim().length > 0;
  const canSubmit = !busy && rating >= 1 && hasObservations;

  return (
    <section className="rounded-2xl border-2 border-primary/40 bg-card p-4 shadow-2xs space-y-3.5" data-testid="delivery-inspection-panel">
      <div className="flex items-center justify-between border-b pb-2">
        <div>
          <h3 className="text-xs font-extrabold text-foreground uppercase tracking-wider">
            Buyer Delivery &amp; Inspection Sign-off (100%)
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Verify on-site deliverables, test certificates, and submit supplier quality score.
          </p>
        </div>
        <span className="rounded-full bg-amber-100 dark:bg-amber-950/60 px-2.5 py-0.5 text-[10px] font-black text-amber-800 dark:text-amber-300 border border-amber-300">
          Sign-off Required
        </span>
      </div>

      {/* Star Rating Section */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/50 dark:bg-amber-950/30 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <label className="block text-[11px] font-extrabold text-amber-950 dark:text-amber-200">
            Supplier Star Rating <span className="text-red-500">*</span>
          </label>
          <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-300">
            {activeRating ? RATING_LABELS[activeRating] : 'Click stars to rate (1–5)'}
          </span>
        </div>

        <div className="flex items-center gap-1">
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
                className="group p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-2xl transition-transform hover:scale-125 focus:outline-none mobile-touch-target"
                title={`${star} Star${star > 1 ? 's' : ''}`}
              >
                <span
                  className={`transition-colors ${
                    isFilled ? 'text-amber-500 drop-shadow-xs' : 'text-slate-300 dark:text-slate-600 group-hover:text-amber-300'
                  }`}
                >
                  ★
                </span>
              </button>
            );
          })}
          {rating > 0 && (
            <span className="ml-2 text-xs font-black text-amber-900 dark:text-amber-200">
              {rating}.0 / 5.0
            </span>
          )}
        </div>
      </div>

      {/* Preset Observations & Notes */}
      <div className="space-y-2">
        <label className="block text-[11px] font-bold text-foreground" htmlFor="inspection-notes">
          Inspection Checklist &amp; Observations:
        </label>

        <div className="grid grid-cols-1 gap-1.5">
          {PRESET_INSPECTION_OBSERVATIONS.map((obs) => {
            const isChecked = selectedObservations.includes(obs);
            return (
              <label
                key={obs}
                className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-xs cursor-pointer transition min-h-[44px] mobile-touch-target ${
                  isChecked
                    ? 'border-primary bg-primary/5 font-semibold text-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted/30'
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
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary shrink-0"
                />
                <span className="leading-snug text-[11px]">{obs}</span>
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
          placeholder="Additional quality remarks (e.g. Tested on-site, voltage/RPM within tolerance)."
          className="w-full rounded-xl border bg-background p-2.5 text-xs focus:ring-2 focus:ring-primary focus:outline-none"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/40 p-2.5 text-xs font-bold text-red-800 dark:text-red-300">
          ⚠️ {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
          {success}
        </div>
      )}

      {!success && (
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void handleAccept()}
          className="w-full min-h-[44px] rounded-xl bg-primary px-5 py-3 text-xs font-black text-primary-foreground shadow-md hover:bg-primary/90 active:scale-98 disabled:opacity-50 transition flex items-center justify-center gap-1.5 mobile-touch-target"
        >
          {busy ? 'Submitting Sign-off…' : '✓ Sign Off Inspection & Unlock Invoice Settlement →'}
        </button>
      )}
    </section>
  );
}
