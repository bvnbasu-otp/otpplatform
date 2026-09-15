import React from 'react';
import { Link } from 'react-router-dom';
import type { HomeActivityEvent } from '../types';

interface HomeActivityTimelineProps {
  events: HomeActivityEvent[];
  emptyMessage?: string;
}

export function HomeActivityTimeline({
  events,
  emptyMessage = 'No recent activity yet.',
}: HomeActivityTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-muted-foreground bg-card rounded-2xl border border-border/70 p-3">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/80 bg-card p-3 sm:p-4 shadow-2xs divide-y divide-border/60">
      {events.map((evt) => {
        const Content = (
          <div className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className="text-base shrink-0 select-none mt-0.5">{evt.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-foreground truncate">{evt.title}</h4>
                <span className="text-[10px] font-medium text-muted-foreground shrink-0">
                  {evt.relativeTime}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                {evt.description}
              </p>
            </div>
          </div>
        );

        if (evt.targetUrl) {
          return (
            <Link
              key={evt.id}
              to={evt.targetUrl}
              className="block hover:bg-muted/40 transition -mx-2 px-2 rounded-xl"
            >
              {Content}
            </Link>
          );
        }

        return <div key={evt.id}>{Content}</div>;
      })}
    </div>
  );
}
