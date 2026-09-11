import { useEffect, useState } from 'react';
import { fetchQuoteAttachmentsForBuyer } from '../api/attachments';
import type { Attachment } from '../types/attachment';
import { AttachmentList } from './AttachmentList';

export interface QuoteAttachmentsPanelProps {
  rfqId: string;
  /** Drives which view is read, and so whether filenames come back at all. */
  revealed: boolean;
}

/**
 * Supplier files as the buyer and committee may see them, grouped by the
 * supplier's alias.
 *
 * Before reveal the rows carry neutral names and nothing else; after reveal the
 * same call returns the real filenames. The switch lives in the database view,
 * not here, so no component can be talked into showing the wrong one.
 */
export function QuoteAttachmentsPanel({ rfqId, revealed }: QuoteAttachmentsPanelProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      const result = await fetchQuoteAttachmentsForBuyer(rfqId, revealed);
      if (cancelled) return;
      setIsLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setAttachments(result.attachments);
    })();
    return () => {
      cancelled = true;
    };
  }, [rfqId, revealed]);

  const bySupplier = new Map<string, Attachment[]>();
  for (const attachment of attachments) {
    const key = attachment.anonymousLabel ?? 'Supplier';
    bySupplier.set(key, [...(bySupplier.get(key) ?? []), attachment]);
  }

  return (
    <section className="rounded-lg border bg-card p-4" data-testid="quote-attachments-panel">
      <div className="mb-3">
        <h3 className="font-medium">Files from Suppliers</h3>
        <p className="text-xs text-muted-foreground">
          {revealed
            ? 'Award revealed — original filenames are now visible.'
            : 'Neutral labels only. Filenames are withheld until the award is revealed.'}
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading files…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!isLoading && !error && attachments.length === 0 && (
        <p className="text-xs text-muted-foreground">No quoting supplier has attached a file.</p>
      )}

      <div className="space-y-4">
        {[...bySupplier.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([label, files]) => (
            <div key={label}>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <AttachmentList attachments={files} />
            </div>
          ))}
      </div>
    </section>
  );
}
