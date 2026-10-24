/**
 * Disposable migration-chain validation (local Docker only, never hosted).
 *
 * Builds a throwaway Supabase stack in a fresh directory outside this
 * repository and outside Google Drive, then applies the migration chain in
 * stages so that the destructive historical migration 00077 runs alone and
 * only against an empty database created by this tool:
 *   A = 00001-00076 (applied by `supabase start`, seeds disabled)
 *   B = 00077 alone
 *   C = 00078-00314
 *   D = 00315-<ceiling>
 *
 * Every command re-runs the refusal checks below. The tool accepts no
 * database URL, never runs `supabase link`, `db push`, `db reset`, or
 * `stop --all`, and only stops the single project id recorded in its marker.
 *
 * Usage (all arguments required, nothing else accepted):
 *   tsx scripts/disposable-migration-validation.ts <command> \
 *     --workdir <absolute path> --project-id otp-disposable-<suffix> --port-base <55000-59900>
 * Commands: prepare | start | stage-B | stage-C | stage-D | sql <file> | ledger | teardown
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';

export const MARKER_FILE = '.otp-disposable-validation.json';
export const MARKER_PURPOSE = 'OTP_DISPOSABLE_MIGRATION_VALIDATION';
export const PROJECT_ID_PATTERN = /^otp-disposable-[a-z0-9]{8,24}$/;
export const PORT_BASE_MIN = 55000;
export const PORT_BASE_MAX = 59900;
export const RESERVED_PORTS = new Set([3000, 5173, 5432, 8000, 8083, 8443]);
export const RESERVED_PORT_RANGE: [number, number] = [54000, 54999];
export const FORBIDDEN_ENV = [
  'DATABASE_URL', 'DIRECT_URL', 'DATABASE_POOLER_URL', 'SUPABASE_DB_URL', 'POSTGRES_URL',
  'POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING', 'PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD',
  'PGDATABASE', 'PGSERVICE', 'PGSERVICEFILE', 'PGPASSFILE', 'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_PROJECT_REF', 'SUPABASE_PROJECT_ID', 'SUPABASE_DB_PASSWORD', 'DB_PASSWORD',
  'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'VITE_SUPABASE_URL',
];
export const EXCLUDED_SERVICES = [
  'realtime', 'imgproxy', 'mailpit', 'postgres-meta', 'studio', 'edge-runtime',
  'logflare', 'vector', 'supavisor',
];
export const HISTORICAL_PURGE_TABLES = [
  'payments', 'invoices', 'work_orders', 'purchase_orders', 'awards',
  'procurement_performance_records', 'committee_votes',
  'conflict_of_interest_declarations', 'committee_assignments',
  'approval_instances', 'quote_evaluations', 'quote_versions', 'quotes',
  'rfq_invitations', 'rfqs', 'requirements', 'work_order_milestones',
  'requirement_specifications', 'requirement_attachments',
  'messaging_messages', 'messaging_channels', 'support_tickets',
  'notifications', 'admin_database_snapshots',
] as const;
export const COMMANDS = ['prepare', 'start', 'stage-B', 'stage-C', 'stage-D', 'sql', 'ledger', 'teardown'] as const;
export type Command = (typeof COMMANDS)[number];

export interface Options {
  command: Command;
  workdir: string;
  projectId: string;
  portBase: number;
  sqlFile?: string;
}

export interface Ports {
  shadow: number;
  api: number;
  db: number;
  studio: number;
  inbucket: number;
  smtp: number;
  pop3: number;
  analytics: number;
  inspector: number;
  pooler: number;
}

export interface Marker {
  purpose: string;
  projectId: string;
  portBase: number;
  createdAt: string;
}

export interface DockerInventory {
  containers: string[];
  volumes: string[];
  networks: string[];
}

export interface StagePlan {
  A: string[];
  B: string[];
  C: string[];
  D: string[];
}

export class RefusalError extends Error {
  constructor(message: string) {
    super(`DISPOSABLE_VALIDATION_REFUSED: ${message}`);
    this.name = 'RefusalError';
  }
}

function refuse(message: string): never {
  throw new RefusalError(message);
}

export function parseArgs(argv: string[]): Options {
  const [command, ...rest] = argv;
  if (!command || !(COMMANDS as readonly string[]).includes(command)) {
    refuse(`unknown or missing command "${command ?? ''}"; expected one of ${COMMANDS.join(', ')}`);
  }
  const values = new Map<string, string>();
  let sqlFile: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (command === 'sql' && sqlFile === undefined && !arg.startsWith('--')) {
      sqlFile = arg;
      continue;
    }
    if (!['--workdir', '--project-id', '--port-base'].includes(arg)) refuse(`unsupported argument ${arg}`);
    if (values.has(arg)) refuse(`duplicate argument ${arg}`);
    const value = rest[i + 1];
    if (value === undefined || value.startsWith('--')) refuse(`missing value for ${arg}`);
    values.set(arg, value);
    i++;
  }
  for (const required of ['--workdir', '--project-id', '--port-base']) {
    if (!values.has(required)) refuse(`missing required ${required}`);
  }
  if (command === 'sql' && !sqlFile) refuse('sql requires a file path');
  const portText = values.get('--port-base')!;
  if (!/^\d{5}$/.test(portText)) refuse(`--port-base must be a five-digit number, got ${portText}`);
  return {
    command: command as Command,
    workdir: values.get('--workdir')!,
    projectId: values.get('--project-id')!,
    portBase: Number(portText),
    sqlFile,
  };
}

export function assertProjectId(projectId: string): void {
  if (!PROJECT_ID_PATTERN.test(projectId)) {
    refuse(`project id "${projectId}" must match ${PROJECT_ID_PATTERN}`);
  }
  if (/otp-local|prod|staging|hosted|live/i.test(projectId)) refuse(`project id "${projectId}" names a retained environment`);
}

export function derivePorts(portBase: number): Ports {
  if (!Number.isInteger(portBase) || portBase < PORT_BASE_MIN || portBase > PORT_BASE_MAX) {
    refuse(`port base ${portBase} outside ${PORT_BASE_MIN}-${PORT_BASE_MAX}`);
  }
  const ports: Ports = {
    shadow: portBase,
    api: portBase + 1,
    db: portBase + 2,
    studio: portBase + 3,
    inbucket: portBase + 4,
    smtp: portBase + 5,
    pop3: portBase + 6,
    analytics: portBase + 7,
    inspector: portBase + 8,
    pooler: portBase + 9,
  };
  const all = Object.values(ports);
  if (new Set(all).size !== all.length) refuse('derived ports are not unique');
  for (const port of all) {
    if (RESERVED_PORTS.has(port)) refuse(`derived port ${port} is reserved`);
    if (port >= RESERVED_PORT_RANGE[0] && port <= RESERVED_PORT_RANGE[1]) {
      refuse(`derived port ${port} is inside the standard local Supabase range ${RESERVED_PORT_RANGE.join('-')}`);
    }
  }
  return ports;
}

export function assertEnvClean(env: NodeJS.ProcessEnv): void {
  const present = FORBIDDEN_ENV.filter((name) => (env[name] ?? '').trim() !== '');
  if (present.length) refuse(`database or hosted environment variables are set: ${present.join(', ')}`);
}

export function sanitizedEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const copy: NodeJS.ProcessEnv = { ...env };
  for (const name of FORBIDDEN_ENV) delete copy[name];
  return copy;
}

export function isGoogleDrivePath(p: string): boolean {
  return /(^|[\\/])(my drive|shared drives|google drive|googledrive|drivefs)([\\/]|$)/i.test(p);
}

function normalizeForCompare(p: string): string {
  return path.resolve(p).replace(/[\\/]+$/, '').toLowerCase();
}

export function assertWorkdirLocation(workdir: string, repoRoot: string): void {
  if (!path.isAbsolute(workdir)) refuse(`workdir must be absolute: ${workdir}`);
  const target = normalizeForCompare(workdir);
  const repo = normalizeForCompare(repoRoot);
  if (target === repo || target.startsWith(`${repo}${path.sep}`) || repo.startsWith(`${target}${path.sep}`)) {
    refuse('workdir overlaps the repository');
  }
  if (isGoogleDrivePath(workdir)) refuse('workdir is under Google Drive');
  if (isGoogleDrivePath(repoRoot) && path.parse(target).root === path.parse(repo).root) {
    refuse('workdir is on the same synced drive as the repository');
  }
  if (path.parse(target).root === target) refuse('workdir cannot be a drive or filesystem root');
}

export function assertNoLinkState(workdir: string, fresh: boolean): void {
  const temp = path.join(workdir, 'supabase', '.temp');
  if (fresh && fs.existsSync(temp)) refuse('supabase/.temp exists in a supposedly fresh workdir');
  for (const linkFile of ['project-ref', 'pooler-url', 'postgres-version', 'storage-version', 'gotrue-version', 'rest-version']) {
    if (fs.existsSync(path.join(temp, linkFile))) refuse(`hosted link state present: supabase/.temp/${linkFile}`);
  }
}

export function assertFreshTarget(workdir: string): void {
  if (fs.existsSync(workdir)) refuse(`workdir already exists; refusing to reuse retained state: ${workdir}`);
}

export function readMarker(workdir: string): Marker {
  const file = path.join(workdir, MARKER_FILE);
  if (!fs.existsSync(file)) refuse(`disposable marker ${MARKER_FILE} is missing`);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Marker;
}

export function assertMarker(marker: Marker, options: Pick<Options, 'projectId' | 'portBase'>): void {
  if (marker.purpose !== MARKER_PURPOSE) refuse('marker purpose mismatch');
  if (marker.projectId !== options.projectId) refuse('marker project id mismatch');
  if (marker.portBase !== options.portBase) refuse('marker port base mismatch');
}

export function plannedDockerNames(projectId: string): DockerInventory {
  const services = ['db', 'kong', 'auth', 'rest', 'storage', 'realtime', 'studio', 'inbucket', 'imgproxy', 'pg_meta', 'edge_runtime', 'analytics', 'vector', 'pooler'];
  return {
    containers: services.map((service) => `supabase_${service}_${projectId}`),
    volumes: [`supabase_db_${projectId}`, `supabase_storage_${projectId}`, `supabase_config_${projectId}`, `supabase_edge_runtime_${projectId}`],
    networks: [`supabase_network_${projectId}`],
  };
}

export function assertNoDockerOverlap(projectId: string, existing: DockerInventory): void {
  const all = [...existing.containers, ...existing.volumes, ...existing.networks];
  const clash = all.filter((name) => name.includes(projectId));
  if (clash.length) refuse(`Docker resources for ${projectId} already exist: ${clash.join(', ')}`);
  const planned = plannedDockerNames(projectId);
  for (const name of [...planned.containers, ...planned.volumes, ...planned.networks]) {
    if (/otp-local/i.test(name)) refuse(`planned resource name ${name} would overlap otp-local`);
  }
}

export function listMigrationFiles(dir: string): string[] {
  return fs.readdirSync(dir).filter((file) => /^\d{5}_.+\.sql$/.test(file)).sort();
}

export function planStages(files: string[], expectedCeiling: number): StagePlan {
  files.forEach((file, index) => {
    if (Number(file.slice(0, 5)) !== index + 1) refuse(`migration chain is not contiguous at ${file}`);
  });
  if (files.length !== expectedCeiling) refuse(`expected ceiling ${expectedCeiling}, found ${files.length} files`);
  if (files.length < 315) refuse('chain does not reach the promoted migrations');
  const seq = (file: string) => Number(file.slice(0, 5));
  return {
    A: files.filter((f) => seq(f) <= 76),
    B: files.filter((f) => seq(f) === 77),
    C: files.filter((f) => seq(f) >= 78 && seq(f) <= 314),
    D: files.filter((f) => seq(f) >= 315),
  };
}

export function buildConfigToml(projectId: string, ports: Ports): string {
  return [
    '# Generated by scripts/disposable-migration-validation.ts. Disposable. Never link.',
    `project_id = "${projectId}"`,
    '',
    '[api]',
    'enabled = true',
    `port = ${ports.api}`,
    'schemas = ["public", "graphql_public"]',
    'extra_search_path = ["public", "extensions"]',
    'max_rows = 1000',
    '',
    '[db]',
    `port = ${ports.db}`,
    `shadow_port = ${ports.shadow}`,
    'major_version = 15',
    '',
    '[db.pooler]',
    'enabled = false',
    `port = ${ports.pooler}`,
    '',
    '[db.seed]',
    'enabled = false',
    '',
    '[studio]',
    'enabled = false',
    `port = ${ports.studio}`,
    '',
    '[inbucket]',
    'enabled = false',
    `port = ${ports.inbucket}`,
    `smtp_port = ${ports.smtp}`,
    `pop3_port = ${ports.pop3}`,
    '',
    '[storage]',
    'enabled = true',
    '',
    '[auth]',
    'enabled = true',
    'site_url = "http://127.0.0.1"',
    'enable_signup = false',
    '',
    '[edge_runtime]',
    'enabled = false',
    `inspector_port = ${ports.inspector}`,
    '',
    '[analytics]',
    'enabled = false',
    `port = ${ports.analytics}`,
    '',
  ].join('\n');
}

export function sha256File(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function localDbUrl(ports: Ports): string {
  return `postgresql://postgres:postgres@127.0.0.1:${ports.db}/postgres`;
}

export function assertHistoricalPurgeTargetEmptySql(): string {
  const tables = HISTORICAL_PURGE_TABLES.map((table) => `'${table}'`).join(', ');
  return `
DO $empty$
DECLARE
  v_table text;
  v_count bigint;
  v_nonempty jsonb := '[]'::jsonb;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[${tables}] LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', v_table) INTO v_count;
      IF v_count <> 0 THEN
        v_nonempty := v_nonempty || jsonb_build_array(
          jsonb_build_object('table', v_table, 'rows', v_count)
        );
      END IF;
    END IF;
  END LOOP;
  IF jsonb_array_length(v_nonempty) <> 0 THEN
    RAISE EXCEPTION 'HISTORICAL_PURGE_TARGET_NOT_EMPTY: %', v_nonempty;
  END IF;
END
$empty$;
SELECT 'HISTORICAL_PURGE_TARGET_EMPTY' AS proof;
`;
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv, capture = false): string {
  const out = execFileSync(cmd, args, { env, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
  return capture ? String(out) : '';
}

function dockerInventory(env: NodeJS.ProcessEnv): DockerInventory {
  const lines = (args: string[]) => run('docker', args, env, true).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return {
    containers: lines(['ps', '-a', '--format', '{{.Names}}']),
    volumes: lines(['volume', 'ls', '--format', '{{.Name}}']),
    networks: lines(['network', 'ls', '--format', '{{.Name}}']),
  };
}

async function assertPortsFree(ports: Ports): Promise<void> {
  for (const port of Object.values(ports)) {
    await new Promise<void>((resolve, reject) => {
      const server = net.createServer();
      server.once('error', () => reject(new RefusalError(`port ${port} is already in use`)));
      server.listen({ port, host: '127.0.0.1', exclusive: true }, () => server.close(() => resolve()));
    });
  }
}

function assertDbContainer(projectId: string, ports: Ports, env: NodeJS.ProcessEnv): string {
  const name = `supabase_db_${projectId}`;
  const raw = run('docker', ['inspect', '--format', '{{json .Config.Labels}}|{{json .NetworkSettings.Ports}}', name], env, true).trim();
  const [labelsJson, portsJson] = raw.split('|');
  const labels = JSON.parse(labelsJson) as Record<string, string>;
  if (labels['com.supabase.cli.project'] !== projectId) refuse(`container ${name} is not labelled for ${projectId}`);
  const bindings = JSON.parse(portsJson) as Record<string, { HostIp: string; HostPort: string }[] | null>;
  const hostPorts = Object.values(bindings).flatMap((b) => b ?? []).map((b) => Number(b.HostPort));
  if (!hostPorts.includes(ports.db)) refuse(`container ${name} does not publish disposable port ${ports.db}`);
  if (hostPorts.some((p) => p >= RESERVED_PORT_RANGE[0] && p <= RESERVED_PORT_RANGE[1])) {
    refuse(`container ${name} publishes a standard local port`);
  }
  return name;
}

export async function main(argv: string[], repoRoot: string): Promise<number> {
  const options = parseArgs(argv);
  assertEnvClean(process.env);
  assertProjectId(options.projectId);
  const ports = derivePorts(options.portBase);
  assertWorkdirLocation(options.workdir, repoRoot);
  const env = sanitizedEnv(process.env);
  const migrationsDir = path.join(options.workdir, 'supabase', 'migrations');
  const stagedDir = path.join(options.workdir, 'staged-migrations');

  if (options.command === 'prepare') {
    assertFreshTarget(options.workdir);
    const source = path.join(repoRoot, 'supabase', 'migrations');
    const files = listMigrationFiles(source);
    const plan = planStages(files, files.length);
    fs.mkdirSync(migrationsDir, { recursive: true });
    fs.mkdirSync(stagedDir, { recursive: true });
    const manifest: string[] = [];
    for (const file of files) {
      fs.copyFileSync(path.join(source, file), path.join(stagedDir, file));
      manifest.push(`${sha256File(path.join(source, file))}  ${file}`);
    }
    for (const file of plan.A) fs.copyFileSync(path.join(stagedDir, file), path.join(migrationsDir, file));
    fs.writeFileSync(path.join(options.workdir, 'supabase', 'config.toml'), buildConfigToml(options.projectId, ports));
    fs.writeFileSync(path.join(options.workdir, 'migration-manifest.sha256'), `${manifest.join('\n')}\n`);
    const marker: Marker = { purpose: MARKER_PURPOSE, projectId: options.projectId, portBase: options.portBase, createdAt: new Date().toISOString() };
    fs.writeFileSync(path.join(options.workdir, MARKER_FILE), JSON.stringify(marker, null, 2));
    assertNoLinkState(options.workdir, true);
    console.log(`Prepared ${options.workdir}: stage A ${plan.A.length}, B ${plan.B.length}, C ${plan.C.length}, D ${plan.D.length}; ceiling ${files.at(-1)}`);
    return 0;
  }

  assertMarker(readMarker(options.workdir), options);
  assertNoLinkState(options.workdir, false);

  if (options.command === 'start') {
    assertNoDockerOverlap(options.projectId, dockerInventory(env));
    await assertPortsFree(ports);
    if (listMigrationFiles(migrationsDir).at(-1)?.slice(0, 5) !== '00076') refuse('start requires only stage A (through 00076) in supabase/migrations');
    run('supabase', ['start', '--workdir', options.workdir, '-x', EXCLUDED_SERVICES.join(',')], env);
    assertDbContainer(options.projectId, ports, env);
    return 0;
  }

  const container = assertDbContainer(options.projectId, ports, env);
  const psql = (sql: string | null, file?: string) => {
    const args = ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-P', 'pager=off'];
    const input = file ? fs.readFileSync(file, 'utf8') : sql ?? '';
    return execFileSync('docker', [...args, '-f', '-'], { env, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] });
  };

  if (options.command.startsWith('stage-')) {
    const stage = options.command.slice(-1) as 'B' | 'C' | 'D';
    const staged = listMigrationFiles(stagedDir);
    const plan = planStages(staged, staged.length);
    const present = listMigrationFiles(migrationsDir);
    const expectedLast = { B: '00076', C: '00077', D: '00314' }[stage];
    if (present.at(-1)?.slice(0, 5) !== expectedLast) refuse(`${options.command} requires the chain to end at ${expectedLast}`);
    const applied = psql('SELECT max(version) FROM supabase_migrations.schema_migrations;').match(/\b(\d{5})\b/)?.[1];
    if (applied !== expectedLast) refuse(`ledger ends at ${applied ?? 'nothing'}, expected ${expectedLast}`);
    if (stage === 'B') {
      const proof = psql(assertHistoricalPurgeTargetEmptySql());
      if (!proof.includes('HISTORICAL_PURGE_TARGET_EMPTY')) {
        refuse('stage-B did not produce the empty transactional-table proof');
      }
      process.stdout.write(proof);
    }
    for (const file of plan[stage]) fs.copyFileSync(path.join(stagedDir, file), path.join(migrationsDir, file));
    run('supabase', ['migration', 'up', '--workdir', options.workdir, '--db-url', localDbUrl(ports)], env);
    return 0;
  }

  if (options.command === 'sql') {
    process.stdout.write(psql(null, path.resolve(options.sqlFile!)));
    return 0;
  }

  if (options.command === 'ledger') {
    process.stdout.write(psql('SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;'));
    return 0;
  }

  if (options.command === 'teardown') {
    run('supabase', ['stop', '--workdir', options.workdir, '--project-id', options.projectId, '--no-backup'], env);
    const leftover = dockerInventory(env);
    const remaining = [...leftover.containers, ...leftover.volumes, ...leftover.networks].filter((n) => n.includes(options.projectId));
    if (remaining.length) refuse(`teardown left resources: ${remaining.join(', ')}`);
    console.log(`Teardown complete: no Docker resources remain for ${options.projectId}`);
    return 0;
  }
  return 1;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (invokedDirectly) {
  main(process.argv.slice(2), path.resolve(__dirname, '..'))
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
