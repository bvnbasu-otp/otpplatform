import { describe, expect, it } from 'vitest';
import { AttachmentKind } from '@otp/domain';
import { formatDuration, formatSize, kindForFile } from './attachment';

function fileNamed(name: string, type: string): File {
  return new File(['x'], name, { type });
}

describe('kindForFile', () => {
  it('treats a recording as a voice note whatever it is called', () => {
    expect(kindForFile(fileNamed('voice-note-1738.webm', 'audio/webm'))).toBe(
      AttachmentKind.VOICE_NOTE,
    );
  });

  it('recognises a CAD file by extension when the browser gives no type', () => {
    expect(kindForFile(fileNamed('pump-base.dxf', ''))).toBe(AttachmentKind.DRAWING);
  });

  it('reads a scanned note as handwritten rather than a photo', () => {
    expect(kindForFile(fileNamed('scan of site note.jpg', 'image/jpeg'))).toBe(
      AttachmentKind.HANDWRITTEN,
    );
    expect(kindForFile(fileNamed('pump room.jpg', 'image/jpeg'))).toBe(
      AttachmentKind.PHOTO,
    );
  });

  it('falls back to document for anything else', () => {
    expect(kindForFile(fileNamed('spec.pdf', 'application/pdf'))).toBe(
      AttachmentKind.DOCUMENT,
    );
  });
});

describe('formatting', () => {
  it('scales sizes to the unit a person would use', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(2048)).toBe('2 KB');
    expect(formatSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });

  it('shows a recording length as minutes and seconds', () => {
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(9)).toBe('0:09');
  });

  it('gives nothing back for a file that has no duration', () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(0)).toBeNull();
  });
});
