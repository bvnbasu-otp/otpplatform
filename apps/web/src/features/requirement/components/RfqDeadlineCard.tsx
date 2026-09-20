import { useState, useMemo } from 'react';
import type { RfqDeadlinePreset } from '../types/rfq-review';

interface RfqDeadlineCardProps {
  currentDeadlineIso: string;
  onDeadlineChange: (newDeadlineIso: string) => void;
}

export function RfqDeadlineCard({
  currentDeadlineIso,
  onDeadlineChange,
}: RfqDeadlineCardProps) {
  const [isCustom, setIsCustom] = useState(false);
  const [customDate, setCustomDate] = useState(() => {
    const d = new Date(currentDeadlineIso);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 16);
  });

  const deadlineDate = useMemo(() => new Date(currentDeadlineIso), [currentDeadlineIso]);
  const isValidDate = !isNaN(deadlineDate.getTime());
  const isPast = isValidDate && deadlineDate.getTime() <= Date.now();

  const formattedDisplay = isValidDate
    ? deadlineDate.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : 'Invalid deadline';

  // Compute days difference from now for active preset detection
  const daysDiff = isValidDate
    ? Math.round((deadlineDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : 0;

  function applyPreset(days: number) {
    setIsCustom(false);
    const target = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    // Standardize to 6:00 PM local time
    target.setHours(18, 0, 0, 0);
    const iso = target.toISOString();
    setCustomDate(target.toISOString().slice(0, 16));
    onDeadlineChange(iso);
  }

  function handleCustomChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setCustomDate(val);
    if (val) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        onDeadlineChange(d.toISOString());
      }
    }
  }

  return (
    <section
      className="rounded-xl border bg-card p-4 shadow-2xs space-y-3.5 transition-all text-foreground"
      data-testid="rfq-deadline-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="rounded-md bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            3. Quote Response Deadline
          </span>
          <h3 className="text-sm sm:text-base font-bold text-foreground mt-1">
            Expected Supplier Quote Submissions
          </h3>
        </div>

        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary border border-primary/20">
          ⏰ {formattedDisplay}
        </span>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Suppliers submit sealed quotes before this deadline. Responses are expected with an initial 30 Min Target from Supplier.
      </p>

      {/* Preset Chips */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        <button
          type="button"
          onClick={() => applyPreset(3)}
          className={`min-h-[48px] px-3.5 py-1.5 rounded-lg border text-xs font-bold transition mobile-touch-target ${
            !isCustom && daysDiff === 3
              ? 'border-primary/60 bg-primary/15 text-primary'
              : 'bg-muted/40 hover:bg-muted text-foreground'
          }`}
        >
          ⚡ 3 Days (Fast)
        </button>
        <button
          type="button"
          onClick={() => applyPreset(5)}
          className={`min-h-[48px] px-3.5 py-1.5 rounded-lg border text-xs font-bold transition mobile-touch-target ${
            !isCustom && daysDiff === 5
              ? 'border-primary/60 bg-primary/15 text-primary'
              : 'bg-muted/40 hover:bg-muted text-foreground'
          }`}
        >
          ⏱️ 5 Days
        </button>
        <button
          type="button"
          onClick={() => applyPreset(7)}
          className={`min-h-[48px] px-3.5 py-1.5 rounded-lg border text-xs font-bold transition mobile-touch-target ${
            !isCustom && (daysDiff === 7 || (daysDiff >= 6 && daysDiff <= 8))
              ? 'border-primary/60 bg-primary/15 text-primary'
              : 'bg-muted/40 hover:bg-muted text-foreground'
          }`}
        >
          📅 7 Days (Standard)
        </button>
        <button
          type="button"
          onClick={() => applyPreset(14)}
          className={`min-h-[48px] px-3.5 py-1.5 rounded-lg border text-xs font-bold transition mobile-touch-target ${
            !isCustom && (daysDiff === 14 || (daysDiff >= 13 && daysDiff <= 15))
              ? 'border-primary/60 bg-primary/15 text-primary'
              : 'bg-muted/40 hover:bg-muted text-foreground'
          }`}
        >
          📆 14 Days (Complex)
        </button>
        <button
          type="button"
          onClick={() => setIsCustom(!isCustom)}
          className={`min-h-[48px] px-3.5 py-1.5 rounded-lg border text-xs font-bold transition mobile-touch-target ${
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
          <label htmlFor="custom-deadline-picker" className="block text-[11px] font-bold text-muted-foreground mb-1 uppercase tracking-wider">
            Select Custom Date &amp; Time:
          </label>
          <input
            id="custom-deadline-picker"
            type="datetime-local"
            value={customDate}
            onChange={handleCustomChange}
            className="min-h-[48px] w-full sm:w-auto rounded-lg border bg-background px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary mobile-touch-target"
          />
        </div>
      )}

      {isPast && (
        <p className="text-xs font-bold text-red-600 bg-red-50 dark:bg-red-950/40 p-2.5 rounded-lg border border-red-200 dark:border-red-800">
          ⚠️ Selected deadline is in the past. Please select a future date/time.
        </p>
      )}
    </section>
  );
}
