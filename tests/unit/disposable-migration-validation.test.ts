import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  assertEnvClean,
  assertFreshTarget,
  assertHistoricalPurgeTargetEmptySql,
  assertMarker,
  assertNoDockerOverlap,
  assertNoLinkState,
  assertProjectId,
  assertWorkdirLocation,
  buildConfigToml,
  derivePorts,
  EXCLUDED_SERVICES,
  FORBIDDEN_ENV,
  listMigrationFiles,
  localDbUrl,
  main,
  MARKER_PURPOSE,
  parseArgs,
  planStages,
  sanitizedEnv,
} from '../../scripts/disposable-migration-validation';

const REPO = resolve(__dirname, '../..');
const SOURCE = readFileSync(resolve(REPO, 'scripts/disposable-migration-validation.ts'), 'utf8');
const ARGS = ['--workdir', 'C:\\otp-disposable\\run1', '--project-id', 'otp-disposable-a1b2c3d4', '--port-base', '56400'];
const scratch: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'otp-dmv-test-'));
  scratch.push(dir);
  return dir;
}

afterEach(() => {
  while (scratch.length) rmSync(scratch.pop()!, { recursive: true, force: true });
});

describe('argument parsing fails closed', () => {
  it('accepts exactly the documented commands and arguments', () => {
    expect(parseArgs(['prepare', ...ARGS])).toMatchObject({ command: 'prepare', projectId: 'otp-disposable-a1b2c3d4', portBase: 56400 });
    expect(parseArgs(['sql', 'q.sql', ...ARGS]).sqlFile).toBe('q.sql');
  });

  it('refuses unknown commands, unknown flags, URLs, duplicates, and missing values', () => {
    for (const argv of [
      [],
      ['push', ...ARGS],
      ['reset', ...ARGS],
      ['link', ...ARGS],
      ['prepare', ...ARGS, '--db-url', 'postgresql://x'],
      ['prepare', ...ARGS, '--linked'],
      ['prepare', ...ARGS, '--project-id', 'otp-disposable-zzzzzzzz'],
      ['prepare', '--workdir', 'C:\\x', '--project-id', 'otp-disposable-a1b2c3d4'],
      ['prepare', '--workdir', '--project-id', 'otp-disposable-a1b2c3d4', '--port-base', '56400'],
      ['prepare', '--workdir', 'C:\\x', '--project-id', 'otp-disposable-a1b2c3d4', '--port-base', '5640'],
      ['sql', ...ARGS],
    ]) {
      expect(() => parseArgs(argv), argv.join(' ')).toThrow(/DISPOSABLE_VALIDATION_REFUSED/);
    }
  });
});

describe('project id, ports, and environment', () => {
  it('refuses otp-local and any non-disposable project id', () => {
    for (const id of ['otp-local', 'otp-disposable-otp-local', 'otp-disposable-prod1234', 'otp-disposable-short', 'otp-prod', 'otp-disposable-ABCDEFGH', 'otp-disposable-live0000']) {
      expect(() => assertProjectId(id), id).toThrow(/DISPOSABLE_VALIDATION_REFUSED/);
    }
    expect(() => assertProjectId('otp-disposable-a1b2c3d4')).not.toThrow();
  });

  it('refuses 54322, the standard local range, and reserved application ports', () => {
    for (const base of [54320, 54313, 54000, 5432, 8000, 54999, 60000, 54990]) {
      expect(() => derivePorts(base), String(base)).toThrow(/DISPOSABLE_VALIDATION_REFUSED/);
    }
    const ports = derivePorts(56400);
    expect(Object.values(ports)).not.toContain(54322);
    expect(new Set(Object.values(ports)).size).toBe(10);
    expect(Object.values(ports).every((p) => p >= 56400 && p <= 56409)).toBe(true);
    expect(localDbUrl(ports)).toBe('postgresql://postgres:postgres@127.0.0.1:56402/postgres');
  });

  it('refuses every forbidden database or hosted environment variable', () => {
    for (const name of FORBIDDEN_ENV) {
      expect(() => assertEnvClean({ [name]: 'set' }), name).toThrow(new RegExp(name));
    }
    expect(() => assertEnvClean({ DATABASE_URL: '  ' })).not.toThrow();
    expect(() => assertEnvClean({ PATH: 'x' })).not.toThrow();
    const clean = sanitizedEnv({ PATH: 'x', SUPABASE_ACCESS_TOKEN: 'secret', PGPORT: '54322' });
    expect(clean).toEqual({ PATH: 'x' });
  });
});

describe('workdir location and state', () => {
  it('refuses relative paths, the repository, Google Drive, the synced drive, and filesystem roots', () => {
    expect(() => assertWorkdirLocation('relative\\dir', REPO)).toThrow(/absolute/);
    expect(() => assertWorkdirLocation(REPO, REPO)).toThrow(/overlaps the repository/);
    expect(() => assertWorkdirLocation(join(REPO, 'tmp-disposable'), REPO)).toThrow(/overlaps the repository/);
    expect(() => assertWorkdirLocation('C:\\Users\\me\\My Drive\\x', 'D:\\repo')).toThrow(/Google Drive/);
    expect(() => assertWorkdirLocation('G:\\scratch\\x', 'G:\\My Drive\\otp')).toThrow(/same synced drive/);
    expect(() => assertWorkdirLocation('C:\\', 'G:\\My Drive\\otp')).toThrow(/root/);
    expect(() => assertWorkdirLocation('C:\\otp-disposable\\run1', 'G:\\My Drive\\otp')).not.toThrow();
  });

  it('refuses a retained target and hosted link state', () => {
    const dir = tempDir();
    expect(() => assertFreshTarget(dir)).toThrow(/already exists/);
    expect(() => assertFreshTarget(join(dir, 'new'))).not.toThrow();
    mkdirSync(join(dir, 'supabase', '.temp'), { recursive: true });
    expect(() => assertNoLinkState(dir, true)).toThrow(/\.temp exists/);
    expect(() => assertNoLinkState(dir, false)).not.toThrow();
    writeFileSync(join(dir, 'supabase', '.temp', 'project-ref'), 'x');
    expect(() => assertNoLinkState(dir, false)).toThrow(/project-ref/);
  });

  it('requires a marker matching project id and port base', () => {
    const marker = { purpose: MARKER_PURPOSE, projectId: 'otp-disposable-a1b2c3d4', portBase: 56400, createdAt: 'x' };
    expect(() => assertMarker(marker, { projectId: 'otp-disposable-a1b2c3d4', portBase: 56400 })).not.toThrow();
    expect(() => assertMarker({ ...marker, purpose: 'other' }, marker)).toThrow(/purpose/);
    expect(() => assertMarker(marker, { projectId: 'otp-disposable-zzzzzzzz', portBase: 56400 })).toThrow(/project id/);
    expect(() => assertMarker(marker, { projectId: marker.projectId, portBase: 56500 })).toThrow(/port base/);
  });

  it('refuses existing Docker resources for the project id', () => {
    const id = 'otp-disposable-a1b2c3d4';
    const otpLocal = { containers: ['supabase_db_otp-local'], volumes: ['supabase_db_otp-local'], networks: ['supabase_network_otp-local'] };
    expect(() => assertNoDockerOverlap(id, otpLocal)).not.toThrow();
    expect(() => assertNoDockerOverlap(id, { ...otpLocal, volumes: [`supabase_db_${id}`] })).toThrow(/already exist/);
    expect(() => assertNoDockerOverlap(id, { ...otpLocal, containers: [`supabase_kong_${id}`] })).toThrow(/already exist/);
  });
});

describe('stage plan isolates 00077', () => {
  it('splits the real chain into A=1-76, B=77 alone, C=78-314, D=315-ceiling', () => {
    const files = listMigrationFiles(resolve(REPO, 'supabase/migrations'));
    const plan = planStages(files, 331);
    expect(plan.A).toHaveLength(76);
    expect(plan.B).toEqual(['00077_clear_all_transactional_data_keep_logins.sql']);
    expect(plan.C).toHaveLength(237);
    expect(plan.D).toEqual([
      '00315_revoke_anon_update_my_organization_name.sql',
      '00316_organization_rename_requires_one_row.sql',
      '00317_rfq_category_service_coverage_guard.sql',
      '00318_support_ticket_rpc_hardening.sql',
      '00319_supplier_business_address_enforcement.sql',
      '00320_audit_actor_identity_registry.sql',
      '00321_founder_superadmin_role_guard.sql',
      '00322_restrict_is_demo_marker.sql',
      '00323_superadmin_demo_user_deletion.sql',
      '00324_public_contact_enquiries.sql',
      '00325_disable_pilot_quote_quorum_waiver.sql',
      '00326_authoritative_committee_tenure.sql',
      '00327_notification_dispatch_isolation.sql',
      '00328_admin_test_runner_canonical_status_enum.sql',
      '00329_fix_direct_invites_and_supplier_quoting_for_demo.sql',
      '00330_authoritative_pricing_and_supplier_fee_gate.sql',
      '00331_authoritative_17_category_taxonomy.sql',
    ]);
  });

  it('refuses gaps and an unexpected ceiling', () => {
    const files = listMigrationFiles(resolve(REPO, 'supabase/migrations'));
    expect(() => planStages(files, 328)).toThrow(/expected ceiling/);
    expect(() => planStages(files.filter((f) => !f.startsWith('00200')), 326)).toThrow(/not contiguous/);
  });
});

describe('historical purge disposable proof', () => {
  it('checks every table affected by 00077 before copying or applying it', () => {
    const proof = assertHistoricalPurgeTargetEmptySql();
    for (const table of [
      'requirements',
      'rfqs',
      'quotes',
      'purchase_orders',
      'work_orders',
      'invoices',
      'payments',
      'support_tickets',
      'notifications',
      'admin_database_snapshots',
    ]) {
      expect(proof).toContain(`'${table}'`);
    }
    expect(proof).toContain('HISTORICAL_PURGE_TARGET_NOT_EMPTY');
    expect(proof).toContain('HISTORICAL_PURGE_TARGET_EMPTY');
    const stageBProof = SOURCE.indexOf("if (stage === 'B')");
    const stageBCopy = SOURCE.indexOf('for (const file of plan[stage])');
    expect(stageBProof).toBeGreaterThan(0);
    expect(stageBCopy).toBeGreaterThan(stageBProof);
  });
});

describe('generated config and command surface', () => {
  it('disables seeds and unused services and never uses otp-local ports', () => {
    const toml = buildConfigToml('otp-disposable-a1b2c3d4', derivePorts(56400));
    expect(toml).toContain('project_id = "otp-disposable-a1b2c3d4"');
    expect(toml).toMatch(/\[db\.seed\]\s+enabled = false/);
    expect(toml).not.toMatch(/sql_paths|seed\.sql|hook|smtp\.gmail|env\(/);
    expect(toml).not.toMatch(/\b5432[0-9]\b/);
    expect(toml).toContain('port = 56402');
    expect(EXCLUDED_SERVICES).toContain('edge-runtime');
  });

  it('contains no hosted, linked, reset, push, or broad-stop command', () => {
    const code = SOURCE.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/'link'|'--linked'|'db', 'push'|'push'|'reset'|'--all'|'secrets'|'functions', 'deploy'/);
    expect(code).not.toMatch(/'volume', 'rm'|'rm', '-f'|'system', 'prune'|'network', 'rm'/);
    expect(code.match(/'stop'/g)).toHaveLength(1);
    expect(code).toContain("['stop', '--workdir', options.workdir, '--project-id', options.projectId, '--no-backup']");
    expect(code).not.toMatch(/process\.env\.(DATABASE_URL|SUPABASE_DB_URL|DIRECT_URL)/);
    expect(SOURCE).toMatch(/ACCESS KEY|PUBLISHABLE|API KEY/);
  });

  it('refuses before touching Docker when the environment or workdir is unsafe', async () => {
    const saved = Object.fromEntries(FORBIDDEN_ENV.map((name) => [name, process.env[name]]));
    for (const name of FORBIDDEN_ENV) delete process.env[name];
    try {
      process.env.SUPABASE_DB_URL = 'postgresql://hosted';
      await expect(main(['start', ...ARGS], REPO)).rejects.toThrow(/SUPABASE_DB_URL/);
      delete process.env.SUPABASE_DB_URL;

      await expect(main(['start', '--workdir', join(REPO, 'x'), '--project-id', 'otp-disposable-a1b2c3d4', '--port-base', '56400'], REPO))
        .rejects.toThrow(/overlaps the repository/);
      await expect(main(['start', ...ARGS.slice(0, 2), '--project-id', 'otp-local', '--port-base', '56400'], REPO))
        .rejects.toThrow(/project id/);
      const dir = tempDir();
      await expect(main(['stage-B', '--workdir', dir, '--project-id', 'otp-disposable-a1b2c3d4', '--port-base', '56400'], REPO))
        .rejects.toThrow(/marker/);
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});
