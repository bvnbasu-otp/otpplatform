import React from 'react';

export function HomeSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Context Header Skeleton */}
      <div className="rounded-2xl border border-border/80 bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5 flex-1">
            <div className="h-3 w-32 bg-muted rounded" />
            <div className="h-5 w-48 bg-muted rounded" />
          </div>
          <div className="h-9 w-9 bg-muted rounded-xl shrink-0" />
        </div>
        <div className="pt-2 border-t border-border/60 flex items-center justify-between">
          <div className="h-3 w-40 bg-muted rounded" />
          <div className="h-3 w-16 bg-muted rounded" />
        </div>
      </div>

      {/* Primary Section Skeleton */}
      <div className="space-y-2.5">
        <div className="h-4 w-36 bg-muted rounded px-1" />
        <div className="rounded-2xl border border-border/80 bg-card p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1.5 flex-1">
              <div className="h-3 w-24 bg-muted rounded" />
              <div className="h-4 w-3/4 bg-muted rounded" />
            </div>
            <div className="h-4 w-16 bg-muted rounded-full" />
          </div>
          <div className="h-8 w-full bg-muted/60 rounded-xl" />
          <div className="h-10 w-full bg-muted rounded-xl" />
        </div>
      </div>

      {/* Secondary Section Skeleton */}
      <div className="space-y-2.5">
        <div className="h-4 w-36 bg-muted rounded px-1" />
        <div className="rounded-2xl border border-border/80 bg-card p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1.5 flex-1">
              <div className="h-3 w-28 bg-muted rounded" />
              <div className="h-4 w-2/3 bg-muted rounded" />
            </div>
            <div className="h-4 w-16 bg-muted rounded-full" />
          </div>
          <div className="h-10 w-full bg-muted/40 rounded-xl" />
          <div className="h-10 w-full bg-muted rounded-xl" />
        </div>
      </div>
    </div>
  );
}
