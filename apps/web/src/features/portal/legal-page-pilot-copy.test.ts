import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const candidatePath = resolve('src/features/portal/pages/LegalPage.tsx');
const filePath = existsSync(candidatePath)
  ? candidatePath
  : resolve('apps/web/src/features/portal/pages/LegalPage.tsx');
const source = readFileSync(filePath, 'utf8');

describe('legal page pilot copy', () => {
  it('does not name Twilio or Meta as the live messaging provider', () => {
    expect(source).not.toContain('Twilio');
    expect(source).not.toContain('Meta');
    expect(source).toContain('provider configured for this deployment');
  });
});
