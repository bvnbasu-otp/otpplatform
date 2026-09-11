import type { AttachmentScope } from '@otp/domain';
import { FileDropzone } from '@/components/ui/FileDropzone';
import { VoiceRecorder } from '@/components/ui/VoiceRecorder';
import { useAttachments } from '../hooks/use-attachments';
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENT_MB } from '../types/attachment';
import { AttachmentList } from './AttachmentList';

export interface AttachmentUploaderProps {
  scope: AttachmentScope;
  requirementId?: string | null;
  quoteId?: string | null;
  label?: string;
  hint?: string;
  /** Voice notes suit describing a problem; they suit pricing one less well. */
  allowVoiceNote?: boolean;
  disabled?: boolean;
}

/**
 * Files for a requirement or a quote.
 *
 * Nothing here is named by the uploader: the server assigns both the storage
 * path and the neutral display name, so the other party sees "Drawing 1"
 * rather than a filename that gives the company away.
 */
export function AttachmentUploader({
  scope,
  requirementId,
  quoteId,
  label = 'Drawings, photos, or a scan of a handwritten note',
  hint = 'The other side sees these as "Drawing 1", never your filename.',
  allowVoiceNote = true,
  disabled,
}: AttachmentUploaderProps) {
  const { attachments, isUploading, error, add, addVoiceNote, remove } = useAttachments({
    scope,
    requirementId: requirementId ?? null,
    quoteId: quoteId ?? null,
  });

  const targetMissing = !(requirementId ?? quoteId);
  const busy = disabled || isUploading || targetMissing;

  return (
    <div className="space-y-3" data-testid="attachment-uploader">
      <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
        🔒 <strong>Identity Protection:</strong> Upload technical drawings, datasheets, or photos. Do not include company letterheads, contact numbers, or logos. Files are shared anonymously under neutral labels (&ldquo;Document 1&rdquo;, &ldquo;Drawing 1&rdquo;).
      </div>
      <FileDropzone
        label={label}
        hint={hint}
        accept={ATTACHMENT_ACCEPT}
        maxSizeMb={MAX_ATTACHMENT_MB}
        disabled={busy}
        onFilesSelected={(files) => void add(files)}
      />

      {allowVoiceNote && (
        <VoiceRecorder
          disabled={busy}
          onRecorded={(file, seconds) => void addVoiceNote(file, seconds)}
        />
      )}

      {isUploading && <p className="text-xs text-muted-foreground">Uploading…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}

      <AttachmentList
        attachments={attachments}
        onRemove={(attachment) => remove(attachment)}
        disabled={disabled}
      />
    </div>
  );
}
