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

  it('uses qualified privacy wording rather than claiming blanket compliance', () => {
    expect(source).toContain('Privacy requests');
    expect(source).toContain('This page is not a certification');
    expect(source).toContain('Deletion is limited where a');
    expect(source).not.toContain('Your Rights (GDPR/DPDP Compliance)');
  });

  it('does not display developer review warnings or internal legal disclaimer banners', () => {
    expect(source).not.toContain('⚠️ Legal Review Required');
    expect(source).not.toContain('NOT final legal text');
    expect(source).not.toMatch(/Last updated:\s*\d/);
  });
});
