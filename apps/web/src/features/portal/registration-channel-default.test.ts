import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const portalRoot = resolve(__dirname);

describe('registration verification channel defaults', () => {
  it('buyer and supplier register forms default to EMAIL', () => {
    for (const file of ['components/BuyerRegisterForm.tsx', 'components/SupplierRegisterForm.tsx']) {
      const source = readFileSync(resolve(portalRoot, file), 'utf8');
      expect(source).toMatch(/useState<VerificationChannel>\('EMAIL'\)/);
      expect(source).not.toMatch(/useState<VerificationChannel>\('WHATSAPP'\)/);
    }
  });

  it('submit_signup_request RPC still defaults verification_channel to EMAIL when omitted', () => {
    const migration = readFileSync(
      resolve(portalRoot, '../../../../../supabase/migrations/00246_buyer_signup_allowlist_and_reveal_po_guard.sql'),
      'utf8',
    );
    expect(migration).toMatch(
      /COALESCE\(NULLIF\(p_request->>'verification_channel', ''\), 'EMAIL'\)/,
    );
  });
});
