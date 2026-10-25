import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertDbContainer,
  assertMarker,
  assertNoLinkState,
  assertWorkdirLocation,
  derivePorts,
  readMarker,
} from './disposable-migration-validation';

export interface DisposableRegressionTarget {
  projectId: string;
  workdir: string;
  container: string;
  apiUrl: string;
  dbPort: number;
  anonKey: string;
  serviceRoleKey: string;
}

const FORBIDDEN_REMOTE_ENV = [
  'DATABASE_URL', 'DIRECT_URL', 'DATABASE_POOLER_URL', 'SUPABASE_DB_URL', 'POSTGRES_URL',
  'POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING', 'PGHOST', 'PGPORT', 'PGUSER',
  'PGPASSWORD', 'PGDATABASE', 'PGSERVICE', 'PGSERVICEFILE', 'PGPASSFILE',
  'SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_REF', 'SUPABASE_DB_PASSWORD', 'DB_PASSWORD',
];

export function resolveDisposableRegressionTarget(
  env: NodeJS.ProcessEnv,
  repoRoot: string,
): DisposableRegressionTarget {
  const projectId = env.OTP_DISPOSABLE_PROJECT_ID?.trim();
  const workdir = env.OTP_DISPOSABLE_WORKDIR?.trim();
  if (!projectId || !workdir) throw new Error('Disposable project identity and workdir are required');
  if (!/^otp-disposable-[a-z0-9]{8,24}$/.test(projectId)) throw new Error('Regression project id is not disposable');
  assertWorkdirLocation(workdir, repoRoot);

  const marker = readMarker(workdir);
  assertMarker(marker, { projectId, portBase: marker.portBase });
  assertNoLinkState(workdir, false);
  const ports = derivePorts(marker.portBase);
  const configPath = path.join(workdir, 'supabase', 'config.toml');
  if (!fs.existsSync(configPath)) throw new Error('Disposable Supabase configuration is missing');
  const config = fs.readFileSync(configPath, 'utf8');
  if (!config.includes(`project_id = "${projectId}"`) || !config.includes(`port = ${ports.api}`)) {
    throw new Error('Disposable Supabase configuration does not match its marker');
  }

  const apiUrl = `http://127.0.0.1:${ports.api}`;
  if (env.SUPABASE_URL !== apiUrl || env.VITE_SUPABASE_URL !== apiUrl) {
    throw new Error('Both Supabase API variables must target the marker-bound loopback port');
  }
  if (Number(env.LOCAL_PG_PORT) !== ports.db) throw new Error('LOCAL_PG_PORT does not match the disposable marker');
  for (const name of FORBIDDEN_REMOTE_ENV) {
    if ((env[name] ?? '').trim()) throw new Error(`Remote database environment variable is forbidden: ${name}`);
  }
  if (env.SUPABASE_PROJECT_ID && env.SUPABASE_PROJECT_ID !== projectId) {
    throw new Error('SUPABASE_PROJECT_ID conflicts with the disposable project id');
  }

  const anonKey = env.SUPABASE_ANON_KEY?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!anonKey || !serviceRoleKey) throw new Error('Disposable Supabase API keys are required');

  const container = assertDbContainer(projectId, ports, env);
  return { projectId, workdir, container, apiUrl, dbPort: ports.db, anonKey, serviceRoleKey };
}

export async function assertDisposableRestReady(target: DisposableRegressionTarget): Promise<void> {
  const response = await fetch(`${target.apiUrl}/rest/v1/`, {
    headers: {
      apikey: target.serviceRoleKey,
      Authorization: `Bearer ${target.serviceRoleKey}`,
    },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Disposable PostgREST readiness returned HTTP ${response.status}`);
}
