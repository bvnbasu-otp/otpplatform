import React from 'react';
import { Link } from 'react-router-dom';

interface HomeEmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionUrl?: string;
  actionOnClick?: () => void;
}

export function HomeEmptyState({
  icon = '📦',
  title,
  description,
  actionLabel,
  actionUrl,
  actionOnClick,
}: HomeEmptyStateProps) {
  return (
    <div className="py-8 px-4 text-center bg-card rounded-2xl border border-border/80 shadow-2xs space-y-3">
      <span className="text-3xl block select-none">{icon}</span>
      <div className="space-y-1">
        <h3 className="text-sm font-extrabold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
          {description}
        </p>
      </div>

      {actionLabel && actionUrl && (
        <div className="pt-1">
          <Link
            to={actionUrl}
            className="min-h-[48px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2.5 text-xs font-extrabold shadow-sm active:scale-98 transition shadow-primary/20"
          >
            <span>+</span>
            <span>{actionLabel}</span>
          </Link>
        </div>
      )}

      {actionLabel && actionOnClick && !actionUrl && (
        <div className="pt-1">
          <button
            type="button"
            onClick={actionOnClick}
            className="min-h-[48px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2.5 text-xs font-extrabold shadow-sm active:scale-98 transition shadow-primary/20 cursor-pointer"
          >
            <span>+</span>
            <span>{actionLabel}</span>
          </button>
        </div>
      )}
    </div>
  );
}
