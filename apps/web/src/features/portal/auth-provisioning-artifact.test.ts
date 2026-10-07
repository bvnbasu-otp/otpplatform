import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deriveRegistrationOutcome } from './lib/registration-outcome';
import type { SignupResult } from './api/signup';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');

describe('signup provisioning is not authentication', () => {
  it('does not treat ONBOARDED as permission to sign in', () => {
    const result: SignupResult = {
      reference: 'REG-1',
      status: 'ONBOARDED',
      alreadySubmitted: false,
      autoApproved: true,
      side: 'BUYER',
      email: 'buyer@example.com',
      verificationChannel: 'EMAIL',
    };
    const outcome = deriveRegistrationOutcome(result, 'BUYER');
    expect(outcome.canSignInNow).toBe(false);
    expect(outcome.accountState).toBe('AUTH_SETUP_PENDING');
  });

  it('records email_confirmed_at at provision time and the web auth UI does not read it', () => {
    const sql = readFileSync(
      join(root, 'supabase/migrations/00212_reconcile_supplier_verification_buyer_addresses_and_self_service_signup.sql'),
      'utf8',
    );
    expect(sql).toContain('email_confirmed_at');
    const authDir = join(root, 'apps/web/src/features/auth');
    const files = ['canonical-auth.ts', 'user-role.ts', 'ProtectedRoute.tsx'];
    for (const file of files) {
      expect(readFileSync(join(authDir, file), 'utf8')).not.toContain('email_confirmed_at');
    }
  });
});
