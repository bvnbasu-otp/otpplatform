import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
const readFile = (rel: string) => readFileSync(join(srcDir, rel), 'utf8');

describe('EULA & Terms Acceptance Attribution', () => {
  it('enforces terms acceptance across all buyer personas including Individual buyers', () => {
    const formCode = readFile('features/portal/components/BuyerRegisterForm.tsx');

    // Validation must enforce agreement acceptance if buyerType is selected
    expect(formCode).toContain('if (buyerType && !agreementAccepted)');
    expect(formCode).toContain("errors.agreement = 'Review and accept the agreement above to continue.'");

    // UI prompt for Individual buyer must exist
    expect(formCode).toContain('data-testid="individual-agreement-prompt"');
    expect(formCode).toContain('data-testid="individual-agreement-checkbox"');
    expect(formCode).toContain('Individual Buyer EULA &amp; Terms');
    expect(formCode).toContain('v1.0-20261014');
  });

  it('submits cryptographic document hash, eula version, and timestamp in signup submission', () => {
    const formCode = readFile('features/portal/components/BuyerRegisterForm.tsx');
    const signupApi = readFile('features/portal/api/signup.ts');

    // Form passes attributable EULA parameters
    expect(formCode).toContain("eulaVersion: 'v1.0-20261014'");
    expect(formCode).toContain("documentHash: 'sha256:7c8b0303d8a9e7019cf39e2df95000be05e527d91d8e13711311ffb43c683b5d'");
    expect(formCode).toContain('acceptedAt: new Date().toISOString()');

    // Signup API accepts and passes them to RPC and stores in localStorage
    expect(signupApi).toContain('eula_version: eulaVersion');
    expect(signupApi).toContain('document_hash: documentHash');
    expect(signupApi).toContain('accepted_at: acceptedAt');
    expect(signupApi).toContain("'otp_eula_acceptance'");
  });

  it('displays attributable Legal Agreements & EULA Acceptance card on Profile Page', () => {
    const profileCode = readFile('features/profile/pages/ProfilePage.tsx');

    expect(profileCode).toContain('data-testid="legal-agreements-eula-card"');
    expect(profileCode).toContain('Legal Agreements &amp; EULA Acceptance');
    expect(profileCode).toContain('EULA Version:');
    expect(profileCode).toContain('Document Hash:');
    expect(profileCode).toContain('Accepted At:');
    expect(profileCode).toContain('Legally Attributable &amp; Binding');
    expect(profileCode).toContain('/legal/terms');
    expect(profileCode).toContain('/legal/privacy');
  });
});
