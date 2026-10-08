import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve('apps/web/src/features/portal/pages/LegalPage.tsx'), 'utf8');

describe('legal page pilot copy', () => {
  it('does not name Twilio or Meta as the live messaging provider', () => {
    expect(source).not.toContain('Twilio');
    expect(source).not.toContain('Meta');
    expect(source).toContain('provider configured for this deployment');
  });
});
