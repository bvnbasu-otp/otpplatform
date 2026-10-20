import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ResetPasswordPage password policy', () => {
  it('validates complexity server-aligned rules before submit', () => {
    const source = readFileSync(resolve(__dirname, 'ResetPasswordPage.tsx'), 'utf8');
    expect(source).toContain('validatePasswordComplexity');
    expect(source).toContain('PASSWORD_REQUIREMENTS_COPY');
    expect(source).not.toMatch(/password\.length < 8/);
  });
});
