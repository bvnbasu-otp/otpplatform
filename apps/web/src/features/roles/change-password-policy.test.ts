import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ChangePasswordModal password policy wiring', () => {
  it('uses domain complexity validation and secure RPC', () => {
    const source = readFileSync(resolve(__dirname, 'components/ChangePasswordModal.tsx'), 'utf8');
    expect(source).toContain('validatePasswordComplexity');
    expect(source).toContain('changePasswordSecure');
    expect(source).toContain('current-password');
    expect(source).not.toContain('updatePassword(');
  });
});
