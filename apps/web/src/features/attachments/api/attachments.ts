import type { AttachmentKind, AttachmentScope } from '@otp/domain';
import { supabase } from '@/lib/supabase';
import { contentTypeFor, type Attachment } from '../types/attachment';

const BUCKET = 'otp-attachments';

interface AttachmentRow {
  id?: string;
  attachment_id?: string;
  kind: string;
  display_name: string;
  original_filename?: string | null;
  content_type: string;
  size_bytes: number | string;
  duration_seconds: number | string | null;
  storage_path: string;
  created_at: string | null;
  anonymous_label?: string | null;
}

function toAttachment(row: AttachmentRow): Attachment {
  return {
    attachmentId: (row.attachment_id ?? row.id) as string,
    kind: row.kind as AttachmentKind,
    displayName: row.display_name,
    ...(row.original_filename ? { originalFilename: row.original_filename } : {}),
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes ?? 0),
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    storagePath: row.storage_path,
    createdAt: row.created_at,
    ...(row.anonymous_label ? { anonymousLabel: row.anonymous_label } : {}),
  };
}

const OWN_COLUMNS =
  'id, kind, display_name, original_filename, content_type, size_bytes, duration_seconds, storage_path, created_at';

export type AttachmentsResult =
  | { ok: true; attachments: Attachment[] }
  | { ok: false; error: string };

export interface UploadAttachmentInput {
  scope: AttachmentScope;
  requirementId?: string;
  quoteId?: string;
  file: File;
  kind: AttachmentKind;
  durationSeconds?: number;
}

export type UploadResult =
  | { ok: true; attachment: Attachment }
  | { ok: false; error: string };

/**
 * Three steps, in this order for a reason: the server mints the row and the
 * path (so the client never names a file after its own company), storage
 * accepts the bytes only because that row exists, and the confirm marks the
 * upload complete so half-finished rows are easy to find and sweep.
 */
export async function uploadAttachment(input: UploadAttachmentInput): Promise<UploadResult> {
  if (input.requirementId?.startsWith('local-')) {
    return { ok: false, error: 'Please save requirement before uploading attachments.' };
  }
  const { file } = input;
  const contentType = contentTypeFor(file);

  const { data: slot, error: slotErr } = await supabase.rpc('create_attachment_slot', {
    p_scope: input.scope,
    p_requirement_id: input.requirementId ?? null,
    p_quote_id: input.quoteId ?? null,
    p_kind: input.kind,
    p_original_filename: file.name,
    p_content_type: contentType,
    p_size_bytes: file.size,
    p_duration_seconds: input.durationSeconds ?? null,
  });

  if (slotErr) return { ok: false, error: slotErr.message };

  const reserved = slot as {
    attachment_id: string;
    storage_path: string;
    display_name: string;
  } | null;
  if (!reserved) return { ok: false, error: 'Upload could not be started' };

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(reserved.storage_path, file, { contentType, upsert: false });

  if (uploadErr) {
    // The metadata row would otherwise advertise a file that does not exist.
    await supabase.from('attachments').delete().eq('id', reserved.attachment_id);
    return { ok: false, error: uploadErr.message };
  }

  const { error: confirmErr } = await supabase.rpc('confirm_attachment_upload', {
    p_attachment_id: reserved.attachment_id,
    p_size_bytes: file.size,
  });

  if (confirmErr) return { ok: false, error: confirmErr.message };

  return {
    ok: true,
    attachment: {
      attachmentId: reserved.attachment_id,
      kind: input.kind,
      displayName: reserved.display_name,
      originalFilename: file.name,
      contentType,
      sizeBytes: file.size,
      durationSeconds: input.durationSeconds ?? null,
      storagePath: reserved.storage_path,
      createdAt: new Date().toISOString(),
    },
  };
}

/** Your own requirement files, filenames and all. */
export async function fetchRequirementAttachments(
  requirementId: string,
): Promise<AttachmentsResult> {
  if (!requirementId || requirementId.startsWith('local-')) {
    return { ok: true, attachments: [] };
  }
  const { data, error } = await supabase
    .from('attachments')
    .select(OWN_COLUMNS)
    .eq('requirement_id', requirementId)
    .order('created_at');

  if (error) return { ok: false, error: error.message };
  return { ok: true, attachments: (data as AttachmentRow[]).map(toAttachment) };
}

/** The buyer's requirement files as an invited supplier may see them. */
export async function fetchSharedRequirementAttachments(
  rfqId: string,
): Promise<AttachmentsResult> {
  const { data, error } = await supabase
    .from('requirement_attachments_shared')
    .select(
      'attachment_id, kind, display_name, content_type, size_bytes, duration_seconds, storage_path, created_at',
    )
    .eq('rfq_id', rfqId)
    .order('created_at');

  if (error) return { ok: false, error: error.message };
  return { ok: true, attachments: (data as AttachmentRow[]).map(toAttachment) };
}

/** Your own quote files, filenames and all. */
export async function fetchQuoteAttachments(quoteId: string): Promise<AttachmentsResult> {
  const { data, error } = await supabase
    .from('attachments')
    .select(OWN_COLUMNS)
    .eq('quote_id', quoteId)
    .order('created_at');

  if (error) return { ok: false, error: error.message };
  return { ok: true, attachments: (data as AttachmentRow[]).map(toAttachment) };
}

/**
 * Supplier quote files for the buyer side. Before reveal the view withholds
 * the filename and gives back a neutral label keyed to the supplier's alias;
 * after reveal the same call returns the real names.
 */
export async function fetchQuoteAttachmentsForBuyer(
  rfqId: string,
  revealed: boolean,
): Promise<AttachmentsResult> {
  const view = revealed ? 'quote_attachments_revealed' : 'quote_attachments_blind';
  const columns = revealed
    ? 'attachment_id, quote_id, anonymous_label, kind, display_name, original_filename, content_type, size_bytes, duration_seconds, storage_path, created_at'
    : 'attachment_id, quote_id, anonymous_label, kind, display_name, content_type, size_bytes, duration_seconds, storage_path, created_at';

  const { data, error } = await supabase
    .from(view)
    .select(columns)
    .eq('rfq_id', rfqId)
    .order('created_at');

  if (error) return { ok: false, error: error.message };
  return { ok: true, attachments: (data as unknown as AttachmentRow[]).map(toAttachment) };
}

export type SignedUrlResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Storage policies re-check can_read_attachment, so a path guessed from
 * another RFQ still mints nothing.
 */
export async function signedUrlFor(
  storagePath: string,
  expiresInSeconds = 300,
): Promise<SignedUrlResult> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error) return { ok: false, error: error.message };
  if (!data?.signedUrl) return { ok: false, error: 'Could not open this file' };
  return { ok: true, url: data.signedUrl };
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

export async function deleteAttachment(
  attachmentId: string,
  storagePath: string,
): Promise<DeleteResult> {
  const { error: storageErr } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (storageErr) return { ok: false, error: storageErr.message };

  const { error } = await supabase.from('attachments').delete().eq('id', attachmentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
