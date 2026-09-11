import { AttachmentKind, ATTACHMENT_KIND_LABELS } from '@otp/domain';

export interface Attachment {
  attachmentId: string;
  kind: AttachmentKind;
  /** Neutral label assigned server-side; safe to show any party at any stage. */
  displayName: string;
  /**
   * Only ever set on your own files, or on the other party's files after award
   * reveal. Filenames name companies, so an undefined here is deliberate.
   */
  originalFilename?: string;
  contentType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  storagePath: string;
  createdAt: string | null;
  /** Present on quote files a buyer reads while identities are protected. */
  anonymousLabel?: string;
}

export const ATTACHMENT_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/heic,application/pdf,text/plain,text/csv,' +
  'application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  'image/vnd.dwg,application/acad,image/vnd.dxf';

export const MAX_ATTACHMENT_MB = 25;

/**
 * A best guess at what a file is, so the buyer is not made to classify every
 * upload. Kind only drives the neutral label and the icon, so a wrong guess
 * costs nothing and the buyer can correct it.
 */
export function kindForFile(file: File): AttachmentKind {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  if (type.startsWith('audio/')) return AttachmentKind.VOICE_NOTE;
  if (/\.(dwg|dxf)$/.test(name) || type.includes('dwg') || type.includes('dxf')) {
    return AttachmentKind.DRAWING;
  }
  if (type.startsWith('image/')) {
    return /scan|note|sketch|hand/.test(name)
      ? AttachmentKind.HANDWRITTEN
      : AttachmentKind.PHOTO;
  }
  return AttachmentKind.DOCUMENT;
}

const EXTENSION_TYPES: Record<string, string> = {
  dwg: 'image/vnd.dwg',
  dxf: 'image/vnd.dxf',
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  csv: 'text/csv',
  txt: 'text/plain',
  webm: 'audio/webm',
  m4a: 'audio/x-m4a',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

/**
 * Browsers hand back an empty type for CAD files and a few others, and the
 * bucket's MIME allowlist rejects the octet-stream that results. The extension
 * is the only thing left to go on.
 */
export function contentTypeFor(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TYPES[extension] ?? 'application/octet-stream';
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function kindLabel(kind: AttachmentKind): string {
  return ATTACHMENT_KIND_LABELS[kind];
}
