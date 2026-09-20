interface ClarificationPiiBannerProps {
  redactions: string[];
  previewScrubbed?: string;
  isOnlyPii?: boolean;
}

export function ClarificationPiiBanner({
  redactions,
  previewScrubbed,
  isOnlyPii,
}: ClarificationPiiBannerProps) {
  if (redactions.length === 0) return null;

  return (
    <div
      role="alert"
      className={`rounded-xl border p-3 text-xs space-y-1.5 transition-all ${
        isOnlyPii
          ? 'border-red-300 dark:border-red-800 bg-red-50/90 dark:bg-red-950/40 text-red-900 dark:text-red-200'
          : 'border-amber-300 dark:border-amber-800 bg-amber-50/90 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200'
      }`}
    >
      <div className="flex items-center gap-1.5 font-black">
        <span>🛡️</span>
        <span>
          {isOnlyPii
            ? 'Cannot send contact details alone'
            : 'Pre-submission Anonymity Scrubber Active'}
        </span>
      </div>

      <p className="text-[11px] leading-relaxed">
        {isOnlyPii
          ? 'Your message contains direct contact identifiers without technical or commercial questions. Platform rules require inquiries to address requirement specifications.'
          : 'To preserve strict identity-protected evaluation guarantees, direct contact details are automatically masked before delivery to the other party.'}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="text-[10px] uppercase font-bold text-muted-foreground">
          Masked Items:
        </span>
        {redactions.map((kind) => (
          <span
            key={kind}
            className="rounded-md bg-white/80 dark:bg-black/30 border border-current/20 px-1.5 py-0.5 text-[10px] font-mono font-bold"
          >
            {kind}
          </span>
        ))}
      </div>

      {previewScrubbed && (
        <div className="mt-1.5 rounded-md bg-white/60 dark:bg-black/20 p-2 text-[11px] font-mono border border-current/10">
          <span className="text-[10px] text-muted-foreground block not-mono font-sans mb-0.5">
            Recipient will see:
          </span>
          <span className="break-words">{previewScrubbed}</span>
        </div>
      )}
    </div>
  );
}

export function ClarificationRedactionTag({ kinds }: { kinds: string[] }) {
  if (!kinds || kinds.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 text-[10px] text-amber-700 dark:text-amber-300">
      <span className="font-bold">🛡️ Masked:</span>
      {kinds.map((k) => (
        <span
          key={k}
          className="rounded bg-amber-100 dark:bg-amber-950/60 border border-amber-300/60 dark:border-amber-800/60 px-1 py-0.2 font-mono font-semibold"
        >
          {k}
        </span>
      ))}
    </div>
  );
}
