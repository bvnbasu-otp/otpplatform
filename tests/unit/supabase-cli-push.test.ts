import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveSupabaseCliLaunch,
  runSupabaseDbPush,
  type SupabaseCliFs,
  type SupabaseCliSpawnResult,
} from '../../scripts/supabase-db-push';

const EXEC = 'C:\\node\\node.exe';
const dangerous = `postgres://user:p%40ss word&|>"<'^%!@db.example.supabase.co:5432/postgres`;
const connection = 'postgres://user:p%40ss@db.example.supabase.co:5432/postgres';
const decodedPassword = 'p@ss';

function fakeFs(platform: 'win32' | 'posix', entries: Record<string, string | true>): SupabaseCliFs {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const known = new Map<string, string | true>();
  for (const [key, value] of Object.entries(entries)) {
    known.set(pathApi.normalize(key).toLowerCase(), value);
  }
  return {
    exists(filePath) {
      return known.has(pathApi.normalize(filePath).toLowerCase());
    },
    readText(filePath) {
      const value = known.get(pathApi.normalize(filePath).toLowerCase());
      return typeof value === 'string' ? value : null;
    },
  };
}

function assertCredentialsHidden(text: string) {
  expect(text).not.toContain(decodedPassword);
  expect(text).not.toContain('p%40ss');
  expect(text).not.toContain(connection);
  expect(text).not.toContain('postgresql://');
  expect(text).not.toContain('postgres://');
}

function assertDbUrlArg(args: readonly string[], url: string) {
  const index = args.indexOf('--db-url');
  expect(index).toBeGreaterThan(-1);
  expect(args[index + 1]).toBe(url);
  expect(args.filter((arg) => arg === url)).toHaveLength(1);
  expect(args.some((arg) => arg.includes('--db-url') && arg.includes(url))).toBe(false);
}

describe('supabase db push argv', () => {
  it('spawns supabase.exe on Windows without a shell and keeps metacharacters in one argument', () => {
    const logs: string[] = [];
    let command = '';
    let args: readonly string[] = [];
    let shell: boolean | undefined;
    runSupabaseDbPush({
      connectionString: dangerous,
      cwd: 'C:\\work',
      platform: 'win32',
      execPath: EXEC,
      env: { Path: 'C:\\cli', SUPABASE_ACCESS_TOKEN: 'token-with-&|%' },
      fs: fakeFs('win32', {
        'C:\\cli\\supabase.exe': true,
        'C:\\cli\\supabase.cmd': '@echo off\r\nsupabase %*\r\n',
      }),
      log: (message) => logs.push(message),
      errorLog: (message) => logs.push(message),
      spawnImpl: (spawnedCommand, spawnedArgs, options) => {
        command = spawnedCommand;
        args = spawnedArgs;
        shell = options.shell;
        expect(options.encoding).toBe('utf8');
        expect(options.windowsHide).toBe(true);
        const result: SupabaseCliSpawnResult = { status: 0, signal: null, stdout: '', stderr: '' };
        return result;
      },
    });

    expect(shell).toBe(false);
    expect(command.toLowerCase()).toBe('c:\\cli\\supabase.exe');
    expect(command).not.toMatch(/\.cmd$/i);
    expect(command).not.toContain(dangerous);
    expect(command).not.toContain('token-with-&|%');
    expect(args).toEqual(['db', 'push', '--db-url', dangerous]);
    assertDbUrlArg(args, dangerous);
    expect(args.join('\n')).not.toContain('token-with-&|%');
    const logged = logs.join('\n');
    expect(logged).not.toContain(dangerous);
    expect(logged).not.toContain('&|>');
    expect(logged).toContain('db push --db-url [redacted]');
  });

  it('resolves a Windows .cmd shim to its JavaScript entry and does not execute the shim', () => {
    const js = 'C:\\npm\\node_modules\\supabase\\dist\\supabase.js';
    const launch = resolveSupabaseCliLaunch({
      connectionString: dangerous,
      cwd: 'C:\\work',
      platform: 'win32',
      execPath: EXEC,
      env: { Path: 'C:\\npm' },
      fs: fakeFs('win32', {
        'C:\\npm\\supabase.cmd': '@echo off\r\n"%_prog%" "%dp0%\\node_modules\\supabase\\dist\\supabase.js" %*\r\n',
        'C:\\npm\\node_modules\\supabase\\package.json': JSON.stringify({ bin: { supabase: 'dist/supabase.js' } }),
        [js]: '#!/usr/bin/env node\n',
      }),
    });

    expect(launch.shell).toBe(false);
    expect(launch.command).toBe(EXEC);
    expect(launch.command).not.toMatch(/\.cmd$/i);
    expect(launch.args[0]).toBe(js);
    expect(launch.args.slice(1)).toEqual(['db', 'push', '--db-url', dangerous]);
    assertDbUrlArg(launch.args, dangerous);
  });

  it('fails closed when Windows only has a .cmd shim and does not fall back to a linked project', () => {
    let spawned = false;
    let message = '';
    try {
      runSupabaseDbPush({
        connectionString: dangerous,
        cwd: 'C:\\work',
        platform: 'win32',
        execPath: EXEC,
        env: { Path: 'C:\\npm' },
        fs: fakeFs('win32', {
          'C:\\npm\\supabase.cmd': '@echo off\r\nnode "%dp0%\\supabase.js" %*\r\n',
        }),
        spawnImpl: () => {
          spawned = true;
          return { status: 0, signal: null, stdout: '', stderr: '' };
        },
      });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toMatch(/shell-free executable/i);
    expect(message).toMatch(/supabase\.cmd/i);
    expect(message).toMatch(/cmd\.exe/i);
    expect(message).toMatch(/SUPABASE_CLI_BIN/);
    expect(message).toMatch(/no linked project was used/i);
    expect(message).not.toContain(dangerous);
    expect(spawned).toBe(false);

    let explicitMessage = '';
    try {
      resolveSupabaseCliLaunch({
        connectionString: dangerous,
        cwd: 'C:\\empty',
        platform: 'win32',
        execPath: EXEC,
        env: { SUPABASE_CLI_BIN: 'C:\\missing\\supabase.cmd' },
        fs: fakeFs('win32', {}),
      });
    } catch (err) {
      explicitMessage = err instanceof Error ? err.message : String(err);
    }
    expect(explicitMessage).toMatch(/SUPABASE_CLI_BIN points at C:\\missing\\supabase\.cmd/i);
    expect(explicitMessage).toMatch(/cmd\.exe/i);
    expect(explicitMessage).toMatch(/no linked project was used/i);
  });

  it('fails closed when no executable or JavaScript entry exists', () => {
    let spawned = false;
    expect(() =>
      runSupabaseDbPush({
        connectionString: dangerous,
        cwd: 'C:\\empty',
        platform: 'win32',
        execPath: EXEC,
        env: {},
        fs: fakeFs('win32', {}),
        spawnImpl: () => {
          spawned = true;
          return { status: 0, signal: null, stdout: '', stderr: '' };
        },
      }),
    ).toThrow(/No supabase\.exe or JavaScript CLI entry[\s\S]*SUPABASE_CLI_BIN/);
    expect(() =>
      runSupabaseDbPush({
        connectionString: dangerous,
        cwd: 'C:\\empty',
        platform: 'win32',
        execPath: EXEC,
        env: {},
        fs: fakeFs('win32', {}),
        spawnImpl: () => {
          spawned = true;
          return { status: 0, signal: null, stdout: '', stderr: '' };
        },
      }),
    ).toThrow(/no linked project was used/i);
    expect(spawned).toBe(false);
  });

  it('redacts credentials and preserves non-zero exits, signals, and spawn failures', () => {
    const logs: string[] = [];
    const fs = fakeFs('win32', { 'C:\\cli\\supabase.exe': true });
    const run = (result: SupabaseCliSpawnResult) =>
      runSupabaseDbPush({
        connectionString: connection,
        cwd: 'C:\\work',
        platform: 'win32',
        execPath: EXEC,
        env: { Path: 'C:\\cli' },
        fs,
        log: (message) => logs.push(message),
        errorLog: (message) => logs.push(message),
        spawnImpl: () => result,
      });
    const expectFailure = (result: SupabaseCliSpawnResult, pattern: RegExp) => {
      let error: (Error & { status?: number | null; code?: string }) | undefined;
      try {
        run(result);
      } catch (err) {
        error = err as Error & { status?: number | null; code?: string };
      }
      expect(error?.message ?? '').toMatch(pattern);
      logs.push(error?.message ?? '');
      return error;
    };

    run({ status: 0, signal: null, stdout: `applied ${connection}`, stderr: `warn ${decodedPassword}` });
    const exitError = expectFailure(
      {
        status: 3,
        signal: null,
        stdout: `stdout ${connection}`,
        stderr: `stderr ${decodedPassword} ${connection}`,
      },
      /exit 3/,
    );
    expect(exitError?.status).toBe(3);
    expectFailure(
      { status: null, signal: 'SIGTERM', stdout: '', stderr: `killed ${decodedPassword}` },
      /signal SIGTERM/,
    );

    const spawnError = new Error(`spawn supabase ENOENT ${connection}`) as Error & { code?: string };
    spawnError.code = 'ENOENT';
    const enoent = expectFailure(
      { status: null, signal: null, stdout: '', stderr: '', error: spawnError },
      /ENOENT/,
    );
    expect(enoent?.code).toBe('ENOENT');

    let timeoutMessage = '';
    try {
      runSupabaseDbPush({
        connectionString: connection,
        cwd: 'C:\\work',
        platform: 'win32',
        execPath: EXEC,
        env: { Path: 'C:\\cli' },
        fs,
        log: (message) => logs.push(message),
        errorLog: (message) => logs.push(message),
        spawnImpl: () => {
          const timeout = new Error(`ETIMEDOUT ${connection} ${decodedPassword}`) as Error & { code?: string };
          timeout.code = 'ETIMEDOUT';
          throw timeout;
        },
      });
    } catch (err) {
      timeoutMessage = err instanceof Error ? err.message : String(err);
    }
    expect(timeoutMessage).toMatch(/ETIMEDOUT/);
    logs.push(timeoutMessage);
    expectFailure({ status: 1, signal: null, stdout: connection, stderr: decodedPassword }, /exit 1/);
    assertCredentialsHidden(logs.join('\n'));
  });

  it('redacts an access token printed alone by the CLI child', () => {
    const token = 'sbp_test_token_do_not_use';
    const logs: string[] = [];
    let childStdout = '';
    let thrown = '';
    try {
      runSupabaseDbPush({
        connectionString: connection,
        cwd: 'C:\\work',
        platform: 'win32',
        execPath: EXEC,
        env: { Path: 'C:\\cli', SUPABASE_ACCESS_TOKEN: token },
        fs: fakeFs('win32', { 'C:\\cli\\supabase.exe': true }),
        log: (message) => logs.push(message),
        errorLog: (message) => logs.push(message),
        spawnImpl: (command, args, options) => {
          expect(options.env.SUPABASE_ACCESS_TOKEN).toBe(token);
          expect(command).not.toContain(token);
          expect(args.join('\n')).not.toContain(token);
          childStdout = token;
          return { status: 1, signal: null, stdout: childStdout, stderr: '' };
        },
      });
    } catch (err) {
      thrown = err instanceof Error ? err.message : String(err);
    }

    expect(childStdout).toBe(token);
    expect(logs.join('\n')).not.toContain(token);
    expect(thrown).not.toContain(token);
    expect(logs).toContain('[redacted]');
    expect(thrown).toContain('[redacted]');
    expect(thrown).toMatch(/exit 1/);
  });
});
