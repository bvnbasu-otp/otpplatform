import { useState } from 'react';
import {
  EXIT_REASON_OPTIONS,
  type ExitReasonCode,
  processRfqCancellation,
} from '../api/cancellations';

interface CancelRfqModalProps {
  rfqId: string;
  isOpen: boolean;
  onClose: () => void;
  onCancelled: () => void;
}

export function CancelRfqModal({
  rfqId,
  isOpen,
  onClose,
  onCancelled,
}: CancelRfqModalProps) {
  const [reasonCode, setReasonCode] = useState<ExitReasonCode>('BUDGET_CANCELLED');
  const [detailedNotes, setDetailedNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // The parent keeps this component mounted and toggles `isOpen`, so state
  // from a previous attempt (a stale error, half-typed notes) would otherwise
  // still be sitting there the next time the dialog opens.
  function handleClose() {
    setError(null);
    setDetailedNotes('');
    setReasonCode('BUDGET_CANCELLED');
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!detailedNotes.trim()) {
      setError('Please provide a brief written explanation for platform compliance records.');
      return;
    }

    setBusy(true);
    setError(null);

    const result = await processRfqCancellation(rfqId, reasonCode, detailedNotes.trim());
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onCancelled();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-2xl animate-in fade-in zoom-in duration-200"
        data-testid="cancel-rfq-modal"
      >
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">Cancel Procurement Enquiry</h2>
            <p className="text-xs text-muted-foreground">
              Record structured reason for withdrawal / cancellation
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-2.5 text-xs text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-foreground" htmlFor="exit-reason-select">
              Select Primary Reason for Cancellation:
            </label>
            <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {EXIT_REASON_OPTIONS.map((opt) => (
                <label
                  key={opt.code}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-xs transition ${
                    reasonCode === opt.code
                      ? 'border-red-400 bg-red-50/50 font-medium'
                      : 'hover:bg-muted/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="exit-reason"
                    value={opt.code}
                    checked={reasonCode === opt.code}
                    onChange={() => setReasonCode(opt.code)}
                    className="mt-0.5 text-red-600 focus:ring-red-500"
                  />
                  <div>
                    <span className="font-semibold text-foreground">{opt.label}</span>
                    <p className="text-[11px] text-muted-foreground">{opt.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground" htmlFor="cancel-notes">
              Explanation &amp; Committee Notes: <span className="text-red-500">*</span>
            </label>
            <textarea
              id="cancel-notes"
              rows={3}
              required
              placeholder="e.g. In General Body Meeting held on Sunday, committee voted to postpone clubhouse rewinding to next fiscal year..."
              value={detailedNotes}
              onChange={(e) => setDetailedNotes(e.target.value)}
              className="mt-1.5 w-full rounded-md border p-2.5 text-xs"
            />
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-[11px] text-amber-800">
            <span className="font-semibold">Platform Governance Notice: </span>
            Cancelling after receiving quotes records an auditable timestamp and notifies participating suppliers.
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={handleClose}
              className="rounded-md border px-4 py-2 text-xs font-medium hover:bg-muted"
            >
              Back to Enquiry
            </button>
            <button
              type="submit"
              disabled={busy || !detailedNotes.trim()}
              className="rounded-md bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? 'Processing…' : 'Confirm Cancellation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
