import { expect } from 'vitest';
import type { ClientConfig } from 'pg';

export const LOCAL_POSTGRES_HOST = '127.0.0.1';
export const DEFAULT_LOCAL_POSTGRES_PORT = 54322;

/**
 * LOCAL_PG_PORT selects another loopback Supabase stack. Only the port is
 * configurable; the host is always 127.0.0.1 so a hosted database cannot be
 * targeted through the environment.
 */
export function resolveLocalPostgresPort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_LOCAL_POSTGRES_PORT;
  const value = raw.trim();
  if (!/^\d+$/.test(value)) {
    throw new Error(`LOCAL_PG_PORT must be a decimal port number, got ${JSON.stringify(raw)}`);
  }
  const port = Number(value);
  if (port < 1024 || port > 65535) {
    throw new Error(`LOCAL_PG_PORT must be between 1024 and 65535, got ${port}`);
  }
  return port;
}

export const LOCAL_POSTGRES_PORT = resolveLocalPostgresPort(process.env.LOCAL_PG_PORT);
export const LOCAL_POSTGRES_ADDRESS = `${LOCAL_POSTGRES_HOST}:${LOCAL_POSTGRES_PORT}`;

/** Local Supabase Docker Postgres — never hosted. */
export const LOCAL_POSTGRES_CONFIG: ClientConfig = {
  host: LOCAL_POSTGRES_HOST,
  port: LOCAL_POSTGRES_PORT,
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
    return `SQL parity requires local Docker Postgres only (${LOCAL_POSTGRES_ADDRESS}); hosted or remote DB is rejected (${skipReason})`;
  }
  if (dbUp && !migrationApplied) {
    return `SQL parity migration/function missing on local Postgres: ${skipReason}. Validate the exact repository chain through 00330 on an isolated disposable database.`;
  }
  if (!dbUp) {
    return `Local Postgres unreachable at ${LOCAL_POSTGRES_ADDRESS} (${skipReason}). Start Supabase locally and wait for container supabase_db_otp-local.`;
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
