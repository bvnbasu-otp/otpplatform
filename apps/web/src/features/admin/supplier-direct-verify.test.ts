import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * suppliers.verification_status is text constrained to the lifecycle
 * vocabulary (00212). The reveal and PO gates require
 * lifecycle_state = 'VERIFIED' AND verification_status = 'VERIFIED', so the
 * admin console's direct verify must write both; the legacy enum labels are
 * rejected by the column's CHECK constraint.
 */
describe('admin direct supplier verification', () => {
  const source = readFileSync(
    resolve(__dirname, 'components/AdminUsersActivityPanel.tsx'),
    'utf8',
  );
  const start = source.indexOf('const handleDirectVerifyOrg');
  const block = source.slice(start, source.indexOf("from('organizations')", start));

  it('writes the lifecycle vocabulary the reveal and PO gates check', () => {
    expect(start).toBeGreaterThan(-1);
    expect(block).toContain(".from('suppliers')");
    expect(block).toMatch(/verification_status:\s*'VERIFIED'/);
    expect(block).toMatch(/lifecycle_state:\s*'VERIFIED'/);
    expect(block).toMatch(/verified_at:/);
  });

  it('never writes a legacy supplier_verification_status label', () => {
    expect(source).not.toMatch(/'PLATFORM_VERIFIED'|'DOCUMENT_VERIFIED'|'SELF_DECLARED'|'UNVERIFIED'/);
  });

  it('surfaces a failed update instead of reporting success', () => {
    expect(block).toMatch(/if \(error\) throw error;/);
  });
});
