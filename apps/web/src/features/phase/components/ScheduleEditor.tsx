import { useState } from 'react';
import { setRfqSchedule } from '../api/phase';
import type { RfqPhase } from '../types/phase';

interface ScheduleEditorProps {
  phase: RfqPhase;
  onChanged: (phase: RfqPhase) => void;
}

/** datetime-local wants "YYYY-MM-DDTHH:mm" in local time, not an ISO instant. */
function toInputValue(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function toIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

/**
 * Changing the three deadlines, as one decision.
 *
 * Sent together because they only make sense in order, and saved through the RPC
 * that validates that order — so a buyer cannot leave the enquiry in a state where
 * revision closes before quoting does, even briefly.
 *
 * Extending a deadline is a legitimate thing to do and is not hidden behind a
 * warning. It is, however, recorded against the person who did it, which is the
 * honest version of the same control: suppliers were given a date, and moving it
 * is a decision someone owns rather than a setting that drifted.
 */
export function ScheduleEditor({ phase, onChanged }: ScheduleEditorProps) {
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState(() => toInputValue(phase.schedule.quoteDeadline));
  const [revision, setRevision] = useState(() => toInputValue(phase.schedule.revisionDeadline));
  const [voting, setVoting] = useState(() => toInputValue(phase.schedule.evaluationDeadline));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result = await setRfqSchedule(phase.rfqId, {
      quoteDeadline: toIso(quote),
      revisionDeadline: toIso(revision),
      evaluationDeadline: toIso(voting),
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onChanged(result.phase);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
      >
        Change schedule
      </button>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="mt-3 space-y-3 border-t pt-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs">
          <span className="font-medium">Quoting Closes</span>
          <input
            type="datetime-local"
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            className="mt-1 w-full rounded-md border px-2 py-1.5 text-xs"
          />
        </label>
        <label className="text-xs">
          <span className="font-medium">Revision Closes</span>
          <input
            type="datetime-local"
            value={revision}
            onChange={(e) => setRevision(e.target.value)}
            className="mt-1 w-full rounded-md border px-2 py-1.5 text-xs"
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Leave empty to freeze prices when quoting closes.
          </span>
        </label>
        <label className="text-xs">
          <span className="font-medium">Voting closes</span>
          <input
            type="datetime-local"
            value={voting}
            onChange={(e) => setVoting(e.target.value)}
            className="mt-1 w-full rounded-md border px-2 py-1.5 text-xs"
          />
        </label>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <p className="text-[11px] text-muted-foreground">
        Suppliers were given these dates, so the change is recorded in the audit trail with your
        name on it.
      </p>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save schedule'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
