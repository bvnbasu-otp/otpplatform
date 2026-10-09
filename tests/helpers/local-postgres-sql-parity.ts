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

/** Human-readable failure when SQL parity cannot run (CI hard-fail messages). */
export function formatSqlParityUnavailableReason(
  dbUp: boolean,
  migrationApplied: boolean,
  skipReason: string,
): string {
  const lower = skipReason.toLowerCase();
  if (lower.includes('refusing non-local') || lower.includes('non-local postgres')) {
    return `SQL parity requires local Docker Postgres only (127.0.0.1:54322); hosted or remote DB is rejected (${skipReason})`;
  }
  if (dbUp && !migrationApplied) {
    return `SQL parity migration/function missing on local Postgres: ${skipReason}. Apply repo migrations through 00260 (private.js_string_utf16_length).`;
  }
  if (!dbUp) {
    return `Local Postgres unreachable at 127.0.0.1:54322 (${skipReason}). Start Supabase locally and wait for container supabase_db_otp-local.`;
  }
  return skipReason;
}

export function assertSqlParityInfrastructure(
  dbUp: boolean,
  migrationApplied: boolean,
  skipReason: string,
): void {
  if (dbUp && migrationApplied) return;

  const detail = formatSqlParityUnavailableReason(dbUp, migrationApplied, skipReason);

  if (requireLocalPostgresSqlParity()) {
    if (!dbUp) {
      expect(dbUp, detail).toBe(true);
    } else {
      expect(migrationApplied, detail).toBe(true);
    }
    return;
  }

  console.warn(`[SKIP REASON] SQL parity unavailable: ${detail}`);
}

export function skipSqlParityCaseUnlessReady(
  dbUp: boolean,
  migrationApplied: boolean,
  skipReason: string,
  context?: string,
): boolean {
  if (dbUp && migrationApplied) return false;

  const detail = formatSqlParityUnavailableReason(dbUp, migrationApplied, skipReason);
  const message = context ? `${context}: ${detail}` : detail;

  if (requireLocalPostgresSqlParity()) {
    if (!dbUp) {
      expect(dbUp, message).toBe(true);
    } else {
      expect(migrationApplied, message).toBe(true);
    }
    return true;
  }

  const prefix = context ? `[SKIP REASON] ${context}` : '[SKIP REASON] SQL parity';
  console.warn(`${prefix}: ${detail}`);
  return true;
}
