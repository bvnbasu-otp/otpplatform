import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const DRAFT = resolve(
  __dirname,
  '../../OTP Golden Reconstruction/MIGRATION_00262_ADMIN_RUN_DIAGNOSTIC_QUERY_ALLOWLIST_DRAFT.sql'
);
const FORMAL = resolve(
  __dirname,
  '../../supabase/migrations/00262_admin_run_diagnostic_query_allowlist_hardening.sql'
);
const LEGACY = resolve(__dirname, '../../supabase/migrations/00074_robust_sql_terminal_execution.sql');

/** Extract WHEN 'op' branches from the draft CASE block. */
function extractAllowlistedOperations(sql: string): string[] {
  const ops: string[] = [];
  const re = /WHEN\s+'([a-z][a-z0-9_]*)'\s+THEN/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    ops.push(m[1]!);
  }
  return [...new Set(ops)].sort();
}

const EXPECTED_OPERATIONS = [
  'awarding_lock_verification',
  'financial_gst_reconciliation',
  'gst_verification_diagnostics',
  'profiles_active_count',
  'quote_submission_integrity',
  'stalled_order_diagnostics',
  'state_transition_audit_trail',
];

const RPC_CALLER_PATHS: Array<{ path: string; needle: RegExp }> = [
  {
    path: 'apps/web/src/features/admin/api/admin-ops.ts',
    needle: /admin_run_diagnostic_query/,
  },
  {
    path: 'apps/web/src/features/admin/components/AdminQueryTerminal.tsx',
    needle: /runDiagnosticQuery|buildDiagnosticRpcPayload/,
  },
  {
    path: 'tests/security/verified-remediation-00216-database.test.ts',
    needle: /admin_run_diagnostic_query/,
  },
];

describe('00262 admin_run_diagnostic_query (static)', () => {
  const sql = readFileSync(FORMAL, 'utf8');
  const legacy = readFileSync(LEGACY, 'utf8');

  it('formal migration matches reviewed draft bytes', () => {
    expect(readFileSync(FORMAL)).toEqual(readFileSync(DRAFT));
  });

  it('documents repo callers for admin_run_diagnostic_query', () => {
    for (const { path: rel, needle } of RPC_CALLER_PATHS) {
      const abs = resolve(__dirname, '../..', rel);
      const body = readFileSync(abs, 'utf8');
      expect(body).toMatch(needle);
    }
  });

  it('removes anon/authenticated guard disjuncts from 00074 baseline', () => {
    expect(legacy).toMatch(/auth\.role\(\)\s*=\s*'anon'/);
    expect(sql).not.toMatch(/auth\.role\(\)\s*=\s*'anon'/);
    expect(sql).not.toMatch(/auth\.role\(\)\s*=\s*'authenticated'/);
    expect(sql).toContain('private.is_platform_admin()');
    expect(sql).toMatch(/COALESCE\(auth\.role\(\),\s*''\)\s*=\s*'service_role'/);
  });

  it('does not EXECUTE client SQL via string concatenation', () => {
    expect(sql).not.toMatch(/EXECUTE\s+'WITH q AS \('/);
    expect(sql).not.toMatch(/\|\|\s*v_clean_sql/);
    expect(sql).toMatch(/Free-form SQL is not permitted/);
  });

  it('exposes a fixed allowlist of named operations', () => {
    const ops = extractAllowlistedOperations(sql);
    expect(ops).toEqual(EXPECTED_OPERATIONS);
    expect(sql).toMatch(/CASE v_op/);
  });

  it('rejects multi-statement and DML/DDL keyword patterns in shim', () => {
    expect(sql).toMatch(/v_input ~ ';'/);
    expect(sql).toMatch(/insert\|update\|delete/);
    expect(sql).toMatch(/alter\|create\|drop/);
  });

  it('revokes anon/PUBLIC execute', () => {
    expect(sql).toMatch(/REVOKE EXECUTE[\s\S]*FROM PUBLIC, anon/);
    expect(sql).toMatch(/GRANT EXECUTE[\s\S]*TO authenticated, service_role/);
  });

  it('redacts audit and client error surfaces', () => {
    expect(sql).toMatch(/'operation',\s*v_op/);
    expect(sql).not.toMatch(/'query',\s*v_clean_sql/);
    expect(sql).toMatch(/'error',\s*'Diagnostic query failed\.'/);
    expect(sql).toMatch(/error_class',\s*SQLSTATE/);
  });

  it('bounds row limits server-side (nested params.limit and legacy root limit)', () => {
    expect(sql).toMatch(
      /least\(greatest\(\(v_params->'params'->>'limit'\)::int,\s*1\),\s*100\)/
    );
    expect(sql).toMatch(/least\(greatest\(\(v_params->>'limit'\)::int,\s*1\),\s*100\)/);
  });

  it('returns structured errors for unknown ops, auth denial, and SQL injection shim', () => {
    expect(sql).toMatch(/Unknown diagnostic operation: %s/);
    expect(sql).toMatch(/Unauthorized: Super Admin access required\./);
    expect(sql).toMatch(/Unknown or malformed diagnostic operation/);
    expect(sql).toMatch(/Invalid diagnostic operation payload/);
    expect(sql).toMatch(/Empty diagnostic operation/);
  });

  it('AdminQueryTerminal template operation keys are subset of draft allowlist', () => {
    const terminal = readFileSync(
      resolve(__dirname, '../../apps/web/src/features/admin/components/AdminQueryTerminal.tsx'),
      'utf8'
    );
    const uiOps: string[] = [];
    const re = /operation:\s*'([a-z][a-z0-9_]*)'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(terminal)) !== null) {
      uiOps.push(m[1]!);
    }
    const allowlisted = extractAllowlistedOperations(sql);
    for (const op of uiOps) {
      expect(allowlisted, op).toContain(op);
    }
    expect(allowlisted).toContain('profiles_active_count');
  });
});

describe('00262 reject patterns (behavioral simulation)', () => {
  const rejectFreeForm = (input: string) => {
    const v_lower = input.toLowerCase();
    return (
      /(^|\s)(select|with|insert|update|delete|merge|truncate|copy|grant|revoke|alter|create|drop|call|execute|prepare|deallocate)\s/.test(
        v_lower
      ) ||
      input.includes(';') ||
      /(pg_read_file|pg_ls_dir)/.test(v_lower)
    );
  };

  it('flags representative attack strings the draft must reject', () => {
    expect(rejectFreeForm('SELECT * FROM auth.users')).toBe(true);
    expect(rejectFreeForm('WITH x AS (SELECT 1) SELECT * FROM x')).toBe(true);
    expect(rejectFreeForm('stalled_order_diagnostics; DROP TABLE profiles')).toBe(true);
    expect(rejectFreeForm('insert into profiles values (1)')).toBe(true);
  });

  it('accepts bare operation keys and JSON payloads', () => {
    expect(rejectFreeForm('stalled_order_diagnostics')).toBe(false);
    expect(rejectFreeForm('{"operation":"quote_submission_integrity","params":{"limit":20}}')).toBe(
      false
    );
  });
});
