/**
 * Buyer-facing orientation at the top of requirement intake (TELL stage).
 * Copy only — does not alter validation or submission.
 */
export function IntakeEntryBanner() {
  return (
    <div
      className="rounded-xl border border-border/80 bg-muted/30 px-3.5 py-2.5 text-xs space-y-1 shrink-0"
      data-testid="intake-entry-banner"
    >
      <p className="font-extrabold text-foreground flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-primary/15 text-primary px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide">
          Step 1 — Tell
        </span>
        <span>Describe what you need</span>
      </p>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        OTP prepares your requirement and RFQ. You will review sealed quotes, make the decision, then track
        fulfilment — same journey as on your dashboard.
      </p>
    </div>
  );
}
