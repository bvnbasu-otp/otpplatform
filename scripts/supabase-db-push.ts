/**
 * Supabase CLI db push without a shell.
 *
 * The database URL is one argv element. Windows .cmd/.bat shims are not
 * executed: cmd.exe would interpret metacharacters in the URL. The resolver
 * uses supabase.exe, a POSIX binary, or Node plus a .js/.mjs/.cjs entry.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { redactDatabaseTargetSummary, redactDiagnosticText } from '../packages/domain/src/deployment/deployment-target';

export interface SupabaseCliSpawnOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  encoding: 'utf8';
  shell: false;
  windowsHide: true;
}

export interface SupabaseCliSpawnResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export type SupabaseCliSpawn = (
  command: string,
  args: readonly string[],
  options: SupabaseCliSpawnOptions,
) => SupabaseCliSpawnResult;

export interface SupabaseCliFs {
  exists: (filePath: string) => boolean;
  readText: (filePath: string) => string | null;
}

export interface SupabaseCliLaunch {
  command: string;
  args: readonly string[];
  shell: false;
  label: string;
}

const REFUSAL_INTRO =
  'Supabase CLI was not resolved to a shell-free executable. Push was not attempted and no linked project was used.';

const defaultFs: SupabaseCliFs = {
  exists: (filePath) => {
    try {
      return existsSync(filePath);
    } catch {
      return false;
    }
  },
  readText: (filePath) => {
    try {
      return readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }
  },
};

interface CliFailure extends Error {
  status?: number | null;
  signal?: NodeJS.Signals | null;
  code?: string;
}

function cliFailure(
  message: string,
  fields: { status?: number | null; signal?: NodeJS.Signals | null; code?: string },
): CliFailure {
  const error = new Error(message) as CliFailure;
  if (fields.status !== undefined) error.status = fields.status;
  if (fields.signal) error.signal = fields.signal;
  if (fields.code) error.code = fields.code;
  return error;
}

function pathApiFor(platform: NodeJS.Platform): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path.posix;
}

function isCmdShim(filePath: string): boolean {
  return /\.(cmd|bat)$/i.test(filePath);
}

function isJsEntry(filePath: string): boolean {
  return /\.(js|mjs|cjs)$/i.test(filePath);
}

function pushArgs(prefix: readonly string[], connectionString: string): string[] {
  return [...prefix, 'db', 'push', '--db-url', connectionString];
}

function directLaunch(command: string, connectionString: string, pathApi: path.PlatformPath): SupabaseCliLaunch {
  return {
    command,
    args: pushArgs([], connectionString),
    shell: false,
    label: pathApi.basename(command),
  };
}

function nodeLaunch(
  execPath: string,
  scriptPath: string,
  connectionString: string,
  pathApi: path.PlatformPath,
): SupabaseCliLaunch {
  return {
    command: execPath,
    args: pushArgs([scriptPath], connectionString),
    shell: false,
    label: `${pathApi.basename(execPath)} ${pathApi.basename(scriptPath)}`,
  };
}

function binRelative(bin: unknown): string | null {
  if (typeof bin === 'string' && bin.trim()) return bin.trim();
  if (!bin || typeof bin !== 'object') return null;
  const record = bin as Record<string, unknown>;
  const named = record.supabase;
  if (typeof named === 'string' && named.trim()) return named.trim();
  for (const value of Object.values(record)) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function launchFromPackageJson(
  packageJsonPath: string,
  ctx: { platform: NodeJS.Platform; execPath: string; connectionString: string; fs: SupabaseCliFs },
): SupabaseCliLaunch | null {
  if (!ctx.fs.exists(packageJsonPath)) return null;
  const text = ctx.fs.readText(packageJsonPath);
  if (!text) return null;
  let parsed: { bin?: unknown };
  try {
    parsed = JSON.parse(text) as { bin?: unknown };
  } catch {
    return null;
  }
  const relative = binRelative(parsed.bin);
  if (!relative) return null;
  const pathApi = pathApiFor(ctx.platform);
  const entry = pathApi.resolve(pathApi.dirname(packageJsonPath), relative);
  return launchFromFile(entry, ctx);
}

function textLooksLikeJavaScript(text: string): boolean {
  return /^\s*(#!|import\s|const\s|let\s|function\s|\/\/)/.test(text);
}

function launchFromFile(
  filePath: string,
  ctx: { platform: NodeJS.Platform; execPath: string; connectionString: string; fs: SupabaseCliFs },
): SupabaseCliLaunch | null {
  if (!filePath || isCmdShim(filePath) || !ctx.fs.exists(filePath)) return null;
  const pathApi = pathApiFor(ctx.platform);
  if (isJsEntry(filePath)) return nodeLaunch(ctx.execPath, filePath, ctx.connectionString, pathApi);
  if (filePath.toLowerCase().endsWith('.exe') || ctx.platform !== 'win32') {
    return directLaunch(filePath, ctx.connectionString, pathApi);
  }
  const text = ctx.fs.readText(filePath);
  if (text && textLooksLikeJavaScript(text)) return nodeLaunch(ctx.execPath, filePath, ctx.connectionString, pathApi);
  return null;
}

function jsPathsInCmd(text: string, cmdPath: string, platform: NodeJS.Platform): string[] {
  const pathApi = pathApiFor(platform);
  const found: string[] = [];
  const pattern = /["']([^"'\r\n]+\.(?:js|mjs|cjs))["']/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[1];
    if (!raw || raw.includes('%')) continue;
    found.push(pathApi.isAbsolute(raw) ? raw : pathApi.resolve(pathApi.dirname(cmdPath), raw));
  }
  return found;
}

function launchFromCmdShim(
  cmdPath: string,
  ctx: { platform: NodeJS.Platform; execPath: string; connectionString: string; fs: SupabaseCliFs },
): SupabaseCliLaunch | null {
  if (!ctx.fs.exists(cmdPath)) return null;
  const pathApi = pathApiFor(ctx.platform);
  const sibling = pathApi.join(pathApi.dirname(cmdPath), 'node_modules', 'supabase', 'package.json');
  const fromPackage = launchFromPackageJson(sibling, ctx);
  if (fromPackage) return fromPackage;
  const text = ctx.fs.readText(cmdPath);
  if (!text) return null;
  for (const jsPath of jsPathsInCmd(text, cmdPath, ctx.platform)) {
    const launch = launchFromFile(jsPath, ctx);
    if (launch) return launch;
  }
  return null;
}

function pathDirectories(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const raw = platform === 'win32' ? (env.Path ?? env.PATH ?? '') : (env.PATH ?? env.Path ?? '');
  return raw
    .split(platform === 'win32' ? ';' : ':')
    .map((entry) => entry.trim().replace(/^"(.*)"$/, '$1'))
    .filter((entry) => entry.length > 0);
}

function localPackageJsons(cwd: string, platform: NodeJS.Platform): string[] {
  const pathApi = pathApiFor(platform);
  const found: string[] = [];
  let dir = pathApi.resolve(cwd);
  for (let i = 0; i < 8; i += 1) {
    found.push(pathApi.join(dir, 'node_modules', 'supabase', 'package.json'));
    const parent = pathApi.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return found;
}

function refusal(detail: string): Error {
  return new Error(`${REFUSAL_INTRO}\n${detail}`);
}

function assertShellFree(launch: SupabaseCliLaunch, connectionString: string): void {
  if (launch.shell !== false || isCmdShim(launch.command)) {
    throw refusal(
      `Refusing to spawn ${launch.command}. A .cmd/.bat shim or a shell would interpret the database URL.`,
    );
  }
  const dbUrlAt = launch.args.indexOf('--db-url');
  if (dbUrlAt < 0 || launch.args[dbUrlAt + 1] !== connectionString) {
    throw refusal('Refusing to run db push without an explicit --db-url argument. No linked project was used.');
  }
}

/**
 * Resolves a shell-free Supabase CLI launch. Never returns a .cmd/.bat command.
 * The database URL is a single argv element after --db-url.
 */
export function resolveSupabaseCliLaunch(input: {
  connectionString: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  execPath?: string;
  fs?: SupabaseCliFs;
}): SupabaseCliLaunch {
  const platform = input.platform ?? process.platform;
  const execPath = input.execPath ?? process.execPath;
  const env = input.env ?? {};
  const fsApi = input.fs ?? defaultFs;
  const pathApi = pathApiFor(platform);
  const ctx = { platform, execPath, connectionString: input.connectionString, fs: fsApi };
  const refused: string[] = [];

  const explicit = (env.SUPABASE_CLI_BIN ?? '').trim();
  if (explicit) {
    if (isCmdShim(explicit)) {
      const mapped = launchFromCmdShim(explicit, ctx);
      if (mapped) return mapped;
      throw refusal(
        `SUPABASE_CLI_BIN points at ${explicit}, a .cmd/.bat shim. Refusing to execute it because cmd.exe would interpret the database URL. Point SUPABASE_CLI_BIN at supabase.exe or the CLI's .js/.mjs/.cjs entry.`,
      );
    }
    const explicitLaunch = launchFromFile(explicit, ctx);
    if (explicitLaunch) return explicitLaunch;
    throw refusal(
      `SUPABASE_CLI_BIN points at ${explicit}, which is missing or is not a shell-free executable. Point it at supabase.exe or the CLI's .js/.mjs/.cjs entry.`,
    );
  }

  for (const packageJsonPath of localPackageJsons(input.cwd, platform)) {
    const launch = launchFromPackageJson(packageJsonPath, ctx);
    if (launch) return launch;
  }

  for (const dir of pathDirectories(env, platform)) {
    const exeName = platform === 'win32' ? 'supabase.exe' : 'supabase';
    const exeLaunch = launchFromFile(pathApi.join(dir, exeName), ctx);
    if (exeLaunch) return exeLaunch;
    const packageLaunch = launchFromPackageJson(pathApi.join(dir, 'node_modules', 'supabase', 'package.json'), ctx);
    if (packageLaunch) return packageLaunch;
  }

  if (platform === 'win32' && env.APPDATA) {
    const launch = launchFromPackageJson(
      pathApi.join(env.APPDATA, 'npm', 'node_modules', 'supabase', 'package.json'),
      ctx,
    );
    if (launch) return launch;
  }
  if (env.npm_config_prefix) {
    const launch = launchFromPackageJson(pathApi.join(env.npm_config_prefix, 'node_modules', 'supabase', 'package.json'), ctx);
    if (launch) return launch;
  }

  for (const dir of pathDirectories(env, platform)) {
    if (platform !== 'win32') continue;
    const cmdPath = pathApi.join(dir, 'supabase.cmd');
    if (!fsApi.exists(cmdPath)) continue;
    const mapped = launchFromCmdShim(cmdPath, ctx);
    if (mapped) return mapped;
    refused.push(cmdPath);
  }

  const refusedText = refused.length
    ? `Found ${refused.join(', ')}. Refusing to execute a .cmd/.bat shim because cmd.exe would interpret the database URL.`
    : 'No supabase.exe or JavaScript CLI entry was found on PATH or in node_modules.';
  throw refusal(
    `${refusedText} Set SUPABASE_CLI_BIN to supabase.exe or to the CLI's .js/.mjs/.cjs entry, or install the supabase package.`,
  );
}

function redactPushDiagnostic(text: string, connectionString: string, accessToken: string): string {
  const redacted = redactDiagnosticText(text, connectionString);
  const token = accessToken.trim();
  if (!token) return redacted;
  return redacted.split(token).join('[redacted]');
}

function defaultSpawn(command: string, args: readonly string[], options: SupabaseCliSpawnOptions): SupabaseCliSpawnResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
    error: result.error,
  };
}

export function runSupabaseDbPush(input: {
  connectionString: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  execPath?: string;
  fs?: SupabaseCliFs;
  spawnImpl?: SupabaseCliSpawn;
  log?: (message: string) => void;
  errorLog?: (message: string) => void;
}): void {
  const env = input.env ?? process.env;
  const accessToken = env.SUPABASE_ACCESS_TOKEN ?? '';
  const log = input.log ?? ((message: string) => console.log(message));
  const errorLog = input.errorLog ?? ((message: string) => console.error(message));
  let launch: SupabaseCliLaunch;
  try {
    launch = resolveSupabaseCliLaunch({
      connectionString: input.connectionString,
      cwd: input.cwd,
      env,
      platform: input.platform,
      execPath: input.execPath,
      fs: input.fs,
    });
    assertShellFree(launch, input.connectionString);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw cliFailure(redactPushDiagnostic(message, input.connectionString, accessToken), {});
  }

  const summary = redactDatabaseTargetSummary(input.connectionString);
  log(`Executing: ${launch.label} db push --db-url [redacted] (${summary})`);

  const command = launch.command;
  const args = launch.args;
  const spawnImpl = input.spawnImpl ?? defaultSpawn;
  let result: SupabaseCliSpawnResult;
  try {
    result = spawnImpl(command, args, {
      cwd: input.cwd,
      env,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
    });
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err && typeof err.code === 'string' ? err.code : '';
    const message = err instanceof Error ? err.message : String(err);
    throw cliFailure(
      redactPushDiagnostic(`Supabase CLI spawn failed${code ? `: ${code}` : ''} ${message}`, input.connectionString, accessToken),
      { code: code || undefined },
    );
  }

  const stdout = redactPushDiagnostic(result.stdout ?? '', input.connectionString, accessToken);
  const stderr = redactPushDiagnostic(result.stderr ?? '', input.connectionString, accessToken);
  if (stdout.trim()) log(stdout);
  if (stderr.trim()) errorLog(stderr);

  if (result.error) {
    const code = 'code' in result.error && typeof result.error.code === 'string' ? result.error.code : '';
    const detail = redactPushDiagnostic(result.error.message, input.connectionString, accessToken);
    const streams = [stderr, stdout].filter((part) => part.trim()).join('\n');
    throw cliFailure(
      redactPushDiagnostic(
        `Supabase CLI spawn failed${code ? `: ${code}` : ''} ${detail}${streams ? `\n${streams}` : ''}`,
        input.connectionString,
        accessToken,
      ),
      { code: code || undefined, status: result.status, signal: result.signal },
    );
  }

  if (result.signal) {
    const streams = [stderr, stdout].filter((part) => part.trim()).join('\n');
    throw cliFailure(
      redactPushDiagnostic(
        `Supabase CLI migration failed: signal ${result.signal}${streams ? `\n${streams}` : ''}`,
        input.connectionString,
        accessToken,
      ),
      { signal: result.signal, status: result.status },
    );
  }

  if (result.status !== 0) {
    const streams = [stderr, stdout].filter((part) => part.trim()).join('\n');
    throw cliFailure(
      redactPushDiagnostic(
        `Supabase CLI migration failed: exit ${String(result.status)}${streams ? `\n${streams}` : ''}`,
        input.connectionString,
        accessToken,
      ),
      { status: result.status },
    );
  }
}
