import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

describe('Auth profile linkage parity (client vs otp-dispatch)', () => {
  it('fetchCurrentProfile and otp-dispatch use the same profile resolution keys', () => {
    const userRole = readFileSync(resolve(repoRoot, 'apps/web/src/features/auth/user-role.ts'), 'utf8');
    const dispatch = readFileSync(resolve(repoRoot, 'supabase/functions/otp-dispatch/index.ts'), 'utf8');

    expect(userRole).toContain('auth_user_id.eq.');
    expect(userRole).toContain('id.eq.');
    expect(userRole).toContain(".eq('email', authUser.email)");

    expect(dispatch).toContain('resolveProfileIdForAuthUser');
    expect(dispatch).toContain('auth_user_id.eq.');
    expect(dispatch).toContain('id.eq.');
    expect(dispatch).toMatch(/\.eq\('email',\s*email\)/);
  });
});
