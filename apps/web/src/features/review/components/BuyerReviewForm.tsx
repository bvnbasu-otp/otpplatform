import { useState } from 'react';
import { submitBuyerReview } from '../api/submit-review';

export interface BuyerReviewFormProps {
  rfqId: string;
  quotedDeliveryDays?: number;
  onSubmitted?: () => void;
}

export function BuyerReviewForm({
  rfqId,
  quotedDeliveryDays,
  onSubmitted,
}: BuyerReviewFormProps) {
  const [qualityRating, setQualityRating] = useState(4);
  const [actualDeliveryDays, setActualDeliveryDays] = useState(
    quotedDeliveryDays != null ? String(quotedDeliveryDays) : '',
  );
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const days = Number(actualDeliveryDays);
    if (!Number.isFinite(days) || days < 0) {
      setError('Enter valid actual delivery days');
      setBusy(false);
      return;
    }

    const result = await submitBuyerReview({
      rfqId,
      qualityRating,
      actualDeliveryDays: days,
      notes: notes.trim() || undefined,
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSuccess('Performance review submitted — feeds market intelligence baselines.');
    onSubmitted?.();
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="rounded-lg border bg-card p-4"
      data-testid="buyer-review-form"
    >
      <h2 className="font-medium">Submit Supplier Review</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Rate delivery and quality after verified payment. Required to close the procurement loop.
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {success && (
        <p className="mt-3 text-sm text-green-700" data-testid="review-success">
          {success}
        </p>
      )}

      {!success && (
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="quality-rating" className="text-sm font-medium">
              Quality (1–5)
            </label>
            <input
              id="quality-rating"
              type="range"
              min={1}
              max={5}
              step={0.5}
              value={qualityRating}
              onChange={(e) => setQualityRating(Number(e.target.value))}
              className="mt-1 w-full"
            />
            <p className="text-sm text-muted-foreground">{qualityRating} / 5</p>
          </div>

          <div>
            <label htmlFor="actual-days" className="text-sm font-medium">
              Actual delivery days
            </label>
            <input
              id="actual-days"
              type="number"
              min={0}
              value={actualDeliveryDays}
              onChange={(e) => setActualDeliveryDays(e.target.value)}
              required
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
            {quotedDeliveryDays != null && (
              <p className="mt-1 text-xs text-muted-foreground">
                Quoted: {quotedDeliveryDays} day(s)
              </p>
            )}
          </div>

          <div>
            <label htmlFor="review-notes" className="text-sm font-medium">
              Notes (optional)
            </label>
            <textarea
              id="review-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="On-site observations, warranty follow-up, etc."
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Submit review
          </button>
        </div>
      )}
    </form>
  );
}
