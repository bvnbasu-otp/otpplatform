import { Link } from 'react-router-dom';
import type { RfqActionRequired } from '../types/rfq-monitoring';

interface ActiveRfqActionRequiredCardProps {
  actionRequired: RfqActionRequired;
  onOpenExtendDeadline?: () => void;
}

export function ActiveRfqActionRequiredCard({
  actionRequired,
  onOpenExtendDeadline,
}: ActiveRfqActionRequiredCardProps) {
  const { type, title, description, actionLabel, actionUrl, severity } = actionRequired;

  const isHashLink = actionUrl.startsWith('#');

  let bgClass = 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-200';
  let badgeClass = 'bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 border-blue-300';
  let btnClass = 'bg-blue-600 hover:bg-blue-700 text-white';
  let icon = 'ℹ️';

  if (severity === 'urgent') {
    bgClass = 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200';
    badgeClass = 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border-amber-300';
    btnClass = 'bg-amber-600 hover:bg-amber-700 text-white';
    icon = '💬';
  } else if (severity === 'success') {
    bgClass = 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200';
    badgeClass = 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border-emerald-300';
    btnClass = 'bg-emerald-600 hover:bg-emerald-700 text-white';
    icon = '🎉';
  } else if (severity === 'warning') {
    bgClass = 'bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800 text-orange-900 dark:text-orange-200';
    badgeClass = 'bg-orange-100 dark:bg-orange-900/60 text-orange-800 dark:text-orange-300 border-orange-300';
    btnClass = 'bg-orange-600 hover:bg-orange-700 text-white';
    icon = '⏰';
  }

  return (
    <section
      className={`rounded-xl border p-4 shadow-2xs transition-all space-y-3 ${bgClass}`}
      data-testid="active-rfq-action-required"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-xs font-black uppercase tracking-wider">
            ACTION REQUIRED
          </span>
        </div>
        <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold border ${badgeClass}`}>
          {type.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="space-y-1">
        <h2 className="text-sm font-bold leading-tight">
          {title}
        </h2>
        <p className="text-xs opacity-90 leading-relaxed">
          {description}
        </p>
      </div>

      <div className="pt-1">
        {isHashLink ? (
          <button
            type="button"
            onClick={onOpenExtendDeadline}
            className={`min-h-[48px] w-full sm:w-auto inline-flex items-center justify-center rounded-lg px-4 py-2 text-xs font-bold shadow-2xs transition mobile-touch-target ${btnClass}`}
            data-testid="action-required-button"
          >
            {actionLabel}
          </button>
        ) : (
          <Link
            to={actionUrl}
            className={`min-h-[48px] w-full sm:w-auto inline-flex items-center justify-center rounded-lg px-4 py-2 text-xs font-bold shadow-2xs transition mobile-touch-target ${btnClass}`}
            data-testid="action-required-button"
          >
            {actionLabel}
          </Link>
        )}
      </div>
    </section>
  );
}
