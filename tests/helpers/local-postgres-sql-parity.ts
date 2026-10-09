import { expect } from 'vitest';
import type { ClientConfig } from 'pg';

/** Local Supabase Docker Postgres — never hosted. */
export const LOCAL_POSTGRES_CONFIG: ClientConfig = {
  host: '127.0.0.1',
  port: 54322,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

/**
 * When true, missing local Postgres or required migration is a hard failure (CI).
 * When false, SQL parity cases log a skip reason and do not assert parity (local dev).
 */
export function requireLocalPostgresSqlParity(): boolean {
  const explicit = process.env.REQUIRE_LOCAL_POSTGRES_SQL_PARITY;
  if (explicit === 'true' || explicit === '1') return true;
  if (explicit === 'false' || explicit === '0') return false;
  return process.env.CI === 'true' || process.env.CI === '1';
}

export function assertSqlParityInfrastructure(
  dbUp: boolean,
  migrationApplied: boolean,
  skipReason: string,
): void {
  if (dbUp && migrationApplied) return;

  if (requireLocalPostgresSqlParity()) {
    expect(migrationApplied, skipReason).toBe(true);
    return;
  }

  console.warn(`[SKIP REASON] SQL parity unavailable: ${skipReason}`);
}

export function skipSqlParityCaseUnlessReady(
  dbUp: boolean,
  migrationApplied: boolean,
  skipReason: string,
  context?: string,
): boolean {
  if (dbUp && migrationApplied) return false;

  if (requireLocalPostgresSqlParity()) {
    expect(migrationApplied, context ? `${context}: ${skipReason}` : skipReason).toBe(true);
    return true;
  }

  const prefix = context ? `[SKIP REASON] ${context}` : '[SKIP REASON] SQL parity';
  console.warn(`${prefix}: ${skipReason}`);
  return true;
}
