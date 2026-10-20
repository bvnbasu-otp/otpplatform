export function QuoteComparisonCommercialLegend() {
  return (
    <p
      className="text-[10px] text-muted-foreground leading-relaxed px-0.5"
      data-testid="quote-comparison-commercial-legend"
    >
      <strong className="text-foreground/90">How to read offers:</strong> Base, GST and freight are supplier-entered.
      Landed total and Smart Merit score come from existing OTP quote records — merit is weighted, not “cheapest wins”.
      Supplier identities stay sealed until award.
    </p>
  );
}
