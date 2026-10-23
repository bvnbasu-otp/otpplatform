/**
 * Strict Environment Guard for Demo & Reset Utilities.
 * Enforces ABSOLUTE SAFETY RULE: Production must NEVER be reset, purged, or seeded.
 */

import { DOCUMENTED_PRODUCTION_PROJECT_REF, normalizeDeploymentClass } from '../../packages/domain/src/deployment/deployment-target';

const PROD_HOST_PATTERNS = [
  'prod',
  'production',
  'supabase.co',
  'aws.neon.tech',
  'pooler.supabase.com',
  'rds.amazonaws.com',
  'cloudsql',
  'vercel-storage.com',
];

export function assertSafeEnvironment(context: string): void {
  const nodeEnv = (process.env.NODE_ENV ?? '').toLowerCase();
  const appEnv = (process.env.APP_ENV ?? '').toLowerCase();
  const dbUrl = process.env.DATABASE_URL ?? '';
  const supabaseUrl = process.env.SUPABASE_URL ?? '';

  if (nodeEnv === 'production' || appEnv === 'production') {
    throw new Error(
      `[SECURITY ERROR] Destructive operation "${context}" is strictly BLOCKED in production (NODE_ENV/APP_ENV="production").`
    );
  }

  const urlsToCheck = [dbUrl, supabaseUrl].filter(Boolean);
  for (const url of urlsToCheck) {
    try {
      // Parse as URL if possible, or search string
      const parsed = new URL(url.startsWith('postgresql://') || url.startsWith('postgres://') || url.startsWith('http') ? url : `http://${url}`);
      const hostname = parsed.hostname.toLowerCase();
      
      for (const pattern of PROD_HOST_PATTERNS) {
        if (hostname.includes(pattern)) {
          throw new Error(
            `[SECURITY ERROR] Destructive operation "${context}" is strictly BLOCKED against production database host: "${hostname}"`
          );
        }
      }
    } catch (e: any) {
      if (e.message?.startsWith('[SECURITY ERROR]')) {
        throw e;
      }
      // If parsing fails, do basic regex inspection
      const lowerUrl = url.toLowerCase();
      for (const pattern of PROD_HOST_PATTERNS) {
        if (lowerUrl.includes(pattern)) {
          throw new Error(
            `[SECURITY ERROR] Destructive operation "${context}" is strictly BLOCKED against potential production target containing pattern "${pattern}": "${url}"`
          );
        }
      }
    }
  }

  const deployment = normalizeDeploymentClass(process.env.OTP_DEPLOYMENT_TARGET);
  if (deployment === 'production') {
    throw new Error(
      `[SECURITY ERROR] Destructive operation "${context}" is strictly BLOCKED in production (OTP_DEPLOYMENT_TARGET).`
    );
  }
  const projectId = (process.env.SUPABASE_PROJECT_ID ?? '').trim();
  const projectRef = (process.env.SUPABASE_PROJECT_REF ?? '').trim();
  const projectBlob = [dbUrl, supabaseUrl, projectRef, projectId].filter(Boolean).join(' ');
  if (projectBlob.includes(DOCUMENTED_PRODUCTION_PROJECT_REF)) {
    throw new Error(
      `[SECURITY ERROR] Destructive operation "${context}" is strictly BLOCKED against production project ref.`
    );
  }
  if (deployment === 'invalid') {
    throw new Error(
      `[SECURITY ERROR] Destructive operation "${context}" is strictly BLOCKED for an unrecognized deployment target.`
    );
  }
  if (projectId && projectRef && projectId !== projectRef) {
    throw new Error(
      `[SECURITY ERROR] Destructive operation "${context}" is strictly BLOCKED because target identifiers disagree.`
    );
  }
}
