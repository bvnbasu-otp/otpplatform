import { useState } from 'react';
import { updateRfqDeadline } from '@/features/requirement/api/rfq-lifecycle';

interface ActiveRfqExtendDeadlineModalProps {
  rfqId: string;
  isOpen: boolean;
  onClose: () => void;
  currentDeadlineIso: string;
  onSuccess: (newDeadlineIso: string) => void;
}

export function ActiveRfqExtendDeadlineModal({
  rfqId,
  isOpen,
  onClose,
  currentDeadlineIso,
  onSuccess,
}: ActiveRfqExtendDeadlineModalProps) {
  const [selectedDeadline, setSelectedDeadline] = useState(currentDeadlineIso);
  const [isCustom, setIsCustom] = useState(false);
  const [customVal, setCustomVal] = useState(() => {
    const d = new Date(currentDeadlineIso);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 16);
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  function handleAddDays(days: number) {
    setIsCustom(false);
    const target = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    target.setHours(18, 0, 0, 0);
    setSelectedDeadline(target.toISOString());
    setCustomVal(target.toISOString().slice(0, 16));
  }

  function handleCustomChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setCustomVal(val);
    if (val) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        setSelectedDeadline(d.toISOString());
      }
    }
  }

  async function handleSave() {
    setBusy(true);
    setError(null);

    const res = await updateRfqDeadline(rfqId, selectedDeadline);
    setBusy(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    onSuccess(selectedDeadline);
    onClose();
  }

  const deadlineDisplay = new Date(selectedDeadline).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="extend-deadline-title"
    >
      <div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-2xl space-y-4 text-foreground animate-in fade-in-50 zoom-in-95">
        <div className="flex items-center justify-between pb-2 border-b">
          <div className="flex items-center gap-2">
            <span className="text-xl">⏰</span>
            <h3 id="extend-deadline-title" className="text-sm sm:text-base font-bold text-foreground">
              Extend Quote Deadline
            </h3>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-[48px] min-w-[48px] inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition mobile-touch-target"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <p className="text-muted-foreground leading-relaxed">
            Choose an extended response window for invited suppliers to prepare and submit quotes.
          </p>

          <div className="rounded-xl bg-primary/10 p-3 border border-primary/20 text-center">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
              New Quote Deadline
            </span>
            <span className="text-sm sm:text-base font-black text-primary block mt-0.5">
              {deadlineDisplay}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => handleAddDays(2)}
              className="min-h-[48px] px-3 py-1.5 rounded-lg border bg-muted/40 hover:bg-muted text-xs font-bold text-foreground transition mobile-touch-target"
            >
              +2 Days
            </button>
            <button
              type="button"
              onClick={() => handleAddDays(5)}
              className="min-h-[48px] px-3 py-1.5 rounded-lg border bg-muted/40 hover:bg-muted text-xs font-bold text-foreground transition mobile-touch-target"
            >
              +5 Days
            </button>
            <button
              type="button"
              onClick={() => handleAddDays(7)}
              className="min-h-[48px] px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/20 text-xs font-bold text-primary transition mobile-touch-target"
            >
              +7 Days
            </button>
            <button
              type="button"
              onClick={() => setIsCustom(!isCustom)}
              className={`min-h-[48px] px-3 py-1.5 rounded-lg border text-xs font-bold transition mobile-touch-target ${
                isCustom
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/40 text-muted-foreground hover:text-foreground'
              }`}
            >
              Custom Date ✎
            </button>
          </div>

          {isCustom && (
            <div className="pt-2">
              <label htmlFor="custom-deadline-input" className="block text-[11px] font-bold text-muted-foreground mb-1 uppercase tracking-wider">
                Select Date &amp; Time:
              </label>
              <input
                id="custom-deadline-input"
                type="datetime-local"
                value={customVal}
                onChange={handleCustomChange}
                className="min-h-[48px] w-full rounded-lg border bg-background px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary mobile-touch-target"
              />
            </div>
          )}

          {error && (
            <p className="text-xs font-bold text-red-600 bg-red-50 dark:bg-red-950/40 p-2.5 rounded-lg border border-red-200">
              ⚠️ {error}
            </p>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-[48px] flex-1 rounded-xl border bg-muted/30 px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition mobile-touch-target"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSave()}
            className="min-h-[48px] flex-1 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-md hover:bg-primary/90 disabled:opacity-50 transition mobile-touch-target flex items-center justify-center gap-1.5"
            data-testid="confirm-extend-deadline-button"
          >
            <span>{busy ? 'Saving…' : 'Save Extended Deadline'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
