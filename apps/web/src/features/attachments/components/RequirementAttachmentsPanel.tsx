import { useEffect, useState } from 'react';
import { fetchRequirementAttachments } from '../api/attachments';
import type { Attachment } from '../types/attachment';
import { AttachmentList } from './AttachmentList';

export interface RequirementAttachmentsPanelProps {
  requirementId: string;
  title?: string;
}

/** The buyer's own requirement files, read-only, for screens after intake. */
export function RequirementAttachmentsPanel({
  requirementId,
  title = 'Files on this requirement',
}: RequirementAttachmentsPanelProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      const result = await fetchRequirementAttachments(requirementId);
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
  }, [requirementId]);

  if (!isLoading && !error && attachments.length === 0) return null;

  return (
    <section
      className="rounded-lg border bg-card p-4"
      data-testid="requirement-attachments-panel"
    >
      <h3 className="mb-1 font-medium">{title}</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Invited suppliers can open these, labelled neutrally.
      </p>
      {isLoading && <p className="text-sm text-muted-foreground">Loading Files…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!isLoading && !error && <AttachmentList attachments={attachments} />}
    </section>
  );
}
