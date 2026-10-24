import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  assertHistoricalPurgePlanSafety,
  DISPOSABLE_BOOTSTRAP_PLAN_ACK,
  parseMigrationArgs,
  runDatabaseMigrationPhase,
  type MigrationFile,
} from '../../scripts/deploy-migrations';

const WRITE_SQL = /\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE|BEGIN|COMMIT|NOTIFY)\b/i;

function fakeFiles(sequences: number[]): MigrationFile[] {
  return sequences.map((n) => {
    const seq = String(n).padStart(5, '0');
    return { filename: `${seq}_fake.sql`, filepath: `/nonexistent/${seq}_fake.sql`, sequenceNumber: n, name: 'fake' };
  });
}

function fakeClient(appliedVersions: string[]) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      async query(sql: string) {
        calls.push(sql);
        if (/^SELECT version FROM supabase_migrations\.schema_migrations$/.test(sql)) {
          return { rows: appliedVersions.map((version) => ({ version })) };
        }
        if (/^SELECT version FROM public\.otp_schema_migrations$/.test(sql)) {
          throw new Error('relation does not exist');
        }
        return { rows: [] };
      },
    },
  };
}

describe('migration CLI arguments fail closed', () => {
  it('accepts each supported invocation exactly', () => {
    expect(parseMigrationArgs(['--check-only'])).toEqual({ mode: 'check-only', disposablePlanAcknowledged: false });
    expect(parseMigrationArgs(['-c']).mode).toBe('check-only');
    expect(parseMigrationArgs(['--status']).mode).toBe('status');
    expect(parseMigrationArgs(['-s']).mode).toBe('status');
    expect(parseMigrationArgs(['--dry-run']).mode).toBe('dry-run');
    expect(parseMigrationArgs(['--deploy']).mode).toBe('deploy');
    expect(parseMigrationArgs(['--deploy', '--dry-run']).mode).toBe('deploy-dry-run');
    expect(parseMigrationArgs(['--dry-run', DISPOSABLE_BOOTSTRAP_PLAN_ACK])).toEqual({
      mode: 'dry-run',
      disposablePlanAcknowledged: true,
    });
  });

  it('rejects unknown, misspelled, and value-bearing arguments', () => {
    for (const args of [
      ['--deploy', '--unknown-flag'],
      ['--dry-run', '--ack-disposable-bootstrap'],
      ['--dry-run', '--ack-disposable-bootstrap-plan=yes'],
      ['--deploy=true'],
      ['--deploy', 'production'],
      ['--target-env'],
      ['--target-env', 'production', '--deploy'],
      ['--target-env=production', '--deploy'],
    ]) {
      expect(() => parseMigrationArgs(args), args.join(' ')).toThrow(/Unsupported argument/);
    }
  });

  it('rejects missing, duplicate, and conflicting modes', () => {
    expect(() => parseMigrationArgs([])).toThrow(/No action specified/);
    expect(() => parseMigrationArgs([DISPOSABLE_BOOTSTRAP_PLAN_ACK])).toThrow(/No action specified/);
    for (const args of [['--deploy', '--deploy'], ['-c', '--check-only'], ['--dry-run', DISPOSABLE_BOOTSTRAP_PLAN_ACK, DISPOSABLE_BOOTSTRAP_PLAN_ACK]]) {
      expect(() => parseMigrationArgs(args), args.join(' ')).toThrow(/Duplicate argument/);
    }
    for (const args of [['--check-only', '--deploy'], ['--status', '--deploy'], ['--status', '--dry-run'], ['--check-only', '--dry-run']]) {
      expect(() => parseMigrationArgs(args), args.join(' ')).toThrow(/Conflicting arguments/);
    }
  });

  it('never accepts the disposable acknowledgement outside file-only dry-run', () => {
    for (const args of [
      ['--deploy', DISPOSABLE_BOOTSTRAP_PLAN_ACK],
      ['--deploy', '--dry-run', DISPOSABLE_BOOTSTRAP_PLAN_ACK],
      ['--status', DISPOSABLE_BOOTSTRAP_PLAN_ACK],
      ['--check-only', DISPOSABLE_BOOTSTRAP_PLAN_ACK],
    ]) {
      expect(() => parseMigrationArgs(args), args.join(' ')).toThrow(/only valid with --dry-run alone/);
    }
  });

  it('exits nonzero on an unknown flag before connecting', () => {
    const tsx = resolve('node_modules/tsx/dist/cli.mjs');
    const res = spawnSync(process.execPath, [tsx, 'scripts/deploy-migrations.ts', '--check-only', '--chek'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: '', DIRECT_URL: '', CI: '' },
      encoding: 'utf8',
    });
    expect(res.status).not.toBe(0);
    const out = `${res.stdout}${res.stderr}`;
    expect(out).toMatch(/Unsupported argument: --chek/);
    expect(out).not.toMatch(/Connecting|Contiguity Check/);
  });
});

describe('database phase performs no write before the 00077 gate', () => {
  it('refuses a crossing deploy with only ledger reads', async () => {
    const { client, calls } = fakeClient([]);
    const code = await runDatabaseMigrationPhase({
      client,
      files: fakeFiles([76, 77, 78]),
      mode: 'deploy',
      connectionString: 'postgresql://fake',
      readSql: () => { throw new Error('migration SQL must not be read'); },
    });
    expect(code).toBe(1);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((sql) => /^SELECT version FROM /.test(sql))).toBe(true);
    expect(calls.some((sql) => WRITE_SQL.test(sql))).toBe(false);
  });

  it('refuses a crossing database dry-run and keeps status read-only', async () => {
    for (const mode of ['deploy-dry-run', 'status'] as const) {
      const { client, calls } = fakeClient([]);
      const code = await runDatabaseMigrationPhase({
        client,
        files: fakeFiles([76, 77, 78]),
        mode,
        connectionString: 'postgresql://fake',
        readSql: () => { throw new Error('migration SQL must not be read'); },
      });
      expect(code).toBe(mode === 'status' ? 0 : 1);
      expect(calls.some((sql) => WRITE_SQL.test(sql)), mode).toBe(false);
    }
  });

  it('allows a non-crossing deploy and sets up tracking only after the ledger reads', async () => {
    const { client, calls } = fakeClient(['00076', '00077']);
    const code = await runDatabaseMigrationPhase({
      client,
      files: fakeFiles([76, 77, 78]),
      mode: 'deploy',
      connectionString: 'postgresql://fake',
      readSql: () => 'SELECT 1;',
    });
    expect(code).toBe(0);
    const firstWrite = calls.findIndex((sql) => WRITE_SQL.test(sql));
    const lastRead = calls.map((sql) => /^SELECT version FROM /.test(sql)).lastIndexOf(true);
    expect(lastRead).toBeGreaterThanOrEqual(0);
    expect(firstWrite).toBeGreaterThan(lastRead);
    expect(calls[firstWrite]).toMatch(/CREATE TABLE IF NOT EXISTS public\.otp_schema_migrations/);
    expect(calls).toContain('BEGIN');
    expect(calls).toContain('SELECT 1;');
  });
});

describe('historical migration 00077 purge gate', () => {
  it('does not block an upgrade range that starts after 00077', () => {
    expect(() => assertHistoricalPurgePlanSafety({
      plannedSequences: [78, 79, 314],
      isDeploy: true,
      disposablePlanAcknowledged: false,
    })).not.toThrow();
  });

  it('blocks a range crossing 00077 by default', () => {
    expect(() => assertHistoricalPurgePlanSafety({
      plannedSequences: [76, 77, 78],
      isDeploy: false,
      disposablePlanAcknowledged: false,
    })).toThrow(/HISTORICAL_PURGE_BLOCK.*00077/i);
  });

  it('allows the explicit disposable acknowledgement for file-only planning', () => {
    expect(() => assertHistoricalPurgePlanSafety({
      plannedSequences: [1, 77, 314],
      isDeploy: false,
      disposablePlanAcknowledged: true,
    })).not.toThrow();
  });

  it('never treats the disposable planning acknowledgement as a deployment bypass', () => {
    expect(() => assertHistoricalPurgePlanSafety({
      plannedSequences: [1, 77, 314],
      isDeploy: true,
      disposablePlanAcknowledged: true,
    })).toThrow(/no deployment bypass/i);
  });

  it('blocks every range whose first, last, or only planned migration is 00077', () => {
    for (const plannedSequences of [[77], [77, 78, 314], [1, 76, 77]]) {
      expect(() => assertHistoricalPurgePlanSafety({
        plannedSequences,
        isDeploy: true,
        disposablePlanAcknowledged: true,
      })).toThrow(/HISTORICAL_PURGE_BLOCK/);
    }
  });

  it('does not block ranges entirely below or above 00077', () => {
    for (const plannedSequences of [[], [1, 2, 76], [78], [315, 327]]) {
      expect(() => assertHistoricalPurgePlanSafety({
        plannedSequences,
        isDeploy: true,
        disposablePlanAcknowledged: false,
      })).not.toThrow();
    }
  });

  it('gates the database apply loop and the CLI fallback before any migration SQL executes', () => {
    const deploy = readFileSync(resolve('scripts/deploy-migrations.ts'), 'utf8');
    const gate = deploy.indexOf('plannedSequences: pending.map((file) => file.sequenceNumber)');
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(deploy.indexOf('await ensureTrackingTables(client)'));
    expect(gate).toBeLessThan(deploy.indexOf('await client.query(execSql)'));
    expect(deploy.match(/await ensureTrackingTables\(client\)/g)).toHaveLength(1);
    expect(deploy.indexOf("if (mode !== 'deploy')")).toBeLessThan(deploy.indexOf('runSupabaseDbPush({'));
    const cliGate = deploy.indexOf('CLI fallback cannot prove that destructive migration 00077');
    expect(cliGate).toBeGreaterThan(0);
    expect(cliGate).toBeLessThan(deploy.indexOf('runSupabaseDbPush({'));
  });

  it('blocks production linked push when remote history does not already include 00077', () => {
    const workflow = readFileSync(resolve('.github/workflows/ci-cd.yml'), 'utf8');
    const guard = workflow.indexOf("!remoteApplied.includes('00077')");
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(workflow.indexOf('supabase db push --linked --yes'));
  });

  it('keeps the legacy cloud sync helper from running an unverified db push', () => {
    const helper = readFileSync(resolve('scripts/sync-supabase-cloud.ps1'), 'utf8');
    expect(helper).toContain('HISTORICAL_PURGE_BLOCK');
    expect(helper).not.toMatch(/^\s*&\s*supabase\s+db\s+push/m);
  });

  describe('retired cloud sync helper is fail-closed with and without -SkipDbPush', () => {
    const helper = readFileSync(resolve('scripts/sync-supabase-cloud.ps1'), 'utf8');
    const code = helper.replace(/<#[\s\S]*?#>/g, '').replace(/^\s*#.*$/gm, '');

    it('invokes no external command and exits 1 unconditionally', () => {
      expect(code).not.toMatch(/^\s*&/m);
      expect(code).not.toMatch(/\b(supabase|pnpm|npx|npm|node|tsx|psql|docker|Invoke-WebRequest|Invoke-RestMethod|Start-Process)\b/i);
      expect(code).not.toMatch(/\$env:/i);
      expect(code).not.toMatch(/\bif\s*\(/i);
      expect(code).not.toMatch(/Read-Host/i);
      const lines = code.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      expect(lines.at(-1)).toBe('exit 1');
      expect(code.match(/\bexit\b/g)).toHaveLength(1);
    });

    it('does not link, set secrets, or claim completion', () => {
      expect(helper).toContain('RETIRED');
      expect(helper).toContain('-SkipDbPush does not change this');
      expect(helper).not.toMatch(/supabase\s+link\b(?!`)/);
      expect(helper).not.toMatch(/secrets\s+set\s+[A-Z_]+=/);
      expect(helper).not.toMatch(/SYNC COMPLETE|synchronized .* successfully|\[OK\]/i);
      expect(helper).not.toMatch(/\b\d{2,3} (tracked )?(schema |database )?migrations\b/i);
      expect(helper).not.toMatch(/-ProjectRef\s+"[a-z0-9]{20}"/);
      expect(helper).not.toMatch(/\b[a-z]{20}\b(?=\.supabase\.co|")/);
    });

    it('parses as PowerShell without executing it', () => {
      const shell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
      const script = "$e=$null;$t=$null;[void][System.Management.Automation.Language.Parser]::ParseFile($env:OTP_PS1_PATH,[ref]$t,[ref]$e);if($e.Count){$e|ForEach-Object{$_.Message};exit 3};'PARSE_OK'";
      const res = spawnSync(shell, ['-NoProfile', '-NonInteractive', '-Command', script], {
        env: { ...process.env, OTP_PS1_PATH: resolve('scripts/sync-supabase-cloud.ps1') },
        encoding: 'utf8',
      });
      if (res.error && (res.error as NodeJS.ErrnoException).code === 'ENOENT') return;
      expect(res.status, `${res.stdout}${res.stderr}`).toBe(0);
      expect(res.stdout).toContain('PARSE_OK');
    });
  });

  it('keeps continuity checking database-free and blocks unacknowledged full dry-run planning', () => {
    const tsx = resolve('node_modules/tsx/dist/cli.mjs');
    const env = {
      ...process.env,
      DATABASE_URL: '',
      DIRECT_URL: '',
      DATABASE_POOLER_URL: '',
      SUPABASE_DB_URL: '',
      POSTGRES_URL: '',
      SUPABASE_PROJECT_ID: '',
      SUPABASE_PROJECT_REF: '',
      SUPABASE_DB_PASSWORD: '',
      DB_PASSWORD: '',
      CI: '',
      GITHUB_ACTIONS: '',
    };

    const check = spawnSync(process.execPath, [tsx, 'scripts/deploy-migrations.ts', '--check-only'], {
      cwd: process.cwd(),
      env,
      encoding: 'utf8',
    });
    expect(check.status).toBe(0);
    expect(`${check.stdout}${check.stderr}`).toMatch(/00077 is destructive/i);

    const blockedPlan = spawnSync(process.execPath, [tsx, 'scripts/deploy-migrations.ts', '--dry-run'], {
      cwd: process.cwd(),
      env,
      encoding: 'utf8',
    });
    expect(blockedPlan.status).not.toBe(0);
    expect(`${blockedPlan.stdout}${blockedPlan.stderr}`).toMatch(/HISTORICAL_PURGE_BLOCK/i);

    const disposablePlan = spawnSync(
      process.execPath,
      [tsx, 'scripts/deploy-migrations.ts', '--dry-run', DISPOSABLE_BOOTSTRAP_PLAN_ACK],
      { cwd: process.cwd(), env, encoding: 'utf8' },
    );
    expect(disposablePlan.status).toBe(0);
    expect(`${disposablePlan.stdout}${disposablePlan.stderr}`).toMatch(/DISPOSABLE-ONLY PLAN/i);
    expect(`${disposablePlan.stdout}${disposablePlan.stderr}`).not.toMatch(/Connecting|Applying \d+ pending/i);

    const ackDeploy = spawnSync(
      process.execPath,
      [tsx, 'scripts/deploy-migrations.ts', '--deploy', DISPOSABLE_BOOTSTRAP_PLAN_ACK, '--unknown-flag'],
      { cwd: process.cwd(), env: { ...env, CI: 'true', GITHUB_ACTIONS: 'true' }, encoding: 'utf8' },
    );
    expect(ackDeploy.status).not.toBe(0);
    expect(`${ackDeploy.stdout}${ackDeploy.stderr}`).not.toMatch(/Connecting|Applying \d+ pending|SUCCESS: Applied/i);
  });
});
