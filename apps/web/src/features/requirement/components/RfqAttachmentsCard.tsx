import { Link } from 'react-router-dom';
import type { Attachment } from '@/features/attachments';

interface RfqAttachmentsCardProps {
  requirementId: string;
  attachments: Attachment[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconForKind(kind: string): string {
  switch (kind) {
    case 'DRAWING':
      return '📐';
    case 'BOQ':
      return '📊';
    case 'PHOTO':
      return '📷';
    case 'SPECIFICATION':
      return '📄';
    default:
      return '📎';
  }
}

export function RfqAttachmentsCard({
  requirementId,
  attachments,
}: RfqAttachmentsCardProps) {
  const count = attachments.length;

  return (
    <section
      className="rounded-xl border bg-card p-4 shadow-2xs space-y-3.5 transition-all text-foreground"
      data-testid="rfq-attachments-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="rounded-md bg-indigo-100 dark:bg-indigo-950/60 px-2 py-0.5 text-[10px] font-bold text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              4. Drawings, BoQ &amp; Files ({count})
            </span>
            <span className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              🔒 Metadata Stripped
            </span>
          </div>
          <h3 className="text-sm sm:text-base font-bold text-foreground">
            Technical Drawings &amp; BoQ Attachments
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Original buyer identity and author metadata are stripped prior to supplier transmission.
          </p>
        </div>

        <Link
          to={`/requirements/${requirementId}`}
          className="min-h-[48px] min-w-[48px] inline-flex items-center justify-center rounded-lg border bg-muted/30 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition mobile-touch-target shrink-0"
          title="Add or Edit Attachments"
        >
          <span>Edit Files ✎</span>
        </Link>
      </div>

      {count === 0 ? (
        <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground bg-muted/20">
          No drawings or BoQ files attached. Suppliers will quote based on the written scope description.
        </div>
      ) : (
        <div className="divide-y rounded-xl border bg-card/60">
          {attachments.map((att) => (
            <div
              key={att.attachmentId}
              className="flex items-center justify-between p-2.5 gap-2 hover:bg-muted/30 transition text-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-base shrink-0">{iconForKind(att.kind)}</span>
                <div className="min-w-0">
                  <p className="font-bold text-foreground truncate">
                    {att.originalFilename || att.displayName}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatSize(att.sizeBytes)} • {att.displayName}
                  </p>
                </div>
              </div>

              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border shrink-0">
                ✓ Ready
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
