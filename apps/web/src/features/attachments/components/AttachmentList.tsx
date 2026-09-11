import { useState } from 'react';
import { AttachmentKind } from '@otp/domain';
import { signedUrlFor } from '../api/attachments';
import {
  formatDuration,
  formatSize,
  kindLabel,
  type Attachment,
} from '../types/attachment';

export interface AttachmentListProps {
  attachments: Attachment[];
  /** Omitted for the other party's files, who may look but not remove. */
  onRemove?: (attachment: Attachment) => void | Promise<void>;
  emptyMessage?: string;
  disabled?: boolean;
}

function iconFor(kind: AttachmentKind): string {
  switch (kind) {
    case AttachmentKind.VOICE_NOTE:
      return '🎙';
    case AttachmentKind.DRAWING:
      return '📐';
    case AttachmentKind.PHOTO:
      return '🖼';
    case AttachmentKind.HANDWRITTEN:
      return '✍';
    default:
      return '📄';
  }
}

/**
 * Shows whatever name the caller was allowed to see. Pre-reveal that is the
 * neutral "Drawing 1"; post-reveal the real filename appears beneath it. The
 * component never chooses between them — the view already did.
 */
export function AttachmentList({
  attachments,
  onRemove,
  emptyMessage = 'No files attached yet.',
  disabled,
}: AttachmentListProps) {
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open(attachment: Attachment) {
    setOpening(attachment.attachmentId);
    setError(null);
    const result = await signedUrlFor(attachment.storagePath);
    setOpening(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.open(result.url, '_blank', 'noopener,noreferrer');
  }

  if (attachments.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div>
      <ul className="divide-y rounded-md border" data-testid="attachment-list">
        {attachments.map((attachment) => {
          const duration = formatDuration(attachment.durationSeconds);
          return (
            <li
              key={attachment.attachmentId}
              className="flex items-center gap-3 px-3 py-2 text-sm"
            >
              <span aria-hidden="true">{iconFor(attachment.kind)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{attachment.displayName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {attachment.anonymousLabel && `${attachment.anonymousLabel} · `}
                  {kindLabel(attachment.kind)} · {formatSize(attachment.sizeBytes)}
                  {duration && ` · ${duration}`}
                  {attachment.originalFilename && ` · ${attachment.originalFilename}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void open(attachment)}
                disabled={opening === attachment.attachmentId}
                className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
              >
                {opening === attachment.attachmentId ? 'Opening…' : 'Open'}
              </button>
              {onRemove && (
                <button
                  type="button"
                  onClick={() => void onRemove(attachment)}
                  disabled={disabled}
                  className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-muted disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
