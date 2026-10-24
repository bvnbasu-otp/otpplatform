import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client, type ClientConfig } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  LOCAL_POSTGRES_ADDRESS,
  LOCAL_POSTGRES_PORT,
  requireLocalPostgresSqlParity,
} from '../helpers/local-postgres-sql-parity';

const ROOT = resolve(__dirname, '../..');
const MIGRATIONS = resolve(ROOT, 'supabase/migrations');
const AUDIT_PROPOSAL = resolve(ROOT, 'supabase/00315_audit_actor_identity_registry.UNAPPLIED.sql');
const FOUNDER_PROPOSAL = resolve(ROOT, 'supabase/00316_founder_superadmin_role_guard.UNAPPLIED.sql');
const DELETE_PROPOSAL = resolve(ROOT, 'supabase/00320_superadmin_demo_user_deletion.UNAPPLIED.sql');
const DEMO_MARKER_PROPOSAL = resolve(ROOT, 'supabase/00321_restrict_is_demo_marker.UNAPPLIED.sql');
// Migration 00113 creates this deterministic local founder. 00316 resolves the
// founder by claim + reserved email and therefore also covers hosted UUIDs.
const FOUNDER_ID = 'dd2dedee-0c2a-4254-b2af-342b41d56385';
const LOCAL_PG: ClientConfig = {
  host: '127.0.0.1',
  port: LOCAL_POSTGRES_PORT,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

function stripComments(sql: string): string {
  return sql.replace(/--.*$/gm, '');
}

function stripTransaction(sql: string): string {
  return sql
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:BEGIN|COMMIT);\s*$/.test(line))
    .join('\n');
}

function stripPreconditions(sql: string): string {
  return sql.replace(/DO \$preconditions\$[\s\S]*?\$preconditions\$;/, '');
}

function extractSnapshotBody(sql: string): string {
  const matches = [...sql.matchAll(
    /CREATE FUNCTION private_security\.demo_user_deletion_snapshot\(\s*p_target_profile_id uuid,\s*p_requester_profile_id uuid\s*\)[\s\S]*?AS \$fn\$\s*([\s\S]*?)\s*\$fn\$;/g,
  )];
  if (matches.length !== 1 || !matches[0][1]) {
    throw new Error(`expected exactly one demo_user_deletion_snapshot body, found ${matches.length}`);
  }
  return matches[0][1];
}

function extractExecuteBody(sql: string): string {
  const matches = [...sql.matchAll(
    /CREATE FUNCTION public\.execute_demo_user_deletion\(\s*p_target_profile_id uuid,\s*p_confirmation_token text,\s*p_reason text,\s*p_outcome text\s*\)[\s\S]*?AS \$fn\$\s*([\s\S]*?)\s*\$fn\$;/g,
  )];
  if (matches.length !== 1 || !matches[0][1]) {
    throw new Error(`expected exactly one execute_demo_user_deletion body, found ${matches.length}`);
  }
  return matches[0][1];
}

function extractPreconditionsBody(sql: string): string {
  const matches = [...sql.matchAll(/DO \$preconditions\$\s*([\s\S]*?)\s*\$preconditions\$;/g)];
  if (matches.length !== 1 || !matches[0][1]) {
    throw new Error(`expected exactly one 00320 precondition body, found ${matches.length}`);
  }
  return matches[0][1];
}

const PREREQUISITE_SIGNATURES = [
  'private.permit_audit_actor_registry(uuid)',
  'private.guard_audit_actor_identity()',
  'private.maintain_audit_actor_identity()',
  'private_security.founder_profile_protected(uuid)',
  'private_security.guard_founder_superadmin_active_role()',
  'private_security.guard_founder_superadmin_profile_role()',
  'private_security.guard_founder_superadmin_internal_assignment()',
  'private_security.guard_founder_superadmin_internal_role()',
  'private_security.guard_founder_superadmin_user_role()',
  'private_security.guard_profile_is_demo_marker()',
] as const;

const POSTGRES_OWNED_SIGNATURES = new Set<string>(PREREQUISITE_SIGNATURES.slice(3));
const UNOWNED_PRIVATE_SIGNATURES = PREREQUISITE_SIGNATURES.slice(0, 3);

type ParsedFunction = {
  signature: string;
  header: string;
  body: string;
  language: string;
  security: 'DEFINER' | 'INVOKER';
  searchPath: string;
  volatility: 's' | null;
};

type ParsedTrigger = {
  name: string;
  table: string;
  functionName: string;
  signature: string;
  timing: string;
  level: string;
  events: string;
  columns: string[];
  args: string[];
  tgtype: number;
};

type FunctionManifestRow = {
  signature: string;
  securityDefiner: boolean;
  searchPath: string;
  language: string;
  volatility: 's' | null;
  requireOwner: boolean;
};

type TriggerManifestRow = {
  proposal: string;
  name: string;
  tableSchema: string;
  tableName: string;
  functionSchema: string;
  functionName: string;
  securityDefiner: boolean;
  searchPath: string;
  signature: string;
  tgtype: number;
  columns: string[];
  args: string[];
};

function mustGet<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`missing ${label}`);
  return value;
}

function canonicalSignature(qualifiedName: string, argList: string): string {
  const trimmed = argList.trim();
  if (!trimmed) return `${qualifiedName}()`;
  const types = trimmed.split(',').map((part) => {
    const tokens = part.trim().split(/\s+/).filter((token) => !/^(IN|OUT|INOUT|VARIADIC)$/i.test(token));
    const type = tokens[tokens.length - 1];
    if (!type) throw new Error(`unparsed argument in ${qualifiedName}(${argList})`);
    return type;
  });
  return `${qualifiedName}(${types.join(', ')})`;
}

function findClosingParen(sql: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < sql.length; index += 1) {
    const char = sql[index];
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error('unbalanced parenthesis');
}

function extractFunctions(sql: string): ParsedFunction[] {
  const stripped = stripComments(sql);
  const results: ParsedFunction[] = [];
  const startRe = /CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+([a-z_]+\.[a-z_]+)\s*\(/gi;
  for (const match of stripped.matchAll(startRe)) {
    const qualifiedName = match[1];
    if (match.index === undefined) throw new Error(`missing index for ${qualifiedName}`);
    const openParen = match.index + match[0].length - 1;
    const closeParen = findClosingParen(stripped, openParen);
    const headerStart = closeParen + 1;
    const asMatch = /AS\s+\$([A-Za-z_][A-Za-z0-9_]*)\$/i.exec(stripped.slice(headerStart));
    if (!asMatch || asMatch.index === undefined) throw new Error(`missing body for ${qualifiedName}`);
    const header = stripped.slice(headerStart, headerStart + asMatch.index);
    const tag = asMatch[1];
    const bodyStart = headerStart + asMatch.index + asMatch[0].length;
    const bodyEnd = stripped.indexOf(`$${tag}$`, bodyStart);
    if (bodyEnd < 0) throw new Error(`unterminated body for ${qualifiedName}`);
    const language = header.match(/LANGUAGE\s+(sql|plpgsql)\b/i)?.[1]?.toLowerCase();
    if (!language) throw new Error(`missing language for ${qualifiedName}`);
    const invoker = /SECURITY\s+INVOKER\b/i.test(header);
    const definer = /SECURITY\s+DEFINER\b/i.test(header);
    if (invoker === definer) throw new Error(`ambiguous security mode for ${qualifiedName}`);
    const searchPathValue = header.match(/SET\s+search_path\s*=\s*([^\n;]+)/i)?.[1]?.replace(/\r/g, '').trim();
    if (!searchPathValue) throw new Error(`missing search_path for ${qualifiedName}`);
    const settings = [...header.matchAll(/\bSET\s+([a-z_]+)\s*=/gi)].map((item) => item[1].toLowerCase());
    if (settings.length !== 1 || settings[0] !== 'search_path') {
      throw new Error(`expected only search_path for ${qualifiedName}, found ${settings.join(', ')}`);
    }
    const volatilityWord = header.match(/\b(STABLE|IMMUTABLE|VOLATILE)\b/i)?.[1]?.toUpperCase() ?? null;
    if (volatilityWord && volatilityWord !== 'STABLE') {
      throw new Error(`${qualifiedName} declares ${volatilityWord}, which this check does not map`);
    }
    results.push({
      signature: canonicalSignature(qualifiedName, stripped.slice(openParen + 1, closeParen)),
      header,
      body: stripped.slice(bodyStart, bodyEnd),
      language,
      security: invoker ? 'INVOKER' : 'DEFINER',
      searchPath: `search_path=${searchPathValue}`,
      volatility: volatilityWord === 'STABLE' ? 's' : null,
    });
  }
  return results;
}

function triggerTgtype(timing: string, level: string, events: { insert: boolean; delete: boolean; update: boolean; truncate: boolean }): number {
  let value = 0;
  if (level.toUpperCase() === 'ROW') value += 1;
  if (timing.toUpperCase() === 'BEFORE') value += 2;
  if (timing.toUpperCase() === 'INSTEAD OF') value += 64;
  if (events.insert) value += 4;
  if (events.delete) value += 8;
  if (events.update) value += 16;
  if (events.truncate) value += 32;
  return value;
}

function parseTriggerEvents(eventsSql: string): { insert: boolean; delete: boolean; update: boolean; truncate: boolean; columns: string[] } {
  let insert = false;
  let deleteEvent = false;
  let update = false;
  let truncate = false;
  let columns: string[] = [];
  for (const part of eventsSql.trim().split(/\s+OR\s+/i)) {
    const updateOf = /^UPDATE\s+OF\s+(.+)$/i.exec(part.trim());
    if (updateOf) {
      update = true;
      columns = updateOf[1].split(',').map((column) => column.trim()).filter(Boolean);
    } else if (/^INSERT$/i.test(part.trim())) insert = true;
    else if (/^DELETE$/i.test(part.trim())) deleteEvent = true;
    else if (/^UPDATE$/i.test(part.trim())) update = true;
    else if (/^TRUNCATE$/i.test(part.trim())) truncate = true;
    else throw new Error(`unparsed trigger event: ${part}`);
  }
  return { insert, delete: deleteEvent, update, truncate, columns };
}

function parseTriggerArguments(rawArgs: string, functionName: string): string[] {
  const trimmed = rawArgs.trim();
  if (!trimmed) return [];
  if (!/^(?:'(?:[^']|'')*'\s*,\s*)*'(?:[^']|'')*'$/.test(trimmed)) {
    throw new Error(`expected quoted trigger arguments for ${functionName}, found ${rawArgs}`);
  }
  return [...trimmed.matchAll(/'([^']*)'/g)].map((match) => match[1]);
}

function extractTriggers(sql: string): ParsedTrigger[] {
  const stripped = stripComments(sql);
  const results: ParsedTrigger[] = [];
  const triggerRe = /CREATE\s+TRIGGER\s+([a-z0-9_]+)\s+(BEFORE|AFTER|INSTEAD OF)\s+([\s\S]*?)\s+ON\s+(public\.[a-z_]+)\s+FOR\s+EACH\s+(ROW|STATEMENT)\s+EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+([a-z_]+\.[a-z_]+)\s*\(([\s\S]*?)\)\s*;/gi;
  for (const match of stripped.matchAll(triggerRe)) {
    const [, name, timing, eventsSql, table, level, functionName, rawArgs] = match;
    const events = parseTriggerEvents(eventsSql);
    const args = parseTriggerArguments(rawArgs, functionName);
    results.push({
      name,
      table,
      functionName,
      signature: `${functionName}()`,
      timing,
      level,
      events: eventsSql.trim().replace(/\s+/g, ' '),
      columns: events.columns,
      args,
      tgtype: triggerTgtype(timing, level, events),
    });
  }
  return results;
}

function parseSqlTextArray(literal: string): string[] {
  const match = /^ARRAY\[([\s\S]*)\]::text\[\]$/.exec(literal.trim());
  if (!match) throw new Error(`unparsed text array: ${literal}`);
  const inner = match[1].trim();
  if (!inner) return [];
  const values = [...inner.matchAll(/'([^']*)'/g)].map((item) => item[1]);
  if (values.length === 0) throw new Error(`unparsed text array values: ${literal}`);
  return values;
}

function sortedCopy(values: string[]): string[] {
  return [...values].sort();
}

function preconditionText(sql: string): string {
  return stripComments(extractPreconditionsBody(sql));
}

function parseFunctionManifest(preconditions: string): Map<string, FunctionManifestRow> {
  const rows = [...preconditions.matchAll(
    /\('((?:private|private_security)\.[a-z_]+\([^)]*\))',\s*(true|false),\s*'(search_path=[^']+)',\s*'(sql|plpgsql)',\s*(NULL::text|'s'),\s*(true|false)\)/g,
  )];
  const manifest = new Map<string, FunctionManifestRow>();
  for (const row of rows) {
    const signature = row[1];
    if (manifest.has(signature)) throw new Error(`duplicate function manifest signature ${signature}`);
    manifest.set(signature, {
      signature,
      securityDefiner: row[2] === 'true',
      searchPath: row[3],
      language: row[4],
      volatility: row[5] === "'s'" ? 's' : null,
      requireOwner: row[6] === 'true',
    });
  }
  return manifest;
}

function parseTriggerManifest(preconditions: string): Map<string, TriggerManifestRow> {
  const rows = [...preconditions.matchAll(
    /\('(\d{5})',\s*'([a-z0-9_]+)',\s*'([a-z_]+)',\s*'([a-z_]+)',\s*'([a-z_]+)',\s*'([a-z_]+)',\s*(true|false),\s*'(search_path=[^']+)',\s*'([a-z0-9_]+\.[a-z0-9_]+\([^)]*\))',\s*(\d+),\s*(ARRAY\[[^\]]*\]::text\[\]),\s*(ARRAY\[[^\]]*\]::text\[\])/g,
  )];
  const manifest = new Map<string, TriggerManifestRow>();
  for (const row of rows) {
    const name = row[2];
    if (manifest.has(name)) throw new Error(`duplicate trigger manifest name ${name}`);
    manifest.set(name, {
      proposal: row[1],
      name,
      tableSchema: row[3],
      tableName: row[4],
      functionSchema: row[5],
      functionName: row[6],
      securityDefiner: row[7] === 'true',
      searchPath: row[8],
      signature: row[9],
      tgtype: Number(row[10]),
      columns: parseSqlTextArray(row[11]),
      args: parseSqlTextArray(row[12]),
    });
  }
  return manifest;
}

function signatureRegexp(signature: string): { name: string; args: string } {
  const match = /^([a-z_]+\.[a-z_]+)\(([^)]*)\)$/.exec(signature);
  if (!match) throw new Error(`unparsed signature ${signature}`);
  return {
    name: match[1].replace('.', '\\.'),
    args: match[2] === '' ? '\\(\\s*\\)' : `\\(\\s*${match[2]}\\s*\\)`,
  };
}

function loadPrerequisiteFunctions(): Map<string, ParsedFunction> {
  const functions = new Map<string, ParsedFunction>();
  for (const path of [AUDIT_PROPOSAL, FOUNDER_PROPOSAL, DEMO_MARKER_PROPOSAL]) {
    for (const fn of extractFunctions(readFileSync(path, 'utf8'))) {
      if (functions.has(fn.signature)) throw new Error(`duplicate declaration ${fn.signature}`);
      functions.set(fn.signature, fn);
    }
  }
  return functions;
}

function loadPrerequisiteTriggers(): ParsedTrigger[] {
  return [AUDIT_PROPOSAL, FOUNDER_PROPOSAL, DEMO_MARKER_PROPOSAL]
    .flatMap((path) => extractTriggers(readFileSync(path, 'utf8')));
}

const RETAINED_CATEGORIES = [
  'audit_history',
  'legal_evidence',
  'procurement_finance_tax',
  'organization_supplier',
  'messaging_delivery',
  'security_identity',
];

const NON_BLOCKING_MANIFEST = [
  'auth.identities.user_id:existing_auth_ephemeral_cascade',
  'auth.mfa_factors.user_id:existing_auth_ephemeral_cascade',
  'auth.mfa_recovery_code_sets.user_id:existing_auth_ephemeral_cascade',
  'auth.oauth_authorizations.user_id:existing_auth_ephemeral_cascade',
  'auth.oauth_consents.user_id:existing_auth_ephemeral_cascade',
  'auth.one_time_tokens.user_id:existing_auth_ephemeral_cascade',
  'auth.sessions.user_id:existing_auth_ephemeral_cascade',
  'auth.webauthn_challenges.user_id:existing_auth_ephemeral_cascade',
  'auth.webauthn_credentials.user_id:existing_auth_ephemeral_cascade',
  'private.password_history.profile_id:delete_allowlisted_before_profile',
  'public.audit_actor_identities.profile_id:preserve_evidence_set_null',
  'public.demo_accounts.profile_id:delete_allowlisted_before_profile',
  'public.internal_user_assignments.profile_id:delete_allowlisted_before_profile',
  'public.notification_preferences.user_id:delete_allowlisted_before_profile',
  'public.profile_roles.profile_id:delete_allowlisted_before_profile',
  'public.profile_verification_otps.profile_id:delete_allowlisted_before_profile',
  'public.profiles.auth_user_id:delete_target_profile_explicitly',
].sort();

async function connectLocalOnly(): Promise<Client | null> {
  const client = new Client({ ...LOCAL_PG, connectionTimeoutMillis: 8000 });
  try {
    await client.connect();
  } catch (error) {
    const reason = `local PostgreSQL is unavailable at ${LOCAL_POSTGRES_ADDRESS} (${(error as Error).message})`;
    if (requireLocalPostgresSqlParity()) expect(false, reason).toBe(true);
    else console.warn(`[SKIP REASON] ${reason}`);
    return null;
  }
  const addr = await client.query<{ addr: string | null }>(`SELECT inet_server_addr()::text AS addr`);
  const host = addr.rows[0]?.addr ?? '';
  if (host && !host.startsWith('127.') && host !== '::1' && !host.startsWith('172.') && !host.startsWith('192.168.')) {
    await client.end();
    throw new Error(`refusing non-local postgres at ${host}`);
  }
  return client;
}

async function openLocal(): Promise<Client | null> {
  const client = new Client({ ...LOCAL_PG, connectionTimeoutMillis: 8000 });
  try {
    await client.connect();
  } catch (error) {
    const reason = `local PostgreSQL is unavailable at ${LOCAL_POSTGRES_ADDRESS} (${(error as Error).message})`;
    if (requireLocalPostgresSqlParity()) expect(false, reason).toBe(true);
    else console.warn(`[SKIP REASON] ${reason}`);
    return null;
  }
  const addr = await client.query<{ addr: string | null }>(`SELECT inet_server_addr()::text AS addr`);
  const host = addr.rows[0]?.addr ?? '';
  if (host && !host.startsWith('127.') && host !== '::1' && !host.startsWith('172.') && !host.startsWith('192.168.')) {
    await client.end();
    throw new Error(`refusing non-local postgres at ${host}`);
  }
  const ready = await client.query<{ ok: boolean }>(
    `SELECT to_regclass('public.profiles') IS NOT NULL
        AND to_regclass('public.profile_roles') IS NOT NULL
        AND to_regclass('public.internal_user_assignments') IS NOT NULL
        AND to_regclass('public.legal_enforcement_config') IS NOT NULL
        AND to_regprocedure('private.prevent_audit_mutation()') IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.profiles p
          JOIN auth.users au ON au.id = p.auth_user_id
          JOIN public.profile_roles pr ON pr.profile_id = p.id AND pr.role_code = 'SUPER_ADMIN'
          JOIN public.internal_user_assignments ua ON ua.profile_id = p.id
          JOIN public.internal_roles ir ON ir.id = ua.role_id AND ir.code = 'SUPER_ADMIN'
          WHERE p.id = '${FOUNDER_ID}'::uuid
            AND p.is_founder IS TRUE
            AND p.is_platform_admin IS TRUE
            AND p.active_role_code = 'SUPER_ADMIN'
        ) AS ok`,
  );
  if (!ready.rows[0]?.ok) {
    await client.end();
    const reason = 'local database lacks the canonical founder/Auth identity, SUPER_ADMIN holdings, or required legal/audit schema';
    if (requireLocalPostgresSqlParity()) expect(false, reason).toBe(true);
    else console.warn(`[SKIP REASON] ${reason}`);
    return null;
  }
  return client;
}

async function captureError(client: Client, sql: string, params: unknown[] = []): Promise<string> {
  await client.query('SAVEPOINT expected_error');
  try {
    await client.query(sql, params);
    return '';
  } catch (error) {
    return (error as Error).message;
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT expected_error');
    await client.query('RELEASE SAVEPOINT expected_error');
  }
}

async function setRequester(client: Client, authId: string): Promise<void> {
  await client.query(
    `SELECT set_config('request.jwt.claim.role', 'authenticated', true)`,
  );
  await client.query(
    `SELECT set_config('request.jwt.claim.sub', $1, true)`,
    [authId],
  );
  await client.query(
    `SELECT set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ role: 'authenticated', sub: authId })],
  );
}

async function insertDisposableProfile(
  client: Client,
  input: { id?: string; emailPrefix: string; isDemo: boolean },
): Promise<{ profileId: string; authId: string }> {
  const id = input.id ?? randomUUID();
  const email = `${input.emailPrefix}-${id}@example.test`;
  await client.query(
    `INSERT INTO auth.users (
       instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       confirmation_token, recovery_token, email_change_token_new, email_change,
       email_change_token_current, phone_change, phone_change_token, reauthentication_token,
       is_super_admin, is_sso_user, is_anonymous, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) VALUES (
       '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
       extensions.crypt('not-a-login', extensions.gen_salt('bf')), now(),
       '', '', '', '', '', '', '', '', false, false, false,
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
     )`,
    [id, email],
  );
  await client.query(
    `INSERT INTO public.profiles (
       id, auth_user_id, email, full_name, is_platform_admin, is_founder, is_demo, active_role_code
     ) VALUES ($1, $1, $2, 'Disposable QA Fixture', false, false, $3, NULL)`,
    [id, email, input.isDemo],
  );
  return { profileId: id, authId: id };
}

describe('00320 disposable demo/QA deletion proposal', () => {
  const sql = readFileSync(DELETE_PROPOSAL, 'utf8');
  const executable = stripComments(sql);

  it('keeps proposals 00315 through 00321 outside the migration runner', () => {
    const migrations = readdirSync(MIGRATIONS).filter((file) => /^\d{5}_.*\.sql$/.test(file)).sort();
    expect(migrations.at(-1)).toBe('00314_internal_invitation_acceptance.sql');
    for (const number of ['00315', '00316', '00317', '00318', '00319', '00320', '00321']) {
      expect(migrations.some((file) => file.startsWith(number))).toBe(false);
      const proposals = readdirSync(resolve(ROOT, 'supabase')).filter((file) => file.startsWith(number));
      expect(proposals).toHaveLength(1);
      expect(proposals[0]).toMatch(/\.UNAPPLIED\.sql$/);
    }
    expect(readFileSync(AUDIT_PROPOSAL, 'utf8')).toContain('00315: keep audit attribution');
    expect(readFileSync(FOUNDER_PROPOSAL, 'utf8')).toContain('FOUNDER_SUPERADMIN_ROLE_IMMUTABLE');
    expect(sql.startsWith('-- STATUS: UNAPPLIED')).toBe(true);
    expect(sql).toContain("to_regprocedure('private_security.guard_profile_is_demo_marker()')");
  });

  it('requires effective server-side SUPER_ADMIN authorization and trusted is_demo classification', () => {
    expect(executable).toContain('effective_superadmin_requester');
    expect(executable).toContain("auth.role(), '') IS DISTINCT FROM 'authenticated'");
    expect(executable).not.toContain("current_setting('request.jwt.claim.role'");
    expect(executable).toContain("p.active_role_code = 'SUPER_ADMIN'");
    expect(executable).toContain("pr.role_code = 'SUPER_ADMIN'");
    expect(executable).toContain("ir.code = 'SUPER_ADMIN'");
    expect(executable).toContain('v_target.is_demo IS DISTINCT FROM TRUE');
    expect(executable).toContain('FOUNDER_IDENTITY_PROTECTED');
    expect(executable).toContain('LAST_EFFECTIVE_SUPERADMIN_PROTECTED');
    expect(executable.match(/lower\(\s*v_target\.email\s*\)/g)).toHaveLength(1);
    expect(executable).toMatch(/lower\(\s*email\s*\)\s*=\s*lower\(\s*v_target\.email\s*\)/);
    expect(executable).not.toMatch(/v_target\.(?:email|full_name|title)\s+(?:LIKE|~|=)/i);
  });

  it('[static] marks a whitelist-protected target ineligible and execute still refuses it', () => {
    const withoutBlockComments = (value: string): string => value.replace(/\/\*[\s\S]*?\*\//g, '');
    const body = withoutBlockComments(stripComments(extractSnapshotBody(sql)));
    expect(body).toContain("pg_catalog.to_regclass('private_security.admin_whitelist')");
    expect(body).toMatch(
      /FROM\s+private_security\.admin_whitelist\s+WHERE\s+lower\(\s*email\s*\)\s*=\s*lower\(\s*v_target\.email\s*\)/i,
    );
    expect(body).toMatch(
      /v_policy_blockers\s*:=\s*v_policy_blockers\s*\|\|\s*jsonb_build_array\(\s*jsonb_build_object\(\s*'code',\s*'ADMIN_WHITELIST_PROTECTED',\s*'category',\s*'identity'\s*\)/i,
    );
    expect(body).toMatch(
      /v_policy_blockers\s*:=\s*v_policy_blockers\s*\|\|\s*jsonb_build_array\(\s*jsonb_build_object\(\s*'code',\s*'ADMIN_WHITELIST_PROTECTION_UNEVALUATED',\s*'category',\s*'identity'\s*\)/i,
    );
    const protectedAt = body.indexOf("'ADMIN_WHITELIST_PROTECTED'");
    const unevaluatedAt = body.indexOf("'ADMIN_WHITELIST_PROTECTION_UNEVALUATED'");
    const eligibleAt = body.indexOf('v_eligible :=');
    expect(protectedAt).toBeGreaterThanOrEqual(0);
    expect(unevaluatedAt).toBeGreaterThanOrEqual(0);
    expect(eligibleAt).toBeGreaterThan(Math.max(protectedAt, unevaluatedAt));
    expect(body).toMatch(/v_eligible\s*:=\s*jsonb_array_length\(\s*v_policy_blockers\s*\)\s*=\s*0/);

    const execute = withoutBlockComments(stripComments(extractExecuteBody(sql)));
    const eligibility = execute.indexOf("(v_snapshot ->> 'eligible')::boolean IS DISTINCT FROM TRUE");
    const blocked = execute.indexOf('DEMO_USER_DELETE_BLOCKED: current preview is not eligible');
    const firstDelete = execute.search(/DELETE FROM public\.internal_user_assignments/i);
    expect(eligibility).toBeGreaterThanOrEqual(0);
    expect(blocked).toBeGreaterThan(eligibility);
    expect(firstDelete).toBeGreaterThan(blocked);
    expect(execute).not.toMatch(/session_replication_role\s*=\s*'replica'|ALTER\s+TABLE[\s\S]*DISABLE\s+TRIGGER|DROP\s+TRIGGER\s+trg_enforce_superadmin_immutability/i);
  });

  it('binds one-time confirmation to requester, target, dependency fingerprint, and expiry', () => {
    expect(executable).toContain('requester_profile_id = v_requester');
    expect(executable).toContain('target_profile_id = p_target_profile_id');
    expect(executable).toContain("extensions.gen_random_bytes(32)");
    expect(executable).toContain("extensions.digest(convert_to(v_state::text, 'UTF8'), 'sha256')");
    expect(executable).toContain("interval '10 minutes'");
    expect(executable).toContain('v_preview.expires_at <= clock_timestamp()');
    expect(executable).toContain('DEMO_USER_DELETE_CONFIRMATION_MISMATCH');
    expect(executable).toContain('DEMO_USER_DELETE_STALE_PREVIEW');
    expect(executable.indexOf('DEMO_USER_DELETE_STALE_PREVIEW')).toBeLessThan(
      executable.indexOf('current preview is not eligible'),
    );
  });

  it('[static] locks and revalidates the execute target before any destructive delete', () => {
    const body = stripComments(extractExecuteBody(sql));
    const uniqueIndex = (pattern: RegExp, label: string): number => {
      const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
      const matches = [...body.matchAll(new RegExp(pattern.source, flags))];
      expect(matches, label).toHaveLength(1);
      return matches[0].index;
    };

    const ordered = [
      uniqueIndex(
        /FROM private_security\.demo_user_deletion_previews[\s\S]*?AND consumed_at IS NULL\s+FOR UPDATE;/i,
        'one-time preview row lock',
      ),
      uniqueIndex(
        /SELECT auth_user_id\s+INTO v_target_auth_user_id\s+FROM public\.profiles\s+WHERE id = p_target_profile_id\s+FOR UPDATE;/i,
        'target profile row lock',
      ),
      uniqueIndex(
        /v_target_auth_user_id IS DISTINCT FROM v_preview\.target_auth_user_id/i,
        'profile Auth identity comparison',
      ),
      uniqueIndex(
        /PERFORM 1\s+FROM auth\.users\s+WHERE id = v_target_auth_user_id\s+FOR UPDATE;/i,
        'matching Auth row lock',
      ),
      uniqueIndex(
        /v_snapshot := private_security\.demo_user_deletion_snapshot\(\s*p_target_profile_id,\s*v_requester\s*\);/i,
        'snapshot recomputation',
      ),
      uniqueIndex(
        /\(v_snapshot ->> 'targetAuthUserId'\)::uuid IS DISTINCT FROM v_target_auth_user_id/i,
        'snapshot Auth identity check',
      ),
      uniqueIndex(
        /v_snapshot ->> 'fingerprint' IS DISTINCT FROM v_preview\.state_fingerprint/i,
        'snapshot fingerprint check',
      ),
      uniqueIndex(
        /\(v_snapshot ->> 'eligible'\)::boolean IS DISTINCT FROM TRUE/i,
        'snapshot eligibility check',
      ),
    ];
    expect(ordered).toEqual([...ordered].sort((a, b) => a - b));
    const firstDelete = uniqueIndex(
      /DELETE FROM public\.internal_user_assignments/i,
      'first destructive delete',
    );
    expect(ordered.every((index) => index < firstDelete)).toBe(true);

    expect(body).toMatch(/token_hash = extensions\.digest\([\s\S]*?AND consumed_at IS NULL\s+FOR UPDATE;/i);
    expect(body).toContain('requester_profile_id = v_requester');
    expect(body).toContain('target_profile_id = p_target_profile_id');
    expect(body).toContain('v_preview.expires_at <= clock_timestamp()');
    expect(body).toContain('DEMO_USER_DELETE_CONFIRMATION_MISMATCH');
    expect(body).toContain('DEMO_USER_DELETE_CONFIRMATION_EXPIRED');
    expect(body).toMatch(/RAISE EXCEPTION 'DEMO_USER_DELETE_STALE_PREVIEW'/);
    expect(body).toMatch(/UPDATE private_security\.demo_user_deletion_previews[\s\S]*?SET consumed_at = clock_timestamp\(\)/i);
    expect(body.indexOf('SET consumed_at = clock_timestamp()')).toBeGreaterThan(firstDelete);
    expect(body).not.toMatch(/\b(?:BEGIN|COMMIT|ROLLBACK)\s*;/i);
  });

  it('[static] fail-closes on exact prerequisite trigger and function catalog metadata', () => {
    const preconditions = stripComments(extractPreconditionsBody(sql));
    const tuples = [
      ['trg_audit_actor_identities_guard', 'public', 'audit_actor_identities', 'private', 'guard_audit_actor_identity', 'search_path=public, private, pg_temp'],
      ['trg_aa_audit_actor_identity_register', 'public', 'profiles', 'private', 'maintain_audit_actor_identity', 'search_path=public, private, pg_temp'],
      ['trg_zz_audit_actor_identity_preserve', 'public', 'profiles', 'private', 'maintain_audit_actor_identity', 'search_path=public, private, pg_temp'],
      ['aa_guard_founder_profile_id', 'public', 'profiles', 'private_security', 'guard_founder_superadmin_active_role', 'search_path=pg_catalog, public'],
      ['aa_guard_founder_profile_delete', 'public', 'profiles', 'private_security', 'guard_founder_superadmin_active_role', 'search_path=pg_catalog, public'],
      ['aa_guard_founder_profile_marker', 'public', 'profiles', 'private_security', 'guard_founder_superadmin_active_role', 'search_path=pg_catalog, public'],
      ['aa_guard_founder_active_role', 'public', 'profiles', 'private_security', 'guard_founder_superadmin_active_role', 'search_path=pg_catalog, public'],
      ['aa_guard_founder_profile_role', 'public', 'profile_roles', 'private_security', 'guard_founder_superadmin_profile_role', 'search_path=pg_catalog, public'],
      ['aa_guard_founder_profile_role_truncate', 'public', 'profile_roles', 'private_security', 'guard_founder_superadmin_profile_role', 'search_path=pg_catalog, public'],
      ['aa_guard_founder_internal_assignment', 'public', 'internal_user_assignments', 'private_security', 'guard_founder_superadmin_internal_assignment', 'search_path=pg_catalog, public'],
      ['aa_guard_founder_internal_assignment_truncate', 'public', 'internal_user_assignments', 'private_security', 'guard_founder_superadmin_internal_assignment', 'search_path=pg_catalog, public'],
      ['aa_guard_founder_internal_role', 'public', 'internal_roles', 'private_security', 'guard_founder_superadmin_internal_role', 'search_path=pg_catalog, public'],
      ['aa_guard_founder_internal_role_truncate', 'public', 'internal_roles', 'private_security', 'guard_founder_superadmin_internal_role', 'search_path=pg_catalog, public'],
      ['aa_guard_founder_user_role', 'public', 'user_roles', 'private_security', 'guard_founder_superadmin_user_role', 'search_path=pg_catalog, public'],
      ['aa_guard_founder_user_role_truncate', 'public', 'user_roles', 'private_security', 'guard_founder_superadmin_user_role', 'search_path=pg_catalog, public'],
      ['trg_guard_profile_is_demo_marker', 'public', 'profiles', 'private_security', 'guard_profile_is_demo_marker', 'search_path=pg_catalog, public, auth'],
    ];
    for (const [trigger, tableSchema, table, functionSchema, fn, searchPath] of tuples) {
      expect(preconditions).toContain(`'${trigger}', '${tableSchema}', '${table}', '${functionSchema}', '${fn}', true, '${searchPath}'`);
    }
    expect(preconditions).toMatch(/FROM pg_trigger t\s+JOIN pg_class rel ON rel\.oid = t\.tgrelid\s+JOIN pg_namespace rel_ns/i);
    expect(preconditions).toMatch(/JOIN pg_proc p ON p\.oid = t\.tgfoid\s+JOIN pg_namespace proc_ns/i);
    expect(preconditions).toContain('NOT t.tgisinternal');
    expect(preconditions).toContain("t.tgenabled IN ('O', 'A')");
    expect(preconditions).toContain("p.prorettype = 'trigger'::regtype");
    expect(preconditions).toContain('p.prosecdef IS NOT DISTINCT FROM prerequisite.security_definer');
    expect(preconditions).toContain("WHERE cfg LIKE 'search_path=%'");
    expect(preconditions).toContain('= ARRAY[prerequisite.search_path_config]');
    expect(preconditions).toContain('DEMO_USER_DELETE_PRECONDITION_FAILED');
    expect(preconditions).toContain('t.tgfoid = to_regprocedure(prerequisite.function_signature)');
    expect(preconditions).toContain('t.tgtype = prerequisite.tgtype');
    expect(preconditions).toContain('t.tgqual IS NULL');
    expect(preconditions).toContain('t.tgnargs = cardinality(prerequisite.trigger_args)');
    expect(preconditions).toContain('unnest(t.tgattr)');
    expect(preconditions).toContain("t.tgenabled IN ('O', 'A')");
  });

  it('[STATIC] direct and transitive prerequisite function inventory is complete', () => {
    const preconditions = preconditionText(sql);
    const manifest = parseFunctionManifest(preconditions);
    const declared = loadPrerequisiteFunctions();
    expect([...manifest.keys()].sort()).toEqual([...PREREQUISITE_SIGNATURES].sort());
    for (const signature of PREREQUISITE_SIGNATURES) {
      expect(preconditions).toContain(`'${signature}'`);
      expect(declared.has(signature)).toBe(true);
    }
    expect(preconditions).toContain('to_regprocedure(required_function.signature)');
    expect(declared.has('public.resolve_audit_actor(uuid)')).toBe(true);
    expect(stripComments(readFileSync(AUDIT_PROPOSAL, 'utf8'))).toMatch(
      /CREATE OR REPLACE FUNCTION public\.resolve_audit_actor\(p_actor_id uuid\)/,
    );
    expect(preconditions).not.toContain('resolve_audit_actor');
    expect(manifest.has('public.resolve_audit_actor(uuid)')).toBe(false);
  });

  it('[STATIC] prerequisite security modes and search paths match source', () => {
    const preconditions = preconditionText(sql);
    const manifest = parseFunctionManifest(preconditions);
    const declared = loadPrerequisiteFunctions();
    const founderSignature = 'private_security.founder_profile_protected(uuid)';
    const founderSql = stripComments(readFileSync(FOUNDER_PROPOSAL, 'utf8'));
    expect(founderSql).toMatch(
      /CREATE FUNCTION private_security\.founder_profile_protected\(p_profile_id uuid\)\s+RETURNS boolean\s+LANGUAGE sql\s+STABLE\s+SECURITY INVOKER\s+SET search_path = pg_catalog, public/,
    );
    for (const signature of PREREQUISITE_SIGNATURES) {
      const source = mustGet(declared.get(signature), signature);
      const row = mustGet(manifest.get(signature), `${signature} manifest`);
      const invoker = signature === founderSignature;
      expect(source.security).toBe(invoker ? 'INVOKER' : 'DEFINER');
      expect(source.header).toMatch(invoker ? /SECURITY\s+INVOKER/ : /SECURITY\s+DEFINER/);
      expect(source.header).not.toMatch(invoker ? /SECURITY\s+DEFINER/ : /SECURITY\s+INVOKER/);
      expect(row.securityDefiner).toBe(!invoker);
      expect(source.language).toBe(invoker ? 'sql' : 'plpgsql');
      expect(row.language).toBe(source.language);
      expect(source.volatility).toBe(invoker ? 's' : null);
      expect(row.volatility).toBe(source.volatility);
      expect(row.searchPath).toBe(source.searchPath);
    }
    expect(new Set(PREREQUISITE_SIGNATURES.map((signature) => mustGet(declared.get(signature), signature).searchPath))).toEqual(
      new Set([
        'search_path=public, private, pg_temp',
        'search_path=pg_catalog, public',
        'search_path=pg_catalog, public, auth',
      ]),
    );
    expect(mustGet(manifest.get(founderSignature), founderSignature).securityDefiner).toBe(false);
  });

  it('[STATIC] explicit owner and EXECUTE policies remain source-aligned', () => {
    const preconditions = preconditionText(sql);
    const manifest = parseFunctionManifest(preconditions);
    const auditSql = stripComments(readFileSync(AUDIT_PROPOSAL, 'utf8'));
    const founderSql = stripComments(readFileSync(FOUNDER_PROPOSAL, 'utf8'));
    const markerSql = stripComments(readFileSync(DEMO_MARKER_PROPOSAL, 'utf8'));
    const proposalSql = `${auditSql}\n${founderSql}\n${markerSql}`;
    expect(auditSql).not.toMatch(/OWNER\s+TO/i);
    for (const signature of UNOWNED_PRIVATE_SIGNATURES) {
      const { name, args } = signatureRegexp(signature);
      expect(auditSql).not.toMatch(new RegExp(`ALTER\\s+FUNCTION\\s+${name}\\s*${args}\\s+OWNER\\s+TO`, 'i'));
      expect(mustGet(manifest.get(signature), signature).requireOwner).toBe(false);
    }
    for (const signature of POSTGRES_OWNED_SIGNATURES) {
      const { name, args } = signatureRegexp(signature);
      const owner = new RegExp(`ALTER\\s+FUNCTION\\s+${name}\\s*${args}\\s+OWNER\\s+TO\\s+postgres\\b`, 'gi');
      const source = signature.endsWith('guard_profile_is_demo_marker()') ? markerSql : founderSql;
      expect(source.match(owner)).toHaveLength(1);
      expect(mustGet(manifest.get(signature), signature).requireOwner).toBe(true);
    }
    for (const signature of PREREQUISITE_SIGNATURES) {
      const { name, args } = signatureRegexp(signature);
      const revoke = new RegExp(
        `REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+${name}\\s*${args}\\s+FROM\\s+PUBLIC\\s*,\\s*anon\\s*,\\s*authenticated\\s*,\\s*service_role`,
        'gi',
      );
      const grant = new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+${name}\\s*${args}`, 'gi');
      expect(proposalSql.match(revoke)).toHaveLength(1);
      expect(proposalSql.match(grant)).toBeNull();
    }
    expect(preconditions).toMatch(/NOT required_function\.require_owner\s+OR owner_role\.rolname = 'postgres'/);
    expect(preconditions.match(/rolname = 'postgres'/g)).toEqual(["rolname = 'postgres'"]);
    expect(preconditions).toContain("WHERE rolname IN ('anon', 'authenticated', 'service_role')");
    expect(preconditions).not.toMatch(/rolname IN \([^)]*'public'/);
    expect(preconditions).not.toMatch(/has_function_privilege\(\s*'postgres'/);
    for (const role of ['public', 'anon', 'authenticated', 'service_role']) {
      expect(preconditions).toContain(`NOT has_function_privilege('${role}', p.oid, 'EXECUTE')`);
    }
    expect(preconditions).not.toMatch(/REVOKE\s+USAGE|GRANT\s+USAGE/i);
  });

  it('[STATIC] prerequisite trigger shape, arguments, and UPDATE OF columns are checked', () => {
    const preconditions = preconditionText(sql);
    const manifest = parseTriggerManifest(preconditions);
    const sourceTriggers = loadPrerequisiteTriggers();
    expect(sourceTriggers).toHaveLength(16);
    expect(manifest.size).toBe(16);
    expect(new Set(sourceTriggers.map((trigger) => trigger.name)).size).toBe(16);
    for (const source of sourceTriggers) {
      const row = mustGet(manifest.get(source.name), source.name);
      expect(`${row.tableSchema}.${row.tableName}`).toBe(source.table);
      expect(`${row.functionSchema}.${row.functionName}`).toBe(source.functionName);
      expect(row.signature).toBe(source.signature);
      expect(row.tgtype).toBe(source.tgtype);
      expect(sortedCopy(row.columns)).toEqual(sortedCopy(source.columns));
      expect(row.args).toEqual(source.args);
      expect(row.securityDefiner).toBe(true);
    }
    expect(preconditions).toMatch(/t\.tgtype\s*=\s*prerequisite\.tgtype/);
    expect(preconditions).toContain('t.tgqual IS NULL');
    expect(preconditions).toContain('unnest(t.tgattr)');
    expect(preconditions).toContain('NOT att.attisdropped');
    expect(preconditions).toContain('array_agg(att.attname::text ORDER BY att.attname::text)');
    expect(preconditions).toContain('t.tgnargs = cardinality(prerequisite.trigger_args)');
    expect(preconditions).toContain('t.tgargs IS NOT DISTINCT FROM');
    expect(preconditions).toContain("convert_to(trigger_arg.arg, 'UTF8') || decode('00', 'hex')");
    expect(preconditions).toContain('COALESCE(octet_length(t.tgargs), 0) = 0');
    expect(preconditions).not.toMatch(/chr\s*\(\s*0\s*\)/);
    expect(preconditions).toContain("t.tgenabled IN ('O', 'A')");
    expect(preconditions).toContain("WHERE cfg LIKE 'search_path=%'");
  });

  it('[STATIC] exact function identities include transitive helpers', () => {
    const preconditions = preconditionText(sql);
    const manifest = parseFunctionManifest(preconditions);
    for (const signature of [
      'private.permit_audit_actor_registry(uuid)',
      'private_security.founder_profile_protected(uuid)',
      ...PREREQUISITE_SIGNATURES,
    ]) {
      expect(manifest.has(signature)).toBe(true);
      expect(preconditions).toContain(`'${signature}'`);
    }
    expect(preconditions).toContain('p.oid = to_regprocedure(required_function.signature)');
    expect(preconditions).toContain('t.tgfoid = to_regprocedure(prerequisite.function_signature)');
    const founder = mustGet(manifest.get('private_security.founder_profile_protected(uuid)'), 'founder helper');
    expect(founder.securityDefiner).toBe(false);
    expect(founder.language).toBe('sql');
    expect(founder.volatility).toBe('s');
    expect(loadPrerequisiteFunctions().get('private_security.founder_profile_protected(uuid)')?.security).toBe('INVOKER');
  });

  it('[STATIC] prerequisite metadata checks fail closed', () => {
    const preconditions = preconditionText(sql);
    expect(preconditions).toContain('to_regprocedure(required_function.signature)');
    expect(preconditions).toContain("'private.permit_audit_actor_registry(uuid)'");
    expect(preconditions).toContain("'private_security.founder_profile_protected(uuid)'");
    expect(preconditions).toContain('t.tgtype = prerequisite.tgtype');
    expect(preconditions).toContain('t.tgqual IS NULL');
    expect(preconditions).toContain('unnest(t.tgattr)');
    expect(preconditions).toContain('t.tgargs IS NOT DISTINCT FROM');
    expect(preconditions).toContain('t.tgnargs = cardinality(prerequisite.trigger_args)');
    expect(preconditions).toContain('p.proconfig = ARRAY[required_function.search_path_config]::text[]');
    expect(preconditions).toContain("WHERE cfg LIKE 'search_path=%'");
    expect(preconditions).toContain('owner_role.oid = p.proowner');
    expect(preconditions).toMatch(/NOT required_function\.require_owner\s+OR owner_role\.rolname = 'postgres'/);
    expect(preconditions).toContain("NOT has_function_privilege('public', p.oid, 'EXECUTE')");
    expect(preconditions).toContain("NOT has_function_privilege('anon', p.oid, 'EXECUTE')");
    expect(preconditions).toContain("NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')");
    expect(preconditions).toContain("NOT has_function_privilege('service_role', p.oid, 'EXECUTE')");
    expect(preconditions).toMatch(
      /RAISE EXCEPTION\s+'DEMO_USER_DELETE_PRECONDITION_FAILED: prerequisite function % is missing or failed security, language, search_path, volatility, owner, or EXECUTE checks'/,
    );
    expect(preconditions).toMatch(
      /RAISE EXCEPTION\s+'DEMO_USER_DELETE_PRECONDITION_FAILED: % trigger % on %\.% is missing, misbound, disabled\/replica-only, shape\/argument\/column mismatched/,
    );
    expect(preconditions).toMatch(
      /RAISE EXCEPTION 'DEMO_USER_DELETE_PRECONDITION_FAILED: anon, authenticated, and service_role must exist before EXECUTE privilege checks'/,
    );
  });

  it('[STATIC] prerequisite call edges and trigger mappings match source', () => {
    const preconditions = preconditionText(sql);
    const declared = loadPrerequisiteFunctions();
    const maintain = mustGet(declared.get('private.maintain_audit_actor_identity()'), 'maintain');
    const between = (body: string, start: string, end: string | null): string => {
      const from = body.indexOf(start);
      expect(from).toBeGreaterThanOrEqual(0);
      const to = end === null ? body.length : body.indexOf(end, from + start.length);
      expect(to).toBeGreaterThan(from);
      return body.slice(from, to);
    };
    for (const [start, end] of [
      ["TG_OP = 'INSERT'", "TG_OP = 'UPDATE'"],
      ["TG_OP = 'UPDATE'", "TG_OP = 'DELETE'"],
      ["TG_OP = 'DELETE'", null],
    ] as const) {
      expect(between(maintain.body, start, end)).toMatch(/private\.permit_audit_actor_registry\s*\(/);
    }
    expect(maintain.body).not.toMatch(/(?<!private\.)permit_audit_actor_registry\s*\(/);
    for (const signature of [
      'private_security.guard_founder_superadmin_active_role()',
      'private_security.guard_founder_superadmin_profile_role()',
      'private_security.guard_founder_superadmin_internal_assignment()',
    ]) {
      const body = mustGet(declared.get(signature), signature).body;
      expect(body).toMatch(/private_security\.founder_profile_protected\s*\(/);
      expect(body).not.toMatch(/(?<!private_security\.)founder_profile_protected\s*\(/);
      expect(body).not.toMatch(/permit_audit_actor_registry/);
    }
    for (const signature of [
      'private.guard_audit_actor_identity()',
      'private_security.guard_founder_superadmin_internal_role()',
      'private_security.guard_founder_superadmin_user_role()',
      'private_security.guard_profile_is_demo_marker()',
    ]) {
      const body = mustGet(declared.get(signature), signature).body;
      expect(body).not.toMatch(/founder_profile_protected/);
      expect(body).not.toMatch(/permit_audit_actor_registry/);
    }
    const manifest = parseTriggerManifest(preconditions);
    const sourceTriggers = loadPrerequisiteTriggers();
    expect(sourceTriggers).toHaveLength(manifest.size);
    for (const source of sourceTriggers) {
      const row = mustGet(manifest.get(source.name), source.name);
      expect(row.signature).toBe(source.signature);
      expect(row.args).toEqual(source.args);
    }
    expect(mustGet(manifest.get('aa_guard_founder_profile_id'), 'id trigger').args).toEqual(['id']);
    expect(mustGet(manifest.get('aa_guard_founder_profile_delete'), 'delete trigger').args).toEqual(['delete']);
    expect(mustGet(manifest.get('aa_guard_founder_profile_marker'), 'marker trigger').args).toEqual(['marker']);
    expect(mustGet(manifest.get('aa_guard_founder_active_role'), 'active trigger').args).toEqual(['active']);
    const activeRoleTriggers = sourceTriggers.filter((trigger) => trigger.functionName.endsWith('guard_founder_superadmin_active_role'));
    expect(activeRoleTriggers.map((trigger) => [trigger.name, trigger.args])).toEqual([
      ['aa_guard_founder_profile_id', ['id']],
      ['aa_guard_founder_profile_delete', ['delete']],
      ['aa_guard_founder_profile_marker', ['marker']],
      ['aa_guard_founder_active_role', ['active']],
    ]);
  });

  it('inventories FK actions, blocks retained and unknown dependencies, and uses an explicit delete allowlist', () => {
    expect(executable).toContain("c.contype = 'f'");
    expect(executable).toContain("tgt.relname = 'profiles'");
    expect(executable).toContain("tgt.relname = 'users'");
    expect(executable).toContain("'NO ACTION'");
    expect(executable).toContain("'RESTRICT'");
    expect(executable).toContain("'CASCADE'");
    expect(executable).toContain("'SET NULL'");
    expect(executable).toContain('block_unknown_fk');
    expect(executable).toContain('block_retained_dependency');
    for (const category of [
      'audit_history',
      'legal_evidence',
      'procurement_finance_tax',
      'organization_supplier',
      'messaging_delivery',
      'security_identity',
    ]) {
      expect(executable).toContain(`'${category}'`);
    }
    const deletes = [...executable.matchAll(/DELETE\s+FROM\s+([a-z_]+\.[a-z_]+)/gi)].map((match) => match[1]);
    expect(deletes).toEqual([
      'public.internal_user_assignments',
      'public.profile_roles',
      'public.notification_preferences',
      'public.profile_verification_otps',
      'public.demo_accounts',
      'private.password_history',
      'public.profiles',
      'auth.users',
    ]);
    expect(executable).toContain('private_security.demo_user_deletion_fk_manifest()');
    expect(executable).toContain('block_fk_action_drift');
    expect(executable).toContain('block_invalid_delete_owner_exclusion');
    expect(executable).toContain('delete_allowlist_owner_column');
    expect(executable).not.toMatch(/source_table\s*~/);
    expect(executable).not.toMatch(/relname\s*~/);
    expect(executable).not.toMatch(/DELETE\s+FROM[\s\S]{0,100}\bCASCADE\b/i);
    expect(executable).not.toMatch(/DISABLE\s+TRIGGER|SET\s+CONSTRAINTS/i);
    expect(executable).not.toMatch(/SET\s+(?:LOCAL\s+|SESSION\s+)?session_replication_role|set_config\s*\(\s*'session_replication_role'/i);
    expect(executable.match(/session_replication_role/g)).toHaveLength(2);
  });

  it('keeps every retained category blocking and limits non-blocking manifest rows to the reviewed allowlist', () => {
    const manifestBody = executable.match(/\$manifest\$([\s\S]*?)\$manifest\$/)?.[1] ?? '';
    const rows = [...manifestBody.matchAll(/\('([a-z]+)', '([a-z_]+)', '([a-z_]+)', '([A-Z ]+)', '([a-z_]+)', '([a-z_]+)', (NULL|'[a-z_]+')\)/g)];
    expect(rows.length).toBe(120);
    const keys = rows.map((row) => `${row[1]}.${row[2]}.${row[3]}`);
    expect(new Set(keys).size).toBe(keys.length);
    const nonBlocking = rows
      .filter((row) => row[6] !== 'block_retained_dependency')
      .map((row) => `${row[1]}.${row[2]}.${row[3]}:${row[6]}`)
      .sort();
    expect(nonBlocking).toEqual(NON_BLOCKING_MANIFEST);
    for (const row of rows) {
      if (RETAINED_CATEGORIES.includes(row[5]) && row[6] !== 'block_retained_dependency') {
        expect(`${row[1]}.${row[2]}.${row[3]}:${row[6]}`).toBe('public.audit_actor_identities.profile_id:preserve_evidence_set_null');
      }
    }
    const ownerExclusions = rows
      .filter((row) => row[7] !== 'NULL')
      .map((row) => `${row[1]}.${row[2]}.${row[3]}:${row[7].replaceAll("'", '')}`)
      .sort();
    expect(ownerExclusions).toEqual([
      'public.internal_user_assignments.assigned_by:profile_id',
      'public.profile_roles.assigned_by:profile_id',
    ]);
    expect(executable).toContain("owner_manifest.disposition = 'delete_allowlisted_before_profile'");
    expect(executable).toMatch(/IF \(v_snapshot ->> 'eligible'\)::boolean IS DISTINCT FROM TRUE THEN\s+RETURN v_snapshot/);
    expect(executable).toContain("current_setting('session_replication_role') IS DISTINCT FROM 'origin'");
  });

  it('requires reason/outcome, preserves audit evidence, postchecks, and closes the historical bypass', () => {
    expect(executable).toContain('DEMO_USER_DELETE_REASON_REQUIRED');
    expect(executable).toContain('DEMO_USER_DELETE_OUTCOME_REQUIRED');
    expect(executable).toContain('audit_actor_identities');
    expect(executable).toContain('admin.demo_user_deleted');
    expect(executable).toContain('DEMO_USER_DELETE_POSTCHECK_FAILED');
    expect(executable).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_bulk_delete_users\(uuid\[\], boolean\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/i,
    );
    expect(executable).toMatch(
      /REVOKE ALL ON FUNCTION public\.preview_demo_user_deletion\(uuid\) FROM PUBLIC, anon, service_role/i,
    );
    expect(executable).toMatch(
      /REVOKE ALL ON FUNCTION public\.execute_demo_user_deletion\(uuid, text, text, text\) FROM PUBLIC, anon, service_role/i,
    );
    expect(executable).toMatch(/GRANT EXECUTE ON FUNCTION public\.preview_demo_user_deletion\(uuid\) TO authenticated/i);
    expect(executable).toMatch(/GRANT EXECUTE ON FUNCTION public\.execute_demo_user_deletion\(uuid, text, text, text\) TO authenticated/i);
  });

  it('classifies every live profile/Auth foreign key through the manifest and blocks retained rows (local postgres, rolled back)', async (ctx) => {
    const client = await connectLocalOnly();
    if (!client) {
      ctx.skip();
      return;
    }

    let failed: unknown;
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL statement_timeout = '120s'`);
      // Compile-only install: the 00315/00316 preconditions are not evaluated here,
      // and no preview/execute RPC is called, so no founder record is required.
      await client.query(stripTransaction(stripPreconditions(sql)));

      const coverage = await client.query<{
        fk: string;
        catalog_action: string;
        column_count: number;
        manifest_action: string | null;
        disposition: string | null;
      }>(`
        WITH fk AS (
          SELECT ns.nspname || '.' || src.relname || '.' || att.attname AS fk,
                 ns.nspname AS s, src.relname AS t, att.attname AS col,
                 CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
                   WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS catalog_action,
                 array_length(c.conkey, 1) AS column_count
          FROM pg_constraint c
          JOIN pg_class src ON src.oid = c.conrelid
          JOIN pg_namespace ns ON ns.oid = src.relnamespace
          JOIN pg_class tgt ON tgt.oid = c.confrelid
          JOIN pg_namespace nt ON nt.oid = tgt.relnamespace
          LEFT JOIN pg_attribute att ON att.attrelid = src.oid AND att.attnum = c.conkey[1]
          WHERE c.contype = 'f'
            AND ((nt.nspname = 'public' AND tgt.relname = 'profiles') OR (nt.nspname = 'auth' AND tgt.relname = 'users'))
        )
        SELECT fk.fk, fk.catalog_action, fk.column_count, m.delete_action AS manifest_action, m.disposition
        FROM fk
        LEFT JOIN private_security.demo_user_deletion_fk_manifest() m
          ON m.source_schema = fk.s AND m.source_table = fk.t AND m.source_column = fk.col
        ORDER BY fk.fk`);
      console.log(`DEMO_DELETE_FK_INVENTORY live=${coverage.rows.length}`);
      const unreviewed = coverage.rows.filter(
        (row) => row.disposition === null || row.manifest_action !== row.catalog_action || row.column_count !== 1,
      );
      expect(unreviewed).toEqual([]);
      expect(coverage.rows.length).toBeGreaterThan(100);

      const target = await insertDisposableProfile(client, { emailPrefix: 'manifest-clean', isDemo: true });
      const requester = randomUUID();
      const snapshot = async (profileId: string) =>
        (await client.query<{ s: any }>(
          `SELECT private_security.demo_user_deletion_snapshot($1::uuid, $2::uuid) AS s`,
          [profileId, requester],
        )).rows[0].s;

      const realAccount = await insertDisposableProfile(client, { emailPrefix: 'manifest-not-demo', isDemo: false });
      const notDemo = await snapshot(realAccount.profileId);
      expect(notDemo.eligible).toBe(false);
      expect(notDemo.policyBlockers).toEqual([{ code: 'TARGET_NOT_TRUSTED_DEMO_QA', category: 'identity' }]);

      const clean = await snapshot(target.profileId);
      expect(clean.trustedDemoQa).toBe(true);
      expect(clean.eligible).toBe(true);
      expect(clean.blockerCount).toBe(0);
      expect(clean.dependencies.length).toBe(coverage.rows.length);

      await client.query(
        `INSERT INTO public.profile_roles (profile_id, role_code, assigned_by) VALUES ($1, 'PROPERTY_OWNER', $1)`,
        [target.profileId],
      );
      const selfAssigned = await snapshot(target.profileId);
      expect(selfAssigned.eligible).toBe(true);
      const assignedBy = selfAssigned.dependencies.find(
        (d: any) => d.table === 'profile_roles' && d.column === 'assigned_by',
      );
      expect(assignedBy).toMatchObject({ count: 0, blocks: false, disposition: 'block_retained_dependency' });

      const role = await client.query<{ id: string }>(
        `SELECT id::text FROM public.internal_roles ORDER BY code LIMIT 1`,
      );
      expect(role.rows).toHaveLength(1);
      await client.query(
        `INSERT INTO public.internal_user_assignments (profile_id, role_id, assigned_by)
         VALUES ($1, $2, $1)`,
        [target.profileId, role.rows[0].id],
      );
      const targetOwnedAssignment = await snapshot(target.profileId);
      expect(targetOwnedAssignment.eligible).toBe(true);
      expect(
        targetOwnedAssignment.dependencies.find(
          (d: any) => d.table === 'internal_user_assignments' && d.column === 'assigned_by',
        ),
      ).toMatchObject({
        category: 'security_identity',
        disposition: 'block_retained_dependency',
        count: 0,
        blocks: false,
      });

      await client.query(
        `INSERT INTO public.internal_user_assignments (profile_id, role_id, assigned_by)
         VALUES ($1, $2, $3)`,
        [realAccount.profileId, role.rows[0].id, target.profileId],
      );
      const assignmentOnAnotherAccount = await snapshot(target.profileId);
      expect(assignmentOnAnotherAccount.eligible).toBe(false);
      expect(
        assignmentOnAnotherAccount.dependencies.find(
          (d: any) => d.table === 'internal_user_assignments' && d.column === 'assigned_by',
        ),
      ).toMatchObject({
        category: 'security_identity',
        disposition: 'block_retained_dependency',
        count: 1,
        blocks: true,
      });

      await client.query(
        `INSERT INTO public.notifications (profile_id, channel, event_type) VALUES ($1, 'IN_APP', 'qa.fixture')`,
        [target.profileId],
      );
      await client.query(
        `INSERT INTO public.buyer_addresses (profile_id, address_line1, city, state, pincode)
         VALUES ($1, 'Fixture line', 'Bengaluru', 'Karnataka', '560001')`,
        [target.profileId],
      );
      await client.query(`INSERT INTO public.personal_subscriptions (profile_id) VALUES ($1)`, [target.profileId]);
      const retained = await snapshot(target.profileId);
      expect(retained.eligible).toBe(false);
      for (const [table, category] of [
        ['notifications', 'messaging_delivery'],
        ['buyer_addresses', 'organization_supplier'],
        ['personal_subscriptions', 'procurement_finance_tax'],
      ]) {
        expect(retained.dependencies.find((d: any) => d.table === table && d.column === 'profile_id')).toMatchObject({
          category,
          disposition: 'block_retained_dependency',
          count: 1,
          blocks: true,
        });
      }

      await client.query(`
        CREATE TABLE public.zz_unreviewed_profile_dependency (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          subject uuid REFERENCES public.profiles(id) ON DELETE CASCADE
        )`);
      const unreviewedTarget = await insertDisposableProfile(client, { emailPrefix: 'manifest-unknown', isDemo: true });
      const unknown = await snapshot(unreviewedTarget.profileId);
      expect(unknown.eligible).toBe(false);
      expect(unknown.dependencies.find((d: any) => d.table === 'zz_unreviewed_profile_dependency')).toMatchObject({
        category: 'unknown',
        disposition: 'block_unknown_fk',
        count: 0,
        blocks: true,
      });

      await client.query(`
        ALTER TABLE public.notifications
          ADD CONSTRAINT zz_notifications_action_drift
          FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT
      `);
      const actionDrift = await snapshot(unreviewedTarget.profileId);
      expect(
        actionDrift.dependencies.find((d: any) => d.constraint === 'zz_notifications_action_drift'),
      ).toMatchObject({
        disposition: 'block_fk_action_drift',
        count: 0,
        blocks: true,
      });

      await client.query(`
        ALTER TABLE public.profiles
          ADD CONSTRAINT zz_profiles_id_auth_unique UNIQUE (id, auth_user_id);
        CREATE TABLE public.zz_composite_profile_dependency (
          subject_profile_id uuid NOT NULL,
          subject_auth_id uuid NOT NULL,
          CONSTRAINT zz_composite_profile_fk
            FOREIGN KEY (subject_profile_id, subject_auth_id)
            REFERENCES public.profiles(id, auth_user_id)
        )
      `);
      const composite = await snapshot(unreviewedTarget.profileId);
      expect(
        composite.dependencies.find((d: any) => d.constraint === 'zz_composite_profile_fk'),
      ).toMatchObject({
        category: 'unknown',
        disposition: 'block_unknown_fk',
        count: 0,
        blocks: true,
      });
    } catch (error) {
      failed = error;
    } finally {
      try {
        await client.query('ROLLBACK');
      } catch (error) {
        failed = failed ?? error;
      }
      await client.end();
    }
    if (failed) throw failed;
  });

  it('executes only against rollback-only disposable fixtures when local prerequisites exist', async (ctx) => {
    const client = await openLocal();
    if (!client) {
      ctx.skip();
      return;
    }

    let failed: unknown;
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL statement_timeout = '180s'`);

      if ((await client.query(`SELECT to_regclass('public.audit_actor_identities') IS NULL AS missing`)).rows[0].missing) {
        await client.query(stripTransaction(readFileSync(AUDIT_PROPOSAL, 'utf8')));
      }
      if ((await client.query(`SELECT to_regprocedure('private_security.guard_founder_superadmin_active_role()') IS NULL AS missing`)).rows[0].missing) {
        await client.query(stripTransaction(readFileSync(FOUNDER_PROPOSAL, 'utf8')));
      }
      if ((await client.query(`SELECT to_regprocedure('private_security.guard_profile_is_demo_marker()') IS NULL AS missing`)).rows[0].missing) {
        await client.query(stripTransaction(readFileSync(DEMO_MARKER_PROPOSAL, 'utf8')));
      }
      await client.query(stripTransaction(sql));

      const founder = await client.query<{ auth_user_id: string }>(
        `SELECT auth_user_id::text
         FROM public.profiles
         WHERE id = $1::uuid`,
        [FOUNDER_ID],
      );
      expect(founder.rows).toHaveLength(1);
      // 00321 only accepts is_demo inserts from the seed operator with no JWT
      // claims, so every demo fixture is created before a requester is set.
      const target = await insertDisposableProfile(client, {
        emailPrefix: 'delete-success',
        isDemo: true,
      });
      const otherTarget = await insertDisposableProfile(client, {
        emailPrefix: 'delete-token-mismatch',
        isDemo: true,
      });
      const ordinary = await insertDisposableProfile(client, {
        emailPrefix: 'delete-denied-caller',
        isDemo: true,
      });
      const expiring = await insertDisposableProfile(client, {
        emailPrefix: 'delete-expired',
        isDemo: true,
      });
      const stale = await insertDisposableProfile(client, {
        emailPrefix: 'delete-stale',
        isDemo: true,
      });
      const retained = await insertDisposableProfile(client, {
        emailPrefix: 'delete-retained-dependencies',
        isDemo: true,
      });
      const unknown = await insertDisposableProfile(client, {
        emailPrefix: 'delete-unknown-fk',
        isDemo: true,
      });
      const assignmentTarget = await insertDisposableProfile(client, {
        emailPrefix: 'delete-assignment-target',
        isDemo: true,
      });
      const assignmentOwner = await insertDisposableProfile(client, {
        emailPrefix: 'delete-assignment-owner',
        isDemo: false,
      });
      const assignmentRole = await client.query<{ id: string }>(
        `SELECT id::text FROM public.internal_roles ORDER BY code LIMIT 1`,
      );
      expect(assignmentRole.rows).toHaveLength(1);
      await client.query(
        `INSERT INTO public.internal_user_assignments (profile_id, role_id, assigned_by)
         VALUES ($1, $2, $1)`,
        [assignmentTarget.profileId, assignmentRole.rows[0].id],
      );
      const whitelisted = await insertDisposableProfile(client, {
        emailPrefix: 'delete-whitelist-protected',
        isDemo: true,
      });
      const whitelistedEmail = await client.query<{ email: string }>(
        `SELECT email FROM public.profiles WHERE id = $1`,
        [whitelisted.profileId],
      );
      expect(whitelistedEmail.rows).toHaveLength(1);
      const storedWhitelistEmail = whitelistedEmail.rows[0].email.toUpperCase();
      expect(storedWhitelistEmail).not.toBe(whitelistedEmail.rows[0].email);
      await client.query(
        `INSERT INTO private_security.admin_whitelist (email, reason)
         VALUES ($1, 'rollback-only whitelist fixture')`,
        [storedWhitelistEmail],
      );
      await setRequester(client, founder.rows[0].auth_user_id);

      const preview = await client.query<{ payload: any }>(
        `SELECT public.preview_demo_user_deletion($1::uuid) AS payload`,
        [target.profileId],
      );
      expect(preview.rows[0].payload.eligible).toBe(true);
      expect(preview.rows[0].payload.blockerCount).toBe(0);

      expect(await captureError(
        client,
        `SELECT public.execute_demo_user_deletion($1, $2, '', 'removed disposable QA fixture')`,
        [target.profileId, preview.rows[0].payload.confirmationToken],
      )).toContain('DEMO_USER_DELETE_REASON_REQUIRED');
      expect(await captureError(
        client,
        `SELECT public.execute_demo_user_deletion($1, $2, 'approved QA cleanup', '')`,
        [target.profileId, preview.rows[0].payload.confirmationToken],
      )).toContain('DEMO_USER_DELETE_OUTCOME_REQUIRED');
      expect(await captureError(
        client,
        `SELECT public.execute_demo_user_deletion($1, 'wrong-token', 'approved QA cleanup', 'removed fixture')`,
        [target.profileId],
      )).toContain('DEMO_USER_DELETE_CONFIRMATION_MISMATCH');
      expect(await captureError(
        client,
        `SELECT public.execute_demo_user_deletion($1, $2, 'approved QA cleanup', 'removed fixture')`,
        [otherTarget.profileId, preview.rows[0].payload.confirmationToken],
      )).toContain('DEMO_USER_DELETE_CONFIRMATION_MISMATCH');

      await client.query('SAVEPOINT late_failure');
      await client.query(`
        CREATE FUNCTION pg_temp.fail_auth_delete() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'EXPECTED_LATE_DELETE_FAILURE';
        END
        $$;
        CREATE TRIGGER zz_test_late_auth_delete
          BEFORE DELETE ON auth.users
          FOR EACH ROW
          WHEN (OLD.id = '${target.authId}'::uuid)
          EXECUTE FUNCTION pg_temp.fail_auth_delete();
      `);
      const lateFailure = await captureError(
        client,
        `SELECT public.execute_demo_user_deletion($1, $2, 'approved QA cleanup', 'removed fixture')`,
        [target.profileId, preview.rows[0].payload.confirmationToken],
      );
      expect(lateFailure).toContain('EXPECTED_LATE_DELETE_FAILURE');
      expect((await client.query(`SELECT count(*)::int AS n FROM public.profiles WHERE id = $1`, [target.profileId])).rows[0].n).toBe(1);
      await client.query('ROLLBACK TO SAVEPOINT late_failure');
      await client.query('RELEASE SAVEPOINT late_failure');

      const executed = await client.query<{ payload: any }>(
        `SELECT public.execute_demo_user_deletion($1, $2, $3, $4) AS payload`,
        [
          target.profileId,
          preview.rows[0].payload.confirmationToken,
          'approved disposable QA cleanup',
          'fixture identity removed; retained evidence preserved',
        ],
      );
      expect(executed.rows[0].payload.ok).toBe(true);
      expect(await captureError(
        client,
        `SELECT public.execute_demo_user_deletion($1, $2, 'approved QA cleanup', 'removed fixture')`,
        [target.profileId, preview.rows[0].payload.confirmationToken],
      )).toContain('DEMO_USER_DELETE_CONFIRMATION_MISMATCH');
      expect((await client.query(`SELECT count(*)::int AS n FROM public.profiles WHERE id = $1`, [target.profileId])).rows[0].n).toBe(0);
      expect((await client.query(`SELECT count(*)::int AS n FROM auth.users WHERE id = $1`, [target.authId])).rows[0].n).toBe(0);
      expect((await client.query(
        `SELECT count(*)::int AS n
         FROM public.audit_actor_identities
         WHERE actor_id = $1 AND profile_id IS NULL AND profile_deleted_at IS NOT NULL`,
        [target.profileId],
      )).rows[0].n).toBe(1);
      expect((await client.query(
        `SELECT count(*)::int AS n
         FROM public.audit_events
         WHERE event_type = 'admin.demo_user_deleted' AND entity_id = $1`,
        [target.profileId],
      )).rows[0].n).toBe(1);

      await setRequester(client, ordinary.authId);
      expect(await captureError(
        client,
        `SELECT public.preview_demo_user_deletion($1)`,
        [FOUNDER_ID],
      )).toContain('DEMO_USER_DELETE_DENIED');
      await client.query(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`);
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [founder.rows[0].auth_user_id]);
      expect(await captureError(
        client,
        `SELECT public.preview_demo_user_deletion($1)`,
        [ordinary.profileId],
      )).toContain('DEMO_USER_DELETE_DENIED: authenticated user context required');
      await setRequester(client, founder.rows[0].auth_user_id);

      const founderPreview = await client.query<{ payload: any }>(
        `SELECT public.preview_demo_user_deletion($1) AS payload`,
        [FOUNDER_ID],
      );
      expect(founderPreview.rows[0].payload.eligible).toBe(false);
      expect(founderPreview.rows[0].payload.confirmationToken).toBeNull();
      expect(JSON.stringify(founderPreview.rows[0].payload.policyBlockers)).toContain('FOUNDER_IDENTITY_PROTECTED');
      if (founderPreview.rows[0].payload.effectiveSuperAdminCount === 1) {
        expect(JSON.stringify(founderPreview.rows[0].payload.policyBlockers)).toContain(
          'LAST_EFFECTIVE_SUPERADMIN_PROTECTED',
        );
      }

      const whitelistPreview = await client.query<{ payload: any }>(
        `SELECT public.preview_demo_user_deletion($1::uuid) AS payload`,
        [whitelisted.profileId],
      );
      expect(whitelistPreview.rows[0].payload.eligible).toBe(false);
      expect(whitelistPreview.rows[0].payload.confirmationToken).toBeNull();
      expect(JSON.stringify(whitelistPreview.rows[0].payload.policyBlockers)).toContain('ADMIN_WHITELIST_PROTECTED');
      expect(JSON.stringify(whitelistPreview.rows[0].payload.policyBlockers)).not.toContain(
        'ADMIN_WHITELIST_PROTECTION_UNEVALUATED',
      );
      expect(await captureError(
        client,
        `DELETE FROM public.profiles WHERE id = $1`,
        [whitelisted.profileId],
      )).toContain('SECURITY VIOLATION');
      expect((await client.query(
        `SELECT count(*)::int AS n FROM public.profiles WHERE id = $1`,
        [whitelisted.profileId],
      )).rows[0].n).toBe(1);

      const whitelistSnapshot = await client.query<{ s: { fingerprint: string; eligible: boolean } }>(
        `SELECT private_security.demo_user_deletion_snapshot($1::uuid, $2::uuid) AS s`,
        [whitelisted.profileId, FOUNDER_ID],
      );
      expect(whitelistSnapshot.rows[0].s.eligible).toBe(false);
      const whitelistToken = `whitelist-protected-${whitelisted.profileId}`;
      await client.query(
        `INSERT INTO private_security.demo_user_deletion_previews (
           token_hash,
           requester_profile_id,
           target_profile_id,
           target_auth_user_id,
           state_fingerprint,
           preview_payload,
           created_at,
           expires_at
         ) VALUES (
           extensions.digest(convert_to($1, 'UTF8'), 'sha256'),
           $2::uuid,
           $3::uuid,
           $4::uuid,
           $5,
           $6::jsonb,
           clock_timestamp(),
           clock_timestamp() + interval '10 minutes'
         )`,
        [
          whitelistToken,
          FOUNDER_ID,
          whitelisted.profileId,
          whitelisted.authId,
          whitelistSnapshot.rows[0].s.fingerprint,
          JSON.stringify(whitelistSnapshot.rows[0].s),
        ],
      );
      expect(await captureError(
        client,
        `SELECT public.execute_demo_user_deletion($1, $2, 'approved QA cleanup', 'removed fixture')`,
        [whitelisted.profileId, whitelistToken],
      )).toContain('DEMO_USER_DELETE_BLOCKED');
      expect((await client.query(
        `SELECT count(*)::int AS n FROM public.profiles WHERE id = $1`,
        [whitelisted.profileId],
      )).rows[0].n).toBe(1);
      expect((await client.query(
        `SELECT count(*)::int AS n FROM auth.users WHERE id = $1`,
        [whitelisted.authId],
      )).rows[0].n).toBe(1);

      const expiringPreview = await client.query<{ payload: any }>(
        `SELECT public.preview_demo_user_deletion($1) AS payload`,
        [expiring.profileId],
      );
      await client.query(
        `UPDATE private_security.demo_user_deletion_previews
         SET created_at = clock_timestamp() - interval '20 minutes',
             expires_at = clock_timestamp() - interval '10 minutes'
         WHERE id = $1`,
        [expiringPreview.rows[0].payload.previewId],
      );
      expect(await captureError(
        client,
        `SELECT public.execute_demo_user_deletion($1, $2, 'approved QA cleanup', 'removed fixture')`,
        [expiring.profileId, expiringPreview.rows[0].payload.confirmationToken],
      )).toContain('DEMO_USER_DELETE_CONFIRMATION_EXPIRED');

      const stalePreview = await client.query<{ payload: any }>(
        `SELECT public.preview_demo_user_deletion($1) AS payload`,
        [stale.profileId],
      );
      await client.query(
        `INSERT INTO public.profile_roles (profile_id, role_code, assigned_by)
         VALUES ($1, 'PROPERTY_OWNER', $1)`,
        [stale.profileId],
      );
      expect(await captureError(
        client,
        `SELECT public.execute_demo_user_deletion($1, $2, 'approved QA cleanup', 'removed fixture')`,
        [stale.profileId, stalePreview.rows[0].payload.confirmationToken],
      )).toContain('DEMO_USER_DELETE_STALE_PREVIEW');

      const assignmentPreview = await client.query<{ payload: any }>(
        `SELECT public.preview_demo_user_deletion($1) AS payload`,
        [assignmentTarget.profileId],
      );
      expect(assignmentPreview.rows[0].payload).toMatchObject({
        eligible: true,
        blockerCount: 0,
      });
      expect(
        assignmentPreview.rows[0].payload.dependencies.find(
          (d: any) => d.table === 'internal_user_assignments' && d.column === 'assigned_by',
        ),
      ).toMatchObject({ category: 'security_identity', count: 0, blocks: false });

      await client.query(
        `INSERT INTO public.internal_user_assignments (profile_id, role_id, assigned_by)
         VALUES ($1, $2, $3)`,
        [assignmentOwner.profileId, assignmentRole.rows[0].id, assignmentTarget.profileId],
      );
      const blockedAssignmentPreview = await client.query<{ payload: any }>(
        `SELECT public.preview_demo_user_deletion($1) AS payload`,
        [assignmentTarget.profileId],
      );
      expect(blockedAssignmentPreview.rows[0].payload).toMatchObject({
        eligible: false,
        blockerCount: 1,
        confirmationToken: null,
      });
      expect(
        blockedAssignmentPreview.rows[0].payload.dependencies.find(
          (d: any) => d.table === 'internal_user_assignments' && d.column === 'assigned_by',
        ),
      ).toMatchObject({
        category: 'security_identity',
        disposition: 'block_retained_dependency',
        count: 1,
        blocks: true,
      });
      expect(await captureError(
        client,
        `SELECT public.execute_demo_user_deletion($1, $2, 'approved QA cleanup', 'removed fixture')`,
        [assignmentTarget.profileId, assignmentPreview.rows[0].payload.confirmationToken],
      )).toContain('DEMO_USER_DELETE_STALE_PREVIEW');

      await client.query(
        `INSERT INTO public.notifications (profile_id, channel, event_type) VALUES ($1, 'IN_APP', 'qa.fixture')`,
        [retained.profileId],
      );
      await client.query(
        `INSERT INTO public.buyer_addresses (profile_id, address_line1, city, state, pincode)
         VALUES ($1, 'Fixture line', 'Bengaluru', 'Karnataka', '560001')`,
        [retained.profileId],
      );
      await client.query(`INSERT INTO public.personal_subscriptions (profile_id) VALUES ($1)`, [retained.profileId]);
      const retainedPreview = await client.query<{ payload: any }>(
        `SELECT public.preview_demo_user_deletion($1) AS payload`,
        [retained.profileId],
      );
      expect(retainedPreview.rows[0].payload.eligible).toBe(false);
      expect(retainedPreview.rows[0].payload.confirmationToken).toBeNull();
      const blocking = retainedPreview.rows[0].payload.dependencies.filter((d: any) => d.blocks);
      expect(blocking.map((d: any) => d.category).sort()).toEqual([
        'messaging_delivery',
        'organization_supplier',
        'procurement_finance_tax',
      ]);

      await client.query(`
        CREATE TABLE public.zz_unclassified_dependency (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          subject uuid REFERENCES public.profiles(id) ON DELETE RESTRICT
        )
      `);
      const unknownPreview = await client.query<{ payload: any }>(
        `SELECT public.preview_demo_user_deletion($1) AS payload`,
        [unknown.profileId],
      );
      expect(unknownPreview.rows[0].payload.eligible).toBe(false);
      expect(JSON.stringify(unknownPreview.rows[0].payload.dependencies)).toContain('block_unknown_fk');
    } catch (error) {
      failed = error;
    } finally {
      try {
        await client.query('ROLLBACK');
      } catch (error) {
        failed = failed ?? error;
      }
      await client.end();
    }
    if (failed) throw failed;
  });
});
