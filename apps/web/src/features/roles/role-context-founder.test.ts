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
});
