import { describe, expect, it } from 'vitest';
import {
  sanitizeAttachmentFilename,
  assertAttachmentPayloadIsProtected,
  neutralDisplayName,
} from '@otp/domain';

describe('Attachment Anti-Leak Tokenization & EXIF Protection', () => {
  it('anonymizes quote attachment filenames during PROTECTED evaluation', () => {
    const rawSupplierUpload = 'Acme_Paint_Pvt_Ltd_Commercial_Offer_Tower3.pdf';
    const sanitized = sanitizeAttachmentFilename(
      rawSupplierUpload,
      'DOCUMENT',
      1,
      'PROTECTED',
      'Supplier-204',
    );

    expect(sanitized).toBe('Supplier-204_Document_1.pdf');
    expect(sanitized).not.toContain('Acme');
    expect(sanitized).not.toContain('Paint');
  });

  it('preserves original filenames after formal award REVEALED state', () => {
    const rawSupplierUpload = 'Acme_Paint_Pvt_Ltd_Commercial_Offer_Tower3.pdf';
    const postAward = sanitizeAttachmentFilename(
      rawSupplierUpload,
      'DOCUMENT',
      1,
      'REVEALED',
      'Supplier-204',
    );

    expect(postAward).toBe('Acme_Paint_Pvt_Ltd_Commercial_Offer_Tower3.pdf');
  });

  it('detects and flags supplier identity leaks in attachment metadata', () => {
    const dirtyMetadata = {
      author: 'John Doe - Acme Paints Bangalore',
      company: 'Acme Coatings India Ltd',
      cameraModel: 'iPhone 15 Pro',
      gps: '12.9716 N, 77.5946 E',
    };

    const result = assertAttachmentPayloadIsProtected(dirtyMetadata, ['Acme Paints', 'John Doe']);
    expect(result.safe).toBe(false);
    expect(result.leaks.length).toBeGreaterThan(0);
  });

  it('verifies clean sanitized attachment metadata passes all anti-leak policies', () => {
    const cleanMetadata = {
      pageCount: 4,
      fileSizeBytes: 245120,
      contentType: 'application/pdf',
      tokenizedName: 'Supplier-101_Document_1.pdf',
    };

    const result = assertAttachmentPayloadIsProtected(cleanMetadata, ['Acme Paints', 'John Doe']);
    expect(result.safe).toBe(true);
    expect(result.leaks).toEqual([]);
  });

  it('generates consistent neutral display names for all attachment kinds', () => {
    expect(neutralDisplayName('DRAWING', 2)).toBe('Drawing 2');
    expect(neutralDisplayName('PHOTO', 3)).toBe('Photo 3');
    expect(neutralDisplayName('VOICE_NOTE', 1)).toBe('Voice note 1');
    expect(neutralDisplayName('HANDWRITTEN', 1)).toBe('Handwritten note 1');
  });
});
