import { describe, expect, it } from 'vitest';
import {
  EXECUTABLE_DATABASE_RPC_TEST_IDS,
  EXTERNAL_RPC_CATALOG_REPLACEMENTS,
  HISTORICAL_RPC_CATALOG_TEST_IDS,
} from '../../scripts/regression-rpc-scope';

describe('master regression RPC scope', () => {
  it('runs only the twelve catalog cases that execute their labelled database checks', () => {
    expect(EXECUTABLE_DATABASE_RPC_TEST_IDS).toHaveLength(12);
    expect(new Set(EXECUTABLE_DATABASE_RPC_TEST_IDS).size).toBe(12);
  });

  it('accounts for every non-executable historical case through a mandatory replacement gate', () => {
    const replacements = Object.entries(EXTERNAL_RPC_CATALOG_REPLACEMENTS);
    expect(replacements).toHaveLength(13);
    expect(replacements.every(([, suites]) => suites.length > 0)).toBe(true);
    expect(new Set(HISTORICAL_RPC_CATALOG_TEST_IDS).size).toBe(25);
    expect(HISTORICAL_RPC_CATALOG_TEST_IDS).toHaveLength(25);
  });

  it('keeps executable RPCs and external replacement evidence disjoint', () => {
    const executable = new Set<string>(EXECUTABLE_DATABASE_RPC_TEST_IDS);
    expect(Object.keys(EXTERNAL_RPC_CATALOG_REPLACEMENTS).filter((id) => executable.has(id))).toEqual([]);
  });
});
