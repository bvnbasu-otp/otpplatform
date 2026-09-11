export const AttachmentScope = {
  REQUIREMENT: 'REQUIREMENT',
  QUOTE: 'QUOTE',
} as const;

export type AttachmentScope =
  (typeof AttachmentScope)[keyof typeof AttachmentScope];

export const AttachmentKind = {
  DRAWING: 'DRAWING',
  PHOTO: 'PHOTO',
  HANDWRITTEN: 'HANDWRITTEN',
  DOCUMENT: 'DOCUMENT',
  VOICE_NOTE: 'VOICE_NOTE',
} as const;

export type AttachmentKind =
  (typeof AttachmentKind)[keyof typeof AttachmentKind];

export const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  DRAWING: 'Drawing',
  PHOTO: 'Photo',
  HANDWRITTEN: 'Handwritten note',
  DOCUMENT: 'Document',
  VOICE_NOTE: 'Voice note',
};

/**
 * What the other party sees before reveal.
 *
 * The real filename is the leak nobody expects: "Sunrise Residency pump
 * room.jpg" names the buyer, and "Aqua Prime quotation.pdf" names the supplier.
 * Mirrors private.attachments_prepare, which assigns the stored value.
 */
export function neutralDisplayName(kind: AttachmentKind, sequence: number): string {
  return `${ATTACHMENT_KIND_LABELS[kind]} ${sequence}`;
}

/**
 * Strips identifiable company names, locations, and personal brands from filenames.
 * Replaces with anonymized canonical token when reveal status is PROTECTED or BLIND.
 */
export function sanitizeAttachmentFilename(
  originalFilename: string,
  kind: AttachmentKind,
  sequence: number,
  revealStatus: 'PROTECTED' | 'BLIND' | 'REVEALED' = 'PROTECTED',
  alias?: string,
): string {
  if (revealStatus === 'REVEALED') {
    return originalFilename.trim();
  }

  const dotIdx = originalFilename.lastIndexOf('.');
  const extension = dotIdx !== -1 ? originalFilename.slice(dotIdx).toLowerCase() : '';
  const label = alias ? `${alias}_${ATTACHMENT_KIND_LABELS[kind]}_${sequence}` : neutralDisplayName(kind, sequence);
  return `${label.replace(/\s+/g, '_')}${extension}`;
}

/**
 * Asserts that a rendered attachment payload contains zero forbidden metadata leaks.
 */
export function assertAttachmentPayloadIsProtected(
  metadata: Record<string, unknown>,
  forbiddenSupplierIdentities: string[] = [],
): { safe: boolean; leaks: string[] } {
  const leaks: string[] = [];
  const serialized = JSON.stringify(metadata).toLowerCase();

  for (const identity of forbiddenSupplierIdentities) {
    if (identity && identity.length > 2 && serialized.includes(identity.toLowerCase())) {
      leaks.push(`Supplier identity leak detected: "${identity}" found in attachment metadata`);
    }
  }

  // Check for common EXIF or unredacted user leaks
  const dangerousKeys = ['author', 'company', 'creator', 'gps', 'cameramodel', 'serialnumber'];
  for (const key of dangerousKeys) {
    if (key in metadata && metadata[key] != null && String(metadata[key]).trim().length > 0) {
      leaks.push(`Unsanitized EXIF/Document metadata key: "${key}"`);
    }
  }

  return { safe: leaks.length === 0, leaks };
}

export const SupplierVerificationStatus = {
  UNVERIFIED: 'UNVERIFIED',
  SELF_DECLARED: 'SELF_DECLARED',
  DOCUMENT_VERIFIED: 'DOCUMENT_VERIFIED',
  PLATFORM_VERIFIED: 'PLATFORM_VERIFIED',
} as const;

export type SupplierVerificationStatus =
  (typeof SupplierVerificationStatus)[keyof typeof SupplierVerificationStatus];
