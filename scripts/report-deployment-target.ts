/**
 * Dry-run deployment target report. Prints hosts and project refs only.
 * Does not read secret files and does not contact a database.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DOCUMENTED_PRODUCTION_PROJECT_REF,
  LOCAL_PROJECT_ID,
  redactDeploymentReport,
  resolveDeploymentTarget,
} from '../packages/domain/src/deployment/deployment-target';

function hostClass(file: string): string {
  if (!existsSync(file)) return 'absent';
  const text = readFileSync(file, 'utf8');
  const line = text.split(/\r?\n/).find((entry) => /^(VITE_)?SUPABASE_URL=/.test(entry.trim()));
  if (!line) return 'present-no-url';
  const value = line.slice(line.indexOf('=') + 1).trim();
  if (/127\.0\.0\.1|localhost/i.test(value)) return 'loopback';
  if (value.includes(DOCUMENTED_PRODUCTION_PROJECT_REF)) return 'documented-production-ref';
  if (/supabase\.co/i.test(value)) return 'hosted-supabase-other';
  return 'other-host';
}

const report = redactDeploymentReport(
  resolveDeploymentTarget({
    deploymentTarget: process.env.OTP_DEPLOYMENT_TARGET ?? process.env.VITE_OTP_DEPLOYMENT_TARGET ?? null,
    supabaseUrl: process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? null,
    projectRef: process.env.VITE_SUPABASE_PROJECT_REF ?? process.env.SUPABASE_PROJECT_REF ?? process.env.SUPABASE_PROJECT_ID ?? null,
    productionSupabaseUrl: process.env.PRODUCTION_SUPABASE_URL ?? null,
    productionProjectRef: process.env.PRODUCTION_PROJECT_REF ?? null,
    demoMode: process.env.VITE_DEMO_MODE ?? null,
    serviceRoleKeyPresent: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY),
    viewMode: process.env.OTP_VIEW_MODE ?? null,
  }),
);

const configToml = readFileSync(resolve('supabase/config.toml'), 'utf8');
const localProject = configToml.match(/project_id\s*=\s*"([^"]+)"/)?.[1] ?? null;

console.log(JSON.stringify({
  processEnv: report,
  staticSources: [
    {
      source: 'supabase/config.toml',
      projectRef: localProject,
      selects: localProject === LOCAL_PROJECT_ID ? 'local' : 'unexpected',
    },
    {
      source: '.github/workflows/ci-cd.yml production job',
      projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
      selects: 'production',
    },
    {
      source: 'apps/web/.env',
      projectRef: hostClass('apps/web/.env') === 'loopback' ? LOCAL_PROJECT_ID : null,
      hostClass: hostClass('apps/web/.env'),
      selects: 'local-dev-file',
    },
    {
      source: 'non-production project',
      projectRef: null,
      selects: 'not-configured',
    },
    {
      source: '.env.otp.production.local',
      present: existsSync('.env.otp.production.local'),
      read: false,
      selects: 'not-used-unless-deployment-target-is-production',
    },
  ],
  credentials: 'redacted',
}, null, 2));
