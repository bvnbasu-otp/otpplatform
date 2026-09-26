import type { CompletionBlocker, SettlementAction } from '../lib/settlement-state';

export interface SettlementCtaProps {
  action: SettlementAction;
  placement: 'INLINE' | 'STICKY';
  onActivate: (action: SettlementAction) => void;
  busy?: boolean;
}

/**
 * The single settlement call-to-action for the current state. One element serves
 * every viewport (full width on mobile, auto width from `sm`), and nothing is
 * rendered when the active tab already shows the inline control for the action.
 */
export function SettlementCta({ action, placement, onActivate, busy = false }: SettlementCtaProps) {
  if (placement === 'INLINE') return null;

  const tone = action.actionable
    ? action.kind === 'COMPLETE_PO' || action.kind === 'RECORD_OFF_PLATFORM_PAYMENT'
      ? 'bg-emerald-700 text-white hover:bg-emerald-800 shadow-md'
      : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-md'
    : 'bg-muted/60 text-muted-foreground border border-border cursor-default';

  return (
    <button
      type="button"
      data-testid="settlement-cta"
      data-settlement-kind={action.kind}
      disabled={!action.actionable || busy}
      aria-disabled={!action.actionable || busy}
      title={action.description}
      onClick={() => {
        if (action.actionable) onActivate(action);
      }}
      className={`w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black transition mobile-touch-target disabled:opacity-80 ${tone}`}
    >
      <span>{action.label}</span>
      {action.actionable && <span aria-hidden="true">→</span>}
    </button>
  );
}

export function CompletionBlockersNotice({ blockers }: { blockers: CompletionBlocker[] }) {
  if (blockers.length === 0) return null;
  return (
    <div
      className="p-3 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-900 dark:text-amber-200 space-y-2"
      data-testid="completion-blockers"
    >
      <p className="font-bold">
        This purchase order cannot be completed yet — {blockers.length} item{blockers.length > 1 ? 's' : ''} outstanding:
      </p>
      <ul className="list-disc pl-4 space-y-1">
        {blockers.map((b) => (
          <li key={b.code} data-blocker-code={b.code}>
            {b.message}{' '}
            <span className="text-[10px] font-semibold opacity-80">
              {b.enforcedBy === 'SERVER' ? '(rejected by the server until resolved)' : '(workflow check on this screen)'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
