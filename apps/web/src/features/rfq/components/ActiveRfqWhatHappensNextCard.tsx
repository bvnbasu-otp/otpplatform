import { Link } from 'react-router-dom';
import type { RfqMonitoringGovernance } from '../types/rfq-monitoring';

interface ActiveRfqWhatHappensNextCardProps {
  rfqId: string;
  governance: RfqMonitoringGovernance;
  isQuorumMet: boolean;
}

export function ActiveRfqWhatHappensNextCard({
  rfqId,
  governance,
  isQuorumMet,
}: ActiveRfqWhatHappensNextCardProps) {
  const { isFastTrack, minQuotesRequired, committeeVoteRequired } = governance;

  return (
    <section
      className="rounded-xl border bg-card p-4 shadow-2xs space-y-3 transition-all text-foreground"
      data-testid="active-rfq-next-steps-card"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground border">
          Procurement Lifecycle Progression
        </span>
        <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300">
          {isFastTrack ? '⚡ Fast Track Protocol' : '🏛️ Full Governance Protocol'}
        </span>
      </div>

      <h3 className="text-sm font-bold text-foreground">
        What Happens Next?
      </h3>

      <div className="space-y-2 text-xs">
        <div className="flex items-start gap-2.5 p-2 rounded-lg bg-muted/20 border">
          <span className="text-base">1️⃣</span>
          <div>
            <p className="font-bold text-foreground">Market Intelligence &amp; Inbound Quotes</p>
            <p className="text-[11px] text-muted-foreground">
              Review regional cluster pricing benchmarks (Fair Market Price, TAT) while supplier quotes arrive.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5 p-2 rounded-lg bg-muted/20 border">
          <span className="text-base">2️⃣</span>
          <div>
            <p className="font-bold text-foreground">Clarifications &amp; Technical Q&amp;A</p>
            <p className="text-[11px] text-muted-foreground">
              Suppliers submit questions through masked threads. Respond to queries without exposing identity.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5 p-2 rounded-lg bg-muted/20 border">
          <span className="text-base">3️⃣</span>
          <div>
            <p className="font-bold text-foreground">Identity-Protected Evaluation &amp; Award</p>
            <p className="text-[11px] text-muted-foreground">
              {isFastTrack
                ? `Compare quotes on price, turnaround, and warranty. Direct manager award once quorum (${minQuotesRequired} quotes) is satisfied.`
                : `Committee voting room activates with mandatory Conflict of Interest (COI) clearances before award authorization.`}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
        <Link
          to={`/rfq/${rfqId}/market-intelligence`}
          className="text-primary hover:underline font-bold"
        >
          View Market Intelligence ↗
        </Link>
        <Link
          to={`/rfq/${rfqId}/audit`}
          className="text-muted-foreground hover:text-foreground font-semibold"
        >
          Enquiry Audit History ↗
        </Link>
      </div>
    </section>
  );
}
