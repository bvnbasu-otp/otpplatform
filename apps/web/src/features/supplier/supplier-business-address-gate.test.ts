import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = resolve(__dirname, '../../..');
const repoRoot = resolve(__dirname, '../../../../..');

function read(path: string): string {
  return readFileSync(resolve(webRoot, path), 'utf8');
}

describe('supplier business address gate', () => {
  it('keeps buyer address-book copy and uses a supplier business-address panel', () => {
    const profile = read('src/features/profile/pages/ProfilePage.tsx');
    expect(profile).toContain('Address Book');
    expect(profile).toContain('SupplierBusinessAddressPanel');
    expect(profile).toContain("context.side === 'SUPPLIER' ? 'Business address' : 'Address Book'");
    expect(profile).toContain('data-testid="profile-language-preference"');
    expect(profile).toContain('<LanguageSwitcher variant="full" placement="menu" />');
  });

  it('blocks ordinary supplier workspace routes and leaves award onboarding outside the layout', () => {
    const gate = read('src/features/supplier/components/SupplierBusinessAddressGate.tsx');
    const app = read('src/App.tsx');
    const layout = read('src/components/AppLayout.tsx');
    expect(gate).toContain("pathname.startsWith('/profile')");
    expect(gate).toContain("pathname.startsWith('/supplier/award-onboarding')");
    expect(gate).toContain('isInternalOperatorContext');
    expect(layout).toContain('<SupplierBusinessAddressGate>');
    expect(app).toContain('path="/supplier/award-onboarding/:token"');
    const awardIndex = app.indexOf('path="/supplier/award-onboarding/:token"');
    const layoutIndex = app.indexOf('<AppLayout />');
    expect(awardIndex).toBeGreaterThan(-1);
    expect(layoutIndex).toBeGreaterThan(awardIndex);
  });

  it('uses the authorized address RPC and includes the promoted server guard', () => {
    const api = read('src/features/supplier/api/business-address.ts');
    const sql = readFileSync(resolve(repoRoot, 'supabase/migrations/00319_supplier_business_address_enforcement.sql'), 'utf8');
    expect(api).toContain("'upsert_supplier_business_address'");
    expect(api).not.toContain(".from('suppliers').update");
    expect(api).not.toContain('registered_address:');
    expect(sql).toContain('-- 00319: Supplier operating-address enforcement.');
    expect(sql).toContain('registered_address is intentionally absent');
    expect(sql).toContain('Internal operators cannot create customer requirements or orders');
    expect(sql).toContain('trg_quote_requires_business_address');
  });
});
