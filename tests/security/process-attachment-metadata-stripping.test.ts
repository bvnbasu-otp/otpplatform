import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const fn = readFileSync(resolve(ROOT, 'supabase/functions/process-attachment/index.ts'), 'utf8');
const client = readFileSync(resolve(ROOT, 'apps/web/src/features/attachments/api/attachments.ts'), 'utf8');

describe('process-attachment strips metadata in the real bucket (static review)', () => {
  it('reads and writes the same storage bucket the web client uploads to', () => {
    const clientBucket = client.match(/const BUCKET = '([^']+)'/)?.[1];
    expect(clientBucket).toBe('otp-attachments');
    expect(fn).toContain(`const ATTACHMENTS_BUCKET = '${clientBucket}';`);
    expect(fn).not.toMatch(/storage\s*\.from\('attachments'\)/);
    expect(fn.match(/storage\s*\.from\(ATTACHMENTS_BUCKET\)/g)).toHaveLength(2);
  });

  it('accepts only the service-role caller, compared in constant time', () => {
    expect(fn).toContain("import { timingSafeEqual } from '../_shared/messaging/crypto.ts';");
    expect(fn).toMatch(/timingSafeEqual\(bearer, supabaseKey\)/);
    expect(fn).toContain("jsonResponse({ success: false, error: 'Forbidden' }, 403)");
    const guard = fn.indexOf("'Forbidden'");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(fn.indexOf('await req.json()'));
  });

  it('takes the storage path and content type from the attachment row, not the request body', () => {
    expect(fn).toMatch(/const \{ attachmentId \}: ProcessAttachmentRequest = await req\.json\(\);/);
    expect(fn).toMatch(/\.select\('storage_path, content_type'\)/);
    expect(fn).toContain('const storagePath: string = attachment.storage_path;');
    expect(fn).not.toMatch(/\{[^}]*storagePath[^}]*\}\s*:\s*ProcessAttachmentRequest/);
  });
});
