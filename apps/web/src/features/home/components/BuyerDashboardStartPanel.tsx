import { Link } from 'react-router-dom';
import type { BuyerPersona } from '@otp/domain';

export interface BuyerDashboardStartPanelProps {
  greeting: string;
  name: string;
  buyerPersona: BuyerPersona;
  actionCount: number;
  activeCount: number;
}

const PERSONA_HINT: Record<BuyerPersona, string> = {
  INDIVIDUAL:
    'Personal procurement — describe what you need at home or on site. No committee steps unless you add an organization later.',
  RWA:
    'Society procurement — draft requirements here. Committee voting and approvals follow your existing RWA rules when applicable.',
  MSME:
    'Business procurement — capture requirements with GST-aligned details. Delegates and spend caps follow your organization settings.',
};

export function BuyerDashboardStartPanel({
  greeting,
  name,
  buyerPersona,
  actionCount,
  activeCount,
}: BuyerDashboardStartPanelProps) {
  return (
    <section
      className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/8 via-card to-card p-3.5 sm:p-4 shadow-2xs space-y-3"
      data-testid="buyer-dashboard-start-panel"
      aria-labelledby="buyer-dashboard-start-heading"
    >
      <div className="space-y-1 min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground md:hidden">
          {greeting}, {name}
        </p>
        <h2 id="buyer-dashboard-start-heading" className="text-sm sm:text-base font-extrabold text-foreground leading-snug">
          Start a procurement request
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed">{PERSONA_HINT[buyerPersona]}</p>
        <p className="text-[10px] text-muted-foreground/90 font-medium">
          Journey: <span className="text-foreground/80">Tell</span> → Review → Decide → Track
        </p>
      </div>

      <div className="flex flex-col xs:flex-row gap-2">
        <Link
          to="/intake"
          data-testid="buyer-primary-intake-cta"
          className="min-h-[48px] inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground shadow-sm hover:bg-primary/90 transition active:scale-[0.98] mobile-touch-target focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <span aria-hidden="true">✏️</span>
          <span>Tell OTP what you need</span>
        </Link>
        {activeCount > 0 && (
          <Link
            to="/purchase-orders"
            className="min-h-[48px] inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold text-foreground hover:bg-muted transition mobile-touch-target focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <span>Track orders ({activeCount})</span>
          </Link>
        )}
      </div>

      {actionCount > 0 && (
        <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" aria-hidden="true" />
          <span>
            {actionCount} item{actionCount === 1 ? '' : 's'} need your attention below.
          </span>
        </p>
      )}
    </section>
  );
}
