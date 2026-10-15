import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const cwd = process.cwd();
const repoRoot = cwd.endsWith('apps/web') || cwd.endsWith('apps\\web')
  ? resolve(cwd, '../..')
  : cwd;

describe('dashboard refer-and-earn persona binding', () => {
  it('DashboardPage does not hardcode ReferAndEarnCard side="buyer"', () => {
    const pagePath = resolve(repoRoot, 'apps/web/src/pages/DashboardPage.tsx');
    const source = readFileSync(pagePath, 'utf8');
    expect(source).not.toMatch(/ReferAndEarnCard[\s\S]*?side="buyer"/);
    expect(source).toContain('side={referSide}');
    expect(source).toContain('useWalletEntitlement');
  });

  it('SupplierDashboardPage binds refer side from wallet entitlement hook', () => {
    const pagePath = resolve(repoRoot, 'apps/web/src/pages/SupplierDashboardPage.tsx');
    const source = readFileSync(pagePath, 'utf8');
    expect(source).toContain('side={referSide}');
    expect(source).not.toMatch(/side="supplier"/);
  });
});
