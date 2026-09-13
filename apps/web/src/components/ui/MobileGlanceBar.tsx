import React from 'react';

export interface MobileGlanceBarProps {
  activeCount: number;
  actionRequiredCount: number;
  completedCount: number;
  selectedFilter: 'ALL' | 'ACTIVE' | 'ACTION_REQUIRED' | 'COMPLETED';
  onSelectFilter: (filter: 'ALL' | 'ACTIVE' | 'ACTION_REQUIRED' | 'COMPLETED') => void;
  className?: string;
}

export function MobileGlanceBar({
  activeCount,
  actionRequiredCount,
  completedCount,
  selectedFilter,
  onSelectFilter,
  className = '',
}: MobileGlanceBarProps) {
  return (
    <div
      className={`grid grid-cols-3 gap-2 select-none ${className}`}
      data-testid="mobile-glance-bar"
    >
      <button
        type="button"
        onClick={() => onSelectFilter(selectedFilter === 'ACTIVE' ? 'ALL' : 'ACTIVE')}
        className={`rounded-2xl border p-2.5 text-center transition-all ${
          selectedFilter === 'ACTIVE'
            ? 'border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500/30'
            : 'border-border bg-card hover:bg-muted/40'
        }`}
      >
        <span className="block text-base font-black font-mono text-emerald-600 dark:text-emerald-400">
          {activeCount}
        </span>
        <span className="text-[10px] font-bold text-foreground">🟢 Active</span>
      </button>

      <button
        type="button"
        onClick={() => onSelectFilter(selectedFilter === 'ACTION_REQUIRED' ? 'ALL' : 'ACTION_REQUIRED')}
        className={`rounded-2xl border p-2.5 text-center transition-all ${
          selectedFilter === 'ACTION_REQUIRED'
            ? 'border-amber-500 bg-amber-500/15 ring-2 ring-amber-500/30'
            : 'border-border bg-card hover:bg-muted/40'
        }`}
      >
        <span className="block text-base font-black font-mono text-amber-600 dark:text-amber-400">
          {actionRequiredCount}
        </span>
        <span className="text-[10px] font-bold text-foreground">🟡 Action</span>
      </button>

      <button
        type="button"
        onClick={() => onSelectFilter(selectedFilter === 'COMPLETED' ? 'ALL' : 'COMPLETED')}
        className={`rounded-2xl border p-2.5 text-center transition-all ${
          selectedFilter === 'COMPLETED'
            ? 'border-slate-500 bg-slate-500/15 ring-2 ring-slate-500/30'
            : 'border-border bg-card hover:bg-muted/40'
        }`}
      >
        <span className="block text-base font-black font-mono text-muted-foreground">
          {completedCount}
        </span>
        <span className="text-[10px] font-bold text-foreground">⚪ Settled</span>
      </button>
    </div>
  );
}
