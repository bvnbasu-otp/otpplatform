import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
import {
  mapRpcPayloadToUiStatus,
  summarizeLiveBattery,
  RPC_IMPLEMENTED_TEST_IDS,
  isUnknownTestIdForLegacyRpc,
} from './lib/admin-test-suite-runner';
import { ALL_TEST_CASES } from './components/AdminTestSuiteRunner';

describe('Admin Test Center live RPC mapping', () => {
  it('never maps unknown or malformed RPC payloads to PASS', () => {
    expect(mapRpcPayloadToUiStatus(null).uiStatus).not.toBe('PASS');
    expect(mapRpcPayloadToUiStatus(undefined).uiStatus).toBe('FAIL');
    expect(mapRpcPayloadToUiStatus({ passed: true }).uiStatus).toBe('FAIL');
    expect(
      mapRpcPayloadToUiStatus({ passed: false, execution_status: 'NOT_IMPLEMENTED', error_message: 'x' })
        .uiStatus
    ).toBe('NOT_IMPLEMENTED');
    expect(mapRpcPayloadToUiStatus({ passed: true, execution_status: 'PASSED' }).uiStatus).toBe('PASS');
    expect(
      mapRpcPayloadToUiStatus({ passed: false, execution_status: 'BLOCKED', error_message: 'blocked' }).uiStatus
    ).toBe('BLOCKED');
    expect(mapRpcPayloadToUiStatus(null, { message: 'denied' }).uiStatus).toBe('FAIL');
  });

  it('computes pass rate only over executed tests and excludes blocked as passes', () => {
    const results = new Map<string, { status: 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_IMPLEMENTED' }>([
      ['SEC-001', { status: 'PASS' }],
      ['SEC-002', { status: 'BLOCKED' }],
      ['SEC-006', { status: 'NOT_IMPLEMENTED' }],
    ]);
    const summary = summarizeLiveBattery(['SEC-001', 'SEC-002', 'SEC-006', 'SEC-007'], results);
    expect(summary.executedCount).toBe(3);
    expect(summary.notRunCount).toBe(1);
    expect(summary.passedCount).toBe(1);
    expect(summary.passRatePercent).toBe(33.3);
    expect(summary.goLiveReady).toBe(false);
  });

  it('flags UI-only test IDs missing from legacy RPC branch list', () => {
    expect(isUnknownTestIdForLegacyRpc('SEC-006')).toBe(true);
    expect(isUnknownTestIdForLegacyRpc('SEC-001')).toBe(false);
    expect(RPC_IMPLEMENTED_TEST_IDS).toHaveLength(25);
  });

  it('keeps live UI probe catalog at 38 IDs with 13 beyond legacy SQL branches', () => {
    expect(ALL_TEST_CASES).toHaveLength(38);
    const uiIds = ALL_TEST_CASES.map((t) => t.id);
    const withoutBranch = uiIds.filter((id) => isUnknownTestIdForLegacyRpc(id));
    expect(withoutBranch).toHaveLength(13);
  });
});

describe('Migration 00261 (static authorization & unknown-ID guards)', () => {
  const migrationPath = path.join(
    repoRoot,
    'supabase/migrations/00261_admin_run_test_case_truthful_execution_and_auth.sql'
  );
  /** Pinned at e8f5e95 formalization; Golden Reconstruction drafts are *.sql gitignored (CI-safe). */
  const FORMAL_00261_SHA256 =
    'E5FA35856B9EA0BF546EBF625A668CE6A3D757E8FB43E5BED2ADFCD2BC263C79';

  it('formal migration SHA256 matches release-pinned digest', () => {
    const bytes = fs.readFileSync(migrationPath);
    // Normalize CRLF to LF so the release-pinned digest does not depend on Windows checkout line endings.
    const canonicalContent = bytes.toString('utf8').replace(/\r\n/g, '\n');
    const digest = createHash('sha256')
      .update(canonicalContent, 'utf8')
      .digest('hex')
      .toUpperCase();
    expect(digest).toBe(FORMAL_00261_SHA256);
  });

  it('removes anon/authenticated bypass and auto-pass ELSE', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toContain("COALESCE(auth.role(), '') = 'service_role'");
    expect(sql).not.toMatch(/auth\.role\(\)\s*=\s*'anon'/);
    expect(sql).not.toMatch(/auth\.role\(\)\s*=\s*'authenticated'/);
    expect(sql).toContain("'NOT_IMPLEMENTED'");
    expect(sql).not.toContain("'status', 'PASSED'");
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.admin_run_test_case');
  });

  it('declares v_execution_status in the function DECLARE block', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/DECLARE[\s\S]*?v_execution_status\s+text/);
  });

  it('marks schema-only identity and integration probes as BLOCKED NOT_VERIFIED', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    for (const probe of ['ID-001', 'ID-002', 'ID-005', 'INT-008'] as const) {
      const branch = sql.slice(sql.indexOf(`WHEN '${probe}'`));
      expect(branch, probe).toContain("'BLOCKED'");
      expect(branch.slice(0, 1200), probe).toMatch(/NOT_VERIFIED/);
    }
  });

  it('requires both rfq_phase and requirement_status enums for UNIT-001', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    const branch = sql.slice(sql.indexOf("WHEN 'UNIT-001'"));
    expect(branch).toContain('rfq_phase');
    expect(branch).toContain('requirement_status');
    expect(branch).toMatch(/IF v_count < 2/);
  });
});
