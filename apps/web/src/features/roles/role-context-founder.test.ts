import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'api/roles.ts'), 'utf8');

describe('role context founder claim', () => {
  it('copies isFounder from the role-context payload and the profile fallback', () => {
    expect(source).toContain('isFounder: Boolean(payload.isFounder)');
    expect(source).toContain('isFounder: Boolean(profile.is_founder)');
    expect(source).toContain('is_founder, is_platform_admin');
  });

  it('supports CONSOLE active portal side and internal roles in fallback', () => {
    expect(source).toContain("active_portal_side === 'CONSOLE'");
    expect(source).toContain("code: 'SUPER_ADMIN'");
    expect(source).toContain("code: 'INTERNAL_OPERATOR'");
    expect(source).toContain("code: 'FINANCE_OPERATOR'");
  });

  it('enforces EULA agreement requirement before completing role onboarding', () => {
    const onboardingSource = readFileSync(resolve(__dirname, 'pages/RoleOnboardingPage.tsx'), 'utf8');
    expect(onboardingSource).toContain('onboarding-eula-checkbox');
    expect(onboardingSource).toContain('eulaAgreed');
    expect(onboardingSource).toContain('disabled={!chosen || !eulaAgreed}');
  });
});
