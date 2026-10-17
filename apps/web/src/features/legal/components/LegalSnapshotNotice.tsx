/** The frozen catalogue snapshot is the agreement a person accepts. */
export function LegalSnapshotNotice({
  version,
  documentHash,
  bodyText,
  published,
}: {
  version: string;
  documentHash: string;
  bodyText: string | null;
  published: boolean;
}) {
  return (
    <div data-testid="legal-snapshot-notice" className="space-y-1 rounded-md border bg-background p-2">
      <p className="text-[11px] text-foreground">
        Frozen agreement version{' '}
        <span data-testid="legal-snapshot-version">{version || 'unpublished'}</span>
      </p>
      <p className="break-all font-mono text-[10px] text-muted-foreground" data-testid="legal-snapshot-hash">
        {documentHash || 'unpublished'}
      </p>
      {published && bodyText ? (
        <pre
          data-testid="legal-snapshot-text"
          className="max-h-40 overflow-auto whitespace-pre-wrap text-[11px] text-foreground"
        >
          {bodyText}
        </pre>
      ) : (
        <p data-testid="legal-snapshot-unpublished" className="text-[11px] text-amber-800">
          The frozen text for this version is not published. The public terms page is not this agreement.
        </p>
      )}
    </div>
  );
}
