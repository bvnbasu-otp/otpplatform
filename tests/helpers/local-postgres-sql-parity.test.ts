import { describe, expect, it } from 'vitest';
import { requireLocalPostgresSqlParity } from './local-postgres-sql-parity';

describe('local-postgres-sql-parity policy', () => {
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
