import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('dashboard refer-and-earn persona binding', () => {
  it('DashboardPage does not hardcode ReferAndEarnCard side="buyer"', () => {
    const path = resolve(process.cwd(), 'apps/web/src/pages/DashboardPage.tsx');
    const source = readFileSync(path, 'utf8');
    expect(source).not.toMatch(/ReferAndEarnCard[\s\S]*?side="buyer"/);
    expect(source).toContain('side={referSide}');
    expect(source).toContain('useWalletEntitlement');
  });

  it('SupplierDashboardPage binds refer side from wallet entitlement hook', () => {
    const path = resolve(process.cwd(), 'apps/web/src/pages/SupplierDashboardPage.tsx');
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('side={referSide}');
    expect(source).not.toMatch(/side="supplier"/);
  });
});
