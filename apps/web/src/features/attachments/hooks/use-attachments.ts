import { useCallback, useEffect, useState } from 'react';
import { AttachmentKind, AttachmentScope } from '@otp/domain';
import {
  deleteAttachment,
  fetchQuoteAttachments,
  fetchRequirementAttachments,
  uploadAttachment,
} from '../api/attachments';
import { kindForFile, type Attachment } from '../types/attachment';

export interface UseAttachmentsOptions {
  scope: AttachmentScope;
  /** Null until the draft requirement or the quote exists. */
  requirementId?: string | null;
  quoteId?: string | null;
}

export interface UseAttachments {
  attachments: Attachment[];
  isLoading: boolean;
  isUploading: boolean;
  error: string | null;
  add: (files: File[]) => Promise<void>;
  addVoiceNote: (file: File, durationSeconds: number) => Promise<void>;
  remove: (attachment: Attachment) => Promise<void>;
  reload: () => Promise<void>;
}

/** Owns the files for one requirement or one quote. */
export function useAttachments({
  scope,
  requirementId,
  quoteId,
}: UseAttachmentsOptions): UseAttachments {
  const targetId = scope === AttachmentScope.REQUIREMENT ? requirementId : quoteId;

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!targetId || targetId.startsWith('local-')) {
      setAttachments([]);
      setError(null);
      return;
    }
    setIsLoading(true);
    const result =
      scope === AttachmentScope.REQUIREMENT
        ? await fetchRequirementAttachments(targetId)
        : await fetchQuoteAttachments(targetId);
    setIsLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setAttachments(result.attachments);
  }, [scope, targetId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const upload = useCallback(
    async (file: File, kind: AttachmentKind, durationSeconds?: number) => {
      if (!targetId || targetId.startsWith('local-')) {
        setError('Please sign in or save requirement before attaching files.');
        return;
      }
      const result = await uploadAttachment({
        scope,
        ...(scope === AttachmentScope.REQUIREMENT
          ? { requirementId: targetId }
          : { quoteId: targetId }),
        file,
        kind,
        ...(durationSeconds === undefined ? {} : { durationSeconds }),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setAttachments((current) => [...current, result.attachment]);
    },
    [scope, targetId],
  );

  const add = useCallback(
    async (files: File[]) => {
      setIsUploading(true);
      // Sequential, so the server's "Drawing 1, Drawing 2" numbering matches
      // the order the buyer dropped them in.
      for (const file of files) {
        await upload(file, kindForFile(file));
      }
      setIsUploading(false);
    },
    [upload],
  );

  const addVoiceNote = useCallback(
    async (file: File, durationSeconds: number) => {
      setIsUploading(true);
      await upload(file, AttachmentKind.VOICE_NOTE, durationSeconds);
      setIsUploading(false);
    },
    [upload],
  );

  const remove = useCallback(async (attachment: Attachment) => {
    const result = await deleteAttachment(attachment.attachmentId, attachment.storagePath);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setAttachments((current) =>
      current.filter((a) => a.attachmentId !== attachment.attachmentId),
    );
  }, []);

  return { attachments, isLoading, isUploading, error, add, addVoiceNote, remove, reload };
}
