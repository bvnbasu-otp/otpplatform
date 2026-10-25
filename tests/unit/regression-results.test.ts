import { describe, expect, it } from 'vitest';
import {
  aggregateRegressionResults,
  resultForCheck,
  resultForUnavailableSuite,
  resultFromVitestReport,
  runRequiredTestBattery,
} from '../../scripts/regression-results';

const base = {
  name: 'database RPC suite',
  category: 'POSTGRES',
  durationMs: 25,
};

describe('master regression result accounting', () => {
  it('counts only the genuine Vitest pass totals', () => {
    expect(resultFromVitestReport({
      ...base,
      report: { numTotalTests: 4, numPassedTests: 4, numFailedTests: 0, numPendingTests: 0 },
      exitCode: 0,
    })).toMatchObject({ status: 'PASS', passed: 4, failed: 0, skipped: 0, blocked: 0, notRun: 0 });
  });

  it('fails when Vitest reports failed tests even if it also passed tests', () => {
    expect(resultFromVitestReport({
      ...base,
      report: { numTotalTests: 3, numPassedTests: 2, numFailedTests: 1, numPendingTests: 0 },
      exitCode: 1,
    })).toMatchObject({ status: 'FAIL', passed: 2, failed: 1 });
  });

  it('blocks required suites that have skipped tests', () => {
    expect(resultFromVitestReport({
      ...base,
      report: { numTotalTests: 5, numPassedTests: 4, numFailedTests: 0, numPendingTests: 1 },
      exitCode: 0,
    })).toMatchObject({ status: 'BLOCKED', passed: 4, skipped: 1, blocked: 1 });
  });

  it('permits and discloses a skip only for an explicitly optional suite', () => {
    expect(resultFromVitestReport({
      ...base,
      required: false,
      report: { numTotalTests: 5, numPassedTests: 4, numFailedTests: 0, numPendingTests: 1 },
      exitCode: 0,
    })).toMatchObject({ status: 'SKIPPED', passed: 4, skipped: 1, blocked: 0 });
  });

  it('blocks when a report is missing or the runner discovers no tests', () => {
    expect(resultFromVitestReport({ ...base, report: null, exitCode: 0 }))
      .toMatchObject({ status: 'BLOCKED', passed: 0, blocked: 1, notRun: 1 });
    expect(resultFromVitestReport({
      ...base,
      report: { numTotalTests: 0, numPassedTests: 0, numFailedTests: 0, numPendingTests: 0 },
      exitCode: 0,
    })).toMatchObject({ status: 'BLOCKED', notRun: 1 });
  });

  it('never turns an unavailable required endpoint into passing tests', () => {
    expect(resultForUnavailableSuite({ ...base, expected: 25, details: 'REST unavailable' }))
      .toMatchObject({ status: 'BLOCKED', passed: 0, skipped: 0, blocked: 1, notRun: 25 });
  });

  it('reports a required RPC endpoint outage as blocked and leaves remaining tests not-run', async () => {
    let calls = 0;
    const result = await runRequiredTestBattery({
      ...base,
      testIds: ['SEC-001', 'SEC-002', 'SEC-003'],
      runOne: async () => {
        calls++;
        if (calls === 1) return { status: 'PASS' };
        throw new Error('REST endpoint unavailable');
      },
    });
    expect(result).toMatchObject({ status: 'BLOCKED', passed: 1, failed: 0, blocked: 1, notRun: 2 });
    expect(calls).toBe(2);
  });

  it('keeps failed and explicitly skipped RPC outcomes separate', async () => {
    const result = await runRequiredTestBattery({
      ...base,
      testIds: ['SEC-001', 'SEC-002', 'SEC-003'],
      runOne: async (testId) => testId === 'SEC-001'
        ? { status: 'PASS' }
        : testId === 'SEC-002'
          ? { status: 'FAIL', details: 'assertion failed' }
          : { status: 'SKIPPED' },
    });
    expect(result).toMatchObject({ status: 'FAIL', passed: 1, failed: 1, skipped: 1, blocked: 1, notRun: 0 });
  });

  it('counts command failures separately from test failures', () => {
    expect(resultForCheck({ ...base, exitCode: 2, details: 'process failed' }))
      .toMatchObject({ status: 'FAIL', passed: 0, failed: 1, skipped: 0 });
  });

  it('makes a required skip, block, or not-run result fail the aggregate gate', () => {
    const blocked = resultForUnavailableSuite({ ...base, expected: 25, details: 'REST unavailable' });
    const passed = resultForCheck({ name: 'build', category: 'BUILD', exitCode: 0, durationMs: 10 });
    expect(aggregateRegressionResults([blocked, passed])).toMatchObject({
      status: 'FAIL', passed: 1, failed: 0, blocked: 1, notRun: 25, requiredFailures: 1,
    });
  });
});
