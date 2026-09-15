import React from 'react';
import { Link } from 'react-router-dom';

interface HomeSectionProps {
  title: string;
  icon?: string;
  count?: number;
  actionText?: string;
  actionUrl?: string;
  actionOnClick?: () => void;
  badge?: string;
  badgeColor?: string;
  children: React.ReactNode;
  className?: string;
}

export function HomeSection({
  title,
  icon,
  count,
  actionText,
  actionUrl,
  actionOnClick,
  badge,
  badgeColor = 'bg-primary/10 text-primary border-primary/20',
  children,
  className = '',
}: HomeSectionProps) {
  return (
    <section className={`space-y-2.5 ${className}`}>
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {icon && <span className="text-sm shrink-0">{icon}</span>}
          <h2 className="text-xs font-black uppercase tracking-wider text-foreground truncate">
            {title}
          </h2>
          {count !== undefined && (
            <span className="text-[11px] font-extrabold text-muted-foreground bg-muted/70 px-1.5 py-0.2 rounded-md shrink-0">
              {count}
            </span>
          )}
          {badge && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${badgeColor}`}>
              {badge}
            </span>
          )}
        </div>

        {actionText && actionUrl && (
          <Link
            to={actionUrl}
            className="text-[11px] font-bold text-primary hover:underline shrink-0 min-h-[48px] min-w-[48px] inline-flex items-center justify-center px-2 py-1 mobile-touch-target"
          >
            {actionText}
          </Link>
        )}

        {actionText && actionOnClick && !actionUrl && (
          <button
            type="button"
            onClick={actionOnClick}
            className="text-[11px] font-bold text-primary hover:underline shrink-0 min-h-[48px] min-w-[48px] inline-flex items-center justify-center px-2 py-1 cursor-pointer mobile-touch-target"
          >
            {actionText}
          </button>
        )}
      </div>

      <div className="space-y-2.5">
        {children}
      </div>
    </section>
  );
}
