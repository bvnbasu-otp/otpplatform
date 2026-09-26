import React from 'react';
import { resolveOrganizationCharter } from '../lib/organization-charter';

export interface OrganizationCharterPanelProps {
  orgType?: string | null;
  organizationName?: string | null;
  isSupplier?: boolean;
  className?: string;
}

export function OrganizationCharterPanel({
  orgType,
  organizationName,
  isSupplier = false,
  className = '',
}: OrganizationCharterPanelProps) {
  const charter = resolveOrganizationCharter(orgType, isSupplier);

  return (
    <section
      className={`rounded-2xl border bg-card p-5 shadow-2xs ${className}`}
      data-testid="organization-charter"
      data-persona={charter.persona}
      aria-labelledby="organization-charter-title"
    >
      <h3 id="organization-charter-title" className="text-base font-bold text-foreground">
        {charter.title}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {organizationName ? `${organizationName}: ` : ''}
        {charter.summary}
      </p>

      <ol className="mt-4 space-y-3">
        {charter.clauses.map((clause, index) => (
          <li key={clause.id} className="text-xs" data-clause={clause.id}>
            <span className="font-semibold text-foreground">
              {index + 1}. {clause.title}.
            </span>{' '}
            <span className="text-muted-foreground">{clause.body}</span>
          </li>
        ))}
      </ol>

      <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
        {charter.acceptanceNote}
      </p>
    </section>
  );
}
