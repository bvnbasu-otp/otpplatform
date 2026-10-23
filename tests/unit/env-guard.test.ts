import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { assertSafeEnvironment } from '../../scripts/demo/env-guard';

describe('Phase 21-23 — Multi-Environment Deterministic Reset & Safety Guard', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NODE_ENV;
    delete process.env.APP_ENV;
    delete process.env.DATABASE_URL;
    delete process.env.SUPABASE_URL;
    delete process.env.OTP_DEPLOYMENT_TARGET;
    delete process.env.SUPABASE_PROJECT_REF;
    delete process.env.SUPABASE_PROJECT_ID;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('allows execution in development or local environment', () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
    process.env.SUPABASE_URL = 'http://127.0.0.1:54321';

    expect(() => assertSafeEnvironment('reset-demo')).not.toThrow();
  });

  it('strictly blocks reset when NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => assertSafeEnvironment('reset-demo')).toThrow(/strictly BLOCKED in production/);
  });

  it('strictly blocks reset when APP_ENV is production', () => {
    process.env.APP_ENV = 'production';
    expect(() => assertSafeEnvironment('seed-demo')).toThrow(/strictly BLOCKED in production/);
  });

  it('strictly blocks destructive operation if DATABASE_URL contains production host (supabase.co)', () => {
    process.env.DATABASE_URL = 'postgresql://postgres:secret@db.abcxyz.supabase.co:5432/postgres';
    expect(() => assertSafeEnvironment('clear-transactions')).toThrow(/production database host/);
  });

  it('strictly blocks destructive operation if DATABASE_URL contains aws.neon.tech', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@ep-cool-fog-123.aws.neon.tech/neondb';
    expect(() => assertSafeEnvironment('reset-demo')).toThrow(/production database host/);
  });

  it('strictly blocks destructive operation if DATABASE_URL contains pooler.supabase.com', () => {
    process.env.DATABASE_URL = 'postgresql://postgres.project:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
    expect(() => assertSafeEnvironment('seed-demo')).toThrow(/production database host/);
  });

  it('strictly blocks destructive operation if SUPABASE_URL contains prod keyword', () => {
    process.env.SUPABASE_URL = 'https://prod-otp.supabase.co';
    expect(() => assertSafeEnvironment('reset-demo')).toThrow(/production database host/);
  });

  it('strictly blocks destructive operation if SUPABASE_URL contains rds.amazonaws.com', () => {
    process.env.SUPABASE_URL = 'https://otp-postgres.rds.amazonaws.com';
    expect(() => assertSafeEnvironment('clear-transactions')).toThrow(/production database host/);
  });

  it('strictly blocks destructive operation when the deployment class is production', () => {
    process.env.OTP_DEPLOYMENT_TARGET = 'production';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
    expect(() => assertSafeEnvironment('seed-demo')).toThrow(/OTP_DEPLOYMENT_TARGET/);
  });

  it('strictly blocks destructive operation against the documented production project ref', () => {
    process.env.SUPABASE_PROJECT_REF = 'qsuvtcezffomtwzwyrso';
    expect(() => assertSafeEnvironment('seed-demo')).toThrow(/production project ref/);
  });

  it('strictly blocks an unrecognized deployment label', () => {
    process.env.OTP_DEPLOYMENT_TARGET = 'qa-lab';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
    expect(() => assertSafeEnvironment('seed-demo')).toThrow(/unrecognized deployment target/);
  });

  it('strictly blocks conflicting project identifiers', () => {
    process.env.SUPABASE_PROJECT_ID = 'abcdefghijklmnopqrst';
    process.env.SUPABASE_PROJECT_REF = 'bcdefghijklmnopqrstu';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
    expect(() => assertSafeEnvironment('seed-demo')).toThrow(/target identifiers disagree/);
  });

  it('strictly blocks destructive operation if DATABASE_URL contains vercel-storage.com', () => {
    process.env.DATABASE_URL = 'postgres://default:pass@ep-sample-123.us-east-1.postgres.vercel-storage.com:5432/verceldb';
    expect(() => assertSafeEnvironment('reset-demo')).toThrow(/production database host/);
  });
});
