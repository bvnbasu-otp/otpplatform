import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(resolve('.github/workflows/ci-cd.yml'), 'utf8');
const stagingJob = workflow.slice(workflow.indexOf('Synchronize Supabase Database Migrations (Staging / Demo)'));

describe('non-production cannot silently select production', () => {
  it('does not fall back from staging secrets to production secrets', () => {
    expect(stagingJob).not.toMatch(/secrets\.STAGING_[A-Z0-9_]+ \|\| secrets\./);
    expect(stagingJob).toContain('OTP_DEPLOYMENT_TARGET: non-production');
    expect(stagingJob).toContain('secrets.STAGING_DATABASE_URL }}');
    expect(stagingJob).toContain('secrets.STAGING_SUPABASE_PROJECT_ID }}');
    expect(stagingJob).toContain('secrets.STAGING_VITE_SUPABASE_URL }}');
    expect(stagingJob).not.toContain('secrets.STAGING_DATABASE_URL ||');
    expect(stagingJob).not.toContain('secrets.STAGING_SUPABASE_PROJECT_ID ||');
    expect(stagingJob).not.toContain('secrets.STAGING_VITE_SUPABASE_URL ||');
  });

  it('keeps the CI web build on the validation sentinel rather than the production project', () => {
    expect(workflow).toContain('VITE_OTP_DEPLOYMENT_TARGET: "non-production"');
    expect(workflow).toContain('https://ci-validation.invalid');
    expect(workflow).not.toMatch(/VITE_SUPABASE_URL: "https:\/\/qsuvtcezffomtwzwyrso/);
  });
});

describe('migration deploy target is explicit', () => {
  const deploy = readFileSync(resolve('scripts/deploy-migrations.ts'), 'utf8');
  const cli = readFileSync(resolve('scripts/supabase-db-push.ts'), 'utf8');

  it('validates the resolved connection before connect or db push, and does not log --db-url', () => {
    const validateAt = deploy.indexOf('assertMigrationTarget(');
    const connectAt = deploy.indexOf('await client.connect()');
    const pushAt = deploy.indexOf('runSupabaseDbPush(');
    const missingTargetAt = deploy.indexOf('if (!connectionString)');
    expect(validateAt).toBeGreaterThan(0);
    expect(missingTargetAt).toBeGreaterThan(validateAt);
    expect(missingTargetAt).toBeLessThan(connectAt);
    expect(pushAt).toBeGreaterThan(connectAt);
    expect(deploy).toContain('CI deploy requires DATABASE_URL');
    expect(deploy).toContain('suppliedConnectionStrings');
    expect(deploy).toContain('suppliedSupabaseUrls');
    expect(deploy).toContain('suppliedProjectRefs');
    expect(deploy).toContain('redactDiagnosticText');
    expect(deploy).not.toContain('console.log(`Executing: ${cmd}`)');
    expect(deploy).not.toContain('const dbUrlArg');
    expect(deploy).not.toMatch(/db push \$\{/);
    expect(deploy).not.toMatch(/db push --db-url ["'`]/);
    expect(deploy).not.toMatch(/execSync\(\s*`[^`]*db push/);
    expect(cli).toContain('spawnSync(command, args');
    expect(cli).toContain('shell: false');
    expect(cli).not.toMatch(/shell:\s*true/);
    expect(cli).toContain('SUPABASE_CLI_BIN');
    expect(cli).toContain('no linked project was used');
    expect(cli).toContain('db push --db-url [redacted]');
    expect(cli).toContain('redactDiagnosticText');
    expect(cli).not.toContain('execSync');
    expect(cli).not.toMatch(/db push --db-url ["'`$\{]/);
    expect(cli).not.toMatch(/\$\{connectionString\}/);
  });

  it('refuses --deploy when no explicit database target is available', () => {
    const tsx = resolve('node_modules/tsx/dist/cli.mjs');
    const res = spawnSync(process.execPath, [tsx, 'scripts/deploy-migrations.ts', '--deploy'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: 'true',
        GITHUB_ACTIONS: 'true',
        OTP_DEPLOYMENT_TARGET: '',
        TARGET_ENV: '',
        DATABASE_URL: '',
        DIRECT_URL: '',
        DATABASE_POOLER_URL: '',
        SUPABASE_DB_URL: '',
        POSTGRES_URL: '',
        SUPABASE_PROJECT_ID: '',
        SUPABASE_PROJECT_REF: '',
        SUPABASE_DB_PASSWORD: '',
        DB_PASSWORD: '',
        SUPABASE_ACCESS_TOKEN: '',
        VITE_SUPABASE_URL: '',
        SUPABASE_URL: '',
      },
    });
    const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
    expect(res.status).not.toBe(0);
    expect(out).toMatch(/CI deploy requires DATABASE_URL/);
    expect(out).not.toMatch(/Executing:/);
    expect(out).not.toMatch(/db push/);
    expect(out).not.toMatch(/Connecting to database/);
    expect(out).not.toMatch(/SUCCESS: Applied/);
  });

  it('refuses --status against a hosted database when no deployment target is declared', () => {
    const tsx = resolve('node_modules/tsx/dist/cli.mjs');
    const res = spawnSync(process.execPath, [tsx, 'scripts/deploy-migrations.ts', '--status'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: 'true',
        GITHUB_ACTIONS: 'true',
        OTP_DEPLOYMENT_TARGET: '',
        TARGET_ENV: '',
        DATABASE_URL: 'postgresql://postgres:not-a-secret@db.abcdefghijklmnopqrst.supabase.co:5432/postgres',
        DIRECT_URL: '',
        DATABASE_POOLER_URL: '',
        SUPABASE_DB_URL: '',
        POSTGRES_URL: '',
        SUPABASE_PROJECT_ID: '',
        SUPABASE_PROJECT_REF: '',
        SUPABASE_DB_PASSWORD: '',
        DB_PASSWORD: '',
        VITE_SUPABASE_URL: '',
        SUPABASE_URL: '',
      },
    });
    const out = `${res.stdout ?? ''}${res.stderr ?? ''}`;
    expect(res.status).not.toBe(0);
    expect(out).toMatch(/must not select a hosted project/);
    expect(out).not.toMatch(/Connecting to database/);
    expect(out).not.toContain('not-a-secret');
  });

  it('reports an undeclared target as local without printing credentials', () => {
    const tsx = resolve('node_modules/tsx/dist/cli.mjs');
    const res = spawnSync(process.execPath, [tsx, 'scripts/report-deployment-target.ts'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        OTP_DEPLOYMENT_TARGET: '',
        VITE_OTP_DEPLOYMENT_TARGET: '',
        VITE_SUPABASE_URL: '',
        SUPABASE_URL: '',
        VITE_SUPABASE_PROJECT_REF: '',
        SUPABASE_PROJECT_REF: '',
        SUPABASE_PROJECT_ID: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
        VITE_SUPABASE_SERVICE_ROLE_KEY: '',
        DATABASE_URL: 'postgresql://postgres:report-secret@127.0.0.1:54322/postgres',
      },
    });
    expect(res.status).toBe(0);
    const report = JSON.parse(res.stdout) as {
      processEnv: { ok: boolean; deploymentClass: string | null; credentials: string };
      credentials: string;
    };
    expect(report.processEnv.ok).toBe(true);
    expect(report.processEnv.deploymentClass).toBe('local');
    expect(report.credentials).toBe('redacted');
    expect(res.stdout).not.toContain('report-secret');
    expect(res.stdout).not.toMatch(/postgres(?:ql)?:\/\//);
  });

  it('has no unguarded Docker or linked-project fallback', () => {
    expect(deploy).not.toContain('otp-prod-db');
    expect(deploy).not.toContain('docker exec');
    expect(deploy).toContain('if (isDeploy || isStatus)');
  });
});
