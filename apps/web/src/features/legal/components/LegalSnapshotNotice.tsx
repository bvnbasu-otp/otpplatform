import { useState } from 'react';

export type LegalSnapshotLoadPhase = 'loading' | 'ready' | 'error';

/** The frozen catalogue snapshot is the agreement a person accepts. */
export function LegalSnapshotNotice({
  version,
  documentHash,
  bodyText,
  published,
  loadPhase = 'ready',
  errorMessage,
}: {
  version: string;
  documentHash: string;
  bodyText: string | null;
  published: boolean;
  loadPhase?: LegalSnapshotLoadPhase;
  errorMessage?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (loadPhase === 'loading') {
    return (
      <div data-testid="legal-snapshot-notice" className="rounded-md border bg-background p-2">
        <p data-testid="legal-snapshot-loading" className="text-[11px] text-muted-foreground">
          Loading the frozen agreement from the server…
        </p>
      </div>
    );
  }

  if (loadPhase === 'error') {
    return (
      <div data-testid="legal-snapshot-notice" className="rounded-md border border-red-300 bg-red-50 p-2 dark:bg-red-950/30">
        <p data-testid="legal-snapshot-error" className="text-[11px] font-semibold text-red-800 dark:text-red-200" role="alert">
          {errorMessage || 'The agreement could not be loaded. Reload the page and try again.'}
        </p>
      </div>
    );
  }

  const canShowBody = published && bodyText;

  return (
    <div data-testid="legal-snapshot-notice" className="space-y-1 rounded-md border bg-background p-2">
      <p className="text-[11px] text-foreground">
        Frozen agreement version{' '}
        <span data-testid="legal-snapshot-version">{version || 'unpublished'}</span>
      </p>
      <p className="break-all font-mono text-[10px] text-muted-foreground" data-testid="legal-snapshot-hash">
        {documentHash || 'unpublished'}
      </p>
      {canShowBody ? (
        <div className="space-y-1">
          <pre
            data-testid="legal-snapshot-text"
            className={`overflow-auto whitespace-pre-wrap text-[11px] text-foreground ${
              expanded ? 'max-h-[min(70vh,32rem)]' : 'max-h-48'
            }`}
          >
            {bodyText}
          </pre>
          <button
            type="button"
            data-testid="legal-snapshot-expand-toggle"
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] font-semibold text-action hover:underline cursor-pointer"
          >
            {expanded ? 'Collapse agreement text' : 'Expand to read full agreement'}
          </button>
        </div>
      ) : (
        <p data-testid="legal-snapshot-unpublished" className="text-[11px] text-amber-800 dark:text-amber-200">
          The frozen text for this version is not published yet. Registration cannot record acceptance until the
          server publishes the frozen bytes. The public terms page is not this agreement.
        </p>
      )}
    </div>
  );
}
