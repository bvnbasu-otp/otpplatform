/**
 * Test Center live RPC battery — result mapping and pass-rate semantics.
 * Denominator for pass rate: executed tests only (status !== NOT_RUN and !== RUNNING).
 * Passed numerator: executionStatus === PASSED only.
 */

export type LiveTestUiStatus =
  | 'NOT_RUN'
  | 'RUNNING'
  | 'PASS'
  | 'FAIL'
  | 'BLOCKED'
  | 'SKIPPED'
  | 'NOT_IMPLEMENTED';

export type RpcExecutionStatus =
  | 'PASSED'
  | 'FAILED'
  | 'BLOCKED'
  | 'NOT_IMPLEMENTED'
  | 'SKIPPED';

export interface AdminRunTestCaseRpcPayload {
  passed?: boolean;
  test_id?: string;
  test_name?: string;
  error_message?: string | null;
  execution_status?: RpcExecutionStatus | string;
  details?: Record<string, unknown>;
  timestamp?: string;
}

export function normalizeRpcExecutionStatus(
  raw: unknown,
  passedFlag: boolean | undefined
): RpcExecutionStatus {
  const s = typeof raw === 'string' ? raw.toUpperCase() : '';
  if (s === 'PASSED' || s === 'FAILED' || s === 'BLOCKED' || s === 'NOT_IMPLEMENTED' || s === 'SKIPPED') {
    return s as RpcExecutionStatus;
  }
  // Legacy payloads without execution_status are not trusted as passes.
  if (passedFlag === true || passedFlag === false) return 'FAILED';
  return 'FAILED';
}

/** Map RPC JSON (or transport error) to UI status. Never treats missing/unknown shapes as PASS. */
export function mapRpcPayloadToUiStatus(
  data: unknown,
  transportError?: { message?: string } | null
): { uiStatus: LiveTestUiStatus; executionStatus: RpcExecutionStatus; error?: string } {
  if (transportError?.message) {
    return {
      uiStatus: 'FAIL',
      executionStatus: 'FAILED',
      error: transportError.message,
    };
  }

  if (data === null || data === undefined || typeof data !== 'object') {
    return {
      uiStatus: 'FAIL',
      executionStatus: 'FAILED',
      error: 'Malformed RPC response: expected JSON object',
    };
  }

  const payload = data as AdminRunTestCaseRpcPayload;
  const executionStatus = normalizeRpcExecutionStatus(payload.execution_status, payload.passed);

  if (executionStatus === 'PASSED' && payload.passed !== true) {
    return {
      uiStatus: 'FAIL',
      executionStatus: 'FAILED',
      error: payload.error_message ?? 'RPC marked PASSED without passed=true',
    };
  }

  switch (executionStatus) {
    case 'PASSED':
      return { uiStatus: 'PASS', executionStatus };
    case 'BLOCKED':
      return {
        uiStatus: 'BLOCKED',
        executionStatus,
        error: payload.error_message ?? 'Test blocked: external or full journey verification unavailable',
      };
    case 'NOT_IMPLEMENTED':
      return {
        uiStatus: 'NOT_IMPLEMENTED',
        executionStatus,
        error: payload.error_message ?? 'No backend implementation for this test ID',
      };
    case 'SKIPPED':
      return {
        uiStatus: 'SKIPPED',
        executionStatus,
        error: payload.error_message ?? 'Test skipped',
      };
    case 'FAILED':
    default:
      return {
        uiStatus: 'FAIL',
        executionStatus: 'FAILED',
        error: payload.error_message ?? 'Test failed',
      };
  }
}

export interface LiveBatterySummary {
  /** Tests in the current filter list (denominator for "selected battery"). */
  selectedCount: number;
  executedCount: number;
  passedCount: number;
  failedCount: number;
  blockedCount: number;
  notImplementedCount: number;
  skippedCount: number;
  notRunCount: number;
  /** Pass rate = passed / (passed + failed + blocked + notImplemented + skipped); excludes NOT_RUN. */
  passRatePercent: number | null;
  passRateDenominatorLabel: string;
  allSelectedExecuted: boolean;
  goLiveReady: boolean;
}

export function summarizeLiveBattery(
  testIds: string[],
  results: Map<string, { status: LiveTestUiStatus }>
): LiveBatterySummary {
  const selectedCount = testIds.length;
  let executedCount = 0;
  let passedCount = 0;
  let failedCount = 0;
  let blockedCount = 0;
  let notImplementedCount = 0;
  let skippedCount = 0;

  for (const id of testIds) {
    const r = results.get(id);
    if (!r || r.status === 'NOT_RUN' || r.status === 'RUNNING') continue;
    executedCount += 1;
    switch (r.status) {
      case 'PASS':
        passedCount += 1;
        break;
      case 'FAIL':
        failedCount += 1;
        break;
      case 'BLOCKED':
        blockedCount += 1;
        break;
      case 'NOT_IMPLEMENTED':
        notImplementedCount += 1;
        break;
      case 'SKIPPED':
        skippedCount += 1;
        break;
      default:
        failedCount += 1;
    }
  }

  const scoredDenominator =
    passedCount + failedCount + blockedCount + notImplementedCount + skippedCount;
  const passRatePercent =
    scoredDenominator === 0 ? null : Math.round((passedCount / scoredDenominator) * 1000) / 10;

  const notRunCount = selectedCount - executedCount;
  const allSelectedExecuted = notRunCount === 0 && selectedCount > 0;
  const goLiveReady =
    allSelectedExecuted && failedCount === 0 && blockedCount === 0 && notImplementedCount === 0;

  return {
    selectedCount,
    executedCount,
    passedCount,
    failedCount,
    blockedCount,
    notImplementedCount,
    skippedCount,
    notRunCount,
    passRatePercent,
    passRateDenominatorLabel: 'passed ÷ executed (excludes NOT_RUN; BLOCKED/NOT_IMPLEMENTED/SKIPPED are not passes)',
    allSelectedExecuted,
    goLiveReady,
  };
}

/** SQL CASE branches in migration 00115 (baseline); superseded by 00261 draft when applied. */
export const RPC_IMPLEMENTED_TEST_IDS = [
  'SEC-001', 'SEC-002', 'SEC-003', 'SEC-004', 'SEC-005',
  'ID-001', 'ID-002', 'ID-003', 'ID-004', 'ID-005',
  'INT-001', 'INT-002', 'INT-003', 'INT-004', 'INT-005', 'INT-006', 'INT-007', 'INT-008',
  'E2E-001', 'E2E-002', 'E2E-003', 'E2E-004',
  'UNIT-001', 'UNIT-002', 'UNIT-003',
] as const;

export function isUnknownTestIdForLegacyRpc(testId: string): boolean {
  return !RPC_IMPLEMENTED_TEST_IDS.includes(testId as (typeof RPC_IMPLEMENTED_TEST_IDS)[number]);
}
