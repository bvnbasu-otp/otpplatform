import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
const readFile = (rel: string) => readFileSync(join(srcDir, rel), 'utf8');

/**
 * Acceptance is authoritative only on the server (migration 00276). These
 * checks pin the client contract; database outcomes are asserted in
 * tests/security/legal-acceptance-00276.test.ts.
 */
describe('EULA acceptance - client contract (server is authoritative)', () => {
  it('requires acceptance for every buyer persona and for suppliers before submitting', () => {
    const buyer = readFile('features/portal/components/BuyerRegisterForm.tsx');
    const supplier = readFile('features/portal/components/SupplierRegisterForm.tsx');

    expect(buyer).toContain('if (buyerType && !agreementAccepted)');
    expect(buyer).toContain('data-testid="individual-agreement-checkbox"');
    expect(supplier).toContain('data-testid="supplier-agreement-checkbox"');
    expect(supplier).toContain('if (!agreementAccepted)');
  });

  it('sends the displayed catalogue version, never a hard-coded version, hash or timestamp', () => {
    const buyer = readFile('features/portal/components/BuyerRegisterForm.tsx');
    const supplier = readFile('features/portal/components/SupplierRegisterForm.tsx');
    const signupApi = readFile('features/portal/api/signup.ts');

    for (const source of [buyer, supplier, signupApi]) {
      expect(source).not.toContain('v1.0-20261014');
      expect(source).not.toMatch(/sha256:[0-9a-f]{64}/);
      expect(source).not.toMatch(/acceptedAt/);
    }
    expect(signupApi).toContain('eula_accepted: true');
    expect(signupApi).toContain('eula_version: input.eulaVersion');
    expect(signupApi).not.toContain('accepted_at');
  });

  it('does not keep acceptance evidence in browser storage', () => {
    const signupApi = readFile('features/portal/api/signup.ts');
    const profile = readFile('features/profile/pages/ProfilePage.tsx');
    expect(signupApi).not.toContain('otp_eula_acceptance');
    expect(profile).not.toContain('otp_eula_acceptance');
  });

  it('shows acceptance records from the server on the Profile page', () => {
    const profile = readFile('features/profile/pages/ProfilePage.tsx');
    expect(profile).toContain('data-testid="legal-agreements-eula-card"');
    expect(profile).toContain('fetchLegalAcceptanceStatus');
    expect(profile).not.toContain('Legally Attributable &amp; Binding');
  });

  it('gates protected routes on the server-side acceptance status', () => {
    const route = readFile('features/auth/ProtectedRoute.tsx');
    const gate = readFile('features/legal/components/LegalAcceptanceGate.tsx');
    expect(route).toContain('<LegalAcceptanceGate>');
    expect(gate).toContain('fetchLegalAcceptanceStatus');
    expect(gate).toContain('acceptLegalAgreement');
  });
});
