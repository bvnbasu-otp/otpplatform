import { Link } from 'react-router-dom';
import type { PilotDefinition } from '@/lib/pilots';

export interface PilotCardProps {
  pilot: PilotDefinition;
  isActive: boolean;
  onSelect: () => void;
}

export function PilotCard({ pilot, isActive, onSelect }: PilotCardProps) {
  return (
    <article
      className={`rounded-lg border p-4 transition-colors ${
        isActive ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'bg-card hover:bg-muted/30'
      }`}
      data-testid={`pilot-card-${pilot.number}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {pilot.label}
          </p>
          <h3 className="mt-1 font-medium">{pilot.requirementTitle}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{pilot.requirementSummary}</p>
        </div>
        <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
          {pilot.location}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <div>
          <dt className="inline">Buyer: </dt>
          <dd className="inline text-foreground">{pilot.orgName}</dd>
        </div>
        <div>
          <dt className="inline">Type: </dt>
          <dd className="inline text-foreground">{pilot.buyerType}</dd>
        </div>
        <div className="col-span-2">
          <dt className="inline">Identity-protected quotes: </dt>
          <dd className="inline text-foreground">{pilot.quoteSummary}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSelect}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
            isActive
              ? 'bg-primary text-primary-foreground'
              : 'border hover:bg-muted'
          }`}
        >
          {isActive ? 'Selected' : 'Select pilot'}
        </button>
        <Link
          to={`/requirements/${pilot.requirementId}`}
          className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
        >
          Requirement →
        </Link>
        <Link
          to={`/rfq/${pilot.rfqId}/evaluation`}
          className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          data-testid={`pilot-evaluation-${pilot.number}`}
        >
          Evaluation →
        </Link>
        <Link
          to={`/rfq/${pilot.rfqId}/committee`}
          className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
        >
          Vote →
        </Link>
        <Link
          to={`/rfq/${pilot.rfqId}/award`}
          className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
        >
          Award →
        </Link>
        <Link
          to={`/rfq/${pilot.rfqId}/reveal`}
          className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
        >
          Reveal →
        </Link>
      </div>
    </article>
  );
}
