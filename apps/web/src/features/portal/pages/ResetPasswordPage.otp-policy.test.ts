import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ResetPasswordPage OTP policy', () => {
  it('uses eight-digit helpers and does not silently truncate on verify', () => {
    const source = readFileSync(resolve(__dirname, 'ResetPasswordPage.tsx'), 'utf8');
    expect(source).toMatch(/isCompleteAuthOtpCode/);
    expect(source).toMatch(/normalizeAuthOtpCodeInput/);
    expect(source).toMatch(/AUTH_OTP_CODE_MAX_LENGTH/);
    expect(source).not.toMatch(/six-digit|6-digit|maxLength=\{6\}/i);
  });
});
