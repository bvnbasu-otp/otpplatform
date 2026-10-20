export function DiscoveryTruthLegend() {
  return (
    <div
      className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-[10px] sm:text-[11px] text-muted-foreground leading-relaxed space-y-1"
      data-testid="discovery-truth-legend"
    >
      <p className="font-bold text-foreground text-[11px]">How to read supplier results</p>
      <ul className="list-disc pl-4 space-y-0.5">
        <li>
          <strong className="text-foreground/90">OTP registered</strong> — supplier has an OTP login (match signal{' '}
          <code className="text-[10px]">otp_registered</code>).
        </li>
        <li>
          <strong className="text-foreground/90">GST verified</strong> — shown only when the system recorded GST verification for this match.
        </li>
        <li>
          <strong className="text-foreground/90">Discovered in area</strong> — geographic/category match (e.g. Google Places or PIN coverage); not the same as OTP registration.
        </li>
        <li>
          <strong className="text-foreground/90">Match score</strong> — relevance ranking from existing discovery data, not a customer rating.
        </li>
      </ul>
    </div>
  );
}
