/**
 * Only cases that the historical admin RPC genuinely executes belong here.
 * The excluded catalog entries deliberately return BLOCKED/NOT_VERIFIED from
 * migration 00261 because they are fixture/schema probes, not their labelled
 * behavior. Their replacement suites are mandatory in the certification gate.
 */
export const EXECUTABLE_DATABASE_RPC_TEST_IDS = [
  'SEC-001', 'SEC-002', 'SEC-003', 'SEC-004',
  'INT-001', 'INT-003', 'INT-004', 'INT-005', 'INT-006', 'INT-007',
  'UNIT-001', 'UNIT-002',
] as const;

export const EXTERNAL_RPC_CATALOG_REPLACEMENTS = {
  'SEC-005': ['Live Database Integration & RLS Security Suite'],
  'ID-001': ['Web Features, Governance & State Machine Tests'],
  'ID-002': ['Web Features, Governance & State Machine Tests'],
  'ID-003': ['Web Features, Governance & State Machine Tests'],
  'ID-004': ['Web Features, Governance & State Machine Tests'],
  'ID-005': ['Web Features, Governance & State Machine Tests'],
  'INT-002': ['Real-Time End-to-End Live Call Flow Battery'],
  'INT-008': ['Network Discovery & External Services Adapters'],
  'E2E-001': ['Authenticated sourcing lifecycle Playwright gate'],
  'E2E-002': ['Authenticated sourcing lifecycle Playwright gate'],
  'E2E-003': ['Messaging Core & Web Routing Invariants'],
  'E2E-004': ['Authenticated sourcing lifecycle Playwright gate'],
  'UNIT-003': ['Messaging Core & Web Routing Invariants'],
} as const;

export const HISTORICAL_RPC_CATALOG_TEST_IDS = [
  ...EXECUTABLE_DATABASE_RPC_TEST_IDS,
  ...Object.keys(EXTERNAL_RPC_CATALOG_REPLACEMENTS),
] as const;
