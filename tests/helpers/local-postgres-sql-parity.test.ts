import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCAL_POSTGRES_PORT,
  LOCAL_POSTGRES_CONFIG,
  requireLocalPostgresSqlParity,
  resolveLocalPostgresPort,
} from './local-postgres-sql-parity';

describe('local-postgres-sql-parity policy', () => {
  it('pins the host to loopback and validates LOCAL_PG_PORT', () => {
    expect(LOCAL_POSTGRES_CONFIG.host).toBe('127.0.0.1');
    expect(resolveLocalPostgresPort(undefined)).toBe(DEFAULT_LOCAL_POSTGRES_PORT);
    expect(resolveLocalPostgresPort('')).toBe(54322);
    expect(resolveLocalPostgresPort('56322')).toBe(56322);
    expect(() => resolveLocalPostgresPort('db.example.com:5432')).toThrow(/decimal port/);
    expect(() => resolveLocalPostgresPort('postgres://evil:5432')).toThrow(/decimal port/);
    expect(() => resolveLocalPostgresPort('80')).toThrow(/between 1024 and 65535/);
    expect(() => resolveLocalPostgresPort('70000')).toThrow(/between 1024 and 65535/);
  });

  it('honours REQUIRE_LOCAL_POSTGRES_SQL_PARITY override', () => {
    const prevCi = process.env.CI;
    const prevReq = process.env.REQUIRE_LOCAL_POSTGRES_SQL_PARITY;
    try {
      delete process.env.CI;
      process.env.REQUIRE_LOCAL_POSTGRES_SQL_PARITY = 'true';
      expect(requireLocalPostgresSqlParity()).toBe(true);
      process.env.REQUIRE_LOCAL_POSTGRES_SQL_PARITY = 'false';
      expect(requireLocalPostgresSqlParity()).toBe(false);
    } finally {
      if (prevCi === undefined) delete process.env.CI;
      else process.env.CI = prevCi;
      if (prevReq === undefined) delete process.env.REQUIRE_LOCAL_POSTGRES_SQL_PARITY;
      else process.env.REQUIRE_LOCAL_POSTGRES_SQL_PARITY = prevReq;
    }
  });

  it('defaults to required when CI=true and override unset', () => {
    const prevCi = process.env.CI;
    const prevReq = process.env.REQUIRE_LOCAL_POSTGRES_SQL_PARITY;
    try {
      delete process.env.REQUIRE_LOCAL_POSTGRES_SQL_PARITY;
      process.env.CI = 'true';
      expect(requireLocalPostgresSqlParity()).toBe(true);
    } finally {
      if (prevCi === undefined) delete process.env.CI;
      else process.env.CI = prevCi;
      if (prevReq === undefined) delete process.env.REQUIRE_LOCAL_POSTGRES_SQL_PARITY;
      else process.env.REQUIRE_LOCAL_POSTGRES_SQL_PARITY = prevReq;
    }
  });
});
