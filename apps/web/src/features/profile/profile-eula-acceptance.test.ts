import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const readFile = (file: string) => readFileSync(join(currentDir, file), 'utf8');

describe('ProfilePage EULA Acceptance Attribution', () => {
  it('renders server-sourced Legal Agreements & EULA Acceptance records', () => {
    const profileCode = readFile('pages/ProfilePage.tsx');
    expect(profileCode).toContain('data-testid="legal-agreements-eula-card"');
    expect(profileCode).toContain('Legal Agreements &amp; EULA Acceptance');
    expect(profileCode).toContain('Current Version:');
    expect(profileCode).toContain('Document Hash:');
    expect(profileCode).toContain('Accepted At:');
    expect(profileCode).toContain('fetchLegalAcceptanceStatus');
    // The record is never implied: no static "Recorded"/"Binding" claim.
    expect(profileCode).not.toContain('Legally Attributable &amp; Binding');
    expect(profileCode).not.toContain('otp_eula_acceptance');
  });

  it('provides navigation links to official Terms and Privacy documents', () => {
    const profileCode = readFile('pages/ProfilePage.tsx');
    expect(profileCode).toContain('to="/legal/terms"');
    expect(profileCode).toContain('to="/legal/privacy"');
  });
});
