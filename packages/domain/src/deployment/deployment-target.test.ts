import { describe, expect, it } from 'vitest';
import {
  CI_BUILD_VALIDATION_URL,
  DOCUMENTED_PRODUCTION_PROJECT_REF,
  LOCAL_PROJECT_ID,
  LOCAL_SUPABASE_URL,
  assertDemoSeedTarget,
  assertMigrationTarget,
  redactDatabaseTargetSummary,
  redactDeploymentReport,
  redactDiagnosticText,
  resolveDeploymentTarget,
} from './deployment-target';
import { resolveDeploymentTarget as resolveFromDomainBarrel } from '../index';

const PRODUCTION_URL = `https://${DOCUMENTED_PRODUCTION_PROJECT_REF}.supabase.co`;
const OTHER_REF = 'abcdefghijklmnopqrst';
const OTHER_URL = `https://${OTHER_REF}.supabase.co`;

describe('deployment target resolution', () => {
  it('exports the deployment resolver through the domain package barrel', () => {
    expect(resolveFromDomainBarrel).toBe(resolveDeploymentTarget);
  });

  it('selects the local loopback project when the target is undeclared on localhost', () => {
    const result = resolveDeploymentTarget({
      pageHostname: 'localhost',
    });
    expect(result.ok).toBe(true);
    expect(result.deploymentClass).toBe('local');
    expect(result.projectRef).toBe(LOCAL_PROJECT_ID);
    expect(result.supabaseUrl).toBe(LOCAL_SUPABASE_URL);
    expect(result.demoSeedAllowed).toBe(true);
    expect(result.configSource).toBe('implicit-local-loopback');
  });

  it('does not let the viewport toggle change the database target', () => {
    const desktop = resolveDeploymentTarget({
      deploymentTarget: 'local',
      supabaseUrl: LOCAL_SUPABASE_URL,
      viewMode: 'desktop',
    });
    const mobile = resolveDeploymentTarget({
      deploymentTarget: 'local',
      supabaseUrl: LOCAL_SUPABASE_URL,
      viewMode: 'mobile',
    });
    expect(redactDeploymentReport(desktop)).toEqual(redactDeploymentReport(mobile));
    expect(desktop.viewModeIgnored).toBe(true);
  });

  it('fails closed when non-production vars are absent even if a production URL is available', () => {
    const result = resolveDeploymentTarget({
      deploymentTarget: 'non-production',
      supabaseUrl: '',
      productionSupabaseUrl: PRODUCTION_URL,
      productionProjectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
    });
    expect(result.ok).toBe(false);
    expect(result.databaseSelected).toBe(false);
    expect(result.projectRef).toBeNull();
    expect(result.failure).toMatch(/not configured/);
    expect(result.failure).toMatch(/production/);
  });

  it('fails closed when a non-production URL is the production project', () => {
    const result = resolveDeploymentTarget({
      deploymentTarget: 'staging',
      supabaseUrl: PRODUCTION_URL,
      projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
    });
    expect(result.ok).toBe(false);
    expect(result.databaseSelected).toBe(false);
    expect(result.failure).toMatch(/production project/);
  });

  it('accepts an explicitly configured non-production project that is not production', () => {
    const result = resolveDeploymentTarget({
      deploymentTarget: 'non-production',
      supabaseUrl: OTHER_URL,
      projectRef: OTHER_REF,
    });
    expect(result.ok).toBe(true);
    expect(result.projectRef).toBe(OTHER_REF);
    expect(result.nonProductionProjectConfigured).toBe(true);
    expect(result.demoSeedAllowed).toBe(false);
  });

  it('treats the CI validation URL as no database and not as production', () => {
    const result = resolveDeploymentTarget({
      deploymentTarget: 'non-production',
      supabaseUrl: CI_BUILD_VALIDATION_URL,
      demoMode: 'false',
      viteProductionBuild: true,
    });
    expect(result.ok).toBe(true);
    expect(result.databaseSelected).toBe(false);
    expect(result.projectRef).toBeNull();
    expect(result.nonProductionProjectConfigured).toBe(false);
    expect(result.configSource).toBe('ci-build-validation-sentinel');
  });

  it('fails closed when production class and project ref disagree', () => {
    const result = resolveDeploymentTarget({
      deploymentTarget: 'production',
      supabaseUrl: OTHER_URL,
      projectRef: OTHER_REF,
      demoMode: 'false',
    });
    expect(result.ok).toBe(false);
    expect(result.failure).toMatch(/disagree/);
  });

  it('selects the documented production ref only when class and URL agree', () => {
    const result = resolveDeploymentTarget({
      deploymentTarget: 'production',
      supabaseUrl: PRODUCTION_URL,
      demoMode: 'false',
      anonKey: 'header.payload.sig',
    });
    expect(result.ok).toBe(true);
    expect(result.projectRef).toBe(DOCUMENTED_PRODUCTION_PROJECT_REF);
    expect(result.demoSeedAllowed).toBe(false);
  });

  it('refuses demo mode on production', () => {
    const result = resolveDeploymentTarget({
      deploymentTarget: 'production',
      supabaseUrl: PRODUCTION_URL,
      demoMode: 'true',
    });
    expect(result.ok).toBe(false);
    expect(result.demoSeedAllowed).toBe(false);
    expect(result.failure).toMatch(/demo mode/);
  });

  it('refuses a service-role key in the client', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
    const result = resolveDeploymentTarget({
      deploymentTarget: 'local',
      supabaseUrl: LOCAL_SUPABASE_URL,
      anonKey: `${header}.${payload}.sig`,
    });
    expect(result.ok).toBe(false);
    expect(result.failure).toMatch(/service-role/);
    expect(redactDeploymentReport(result).credentials).toBe('redacted');
  });

  it('does not use a custom page host as the database when no target is configured', () => {
    const result = resolveDeploymentTarget({
      pageHostname: 'otpplatform-theta.vercel.app',
    });
    expect(result.ok).toBe(false);
    expect(result.databaseSelected).toBe(false);
    expect(result.failure).toMatch(/not a database target/);
  });

  it('blocks demo seed against the production ref and against a production class', () => {
    expect(() =>
      assertDemoSeedTarget({
        SUPABASE_URL: PRODUCTION_URL,
      }),
    ).toThrow(/production project ref/);
    expect(() =>
      assertDemoSeedTarget({
        OTP_DEPLOYMENT_TARGET: 'production',
        SUPABASE_URL: LOCAL_SUPABASE_URL,
      }),
    ).toThrow(/blocked for production/);
  });

  it('blocks a non-production migration that would use the production project', () => {
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'non-production',
        connectionString: `postgresql://postgres.${DOCUMENTED_PRODUCTION_PROJECT_REF}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
        projectRef: OTHER_REF,
        supabaseUrl: OTHER_URL,
      }),
    ).toThrow(/production project/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'non-production',
        connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        projectRef: OTHER_REF,
        supabaseUrl: PRODUCTION_URL,
      }),
    ).toThrow(/production project/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'non-production',
      }),
    ).toThrow(/not configured/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'non-production',
        connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      }),
    ).toThrow(/VITE_SUPABASE_URL/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'non-production',
        connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
        projectRef: OTHER_REF,
        supabaseUrl: OTHER_URL,
      }),
    ).toThrow(/identifiers disagree/);
    expect(() =>
      assertMigrationTarget({
        connectionString: `postgresql://postgres.${DOCUMENTED_PRODUCTION_PROJECT_REF}@db.${DOCUMENTED_PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`,
      }),
    ).toThrow(/must not select the production project/);
  });
});

describe('migration target identity', () => {
  const stagingRef = 'bcdefghijklmnopqrstu';
  const stagingUrl = `https://${stagingRef}.supabase.co`;
  const localConnection = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  const stagingDirect = `postgresql://postgres:staging-secret@db.${stagingRef}.supabase.co:5432/postgres`;
  const stagingPooler = `postgresql://postgres.${stagingRef}:staging-secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;
  const productionDirect = `postgresql://postgres:prod-secret@db.${DOCUMENTED_PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`;
  const productionPooler = `postgresql://postgres.${DOCUMENTED_PRODUCTION_PROJECT_REF}:prod-secret@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`;

  it('rejects an unrecognized deployment label', () => {
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'qa-lab',
        connectionString: localConnection,
      }),
    ).toThrow(/not local, non-production, or production/);
  });

  it('does not let a production ref or URL override a local connection', () => {
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'production',
        connectionString: `postgresql://postgres:secret-${DOCUMENTED_PRODUCTION_PROJECT_REF}@127.0.0.1:54322/postgres`,
        projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
        supabaseUrl: PRODUCTION_URL,
      }),
    ).toThrow(/disagree/);
  });

  it('does not let a production ref or URL override a staging connection', () => {
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'production',
        connectionString: `postgresql://postgres.${stagingRef}:secret-${DOCUMENTED_PRODUCTION_PROJECT_REF}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
        projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
        supabaseUrl: PRODUCTION_URL,
      }),
    ).toThrow(/disagree/);
  });

  it('requires an explicit verifiable production connection', () => {
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'production',
        projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
        supabaseUrl: PRODUCTION_URL,
      }),
    ).toThrow(/explicit connection/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'production',
        connectionString: `postgresql://postgres:secret@aws-0-ap-south-1.pooler.supabase.com:6543/${DOCUMENTED_PRODUCTION_PROJECT_REF}`,
        projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
        supabaseUrl: PRODUCTION_URL,
      }),
    ).toThrow(/explicit connection/);
  });

  it('accepts a documented production direct connection and a pooler connection', () => {
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'production',
        connectionString: productionDirect,
        projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
        supabaseUrl: PRODUCTION_URL,
      }),
    ).not.toThrow();
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'prod',
        connectionString: productionPooler,
      }),
    ).not.toThrow();
  });

  it('rejects non-production connection, ref, and URL mismatches', () => {
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'non-production',
        connectionString: stagingDirect,
        projectRef: OTHER_REF,
        supabaseUrl: stagingUrl,
      }),
    ).toThrow(/identifiers disagree/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'staging',
        connectionString: stagingPooler,
        projectRef: stagingRef,
        supabaseUrl: OTHER_URL,
      }),
    ).toThrow(/identifiers disagree/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'non-production',
        connectionString: 'postgresql://not a url',
        projectRef: stagingRef,
        supabaseUrl: stagingUrl,
      }),
    ).toThrow(/malformed or cannot be identified/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'non-production',
        connectionString: stagingDirect,
        projectRef: stagingRef,
        supabaseUrl: stagingUrl,
      }),
    ).not.toThrow();
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'demo',
        connectionString: stagingPooler,
        projectRef: stagingRef,
        supabaseUrl: stagingUrl,
      }),
    ).not.toThrow();
  });

  it('does not guess a hosted project for a local or undeclared target', () => {
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'local',
        connectionString: stagingDirect,
      }),
    ).toThrow(/hosted project/);
    expect(() =>
      assertMigrationTarget({
        connectionString: stagingPooler,
      }),
    ).toThrow(/hosted project/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'local',
        connectionString: localConnection,
      }),
    ).not.toThrow();
  });

  it('rejects invalid demo-seed labels and conflicting target identifiers', () => {
    expect(() =>
      assertDemoSeedTarget({
        OTP_DEPLOYMENT_TARGET: 'qa-lab',
        DATABASE_URL: localConnection,
        SUPABASE_URL: LOCAL_SUPABASE_URL,
      }),
    ).toThrow(/unrecognized deployment target/);
    expect(() =>
      assertDemoSeedTarget({
        OTP_DEPLOYMENT_TARGET: 'local',
        DATABASE_URL: stagingDirect,
        SUPABASE_URL: stagingUrl,
        SUPABASE_PROJECT_REF: stagingRef,
      }),
    ).toThrow(/identifiers disagree/);
    expect(() =>
      assertDemoSeedTarget({
        SUPABASE_URL: stagingUrl,
        SUPABASE_PROJECT_REF: OTHER_REF,
      }),
    ).toThrow(/identifiers disagree/);
    expect(() =>
      assertDemoSeedTarget({
        OTP_DEPLOYMENT_TARGET: 'local',
        DATABASE_URL: localConnection,
        SUPABASE_URL: LOCAL_SUPABASE_URL,
      }),
    ).not.toThrow();
  });

  it('redacts database credentials in diagnostic output', () => {
    const connection = `postgresql://postgres.${DOCUMENTED_PRODUCTION_PROJECT_REF}:super-secret-password@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;
    const summary = redactDatabaseTargetSummary(connection);
    expect(summary).toContain('aws-0-ap-south-1.pooler.supabase.com');
    expect(summary).toContain(DOCUMENTED_PRODUCTION_PROJECT_REF);
    expect(summary).not.toContain('super-secret-password');
    expect(summary).not.toContain('--db-url');
    expect(summary).not.toContain('postgresql://');

    const leaked = `Command failed: supabase db push --db-url "${connection}"`;
    const redacted = redactDiagnosticText(leaked, connection);
    expect(redacted).not.toContain('super-secret-password');
    expect(redacted).not.toContain(connection);
    expect(redacted).not.toContain('postgresql://');
    expect(redacted).toContain('--db-url [redacted]');
  });
});

describe('production acceptance ignores embedded project refs', () => {
  const stagingRef = 'bcdefghijklmnopqrstu';
  const stagingUrl = `https://${stagingRef}.supabase.co`;
  const stagingDirect = `postgresql://postgres:staging-secret@db.${stagingRef}.supabase.co:5432/postgres`;
  const stagingPooler = `postgresql://postgres.${stagingRef}:staging-secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;
  const productionDirect = `postgresql://postgres:prod-secret@db.${DOCUMENTED_PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`;
  const productionPooler = `postgresql://postgres.${DOCUMENTED_PRODUCTION_PROJECT_REF}:prod-secret@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`;
  const unrelated = `postgresql://postgres:secret@cdn.example.com:5432/${DOCUMENTED_PRODUCTION_PROJECT_REF}?upstream=https://${DOCUMENTED_PRODUCTION_PROJECT_REF}.supabase.co`;

  it('rejects local, staging, malformed, and unidentifiable connections that only mention production', () => {
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'production',
        connectionString: `postgresql://postgres:secret-${DOCUMENTED_PRODUCTION_PROJECT_REF}@127.0.0.1:54322/postgres`,
        projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
        supabaseUrl: PRODUCTION_URL,
      }),
    ).toThrow(/disagree/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'production',
        connectionString: `postgresql://postgres.${stagingRef}:secret-${DOCUMENTED_PRODUCTION_PROJECT_REF}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
        projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
        supabaseUrl: PRODUCTION_URL,
      }),
    ).toThrow(/disagree/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'production',
        connectionString: `postgresql://postgres:secret@db.${stagingRef}.supabase.co:5432/${DOCUMENTED_PRODUCTION_PROJECT_REF}`,
        projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
        supabaseUrl: PRODUCTION_URL,
      }),
    ).toThrow(/disagree/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'production',
        connectionString: `postgresql://postgres:secret@aws-0-ap-south-1.pooler.supabase.com:6543/${DOCUMENTED_PRODUCTION_PROJECT_REF}`,
        projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
        supabaseUrl: PRODUCTION_URL,
      }),
    ).toThrow(/explicit connection/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'production',
        connectionString: unrelated,
        projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
        supabaseUrl: PRODUCTION_URL,
      }),
    ).toThrow(/explicit connection/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'production',
        connectionString: `postgresql://postgres.${DOCUMENTED_PRODUCTION_PROJECT_REF}:secret@cdn.example.com:5432/postgres`,
        projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
        supabaseUrl: PRODUCTION_URL,
      }),
    ).toThrow(/explicit connection/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'production',
        connectionString: `https://${DOCUMENTED_PRODUCTION_PROJECT_REF}.supabase.co`,
        projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
        supabaseUrl: PRODUCTION_URL,
      }),
    ).toThrow(/explicit connection/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'production',
        connectionString: productionDirect,
        projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
        supabaseUrl: `https://cdn.example.com/${DOCUMENTED_PRODUCTION_PROJECT_REF}.supabase.co`,
      }),
    ).toThrow(/disagree/);
  });

  it('rejects a selected URL that disagrees even when a lower-priority URL matches production', () => {
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'production',
        connectionString: stagingDirect,
        projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
        supabaseUrl: PRODUCTION_URL,
        suppliedConnectionStrings: [productionDirect, productionPooler],
        suppliedSupabaseUrls: [PRODUCTION_URL],
        suppliedProjectRefs: [DOCUMENTED_PRODUCTION_PROJECT_REF],
      }),
    ).toThrow(/disagree/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'production',
        connectionString: productionDirect,
        projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
        supabaseUrl: OTHER_URL,
        suppliedSupabaseUrls: [PRODUCTION_URL],
      }),
    ).toThrow(/disagree/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'production',
        connectionString: productionDirect,
        projectRef: OTHER_REF,
        supabaseUrl: PRODUCTION_URL,
        suppliedProjectRefs: [DOCUMENTED_PRODUCTION_PROJECT_REF],
      }),
    ).toThrow(/disagree/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'production',
        connectionString: `postgresql://postgres:${DOCUMENTED_PRODUCTION_PROJECT_REF}@127.0.0.1:54322/postgres`,
        projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
        supabaseUrl: PRODUCTION_URL,
        suppliedConnectionStrings: [productionDirect],
      }),
    ).toThrow(/disagree/);
  });

  it('rejects lower-priority URLs and project refs that disagree with the selected connection', () => {
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'production',
        connectionString: productionDirect,
        projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
        supabaseUrl: PRODUCTION_URL,
        suppliedConnectionStrings: [productionDirect, stagingPooler],
      }),
    ).toThrow(/disagree/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'production',
        connectionString: productionDirect,
        projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
        supabaseUrl: PRODUCTION_URL,
        suppliedSupabaseUrls: [PRODUCTION_URL, stagingUrl],
      }),
    ).toThrow(/disagree/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'production',
        connectionString: productionDirect,
        projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
        supabaseUrl: PRODUCTION_URL,
        suppliedProjectRefs: [DOCUMENTED_PRODUCTION_PROJECT_REF, stagingRef],
      }),
    ).toThrow(/disagree/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'production',
        connectionString: productionDirect,
        projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
        supabaseUrl: PRODUCTION_URL,
        suppliedConnectionStrings: [
          productionDirect,
          `postgresql://postgres:secret-${DOCUMENTED_PRODUCTION_PROJECT_REF}@127.0.0.1:54322/postgres`,
        ],
      }),
    ).toThrow(/disagree/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'production',
        connectionString: productionDirect,
        projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
        supabaseUrl: PRODUCTION_URL,
        suppliedConnectionStrings: [productionDirect, unrelated],
      }),
    ).toThrow(/disagree/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'non-production',
        connectionString: stagingDirect,
        projectRef: stagingRef,
        supabaseUrl: stagingUrl,
        suppliedConnectionStrings: [stagingPooler, productionDirect],
      }),
    ).toThrow(/production project/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'non-production',
        connectionString: stagingDirect,
        projectRef: stagingRef,
        supabaseUrl: stagingUrl,
        suppliedConnectionStrings: [stagingDirect, `postgresql://postgres:secret@db.${OTHER_REF}.supabase.co:5432/postgres`],
      }),
    ).toThrow(/identifiers disagree/);
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'staging',
        connectionString: stagingPooler,
        projectRef: stagingRef,
        supabaseUrl: stagingUrl,
        suppliedSupabaseUrls: [OTHER_URL],
        suppliedProjectRefs: [OTHER_REF],
      }),
    ).toThrow(/identifiers disagree/);
  });

  it('accepts production only when the selected connection and every supplied identifier agree', () => {
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'production',
        connectionString: productionDirect,
        projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF.toUpperCase(),
        supabaseUrl: PRODUCTION_URL,
        suppliedProjectRefs: [DOCUMENTED_PRODUCTION_PROJECT_REF],
        suppliedSupabaseUrls: [PRODUCTION_URL, PRODUCTION_URL],
        suppliedConnectionStrings: [productionDirect, productionPooler],
      }),
    ).not.toThrow();
    expect(() =>
      assertMigrationTarget({
        deploymentTarget: 'non-production',
        connectionString: stagingDirect,
        projectRef: stagingRef,
        supabaseUrl: stagingUrl,
        suppliedProjectRefs: [stagingRef.toUpperCase()],
        suppliedSupabaseUrls: [stagingUrl],
        suppliedConnectionStrings: [stagingDirect, stagingPooler],
      }),
    ).not.toThrow();
  });

  it('still blocks demo seed when a production ref is embedded in a local password', () => {
    expect(() =>
      assertDemoSeedTarget({
        OTP_DEPLOYMENT_TARGET: 'local',
        DATABASE_URL: `postgresql://postgres:secret-${DOCUMENTED_PRODUCTION_PROJECT_REF}@127.0.0.1:54322/postgres`,
        SUPABASE_URL: LOCAL_SUPABASE_URL,
      }),
    ).toThrow(/production project ref/);
  });
});
