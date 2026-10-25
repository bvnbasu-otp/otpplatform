export type RegressionStatus = 'PASS' | 'FAIL' | 'SKIPPED' | 'BLOCKED' | 'NOT_RUN';

export interface RegressionCounts {
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  notRun: number;
}

export interface RegressionSuiteResult extends RegressionCounts {
  name: string;
  category: string;
  required: boolean;
  status: RegressionStatus;
  durationMs: number;
  details?: string;
}

export interface RegressionAggregate extends RegressionCounts {
  status: RegressionStatus;
  requiredFailures: number;
  optionalSkips: number;
}

export type IndividualTestOutcome = { status: 'PASS' | 'FAIL' | 'SKIPPED'; details?: string };

function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

export function resultFromVitestReport(args: {
  name: string;
  category: string;
  required?: boolean;
  report: unknown;
  exitCode: number;
  durationMs: number;
}): RegressionSuiteResult {
  const required = args.required ?? true;
  const report = args.report as Record<string, unknown> | null;
  const passed = integer(report?.numPassedTests);
  const failed = integer(report?.numFailedTests);
  const skipped = integer(report?.numPendingTests);
  const total = integer(report?.numTotalTests);

  if (passed === undefined || failed === undefined || skipped === undefined || total === undefined) {
    return {
      name: args.name, category: args.category, required, status: 'BLOCKED',
      passed: 0, failed: 0, skipped: 0, blocked: 1, notRun: 1,
      durationMs: args.durationMs, details: 'Missing or invalid Vitest JSON summary',
    };
  }

  if (args.exitCode !== 0) {
    return {
      name: args.name, category: args.category, required, status: 'FAIL',
      passed, failed: failed || 1, skipped, blocked: 0, notRun: 0,
      durationMs: args.durationMs, details: `Vitest exited with code ${args.exitCode}`,
    };
  }

  if (total === 0) {
    return {
      name: args.name, category: args.category, required, status: 'BLOCKED',
      passed, failed, skipped, blocked: 1, notRun: 1,
      durationMs: args.durationMs, details: 'Vitest discovered no tests',
    };
  }

  if (failed > 0) {
    return { name: args.name, category: args.category, required, status: 'FAIL', passed, failed, skipped, blocked: 0, notRun: 0, durationMs: args.durationMs };
  }

  if (skipped > 0) {
    return {
      name: args.name, category: args.category, required,
      status: required ? 'BLOCKED' : 'SKIPPED',
      passed, failed, skipped, blocked: required ? 1 : 0, notRun: 0,
      durationMs: args.durationMs, details: 'Vitest reported pending/skipped tests',
    };
  }

  return { name: args.name, category: args.category, required, status: 'PASS', passed, failed, skipped, blocked: 0, notRun: 0, durationMs: args.durationMs };
}

export function resultForCheck(args: {
  name: string;
  category: string;
  required?: boolean;
  exitCode: number;
  durationMs: number;
  details?: string;
}): RegressionSuiteResult {
  const required = args.required ?? true;
  const passed = args.exitCode === 0 ? 1 : 0;
  const failed = args.exitCode === 0 ? 0 : 1;
  return {
    name: args.name, category: args.category, required,
    status: args.exitCode === 0 ? 'PASS' : 'FAIL',
    passed, failed, skipped: 0, blocked: 0, notRun: 0,
    durationMs: args.durationMs, details: args.details,
  };
}

export function resultForUnavailableSuite(args: {
  name: string;
  category: string;
  required?: boolean;
  expected?: number;
  durationMs?: number;
  details: string;
}): RegressionSuiteResult {
  const required = args.required ?? true;
  const blocked = required ? 1 : 0;
  const skipped = required ? 0 : (args.expected ?? 0);
  return {
    name: args.name, category: args.category, required,
    status: required ? 'BLOCKED' : 'SKIPPED',
    passed: 0, failed: 0, skipped, blocked, notRun: args.expected ?? 0,
    durationMs: args.durationMs ?? 0, details: args.details,
  };
}

export async function runRequiredTestBattery(args: {
  name: string;
  category: string;
  testIds: string[];
  runOne: (testId: string) => Promise<IndividualTestOutcome>;
  elapsedMs?: () => number;
}): Promise<RegressionSuiteResult> {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures: string[] = [];
  const startedAt = Date.now();

  for (let index = 0; index < args.testIds.length; index++) {
    const testId = args.testIds[index];
    try {
      const outcome = await args.runOne(testId);
      if (outcome.status === 'PASS') passed++;
      else if (outcome.status === 'SKIPPED') skipped++;
      else {
        failed++;
        if (outcome.details) failures.push(`${testId}: ${outcome.details}`);
      }
    } catch (error) {
      const durationMs = args.elapsedMs?.() ?? Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      return {
        name: args.name, category: args.category, required: true, status: 'BLOCKED',
        passed, failed, skipped, blocked: 1,
        notRun: args.testIds.length - index,
        durationMs,
        details: `Required endpoint or suite unavailable: ${message}`,
      };
    }
  }

  const durationMs = args.elapsedMs?.() ?? Date.now() - startedAt;
  const status: RegressionStatus = failed > 0 ? 'FAIL' : skipped > 0 ? 'BLOCKED' : 'PASS';
  return {
    name: args.name, category: args.category, required: true, status,
    passed, failed, skipped, blocked: skipped > 0 ? 1 : 0, notRun: 0,
    durationMs, details: failures.length ? failures.join('; ') : skipped ? 'Required tests were skipped' : undefined,
  };
}

export function aggregateRegressionResults(results: RegressionSuiteResult[]): RegressionAggregate {
  const counts = results.reduce<RegressionCounts>((total, result) => ({
    passed: total.passed + result.passed,
    failed: total.failed + result.failed,
    skipped: total.skipped + result.skipped,
    blocked: total.blocked + result.blocked,
    notRun: total.notRun + result.notRun,
  }), { passed: 0, failed: 0, skipped: 0, blocked: 0, notRun: 0 });
  const requiredFailures = results.filter((result) => result.required && result.status !== 'PASS').length;
  const optionalSkips = results.filter((result) => !result.required && result.status === 'SKIPPED').length;
  const status: RegressionStatus = requiredFailures > 0 || counts.failed > 0
    ? 'FAIL'
    : counts.blocked > 0
      ? 'BLOCKED'
      : 'PASS';
  return { ...counts, status, requiredFailures, optionalSkips };
}
