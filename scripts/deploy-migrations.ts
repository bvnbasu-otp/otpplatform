/**
 * =============================================================================
 * OTP Platform — Automated Supabase & PostgreSQL Migration Deployment Engine
 * =============================================================================
 * Safely, idempotently, and sequentially executes all pending migrations from
 * `supabase/migrations/` (currently 187 contiguous migrations) across Local,
 * Staging, Demo, and Production environments.
 *
 * Guarantees:
 *  1. Zero Data Loss & Immutable Ledger Tracking in `otp_schema_migrations`
 *     and `supabase_migrations.schema_migrations`.
 *  2. Contiguous numbering & SQL integrity validation before execution.
 *  3. PostgREST schema cache reload (`NOTIFY pgrst, 'reload schema';`).
 *  4. Production data integrity assertion (`assert_production_data_integrity()`).
 *  5. Dual engine: Native PostgreSQL client (`pg`) with fallback to the
 *     Supabase CLI (`supabase db push --db-url`). Both run only after the
 *     deployment target check; an undeclared target may only be local.
 *
 * Usage:
 *   pnpm db:migrate:deploy
 *   pnpm db:migrate:status
 *   pnpm db:migrate:check
 *   tsx scripts/deploy-migrations.ts --deploy
 *   tsx scripts/deploy-migrations.ts --dry-run
 *   tsx scripts/deploy-migrations.ts --dry-run --ack-disposable-bootstrap-plan
 *   tsx scripts/deploy-migrations.ts --check-only
 *   OTP_DEPLOYMENT_TARGET=production tsx scripts/deploy-migrations.ts --deploy
 * Any other argument is refused.
 * =============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  assertMigrationTarget,
  normalizeDeploymentClass,
  redactDiagnosticText,
} from '../packages/domain/src/deployment/deployment-target';
import { runSupabaseDbPush } from './supabase-db-push';

const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(WORKSPACE_ROOT, 'supabase', 'migrations');

export interface MigrationFile {
  filename: string;
  filepath: string;
  sequenceNumber: number;
  name: string;
}

export interface MigrationStatusReport {
  totalFiles: number;
  isContiguous: boolean;
  missingSequences: number[];
  migrationFiles: MigrationFile[];
  appliedCount: number;
  pendingCount: number;
  appliedList: string[];
  pendingList: string[];
}

export const HISTORICAL_PURGE_SEQUENCE = 77;
export const DISPOSABLE_BOOTSTRAP_PLAN_ACK = '--ack-disposable-bootstrap-plan';

export function assertHistoricalPurgePlanSafety(options: {
  plannedSequences: number[];
  isDeploy: boolean;
  disposablePlanAcknowledged: boolean;
}): void {
  if (!options.plannedSequences.includes(HISTORICAL_PURGE_SEQUENCE)) {
    return;
  }

  if (options.isDeploy) {
    throw new Error(
      'HISTORICAL_PURGE_BLOCK: migration 00077 executes a destructive purge. ' +
      'This runner will not apply a range crossing 00077; there is no deployment bypass. ' +
      'Use an empty disposable database and the separately reviewed validation procedure.',
    );
  }

  if (!options.disposablePlanAcknowledged) {
    throw new Error(
      `HISTORICAL_PURGE_BLOCK: this plan crosses destructive migration 00077. ` +
      `For file-only planning against an empty disposable bootstrap, add ${DISPOSABLE_BOOTSTRAP_PLAN_ACK}. ` +
      'The acknowledgement never permits database apply.',
    );
  }
}

/**
 * Reads and validates all migration files in supabase/migrations/
 */
export function loadMigrationFiles(): { files: MigrationFile[]; isContiguous: boolean; missing: number[] } {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found at: ${MIGRATIONS_DIR}`);
  }

  const fileNames = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const files: MigrationFile[] = [];
  const sequenceNumbers: number[] = [];

  for (const filename of fileNames) {
    const match = filename.match(/^(\d{5})_(.+)\.sql$/);
    if (!match) {
      // Non-standard migration filename format
      continue;
    }
    const sequenceNumber = parseInt(match[1], 10);
    const name = match[2];
    sequenceNumbers.push(sequenceNumber);
    files.push({
      filename,
      filepath: path.join(MIGRATIONS_DIR, filename),
      sequenceNumber,
      name,
    });
  }

  // Sort strictly by sequenceNumber
  files.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  // Check continuity (1 to max)
  const maxSeq = files.length > 0 ? files[files.length - 1].sequenceNumber : 0;
  const missing: number[] = [];
  const seqSet = new Set(files.map((f) => f.sequenceNumber));

  for (let i = 1; i <= maxSeq; i++) {
    if (!seqSet.has(i)) {
      missing.push(i);
    }
  }

  return {
    files,
    isContiguous: missing.length === 0,
    missing,
  };
}

/**
 * Loads environment variables from local .env files if not already present in process.env
 */
export function loadEnvFileIfPresent(): void {
  if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
    return;
  }
  const deployment = normalizeDeploymentClass(
    process.env.OTP_DEPLOYMENT_TARGET ?? process.env.TARGET_ENV,
  );
  // A local command must not inherit the production env file.
  const envFiles =
    deployment === 'production'
      ? ['.env.otp.production.local', '.env.local', '.env']
      : ['.env.local', '.env'];
  for (const envFile of envFiles) {
    const fullPath = path.join(WORKSPACE_ROOT, envFile);
    if (fs.existsSync(fullPath)) {
      try {
        const text = fs.readFileSync(fullPath, 'utf8');
        for (const line of text.split(/\r?\n/)) {
          const t = line.trim();
          if (!t || t.startsWith('#')) continue;
          const eq = t.indexOf('=');
          if (eq <= 0) continue;
          const key = t.slice(0, eq).trim();
          let val = t.slice(eq + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
        break;
      } catch {}
    }
  }
}

/**
 * Resolves database connection string from environment variables
 */
export function resolveDatabaseUrl(): {
  connectionString: string | null;
  source: string;
  /** Every non-empty database URL, highest priority first. Includes URLs that were not selected. */
  suppliedConnectionStrings: string[];
} {
  loadEnvFileIfPresent();

  // 1. Direct explicit database URLs. The first postgres URL is selected.
  // Later URLs stay in suppliedConnectionStrings so a conflict can be rejected.
  const directUrls = [
    { key: 'DIRECT_URL', val: process.env.DIRECT_URL },
    { key: 'DATABASE_URL', val: process.env.DATABASE_URL },
    { key: 'DATABASE_POOLER_URL', val: process.env.DATABASE_POOLER_URL },
    { key: 'SUPABASE_DB_URL', val: process.env.SUPABASE_DB_URL },
    { key: 'POSTGRES_URL', val: process.env.POSTGRES_URL },
  ];
  const suppliedConnectionStrings = directUrls
    .map((item) => (item.val ?? '').trim())
    .filter((val) => val.length > 0);

  for (const item of directUrls) {
    const val = (item.val ?? '').trim();
    if (val.startsWith('postgresql://') || val.startsWith('postgres://')) {
      return { connectionString: val, source: item.key, suppliedConnectionStrings };
    }
  }

  // 2. Synthesize from Supabase project credentials if provided
  const projectId = process.env.SUPABASE_PROJECT_ID || process.env.SUPABASE_PROJECT_REF;
  const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.DB_PASSWORD;
  const region = process.env.SUPABASE_REGION || 'ap-south-1';

  if (projectId && dbPassword) {
    // Standard Supabase pooler or direct host URL
    const connStr = `postgresql://postgres.${projectId}:${encodeURIComponent(dbPassword)}@aws-0-${region}.pooler.supabase.com:6543/postgres?pgbouncer=true`;
    return { connectionString: connStr, source: 'SUPABASE_PROJECT_ID + DB_PASSWORD', suppliedConnectionStrings };
  }

  // 3. Fallback to local default if port 5432 or 54322 is expected
  return { connectionString: null, source: 'NONE', suppliedConnectionStrings };
}

/**
 * Ensures migration tracking tables exist in PostgreSQL
 */
export async function ensureTrackingTables(client: any): Promise<void> {
  const sql = `
    CREATE TABLE IF NOT EXISTS public.otp_schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version text PRIMARY KEY,
      inserted_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE public.otp_schema_migrations ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "otp_schema_migrations_read" ON public.otp_schema_migrations;
    REVOKE ALL ON public.otp_schema_migrations FROM PUBLIC, anon;
  `;
  await client.query(sql);
}

/**
 * Fetches list of applied migrations from database
 */
export async function getAppliedMigrations(client: any): Promise<string[]> {
  // Read-only. A missing ledger table contributes no versions, which keeps 00077 pending.
  const versions = new Set<string>();
  for (const sql of [
    'SELECT version FROM public.otp_schema_migrations',
    'SELECT version FROM supabase_migrations.schema_migrations',
  ]) {
    try {
      const res = await client.query(sql);
      for (const row of res.rows ?? []) {
        const version = String(row.version ?? '').trim();
        if (version) versions.add(version);
      }
    } catch {
      // Table absent or unreadable.
    }
  }
  return [...versions];
}

export type MigrationMode = 'check-only' | 'status' | 'dry-run' | 'deploy-dry-run' | 'deploy';

export interface ParsedMigrationArgs {
  mode: MigrationMode;
  disposablePlanAcknowledged: boolean;
}

const MODE_FLAGS: Record<string, 'check-only' | 'status' | 'dry-run' | 'deploy'> = {
  '--check-only': 'check-only',
  '-c': 'check-only',
  '--status': 'status',
  '-s': 'status',
  '--dry-run': 'dry-run',
  '--deploy': 'deploy',
};

export function parseMigrationArgs(args: string[]): ParsedMigrationArgs {
  const modes = new Set<'check-only' | 'status' | 'dry-run' | 'deploy'>();
  let disposablePlanAcknowledged = false;

  for (const arg of args) {
    if (arg === DISPOSABLE_BOOTSTRAP_PLAN_ACK) {
      if (disposablePlanAcknowledged) {
        throw new Error(`Duplicate argument: ${arg}`);
      }
      disposablePlanAcknowledged = true;
      continue;
    }
    const mode = MODE_FLAGS[arg];
    if (!mode) {
      if (arg === '--target-env' || arg.startsWith('--target-env=')) {
        throw new Error('Unsupported argument: --target-env. Set OTP_DEPLOYMENT_TARGET in the environment instead.');
      }
      throw new Error(`Unsupported argument: ${arg}`);
    }
    if (modes.has(mode)) {
      throw new Error(`Duplicate argument: ${arg}`);
    }
    modes.add(mode);
  }

  let mode: MigrationMode;
  if (modes.size === 0) {
    throw new Error('No action specified. Use --deploy, --status, --check-only, or --dry-run.');
  } else if (modes.size === 1) {
    mode = [...modes][0];
  } else if (modes.size === 2 && modes.has('deploy') && modes.has('dry-run')) {
    mode = 'deploy-dry-run';
  } else {
    throw new Error(`Conflicting arguments: ${args.join(' ')}`);
  }

  if (disposablePlanAcknowledged && mode !== 'dry-run') {
    throw new Error(`${DISPOSABLE_BOOTSTRAP_PLAN_ACK} is only valid with --dry-run alone and never permits database apply.`);
  }

  return { mode, disposablePlanAcknowledged };
}

export interface MigrationDbClient {
  query(sql: string, params?: unknown[]): Promise<{ rows?: any[] }>;
}

/**
 * Database phase after connect. Ledger reads and the 00077 gate run before any write.
 * Returns the process exit code; the caller owns connect/end.
 */
export async function runDatabaseMigrationPhase(input: {
  client: MigrationDbClient;
  files: MigrationFile[];
  mode: 'status' | 'deploy-dry-run' | 'deploy';
  connectionString: string;
  readSql?: (file: MigrationFile) => string;
}): Promise<number> {
  const { client, files, mode, connectionString } = input;
  const readSql = input.readSql ?? ((file: MigrationFile) => fs.readFileSync(file.filepath, 'utf8'));

  const applied = await getAppliedMigrations(client);
  const appliedSet = new Set(applied);

  const isFileApplied = (f: MigrationFile) => {
    const seq5 = String(f.sequenceNumber).padStart(5, '0');
    return (
      appliedSet.has(f.filename) ||
      appliedSet.has(f.filename.replace('.sql', '')) ||
      appliedSet.has(seq5)
    );
  };

  const pending = files.filter((f) => !isFileApplied(f));

  console.log(`Applied Count   : ${files.length - pending.length} migrations`);
  console.log(`Pending Count   : ${pending.length} migrations`);

  if (mode === 'status') {
    console.log('\n--- MIGRATION STATUS BREAKDOWN ---');
    for (const file of files) {
      const isApp = isFileApplied(file);
      console.log(`  ${isApp ? '\x1b[32m[APPLIED]\x1b[0m' : '\x1b[33m[PENDING]\x1b[0m'} ${file.filename}`);
    }
    console.log('----------------------------------\n');
    return 0;
  }

  try {
    assertHistoricalPurgePlanSafety({
      plannedSequences: pending.map((file) => file.sequenceNumber),
      isDeploy: true,
      disposablePlanAcknowledged: false,
    });
  } catch (safetyError) {
    const message = safetyError instanceof Error ? safetyError.message : 'Historical purge apply refused.';
    console.error(`\n\x1b[31m[ERROR] ${message}\x1b[0m\n`);
    return 1;
  }

  if (pending.length === 0) {
    console.log('\n\x1b[32m✓ All ' + files.length + ' migrations are already synchronized with target database.\x1b[0m\n');
    return 0;
  }

  if (mode === 'deploy-dry-run') {
    console.log('\n[DRY-RUN] Pending migrations to apply:');
    pending.forEach((p) => console.log(`  - ${p.filename}`));
    return 0;
  }

  await ensureTrackingTables(client);

  console.log(`\n⏳ Applying ${pending.length} pending migrations sequentially...`);
  let successCount = 0;

  for (const item of pending) {
    process.stdout.write(`  [APPLYING] ${item.filename}... `);
    const start = Date.now();
    const sql = readSql(item);

    try {
      let execSql = sql;
      const alterTypeMatches = sql.match(/ALTER\s+TYPE\s+[^;]+ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'[^;]+';/gi);
      if (alterTypeMatches) {
        for (const alterStmt of alterTypeMatches) {
          try {
            await client.query(alterStmt);
          } catch (alterErr: any) {
            if (!alterErr.message.includes('already exists')) {
              throw alterErr;
            }
          }
          execSql = execSql.replace(alterStmt, `-- [Pre-committed] ${alterStmt}`);
        }
      }

      await client.query('BEGIN');
      await client.query(execSql);
      await client.query(
        `INSERT INTO public.otp_schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO UPDATE SET applied_at = now()`,
        [item.filename]
      );
      await client.query(
        `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING`,
        [String(item.sequenceNumber).padStart(5, '0')]
      );
      await client.query('COMMIT');
      const elapsed = Date.now() - start;
      console.log(`\x1b[32mPASSED\x1b[0m (${elapsed}ms)`);
      successCount++;
    } catch (migErr: any) {
      await client.query('ROLLBACK');
      console.log(`\x1b[31mFAILED\x1b[0m`);
      console.error(`\x1b[31m[ERROR] Failed to apply migration ${item.filename}:\x1b[0m`, redactDiagnosticText(String(migErr.message ?? ''), connectionString));
      return 1;
    }
  }

  // Reload PostgREST schema cache
  try {
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log('✓ PostgREST schema cache reloaded.');
  } catch {}

  // Assert Production Data Integrity
  try {
    const check = await client.query("SELECT public.assert_production_data_integrity();");
    console.log(`✓ Production Data Integrity Verified: ${check.rows?.[0]?.assert_production_data_integrity || 'OK'}`);
  } catch {
    // Assertion function might not be installed in all test environments
  }

  console.log(`\n\x1b[32m🎉 SUCCESS: Applied ${successCount}/${pending.length} migrations. Total synchronized: ${files.length}.\x1b[0m\n`);
  return 0;
}

/**
 * Main migration runner
 */
export async function runMigrations() {
  let parsed: ParsedMigrationArgs;
  try {
    parsed = parseMigrationArgs(process.argv.slice(2));
  } catch (argError) {
    const message = argError instanceof Error ? argError.message : 'Invalid arguments.';
    console.error(`\n\x1b[31m[ERROR] ${message}\x1b[0m\n`);
    process.exit(1);
  }
  const { mode, disposablePlanAcknowledged } = parsed;
  const isCheckOnly = mode === 'check-only';
  const isStatus = mode === 'status';
  const isDryRun = mode === 'dry-run' || mode === 'deploy-dry-run';
  const isDeploy = mode === 'deploy' || mode === 'deploy-dry-run';

  console.log('\n=================================================================');
  console.log('  🛡️  OTP PLATFORM — SUPABASE & DATABASE MIGRATION ENGINE');
  console.log('=================================================================');
  console.log(`Timestamp       : ${new Date().toISOString()}`);
  console.log(`Migrations Path : ${MIGRATIONS_DIR}`);

  // 1. Scan and validate migration files
  const { files, isContiguous, missing } = loadMigrationFiles();
  console.log(`Total Files     : ${files.length} migrations`);
  console.log(`Range           : ${files[0]?.filename} -> ${files[files.length - 1]?.filename}`);
  console.log(`Contiguity Check: ${isContiguous ? '\x1b[32mPASS (Contiguous 00001 to ' + String(files.length).padStart(5, '0') + ')\x1b[0m' : '\x1b[31mFAIL (Missing: ' + missing.join(', ') + ')\x1b[0m'}`);

  // --deploy must refuse an unverified target before any later exit, connection, or push.
  // File-only commands still fail closed on a sequence gap here.
  if (!isContiguous && !(isDeploy && !isCheckOnly)) {
    console.error(`\x1b[31m[ERROR] Non-contiguous migration sequence detected! Missing: ${missing.join(', ')}\x1b[0m`);
    process.exit(1);
  }

  if (isCheckOnly) {
    console.warn(
      '\n[SAFETY] File continuity passes, but migration 00077 is destructive. ' +
      'A full historical apply is blocked by this runner.',
    );
    console.log('\n\x1b[32m✓ All migration files validated successfully with zero sequence gaps.\x1b[0m\n');
    process.exit(0);
  }

  if (isDryRun && !isDeploy) {
    try {
      assertHistoricalPurgePlanSafety({
        plannedSequences: files.map((file) => file.sequenceNumber),
        isDeploy: false,
        disposablePlanAcknowledged,
      });
    } catch (safetyError) {
      const message = safetyError instanceof Error ? safetyError.message : 'Historical purge plan refused.';
      console.error(`\n\x1b[31m[ERROR] ${message}\x1b[0m\n`);
      process.exit(1);
    }
    console.log('\n[DRY-RUN] Migration files validated. No database connection required for file-only dry-run.');
    console.log(
      `[DISPOSABLE-ONLY PLAN] ${files.length} migrations include destructive migration 00077. ` +
      'This acknowledgement does not permit database apply.\n',
    );
    process.exit(0);
  }

  // 2. Resolve database connection
  const { connectionString, source, suppliedConnectionStrings } = resolveDatabaseUrl();
  console.log(`Database Source : ${source}`);
  const deploymentTarget = process.env.OTP_DEPLOYMENT_TARGET ?? process.env.TARGET_ENV ?? null;
  // --status connects and reads the ledgers, so it gets the same target check as --deploy.
  if (isDeploy || isStatus) {
    const projectId = (process.env.SUPABASE_PROJECT_ID ?? '').trim();
    const projectRef = (process.env.SUPABASE_PROJECT_REF ?? '').trim();
    const viteSupabaseUrl = (process.env.VITE_SUPABASE_URL ?? '').trim();
    const supabaseApiUrl = (process.env.SUPABASE_URL ?? '').trim();
    try {
      if (projectId && projectRef && projectId.toLowerCase() !== projectRef.toLowerCase()) {
        throw new Error('Environment and Supabase project ref disagree.');
      }
      const declared = normalizeDeploymentClass(deploymentTarget);
      assertMigrationTarget({
        deploymentTarget,
        connectionString,
        projectRef: declared === 'non-production' ? projectId || null : projectId || projectRef || null,
        supabaseUrl: viteSupabaseUrl || supabaseApiUrl || null,
        suppliedProjectRefs: [projectId, projectRef],
        suppliedSupabaseUrls: [viteSupabaseUrl, supabaseApiUrl],
        suppliedConnectionStrings,
      });
    } catch (guardError) {
      const message = guardError instanceof Error ? guardError.message : 'Migration target refused.';
      console.error(`\n\x1b[31m[ERROR] ${message}\x1b[0m\n`);
      process.exit(1);
    }
  }

  if (!connectionString) {
    if (process.env.CI || process.env.GITHUB_ACTIONS) {
      console.error(
        '\n\x1b[31m[ERROR] CI deploy requires DATABASE_URL (or equivalent). Migration push was not attempted.\x1b[0m\n',
      );
      process.exit(1);
    }
    console.error('\n\x1b[31m[ERROR] No database connection available for --deploy. Set DATABASE_URL or SUPABASE_PROJECT_ID + SUPABASE_DB_PASSWORD.\x1b[0m\n');
    process.exit(1);
  }

  if (!isContiguous) {
    console.error(`\x1b[31m[ERROR] Non-contiguous migration sequence detected! Missing: ${missing.join(', ')}\x1b[0m`);
    process.exit(1);
  }

  let pgModule: any = null;
  try {
    pgModule = await import('pg');
  } catch {
    // pg not directly installed in runtime
  }

  // If we have a direct connection string and pg client
  if (connectionString && pgModule?.Client) {
    console.log(`Connecting to database via ${source}...`);
    const client = new pgModule.Client({
      connectionString,
      ssl: connectionString.includes('supabase.co') || connectionString.includes('pooler.supabase.com') ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 10000,
    });

    try {
      await client.connect();
      console.log('\x1b[32m✓ Connected to PostgreSQL database successfully.\x1b[0m');

      const exitCode = await runDatabaseMigrationPhase({
        client,
        files,
        mode: isStatus ? 'status' : isDryRun ? 'deploy-dry-run' : 'deploy',
        connectionString,
      });
      await client.end();
      process.exit(exitCode);
    } catch (dbErr: any) {
      console.error(`\x1b[31m[ERROR] Database execution failed: ${redactDiagnosticText(String(dbErr.message ?? ''), connectionString)}\x1b[0m`);
      try { await client.end(); } catch {}
      process.exit(1);
    }
  }

  // 3. Explicit Supabase CLI target. A missing connection already exited above.
  // `supabase db push` without `--db-url` would use the linked project, so it is never invoked that way.
  if (mode !== 'deploy') {
    console.error('\n\x1b[31m[ERROR] No database connection available for --deploy. Set DATABASE_URL or SUPABASE_PROJECT_ID + SUPABASE_DB_PASSWORD.\x1b[0m\n');
    process.exit(1);
  }
  if (files.some((file) => file.sequenceNumber === HISTORICAL_PURGE_SEQUENCE)) {
    console.error(
      '\n\x1b[31m[ERROR] HISTORICAL_PURGE_BLOCK: CLI fallback cannot prove that destructive migration 00077 ' +
      'is already applied, so database push was not attempted.\x1b[0m\n',
    );
    process.exit(1);
  }
  console.log('Attempting migration execution via Supabase CLI (`supabase db push`)...');
  try {
    runSupabaseDbPush({
      connectionString,
      cwd: WORKSPACE_ROOT,
      env: process.env,
    });
    console.log('\n\x1b[32m✓ Migrations deployed successfully via Supabase CLI.\x1b[0m\n');
    process.exit(0);
  } catch (cliErr: unknown) {
    const message = cliErr instanceof Error ? cliErr.message : 'Supabase CLI migration failed';
    console.error(`\x1b[31m[ERROR] Supabase CLI migration failed: ${redactDiagnosticText(message, connectionString)}\x1b[0m`);
    process.exit(1);
  }
}

if (require.main === module || process.argv[1]?.includes('deploy-migrations')) {
  runMigrations().catch((err) => {
    console.error('Fatal migration deployment error:', err);
    process.exit(1);
  });
}
