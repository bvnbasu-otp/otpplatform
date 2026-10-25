/** Runs required regression suites against a positively identified disposable Supabase project. */
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, unlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  aggregateRegressionResults,
  resultForCheck,
  resultForUnavailableSuite,
  resultFromVitestReport,
  runRequiredTestBattery,
  type RegressionSuiteResult,
} from './regression-results';
import { assertDisposableRestReady, resolveDisposableRegressionTarget, type DisposableRegressionTarget } from './regression-target';
import { EXECUTABLE_DATABASE_RPC_TEST_IDS } from './regression-rpc-scope';

const summary: RegressionSuiteResult[] = [];
const reportDir = mkdtempSync(path.join(tmpdir(), 'otp-regression-vitest-'));
let target: DisposableRegressionTarget | undefined;

function logHeader(title: string): void {
  console.log('\n=================================================================');
  console.log(`  ${title}`);
  console.log('=================================================================');
}

function isVitestCommand(command: string): boolean {
  return [
    'pnpm test:domain', 'pnpm test:services', 'pnpm test:database', 'pnpm test:web',
    'pnpm test:db', 'pnpm vitest run ',
  ].some((prefix) => command.startsWith(prefix));
}

function getExecCommand(command: string, reportPath?: string): string {
  const nodeExecutable = process.execPath;
  let resolved: string;
  if (command.startsWith('pnpm test:vocab')) {
    resolved = `"${nodeExecutable}" ./node_modules/tsx/dist/cli.mjs scripts/verify-vocabulary.ts`;
  } else if (command.startsWith('pnpm test:domain')) {
    resolved = `"${nodeExecutable}" ./node_modules/vitest/vitest.mjs run --config packages/domain/vitest.config.ts`;
  } else if (command.startsWith('pnpm test:services')) {
    resolved = `"${nodeExecutable}" ./node_modules/vitest/vitest.mjs run --config packages/services/vitest.config.ts`;
  } else if (command.startsWith('pnpm test:database')) {
    resolved = `"${nodeExecutable}" ./node_modules/vitest/vitest.mjs run --config packages/database/vitest.config.ts`;
  } else if (command.startsWith('pnpm test:web')) {
    resolved = `"${nodeExecutable}" ./node_modules/vitest/vitest.mjs run --config apps/web/vitest.config.ts`;
  } else if (command.startsWith('pnpm test:db')) {
    resolved = `"${nodeExecutable}" ./node_modules/vitest/vitest.mjs run tests/integration tests/security`;
  } else if (command.startsWith('pnpm test:smoke')) {
    resolved = `"${nodeExecutable}" ./node_modules/tsx/dist/cli.mjs scripts/test-live-smoke.ts`;
  } else if (command.startsWith('pnpm test:live')) {
    resolved = `"${nodeExecutable}" ./node_modules/tsx/dist/cli.mjs scripts/run_live_automated_tests.ts`;
  } else if (command.startsWith('pnpm vitest run ')) {
    const targetArg = command.replace(/^pnpm vitest run\s+/, '');
    resolved = `"${nodeExecutable}" ./node_modules/vitest/vitest.mjs run ${targetArg}`;
  } else if (command.startsWith('pnpm --filter @otp/web build')) {
    resolved = `"${nodeExecutable}" ./node_modules/vite/bin/vite.js build apps/web --config apps/web/vite.config.ts`;
  } else {
    throw new Error(`Unrecognized regression command: ${command}`);
  }
  return reportPath ? `${resolved} --reporter=json --outputFile "${reportPath}"` : resolved;
}

function removePrivateVitestReport(reportPath: string): void {
  if (existsSync(reportPath)) unlinkSync(reportPath);
}

function printSuiteResult(result: RegressionSuiteResult): void {
  const label = result.status.padEnd(8);
  console.log(`${label} ${result.category}: ${result.name} — passed ${result.passed}, failed ${result.failed}, skipped ${result.skipped}, blocked ${result.blocked}, not-run ${result.notRun}`);
}

function parseSmokeSummary(output: string): { passed: number; failed: number; total: number } | undefined {
  const clean = output.replace(/\x1b\[[0-9;]*m/g, '');
  const total = clean.match(/Total Checks\s*:\s*(\d+)/i);
  const passed = clean.match(/Passed\s*:\s*(\d+)/i);
  const failed = clean.match(/Failed\s*:\s*(\d+)/i);
  if (!total || !passed || !failed) return undefined;
  return { total: Number(total[1]), passed: Number(passed[1]), failed: Number(failed[1]) };
}

function parseLiveSummary(output: string): { passed: number; failed: number; total: number } | undefined {
  const clean = output.replace(/\x1b\[[0-9;]*m/g, '');
  const match = clean.match(/TEST SUITE SUMMARY:\s*(\d+)\/(\d+)\s+PASSED\s+\((\d+)\s+FAILED\)/i);
  if (!match) return undefined;
  return { passed: Number(match[1]), total: Number(match[2]), failed: Number(match[3]) };
}

function runStep(name: string, category: string, command: string): RegressionSuiteResult {
  process.stdout.write(`⏳ [${category}] ${name}... `);
  const startedAt = Date.now();
  const vitest = isVitestCommand(command);
  const reportPath = vitest ? path.join(reportDir, `${summary.length}.json`) : undefined;
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (command.startsWith('pnpm --filter @otp/web build')) {
    env.VITE_OTP_DEPLOYMENT_TARGET = 'non-production';
    env.VITE_SUPABASE_URL = 'https://ci-validation.invalid';
    env.VITE_SUPABASE_ANON_KEY = 'ci-validation-public-anon-placeholder';
    env.VITE_DEMO_MODE = 'false';
  }

  let exitCode = 0;
  let output = '';
  try {
    output = execSync(getExecCommand(command, reportPath), {
      stdio: 'pipe',
      encoding: 'utf8',
      env,
      timeout: Number(process.env.OTP_REGRESSION_STEP_TIMEOUT_MS ?? 900_000),
      killSignal: 'SIGKILL',
    });
  } catch (error: unknown) {
    const processError = error as { status?: unknown; stdout?: unknown; stderr?: unknown };
    exitCode = typeof processError.status === 'number' ? processError.status : 1;
    output = `${processError.stdout ?? ''}\n${processError.stderr ?? ''}`;
  }

  const durationMs = Date.now() - startedAt;
  let result: RegressionSuiteResult;
  if (vitest) {
    let report: unknown = null;
    try {
      if (reportPath && existsSync(reportPath)) report = JSON.parse(readFileSync(reportPath, 'utf8'));
    } catch {
      report = null;
    }
    result = resultFromVitestReport({ name, category, report, exitCode, durationMs });
  } else if (command.startsWith('pnpm test:smoke')) {
    const counts = parseSmokeSummary(output);
    result = counts
      ? resultForCheck({ name, category, exitCode, durationMs, details: `${counts.passed}/${counts.total} checks; ${counts.failed} failed` })
      : resultForUnavailableSuite({ name, category, expected: 1, durationMs, details: 'Missing smoke-suite result summary' });
    if (counts && (counts.total === 0 || counts.failed > 0 || counts.passed + counts.failed !== counts.total || exitCode !== 0 || /\bSKIPPED\b/i.test(output))) {
      result = resultForUnavailableSuite({ name, category, expected: counts.total - counts.passed - counts.failed, durationMs, details: 'Smoke suite failed or did not execute every check' });
      if (counts.failed > 0 || exitCode !== 0) result = { ...result, status: 'FAIL', failed: counts.failed || 1, blocked: 0 };
    } else if (counts) {
      result = { ...result, passed: counts.passed, failed: 0, status: 'PASS' };
    }
  } else if (command.startsWith('pnpm test:live')) {
    const counts = parseLiveSummary(output);
    if (!counts) {
      result = resultForUnavailableSuite({ name, category, expected: 1, durationMs, details: 'Missing live-suite result summary' });
    } else if (counts.total === 0 || counts.failed > 0 || counts.passed + counts.failed !== counts.total || exitCode !== 0) {
      result = {
        name, category, required: true, status: counts.failed > 0 || exitCode !== 0 ? 'FAIL' : 'BLOCKED',
        passed: counts.passed, failed: counts.failed || (exitCode !== 0 ? 1 : 0), skipped: 0,
        blocked: counts.passed + counts.failed !== counts.total ? 1 : 0,
        notRun: Math.max(0, counts.total - counts.passed - counts.failed), durationMs,
      };
    } else {
      result = { name, category, required: true, status: 'PASS', passed: counts.passed, failed: 0, skipped: 0, blocked: 0, notRun: 0, durationMs };
    }
  } else {
    result = resultForCheck({ name, category, exitCode, durationMs, details: exitCode === 0 ? undefined : `Command exited with code ${exitCode}` });
    if (output.includes('SKIPPED')) {
      result = resultForUnavailableSuite({ name, category, expected: 1, durationMs, details: 'Command reported a skipped required check' });
    }
  }

  if (reportPath) removePrivateVitestReport(reportPath);
  summary.push(result);
  printSuiteResult(result);
  return result;
}

async function runDatabaseRpcBattery(): Promise<void> {
  if (!target) throw new Error('Disposable database preflight was not completed');
  const client = createClient(target.apiUrl, target.serviceRoleKey, { auth: { persistSession: false } });
  const startedAt = Date.now();
  const result = await runRequiredTestBattery({
    name: 'Database Engine & Security RPCs',
    category: 'POSTGRES',
    testIds: EXECUTABLE_DATABASE_RPC_TEST_IDS,
    runOne: async (testId) => {
      const { data, error } = await client.rpc('admin_run_test_case', {
        p_test_id: testId,
        p_test_name: testId,
      });
      if (error) {
        if (/fetch failed|ECONNREFUSED|network|timeout/i.test(error.message)) throw new Error('PostgREST request failed');
        return { status: 'FAIL', details: 'RPC returned an error' };
      }
      return data?.passed === true
        ? { status: 'PASS' }
        : { status: 'FAIL', details: 'RPC did not report a pass' };
    },
    elapsedMs: () => Date.now() - startedAt,
  });
  summary.push(result);
  printSuiteResult(result);
}

async function seedDisposableFixtures(): Promise<void> {
  if (!target) throw new Error('Disposable target is not set');
  const client = createClient(target.apiUrl, target.serviceRoleKey, { auth: { persistSession: false } });
  const initial = await client.from('requirements').select('id', { count: 'exact', head: true });
  if (initial.error) throw new Error('Could not verify disposable fixture state');

  if ((initial.count ?? 0) === 0) {
    const seedFiles = [
      'seed.sql',
      'seed_pilots_horizontals.sql',
      'seed_market_intelligence.sql',
      'seed_procurement_policies.sql',
      'seed_taxonomy_alignment.sql',
      'seed_demo_environment.sql',
      'seed_demo_messaging.sql',
      'seed_demo_roles.sql',
      'seed_demo_test_accounts.sql',
      'seed_master_role_accounts.sql',
    ];
    for (const file of seedFiles) {
      const sql = readFileSync(path.resolve('supabase', file), 'utf8');
      execFileSync('docker', [
        'exec', '-i', target.container,
        'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
      ], { input: sql, stdio: ['pipe', 'ignore', 'pipe'] });
    }
  } else if ((initial.count ?? 0) < 5) {
    throw new Error('Disposable fixture state is partial; refusing to overlay the canonical seed set');
  }

  const [requirements, channels] = await Promise.all([
    client.from('requirements').select('id', { count: 'exact', head: true }),
    client.from('supplier_messaging_channels').select('id', { count: 'exact', head: true }),
  ]);
  if (requirements.error || channels.error || (requirements.count ?? 0) < 5 || (channels.count ?? 0) < 5) {
    throw new Error('Disposable canonical seed verification failed');
  }
}

function writeRegressionReport(): void {
  const result = aggregateRegressionResults(summary);
  const reportPath = process.env.OTP_REGRESSION_RESULT_PATH
    || path.join(tmpdir(), `otp-regression-summary-${Date.now()}.json`);
  const report = {
    sourceSha: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
    disposableProjectId: target?.projectId ?? null,
    timestamp: new Date().toISOString(),
    ...result,
    suites: summary,
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2), { encoding: 'utf8', flag: 'wx' });
  rmSync(reportDir, { recursive: true, force: true });
  logHeader('MASTER REGRESSION EXECUTION SCORECARD');
  for (const suite of summary) printSuiteResult(suite);
  console.log(`Status: ${result.status}`);
  console.log(`Passed: ${result.passed}; failed: ${result.failed}; skipped: ${result.skipped}; blocked: ${result.blocked}; not-run: ${result.notRun}`);
  console.log(`Required suites not passing: ${result.requiredFailures}; optional skips: ${result.optionalSkips}`);
  console.log(`Redacted result summary: ${reportPath}`);
  if (result.status !== 'PASS') process.exitCode = 1;
}

async function main(): Promise<void> {
  logHeader('OTP PLATFORM — MASTER REGRESSION SUITE EXECUTION');
  try {
    target = resolveDisposableRegressionTarget(process.env, process.cwd());
    await assertDisposableRestReady(target);
    await seedDisposableFixtures();
  } catch (error) {
    summary.push(resultForUnavailableSuite({
      name: 'Disposable database preflight and fixture readiness',
      category: 'PRECONDITION',
      expected: 1,
      details: error instanceof Error ? error.message : 'Disposable target verification failed',
    }));
    printSuiteResult(summary[summary.length - 1]);
    writeRegressionReport();
    return;
  }

  runStep('Canonical Procurement Vocabulary Scanner', 'POLICY', 'pnpm test:vocab');
  runStep('Domain Logic, GST Validation & Parsing Engine', 'DOMAIN', 'pnpm test:domain');
  runStep('Network Discovery & External Services Adapters', 'SERVICES', 'pnpm test:services');
  runStep('Database Entity Mappers', 'DATABASE', 'pnpm test:database');
  runStep('Messaging Core & Web Routing Invariants', 'UNIT', 'pnpm vitest run tests/unit/');
  runStep('Web Features, Governance & State Machine Tests', 'WEB', 'pnpm test:web');
  runStep('Live Database Integration & RLS Security Suite', 'INTEGRATION', 'pnpm test:db');
  runStep('Live Demo Scenario & E2E Walkthrough Suite', 'DEMO_E2E', 'pnpm vitest run tests/demo/');
  await runDatabaseRpcBattery();
  runStep('Live Operational & Auth Smoke Battery', 'SMOKE', 'pnpm test:smoke');
  runStep('Real-Time End-to-End Live Call Flow Battery', 'LIVE_FLOWS', 'pnpm test:live');
  runStep('Production Vite Bundle Build', 'BUILD', 'pnpm --filter @otp/web build');
  writeRegressionReport();
}

main().catch((error) => {
  summary.push(resultForUnavailableSuite({
    name: 'Master regression runner', category: 'PRECONDITION', expected: 1,
    details: error instanceof Error ? error.message : 'Unexpected runner failure',
  }));
  printSuiteResult(summary[summary.length - 1]);
  writeRegressionReport();
});
