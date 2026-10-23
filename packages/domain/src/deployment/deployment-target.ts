/**
 * Fail-closed deployment target resolution.
 *
 * local / non-production / production are explicit. The desktop/mobile view
 * toggle is presentation state and is ignored. A missing non-production
 * project is a failure; it is never replaced with the documented production
 * project.
 *
 * The production ref below is the ref already pinned in CI. It is not a
 * live lookup and it is not a non-production project.
 */

export const DOCUMENTED_PRODUCTION_PROJECT_REF = 'qsuvtcezffomtwzwyrso';
export const LOCAL_PROJECT_ID = 'otp-local';
export const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
/** Compile-only placeholder. It selects no Supabase project. */
export const CI_BUILD_VALIDATION_URL = 'https://ci-validation.invalid';

export type DeploymentClass = 'local' | 'non-production' | 'production';

export interface DeploymentTargetInput {
  deploymentTarget?: string | null;
  /** URL for the declared class. Not a fallback slot. */
  supabaseUrl?: string | null;
  projectRef?: string | null;
  /**
   * Production URL held in a separate slot. Read only when the class is
   * production. Non-production resolution must not consult it.
   */
  productionSupabaseUrl?: string | null;
  productionProjectRef?: string | null;
  demoMode?: string | null;
  anonKey?: string | null;
  /** True when a service-role credential is present in the client environment. */
  serviceRoleKeyPresent?: boolean;
  /** Presentation only. Must not change the database target. */
  viewMode?: string | null;
  viteProductionBuild?: boolean;
  pageHostname?: string | null;
}

export interface DeploymentResolution {
  ok: boolean;
  deploymentClass: DeploymentClass | null;
  projectRef: string | null;
  supabaseUrl: string | null;
  /** False when no database may be contacted, including the CI validation build. */
  databaseSelected: boolean;
  configSource: string;
  demoSeedAllowed: boolean;
  /** Non-production project ref was supplied and is not the production ref. */
  nonProductionProjectConfigured: boolean;
  viewModeIgnored: true;
  failure: string | null;
}

export function normalizeDeploymentClass(raw: string | null | undefined): DeploymentClass | 'invalid' | null {
  const value = (raw ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (!value) return null;
  if (value === 'local' || value === 'development' || value === 'dev') return 'local';
  if (
    value === 'non-production' ||
    value === 'staging' ||
    value === 'demo' ||
    value === 'preview' ||
    value === 'staging/demo'
  ) {
    return 'non-production';
  }
  if (value === 'production' || value === 'prod') return 'production';
  return 'invalid';
}

export function projectRefFromSupabaseUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    const match = host.match(/^([a-z0-9]{20})\.supabase\.co$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isLoopbackSupabaseUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === '127.0.0.1' || host === 'localhost';
  } catch {
    return false;
  }
}

function decodeBase64Url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  if (typeof atob === 'function') return atob(padded);
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function clientKeyRole(key: string | null | undefined): string | null {
  if (!key) return null;
  const parts = key.split('.');
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

function containsProductionRef(value: string | null | undefined): boolean {
  return Boolean(value && value.toLowerCase().includes(DOCUMENTED_PRODUCTION_PROJECT_REF));
}

function fail(partial: {
  deploymentClass: DeploymentClass | null;
  configSource: string;
  failure: string;
}): DeploymentResolution {
  return {
    ok: false,
    viewModeIgnored: true,
    deploymentClass: partial.deploymentClass,
    projectRef: null,
    supabaseUrl: null,
    databaseSelected: false,
    configSource: partial.configSource,
    demoSeedAllowed: false,
    nonProductionProjectConfigured: false,
    failure: partial.failure,
  };
}

export function resolveDeploymentTarget(input: DeploymentTargetInput): DeploymentResolution {
  // viewMode is accepted so callers can prove it is ignored.
  void input.viewMode;

  if (input.serviceRoleKeyPresent) {
    return fail({
      deploymentClass: null,
      configSource: 'client-env',
      failure: 'Service-role credentials are not allowed in the client environment.',
    });
  }

  const keyRole = clientKeyRole(input.anonKey);
  if (keyRole === 'service_role' || (input.anonKey ?? '').includes('service_role')) {
    return fail({
      deploymentClass: null,
      configSource: 'client-anon-key',
      failure: 'The client key is a service-role credential.',
    });
  }

  const declared = normalizeDeploymentClass(input.deploymentTarget);
  if (declared === 'invalid') {
    return fail({
      deploymentClass: null,
      configSource: 'deployment-target',
      failure: 'Deployment target is not local, non-production, or production.',
    });
  }

  const supabaseUrl = (input.supabaseUrl ?? '').trim();
  const declaredRef = (input.projectRef ?? '').trim();
  const urlRef = projectRefFromSupabaseUrl(supabaseUrl);

  if (declared === 'non-production') {
    // Do not read productionSupabaseUrl or productionProjectRef.
    if (!supabaseUrl) {
      return fail({
        deploymentClass: 'non-production',
        configSource: 'non-production-url-missing',
        failure: 'Non-production project is not configured. Refusing to fall back to production.',
      });
    }
    if (containsProductionRef(supabaseUrl) || containsProductionRef(declaredRef) || urlRef === DOCUMENTED_PRODUCTION_PROJECT_REF) {
      return fail({
        deploymentClass: 'non-production',
        configSource: 'non-production-url',
        failure: 'Non-production target resolved to the production project. Refusing.',
      });
    }
    if (supabaseUrl === CI_BUILD_VALIDATION_URL) {
      return {
        ok: true,
        deploymentClass: 'non-production',
        projectRef: null,
        supabaseUrl: null,
        databaseSelected: false,
        configSource: 'ci-build-validation-sentinel',
        demoSeedAllowed: false,
        nonProductionProjectConfigured: false,
        viewModeIgnored: true,
        failure: null,
      };
    }
    if (declaredRef && urlRef && declaredRef !== urlRef) {
      return fail({
        deploymentClass: 'non-production',
        configSource: 'non-production-url',
        failure: 'Environment and Supabase project ref disagree.',
      });
    }
    const projectRef = declaredRef || urlRef;
    if (!projectRef) {
      return fail({
        deploymentClass: 'non-production',
        configSource: 'non-production-project-ref-missing',
        failure: 'Non-production project is not configured. Refusing to fall back to production.',
      });
    }
    return {
      ok: true,
      deploymentClass: 'non-production',
      projectRef,
      supabaseUrl,
      databaseSelected: true,
      configSource: declaredRef ? 'explicit-non-production-ref' : 'non-production-url-host',
      demoSeedAllowed: false,
      nonProductionProjectConfigured: true,
      viewModeIgnored: true,
      failure: null,
    };
  }

  if (declared === 'production') {
    const url = supabaseUrl || (input.productionSupabaseUrl ?? '').trim();
    const refFromUrl = projectRefFromSupabaseUrl(url);
    const ref = declaredRef || (input.productionProjectRef ?? '').trim() || refFromUrl || '';
    if (!url || refFromUrl !== DOCUMENTED_PRODUCTION_PROJECT_REF || ref !== DOCUMENTED_PRODUCTION_PROJECT_REF) {
      return fail({
        deploymentClass: 'production',
        configSource: 'production-url',
        failure: 'Environment and Supabase project ref disagree.',
      });
    }
    if ((input.demoMode ?? '').trim() === 'true') {
      return fail({
        deploymentClass: 'production',
        configSource: 'demo-mode',
        failure: 'Production must not receive demo mode.',
      });
    }
    if (input.viteProductionBuild && keyRole && keyRole !== 'anon') {
      return fail({
        deploymentClass: 'production',
        configSource: 'client-anon-key',
        failure: 'Production client key must be the anon role.',
      });
    }
    return {
      ok: true,
      deploymentClass: 'production',
      projectRef: DOCUMENTED_PRODUCTION_PROJECT_REF,
      supabaseUrl: url,
      databaseSelected: true,
      configSource: 'explicit-production-ref',
      demoSeedAllowed: false,
      nonProductionProjectConfigured: false,
      viewModeIgnored: true,
      failure: null,
    };
  }

  if (declared === 'local' || declared === null) {
    const hostedRef = urlRef || (declaredRef && !isLoopbackSupabaseUrl(supabaseUrl) ? declaredRef : '');
    if (containsProductionRef(supabaseUrl) || hostedRef === DOCUMENTED_PRODUCTION_PROJECT_REF) {
      return fail({
        deploymentClass: declared,
        configSource: 'undeclared-or-local',
        failure: 'Local or undeclared target must not select the production project.',
      });
    }
    if (supabaseUrl && !isLoopbackSupabaseUrl(supabaseUrl)) {
      return fail({
        deploymentClass: declared,
        configSource: 'undeclared-or-local',
        failure: declared
          ? 'Local target must use the loopback Supabase API.'
          : 'Deployment target is not configured. Refusing to select a hosted project.',
      });
    }
    if (input.viteProductionBuild && !supabaseUrl) {
      return fail({
        deploymentClass: declared,
        configSource: 'vite-production-build',
        failure: 'Production build has no deployment target. Refusing to select a project.',
      });
    }
    const pageHost = (input.pageHostname ?? '').toLowerCase();
    const pageIsLoopback = pageHost === 'localhost' || pageHost === '127.0.0.1' || pageHost === '';
    if (!supabaseUrl && !pageIsLoopback && declared === null) {
      return fail({
        deploymentClass: null,
        configSource: 'page-host',
        failure: 'Page host is not a database target. Refusing to guess a project.',
      });
    }
    return {
      ok: true,
      deploymentClass: 'local',
      projectRef: LOCAL_PROJECT_ID,
      supabaseUrl: supabaseUrl || LOCAL_SUPABASE_URL,
      databaseSelected: true,
      configSource: supabaseUrl ? 'explicit-local-url' : 'implicit-local-loopback',
      demoSeedAllowed: true,
      nonProductionProjectConfigured: false,
      viewModeIgnored: true,
      failure: null,
    };
  }

  return fail({
    deploymentClass: null,
    configSource: 'deployment-target',
    failure: 'Deployment target could not be resolved.',
  });
}

export interface RedactedDeploymentReport {
  ok: boolean;
  deploymentClass: DeploymentClass | null;
  projectRef: string | null;
  supabaseHost: string | null;
  databaseSelected: boolean;
  configSource: string;
  demoSeedAllowed: boolean;
  nonProductionProjectConfigured: boolean;
  viewModeIgnored: true;
  failure: string | null;
  credentials: 'redacted';
}

export function redactDeploymentReport(result: DeploymentResolution): RedactedDeploymentReport {
  let supabaseHost: string | null = null;
  if (result.supabaseUrl) {
    try {
      supabaseHost = new URL(result.supabaseUrl).host;
    } catch {
      supabaseHost = 'unparsed';
    }
  }
  return {
    ok: result.ok,
    deploymentClass: result.deploymentClass,
    projectRef: result.projectRef,
    supabaseHost,
    databaseSelected: result.databaseSelected,
    configSource: result.configSource,
    demoSeedAllowed: result.demoSeedAllowed,
    nonProductionProjectConfigured: result.nonProductionProjectConfigured,
    viewModeIgnored: true,
    failure: result.failure,
    credentials: 'redacted',
  };
}

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
/** Direct database host. The API host `<ref>.supabase.co` is not a database host. */
const DIRECT_DATABASE_HOST = /^db\.([a-z0-9]{20})\.supabase\.co$/;
/** Supavisor session (5432) and transaction (6543) pooler hosts. The project ref is not in this host. */
const POOLER_DATABASE_HOST = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/;
const POOLER_DATABASE_USER = /^postgres\.([a-z0-9]{20})$/;

export type DatabaseConnectionKind = 'missing' | 'malformed' | 'local' | 'hosted' | 'unidentifiable';

export interface DatabaseConnectionIdentity {
  kind: DatabaseConnectionKind;
  projectRef: string | null;
  host: string | null;
}

function emptyIdentity(kind: DatabaseConnectionKind, host: string | null = null): DatabaseConnectionIdentity {
  return { kind, projectRef: null, host };
}

/**
 * Identifies a Postgres connection by its database host and, for the pooler,
 * the `postgres.<project-ref>` user. A project ref in the password, path, or
 * query does not identify the database.
 */
export function identifyDatabaseConnection(connectionString: string | null | undefined): DatabaseConnectionIdentity {
  const raw = (connectionString ?? '').trim();
  if (!raw) return emptyIdentity('missing');
  if (!/^postgres(?:ql)?:\/\//i.test(raw)) return emptyIdentity('malformed');

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return emptyIdentity('malformed');
  }

  const host = parsed.hostname.toLowerCase();
  if (!host) return emptyIdentity('malformed');
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return emptyIdentity('local', host);
  }

  let username = '';
  try {
    username = decodeURIComponent(parsed.username || '').toLowerCase();
  } catch {
    return emptyIdentity('malformed', host);
  }

  const direct = host.match(DIRECT_DATABASE_HOST);
  if (direct) {
    const hostRef = direct[1] ?? '';
    if (username === '' || username === 'postgres' || username === `postgres.${hostRef}`) {
      return { kind: 'hosted', projectRef: hostRef, host };
    }
    return emptyIdentity('unidentifiable', host);
  }

  if (POOLER_DATABASE_HOST.test(host)) {
    const poolerUser = username.match(POOLER_DATABASE_USER);
    if (!poolerUser?.[1]) return emptyIdentity('unidentifiable', host);
    return { kind: 'hosted', projectRef: poolerUser[1], host };
  }

  return emptyIdentity('unidentifiable', host);
}

/** Host and project only. Never includes a user, password, or connection string. */
export function redactDatabaseTargetSummary(connectionString: string | null | undefined): string {
  const identity = identifyDatabaseConnection(connectionString);
  const host = identity.host ?? 'none';
  const project = identity.projectRef ?? (identity.kind === 'local' ? 'local' : identity.kind);
  return `host=${host} project=${project}`;
}

/** Removes a connection string, its password, and any `--db-url` argument. */
export function redactDiagnosticText(text: string, connectionString?: string | null): string {
  let redacted = text;
  const secret = (connectionString ?? '').trim();
  if (secret) {
    redacted = redacted.split(secret).join('[redacted]');
    try {
      const password = new URL(secret).password;
      const variants = new Set<string>();
      if (password.length >= 4) variants.add(password);
      try {
        const decoded = decodeURIComponent(password);
        if (decoded.length >= 4) variants.add(decoded);
      } catch {
        // The password is not valid percent-encoding. The raw form is already queued.
      }
      for (const variant of variants) {
        redacted = redacted.split(variant).join('[redacted]');
        const encoded = encodeURIComponent(variant);
        if (encoded !== variant && encoded.length >= 4) redacted = redacted.split(encoded).join('[redacted]');
      }
    } catch {
      // The full string was already removed. A malformed URL has no separate password.
    }
  }
  return redacted
    .replace(/--db-url(?:=|\s+)(?:"[^"]*"|'[^']*'|\S+)/gi, '--db-url [redacted]')
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted]');
}

function hostedApiProjectRef(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    return projectRefFromSupabaseUrl(trimmed);
  } catch {
    return null;
  }
}

function hitsProductionIdentifier(connection: string, ref: string, supabaseUrl: string): boolean {
  const identity = identifyDatabaseConnection(connection);
  return (
    containsProductionRef(connection) ||
    containsProductionRef(ref) ||
    containsProductionRef(supabaseUrl) ||
    identity.projectRef === DOCUMENTED_PRODUCTION_PROJECT_REF ||
    ref.trim().toLowerCase() === DOCUMENTED_PRODUCTION_PROJECT_REF ||
    hostedApiProjectRef(supabaseUrl) === DOCUMENTED_PRODUCTION_PROJECT_REF
  );
}

/** Demo seed is allowed only for an explicit local loopback target. */
export function assertDemoSeedTarget(env: {
  NODE_ENV?: string;
  APP_ENV?: string;
  OTP_DEPLOYMENT_TARGET?: string;
  DATABASE_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_PROJECT_REF?: string;
}): void {
  const blob = [env.DATABASE_URL, env.SUPABASE_URL, env.SUPABASE_PROJECT_REF].filter(Boolean).join(' ');
  if (containsProductionRef(blob)) {
    throw new Error('[SECURITY ERROR] Demo seed is blocked against the production project ref.');
  }
  const declared = normalizeDeploymentClass(env.OTP_DEPLOYMENT_TARGET);
  if (declared === 'invalid') {
    throw new Error('[SECURITY ERROR] Demo seed is blocked for an unrecognized deployment target.');
  }
  if (declared === 'production' || (env.NODE_ENV ?? '').toLowerCase() === 'production' || (env.APP_ENV ?? '').toLowerCase() === 'production') {
    throw new Error('[SECURITY ERROR] Demo seed is blocked for production.');
  }
  if (declared === 'non-production') {
    throw new Error('[SECURITY ERROR] Demo seed is blocked for non-production until a local target is explicit.');
  }

  const urlRef = hostedApiProjectRef(env.SUPABASE_URL ?? '');
  const declaredRef = (env.SUPABASE_PROJECT_REF ?? '').trim().toLowerCase();
  const identity = identifyDatabaseConnection(env.DATABASE_URL);
  const connectionSupplied = Boolean((env.DATABASE_URL ?? '').trim());
  if (connectionSupplied && (identity.kind === 'malformed' || identity.kind === 'unidentifiable')) {
    throw new Error('[SECURITY ERROR] Demo seed target identifiers disagree.');
  }
  if (declaredRef && urlRef && declaredRef !== urlRef) {
    throw new Error('[SECURITY ERROR] Demo seed target identifiers disagree.');
  }
  if (identity.kind === 'hosted' && declaredRef && identity.projectRef !== declaredRef) {
    throw new Error('[SECURITY ERROR] Demo seed target identifiers disagree.');
  }
  if (identity.kind === 'hosted' && urlRef && identity.projectRef !== urlRef) {
    throw new Error('[SECURITY ERROR] Demo seed target identifiers disagree.');
  }
  if (declared === 'local' && (identity.kind === 'hosted' || urlRef)) {
    throw new Error('[SECURITY ERROR] Demo seed target identifiers disagree.');
  }
}

function nonEmptyValues(values: Array<string | null | undefined> | undefined): string[] {
  const result: string[] = [];
  for (const value of values ?? []) {
    const trimmed = (value ?? '').trim();
    if (trimmed) result.push(trimmed);
  }
  return result;
}

function valueHitsProduction(value: string): boolean {
  return (
    containsProductionRef(value) ||
    identifyDatabaseConnection(value).projectRef === DOCUMENTED_PRODUCTION_PROJECT_REF ||
    hostedApiProjectRef(value) === DOCUMENTED_PRODUCTION_PROJECT_REF
  );
}

/** Lower-priority values must not smuggle the production project into a non-production target. */
function rejectSuppliedProductionExtras(
  message: string,
  input: {
    suppliedProjectRefs?: Array<string | null | undefined>;
    suppliedSupabaseUrls?: Array<string | null | undefined>;
    suppliedConnectionStrings?: Array<string | null | undefined>;
  },
): void {
  const values = [
    ...nonEmptyValues(input.suppliedProjectRefs),
    ...nonEmptyValues(input.suppliedSupabaseUrls),
    ...nonEmptyValues(input.suppliedConnectionStrings),
  ];
  for (const value of values) {
    if (valueHitsProduction(value)) throw new Error(message);
  }
}

function disagreementMessage(deploymentClass: DeploymentClass | null): string {
  if (deploymentClass === 'non-production') return 'Non-production migration target identifiers disagree.';
  if (deploymentClass === 'production') return 'Environment and Supabase project ref disagree.';
  return 'Local or undeclared migration target must not select a hosted project.';
}

/**
 * The resolved connection is the selected database URL. Every supplied project
 * ref, API URL, and database URL — including lower-priority ones — must identify
 * that same target. A later URL cannot overrule the selected one.
 */
function assertSuppliedTargetsAgree(
  deploymentClass: DeploymentClass | null,
  identity: DatabaseConnectionIdentity,
  input: {
    projectRef?: string | null;
    supabaseUrl?: string | null;
    suppliedProjectRefs?: Array<string | null | undefined>;
    suppliedSupabaseUrls?: Array<string | null | undefined>;
    suppliedConnectionStrings?: Array<string | null | undefined>;
  },
): void {
  const fail = () => {
    throw new Error(disagreementMessage(deploymentClass));
  };
  const hosted = deploymentClass === 'production' || deploymentClass === 'non-production';
  const refs = nonEmptyValues([input.projectRef, ...(input.suppliedProjectRefs ?? [])]);
  const urls = nonEmptyValues([input.supabaseUrl, ...(input.suppliedSupabaseUrls ?? [])]);

  for (const ref of refs) {
    const normalized = ref.toLowerCase();
    if (hosted) {
      if (identity.kind !== 'hosted' || normalized !== identity.projectRef) fail();
    } else if (normalized !== LOCAL_PROJECT_ID) {
      fail();
    }
  }

  for (const url of urls) {
    if (hosted) {
      if (hostedApiProjectRef(url) !== identity.projectRef) fail();
    } else if (!isLoopbackSupabaseUrl(url) || hostedApiProjectRef(url)) {
      fail();
    }
  }

  for (const candidate of nonEmptyValues(input.suppliedConnectionStrings)) {
    const other = identifyDatabaseConnection(candidate);
    if (hosted) {
      if (identity.kind !== 'hosted' || other.kind !== 'hosted' || other.projectRef !== identity.projectRef) fail();
    } else if (other.kind !== 'local') {
      fail();
    }
  }
}

export function assertMigrationTarget(input: {
  deploymentTarget?: string | null;
  /** Selected database URL. This is the resolved connection. */
  connectionString?: string | null;
  projectRef?: string | null;
  /** Selected browser/project URL. Required for a non-production migration, together with the connection and project ref. */
  supabaseUrl?: string | null;
  /** Every supplied project ref, including ones that were not selected. */
  suppliedProjectRefs?: Array<string | null | undefined>;
  /** Every supplied API URL. Lower-priority URLs must still match the resolved connection. */
  suppliedSupabaseUrls?: Array<string | null | undefined>;
  /** Every supplied database URL, highest priority first. Lower-priority URLs must match the selected connection. */
  suppliedConnectionStrings?: Array<string | null | undefined>;
}): void {
  const declared = normalizeDeploymentClass(input.deploymentTarget);
  const connection = input.connectionString ?? '';
  const ref = (input.projectRef ?? '').trim();
  const supabaseUrl = input.supabaseUrl ?? '';
  const identity = identifyDatabaseConnection(connection);

  if (declared === 'invalid') {
    throw new Error('Migration target is not local, non-production, or production.');
  }

  if (declared === 'non-production') {
    if (hitsProductionIdentifier(connection, ref, supabaseUrl)) {
      throw new Error('Non-production migration target resolved to the production project. Refusing.');
    }
    rejectSuppliedProductionExtras(
      'Non-production migration target resolved to the production project. Refusing.',
      input,
    );
    if (!connection.trim() || !ref || !supabaseUrl.trim()) {
      throw new Error(
        'Non-production project is not configured. DATABASE_URL, SUPABASE_PROJECT_ID, and VITE_SUPABASE_URL are required. Refusing to fall back to production.',
      );
    }
    if (identity.kind === 'malformed' || identity.kind === 'unidentifiable' || identity.kind === 'missing') {
      throw new Error('Non-production migration target is malformed or cannot be identified.');
    }
    const normalizedRef = ref.toLowerCase();
    const urlRef = hostedApiProjectRef(supabaseUrl);
    if (!PROJECT_REF_PATTERN.test(normalizedRef) || !urlRef || urlRef !== normalizedRef || identity.kind !== 'hosted' || identity.projectRef !== normalizedRef) {
      throw new Error('Non-production migration target identifiers disagree.');
    }
    assertSuppliedTargetsAgree('non-production', identity, input);
    return;
  }

  if (declared === 'production') {
    // Host or pooler user only. A production ref in a password, database name,
    // or unrelated URL does not make this the documented production project.
    const connectionIsProduction = identity.kind === 'hosted' && identity.projectRef === DOCUMENTED_PRODUCTION_PROJECT_REF;
    if (!connectionIsProduction) {
      if (!connection.trim() || identity.kind === 'missing' || identity.kind === 'malformed' || identity.kind === 'unidentifiable') {
        throw new Error('Production migration requires an explicit connection to the documented production project.');
      }
      throw new Error('Environment and Supabase project ref disagree.');
    }
    if (ref && ref.toLowerCase() !== DOCUMENTED_PRODUCTION_PROJECT_REF) {
      throw new Error('Environment and Supabase project ref disagree.');
    }
    if (supabaseUrl.trim() && hostedApiProjectRef(supabaseUrl) !== DOCUMENTED_PRODUCTION_PROJECT_REF) {
      throw new Error('Environment and Supabase project ref disagree.');
    }
    assertSuppliedTargetsAgree('production', identity, input);
    return;
  }

  if (hitsProductionIdentifier(connection, ref, supabaseUrl)) {
    throw new Error('Undeclared migration target must not select the production project.');
  }
  rejectSuppliedProductionExtras('Undeclared migration target must not select the production project.', input);
  if (connection.trim() && identity.kind !== 'local') {
    throw new Error('Local or undeclared migration target must not select a hosted project.');
  }
  if (ref && ref.toLowerCase() !== LOCAL_PROJECT_ID) {
    throw new Error('Local or undeclared migration target must not select a hosted project.');
  }
  if (supabaseUrl.trim() && !isLoopbackSupabaseUrl(supabaseUrl)) {
    throw new Error('Local or undeclared migration target must not select a hosted project.');
  }
  assertSuppliedTargetsAgree('local', identity, input);
}
