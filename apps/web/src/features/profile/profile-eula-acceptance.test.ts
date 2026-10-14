import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const readFile = (file: string) => readFileSync(join(currentDir, file), 'utf8');

describe('ProfilePage EULA Acceptance Attribution', () => {
  it('renders attributable Legal Agreements & EULA Acceptance section', () => {
    const profileCode = readFile('pages/ProfilePage.tsx');
    expect(profileCode).toContain('data-testid="legal-agreements-eula-card"');
    expect(profileCode).toContain('Legal Agreements &amp; EULA Acceptance');
    expect(profileCode).toContain('EULA Version:');
    expect(profileCode).toContain('Document Hash:');
    expect(profileCode).toContain('Accepted At:');
    expect(profileCode).toContain('Legally Attributable &amp; Binding');
  });

  it('provides navigation links to official Terms and Privacy documents', () => {
    const profileCode = readFile('pages/ProfilePage.tsx');
    expect(profileCode).toContain('to="/legal/terms"');
    expect(profileCode).toContain('to="/legal/privacy"');
  });
});
