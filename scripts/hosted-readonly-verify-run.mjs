/**
 * Read-only hosted Postgres verification — outputs JSON evidence (no secrets).
 * Usage: node scripts/hosted-readonly-verify-run.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AUTH_PATH = path.join(ROOT, '.env.auth');
const OUT_PATH = path.join(ROOT, 'OTP Golden Reconstruction', '_hosted_readonly_evidence.json');

const PROJECT_REF = 'qsuvtcezffomtwzwyrso';

function parseDotEnv(text) {
  const env = {};
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
    env[key] = val;
  }
  return env;
}

function redactHostFromUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'postgresql:' ? '5432' : ''),
      database: u.pathname.replace(/^\//, '') || 'postgres',
      username: u.username ? u.username.split('@')[0] : '',
      hasPassword: Boolean(u.password),
      isLoopback: ['127.0.0.1', 'localhost', '0.0.0.0'].includes(u.hostname),
      isSupabasePooler: u.hostname.includes('pooler.supabase.com'),
      hasProjectRef: urlStr.includes(PROJECT_REF),
    };
  } catch {
    return { parseError: true };
  }
}

function classifyHosted(env, fileExists) {
  const meta = {
    credentialFile: '.env.auth',
    credentialFileExists: Boolean(fileExists),
    keysPresent: Object.keys(env).sort(),
    hostedConnectionPossible: false,
    blockReason: null,
    connectionMeta: null,
  };

  if (!fileExists) {
    meta.blockReason = 'ENV_AUTH_FILE_MISSING';
    return { meta, config: null };
  }

  const urlKeys = [
    'DATABASE_URL',
    'SUPABASE_DB_URL',
    'DIRECT_URL',
    'POSTGRES_URL',
    'POSTGRES_PRISMA_URL',
    'GOTRUE_DB_DATABASE_URL',
  ];
  meta.postgresUrlKeys = [];
  let connectionString = null;
  for (const [k, v] of Object.entries(env)) {
    if (v && /^postgres(ql)?:\/\//i.test(String(v))) {
      meta.postgresUrlKeys.push(k);
    }
  }
  for (const k of urlKeys) {
    if (env[k] && String(env[k]).startsWith('postgres')) {
      connectionString = env[k];
      meta.connectionStringSourceKey = k;
      break;
    }
  }
  if (!connectionString) {
    for (const k of meta.postgresUrlKeys) {
      if (!urlKeys.includes(k)) continue;
      connectionString = env[k];
      meta.connectionStringSourceKey = k;
      break;
    }
  }

  if (!connectionString) {
    const host = env.PGHOST || env.POSTGRES_HOST;
    const password = env.SUPABASE_DB_PASSWORD || env.PGPASSWORD || env.POSTGRES_PASSWORD;
    const user = env.PGUSER || env.POSTGRES_USER || 'postgres';
    const database = env.PGDATABASE || env.POSTGRES_DB || 'postgres';
    const port = env.PGPORT || env.POSTGRES_PORT || '5432';
    if (host && password) {
      const encUser = encodeURIComponent(user);
      const encPass = encodeURIComponent(password);
      connectionString = `postgresql://${encUser}:${encPass}@${host}:${port}/${database}`;
    }
  }

  if (!connectionString) {
    const supabaseUrl = env.SUPABASE_URL || '';
    const isLocalSupabase = /127\.0\.0\.1|localhost/.test(supabaseUrl);
    const hasDbPassword = Boolean(env.SUPABASE_DB_PASSWORD || env.PGPASSWORD);
    const onlyGotrue =
      meta.keysPresent.length > 0 &&
      meta.keysPresent.every((k) => k.startsWith('GOTRUE_') || k === 'API_EXTERNAL_URL');
    if (onlyGotrue || (isLocalSupabase && !hasDbPassword)) {
      meta.blockReason = 'LOCAL_GOTRUE_ONLY_NO_HOSTED_DB_CREDENTIALS';
      meta.localGotrueHint = {
        supabaseUrlKeyPresent: Boolean(env.SUPABASE_URL),
        supabaseUrlLoopback: isLocalSupabase,
        hasSupabaseDbPassword: hasDbPassword,
        postgresUrlKeysFound: meta.postgresUrlKeys,
      };
    } else {
      meta.blockReason = 'NO_HOSTED_POSTGRES_CONNECTION_FIELDS';
    }
    return { meta, config: null };
  }

  const cm = redactHostFromUrl(connectionString);
  meta.connectionMeta = cm;

  if (cm.isLoopback) {
    meta.blockReason = 'CONNECTION_TARGETS_LOOPBACK';
    return { meta, config: null };
  }

  const looksHosted =
    cm.isSupabasePooler ||
    cm.hasProjectRef ||
    (cm.hostname && cm.hostname.includes('supabase.co'));

  if (!looksHosted) {
    meta.blockReason = 'CONNECTION_NOT_RECOGNIZED_AS_OTP_HOSTED';
    return { meta, config: null };
  }

  meta.hostedConnectionPossible = true;
  return {
    meta,
    config: {
      connectionString,
      ssl: { rejectUnauthorized: false },
    },
  };
}

async function q(client, sql, params) {
  const r = await client.query(sql, params);
  return r.rows;
}

async function runCatalog(client) {
  const out = {};

  const roShow = await q(client, 'SHOW transaction_read_only');
  const roSetting = await q(client, "SELECT current_setting('transaction_read_only') AS v");
  out.readOnly = {
    show: roShow[0]?.transaction_read_only ?? roShow[0]?.transaction_read_only,
    setting: roSetting[0]?.v,
  };

  const ident = await q(client, 'SELECT current_database() AS db, current_user AS usr');
  out.identity = ident[0];
  const ver = await q(client, 'SELECT version() AS v');
  out.version = ver[0]?.v?.slice(0, 120);

  let serverAddr = null;
  try {
    const sa = await q(client, 'SELECT inet_server_addr()::text AS addr');
    serverAddr = sa[0]?.addr;
  } catch (e) {
    serverAddr = { error: String(e.message).slice(0, 80) };
  }
  out.serverAddr = serverAddr;

  const migTables = await q(
    client,
    `SELECT table_schema, table_name FROM information_schema.tables
     WHERE (table_schema = 'supabase_migrations' AND table_name = 'schema_migrations')
        OR (table_schema = 'public' AND table_name = 'otp_schema_migrations')`,
  );
  out.migrationTables = migTables;

  if (migTables.some((t) => t.table_schema === 'supabase_migrations')) {
    const allMigs = await q(
      client,
      `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version`,
    );
    out.schemaMigrations = allMigs;
    const targets = ['00212', '00213', '00214', '00215', '00216', '00217', '00218', '00219'];
    out.migration00212_219 = {};
    for (const t of targets) {
      const hits = allMigs.filter(
        (r) => String(r.version) === t || String(r.version).includes(t) || (r.name && r.name.includes(t)),
      );
      out.migration00212_219[t] = hits.length ? 'PRESENT' : 'ABSENT';
    }
    out.migrationVersionStyle = allMigs.slice(0, 5).map((r) => ({ version: String(r.version), name: r.name?.slice(0, 60) }));
  }

  if (migTables.some((t) => t.table_name === 'otp_schema_migrations')) {
    try {
      out.otpSchemaMigrations = await q(client, `SELECT * FROM public.otp_schema_migrations ORDER BY 1 LIMIT 50`);
    } catch (e) {
      out.otpSchemaMigrationsError = String(e.message).slice(0, 120);
    }
  }

  const routineNames = [
    'credit_buyer_settlement_reward_atomic',
    'apply_wallet_credits_to_subscription_atomic',
    'reveal_award',
    'lock_and_reveal_award_atomic',
    'create_purchase_order_from_award',
    'appoint_org_role_atomic',
    'approve_milestone_inspection_atomic',
    'reject_milestone_inspection_atomic',
    'record_invoice_payment_atomic',
    'cast_committee_vote',
    'guard_rfq_status_transition',
    'rfq_status_transition_allowed',
    'guard_rfq_approval_stage_direct_write',
    'submit_rfq_tier_approval_atomic',
    'is_platform_admin',
    'get_profile_id',
    'subscription_wallet_credit_inr',
  ];

  const fnRows2 = await q(
    client,
    `SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args, p.oid
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.proname = ANY($1::text[])
     ORDER BY 1,2,3`,
    [routineNames],
  );
  out.functionsPresent = fnRows2.map((r) => `${r.schema}.${r.name}(${r.args})`);

  const markers = [
    'WALLET-REWARD-FEE-REQUIRED',
    'RFQ-STATUS-TRANSITION',
    'RFQ-IMMUTABLE',
    'DECLARED_CONFLICT',
    'unconflicted',
    'INV-SUPPLIER-STATUS',
    'get_profile_id',
    'subscription_wallet_credit',
  ];

  out.functionMarkerHits = {};
  for (const row of fnRows2) {
    const def = await q(client, 'SELECT pg_get_functiondef($1::oid) AS d', [row.oid]);
    const d = def[0]?.d || '';
    const hits = markers.filter((m) => d.includes(m));
    if (hits.length) {
      out.functionMarkerHits[`${row.schema}.${row.name}`] = hits;
    }
  }

  out.functionSecuritySummary = {};
  for (const row of fnRows2) {
    const def = await q(client, 'SELECT pg_get_functiondef($1::oid) AS d', [row.oid]);
    const d = def[0]?.d || '';
    const key = `${row.schema}.${row.name}`;
    const summary = [];
    if (/SECURITY DEFINER/i.test(d)) summary.push('SECURITY_DEFINER');
    if (/REVOKE ALL.*FROM PUBLIC/i.test(d)) summary.push('revoke_public_in_def');
    if (/get_profile_id/i.test(d)) summary.push('uses_get_profile_id');
    if (/is_platform_admin/i.test(d)) summary.push('references_is_platform_admin');
    if (summary.length) out.functionSecuritySummary[key] = summary;
  }

  const privs = await q(
    client,
    `SELECT routine_schema, routine_name, grantee, privilege_type
     FROM information_schema.routine_privileges
     WHERE routine_schema = 'public' AND privilege_type = 'EXECUTE'
       AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
     ORDER BY grantee, routine_name`,
  );
  out.privileges = privs;
  out.publicExecuteCount = privs.filter((p) => p.grantee === 'PUBLIC').length;
  out.anonExecuteCount = privs.filter((p) => p.grantee === 'anon').length;
  out.anonOrPublicRoutines = privs
    .filter((p) => p.grantee === 'anon' || p.grantee === 'PUBLIC')
    .map((p) => `${p.grantee}:${p.routine_name}`);

  const sensitive = ['reveal_award', 'create_purchase_order_from_award'];
  out.sensitiveAnonExecute = privs
    .filter((p) => p.grantee === 'anon' && sensitive.includes(p.routine_name))
    .map((p) => p.routine_name);

  const triggers = await q(
    client,
    `SELECT tgname, pg_get_triggerdef(t.oid, true) AS def
     FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE NOT t.tgisinternal AND n.nspname = 'public'
       AND (tgname ILIKE '%rfq%' OR tgname ILIKE '%invoice%' OR tgname ILIKE '%approval%')
     ORDER BY tgname`,
  );
  out.triggers = triggers.map((t) => ({
    name: t.tgname,
    hasEvaluatingOpen: /EVALUATING.*OPEN|OPEN.*EVALUATING/i.test(t.def),
    hasAwardedEvaluating: /AWARDED.*EVALUATING|EVALUATING.*AWARDED/i.test(t.def),
    hasImmutableOrg: /organization_id/i.test(t.def) && /immutable|RFQ-IMMUTABLE|IS DISTINCT FROM/i.test(t.def),
    hasImmutableReq: /requirement_id/i.test(t.def) && /IS DISTINCT FROM|immutable|RFQ-IMMUTABLE/i.test(t.def),
    hasImmutableCreated: /created_by/i.test(t.def) && /IS DISTINCT FROM|immutable|RFQ-IMMUTABLE/i.test(t.def),
    hasInvSupplier: /INV-SUPPLIER|APPROVED|PAID/i.test(t.def),
    hasApprovalDirectWrite: /approval_stage|guard_rfq_approval/i.test(t.def),
    defSnippet: t.def?.slice(0, 400),
  }));

  const guardRfq = fnRows2.find((r) => r.name === 'guard_rfq_status_transition');
  if (guardRfq) {
    const def = await q(client, 'SELECT pg_get_functiondef($1::oid) AS d', [guardRfq.oid]);
    const d = def[0]?.d || '';
    out.rfqGuardText = {
      rejectsEvaluatingToOpen: /EVALUATING[\s\S]{0,80}OPEN|OPEN[\s\S]{0,40}not allowed|RFQ-STATUS-TRANSITION/i.test(d),
      rejectsAwardedToEvaluating: /AWARDED[\s\S]{0,80}EVALUATING/i.test(d),
      immutables: {
        organization_id: /organization_id[\s\S]{0,60}IS DISTINCT FROM|RFQ-IMMUTABLE/i.test(d),
        requirement_id: /requirement_id[\s\S]{0,60}IS DISTINCT FROM|RFQ-IMMUTABLE/i.test(d),
        created_by: /created_by[\s\S]{0,60}IS DISTINCT FROM|RFQ-IMMUTABLE/i.test(d),
      },
    };
  }

  out.approvalStageGuard00219 = fnRows2.some((r) => r.name === 'guard_rfq_approval_stage_direct_write')
    ? 'PRESENT'
    : 'ABSENT';

  const walletFn = fnRows2.find((r) => r.name === 'credit_buyer_settlement_reward_atomic');
  if (walletFn) {
    const def = await q(client, 'SELECT pg_get_functiondef($1::oid) AS d', [walletFn.oid]);
    const d = def[0]?.d || '';
    const wPriv = privs.filter((p) => p.routine_name === 'credit_buyer_settlement_reward_atomic');
    out.walletChecklist = {
      feeRequiredMarker: d.includes('WALLET-REWARD-FEE-REQUIRED'),
      nullFeeRejected: /p_platform_fee_tx_id IS NULL/i.test(d),
      orgMembershipGate: /organization_members/i.test(d),
      idempotencyKeyPath: /idempotency_key/i.test(d),
      feeRowLookup: /platform_fee_transactions/i.test(d),
      feeOrgMatch: /does not belong to organization/i.test(d),
      securityDefiner: /SECURITY DEFINER/i.test(d),
      anonDenied: !wPriv.some((p) => p.grantee === 'anon' || p.grantee === 'PUBLIC'),
      authenticatedGranted: wPriv.some((p) => p.grantee === 'authenticated'),
    };
  }

  const subFn = fnRows2.find((r) => r.name === 'apply_wallet_credits_to_subscription_atomic');
  if (subFn) {
    const def = await q(client, 'SELECT pg_get_functiondef($1::oid) AS d', [subFn.oid]);
    const d = def[0]?.d || '';
    out.subscriptionArbitraryRejected =
      /subscription_wallet_credit_inr/i.test(d) &&
      (/v_required/i.test(d) || /catalog/i.test(d) || /does not match/i.test(d));
  }

  const appointFn = fnRows2.find((r) => r.name === 'appoint_org_role_atomic');
  if (appointFn) {
    const def = await q(client, 'SELECT pg_get_functiondef($1::oid) AS d', [appointFn.oid]);
    const d = def[0]?.d || '';
    out.appointOwnerGate = /OWNER/i.test(d) && (/v_caller_role|caller.*role/i.test(d) || /must be owner/i.test(d));
  }

  const adminFn = fnRows2.find((r) => r.name === 'is_platform_admin' && r.schema === 'private');
  if (adminFn) {
    const def = await q(client, 'SELECT pg_get_functiondef($1::oid) AS d', [adminFn.oid]);
    const d = def[0]?.d || '';
    out.isPlatformAdmin = {
      present: true,
      hasEmailAllowlistPattern: /@/.test(d) && (/allowlist|admin.*email|jwt/i.test(d) || /auth\.jwt/i.test(d)),
      hasMfaMention: /mfa|aal/i.test(d),
      bodyLength: d.length,
    };
  } else {
    out.isPlatformAdmin = { present: false };
  }

  const voteFn = fnRows2.find((r) => r.name === 'cast_committee_vote');
  if (voteFn) {
    const def = await q(client, 'SELECT pg_get_functiondef($1::oid) AS d', [voteFn.oid]);
    const d = def[0]?.d || '';
    out.quorumCoi = {
      declaredConflict: /DECLARED_CONFLICT/i.test(d),
      coiTable: /conflict_of_interest/i.test(d),
    };
  }
  const lockFn = fnRows2.find((r) => r.name === 'lock_and_reveal_award_atomic');
  if (lockFn) {
    const def = await q(client, 'SELECT pg_get_functiondef($1::oid) AS d', [lockFn.oid]);
    const d = def[0]?.d || '';
    out.quorumCoi = out.quorumCoi || {};
    out.quorumCoi.unconflictedInLock = /unconflicted/i.test(d);
  }

  const invTriggers = triggers.filter((t) => /invoice/i.test(t.tgname));
  out.invoiceSupplierGuard = invTriggers.some((t) => t.hasInvSupplier);

  const payCount = fnRows2.filter((r) => r.name === 'record_invoice_payment_atomic');
  out.recordInvoicePaymentOverloadCount = payCount.length;

  const counts = {};
  for (const table of ['rfqs', 'awards', 'purchase_orders', 'invoices', 'wallet_transactions']) {
    try {
      const c = await q(client, `SELECT count(*)::bigint AS c FROM public.${table}`);
      counts[table] = c[0]?.c;
    } catch (e) {
      counts[table] = { error: String(e.message).slice(0, 80) };
    }
  }
  out.readOnlyCounts = counts;

  const policies = await q(
    client,
    `SELECT schemaname, tablename, policyname, cmd
     FROM pg_policies
     WHERE tablename IN ('organization_wallets','wallet_transactions','rfqs','invoices')
     ORDER BY tablename, policyname LIMIT 40`,
  );
  out.samplePolicies = policies;

  return out;
}

async function main() {
  const evidence = {
    generatedAt: new Date().toISOString(),
    passwordPrinted: false,
    credentialPersisted: false,
    credentialSource: '.env.auth',
  };

  const fileExists = fs.existsSync(AUTH_PATH);
  const env = fileExists ? parseDotEnv(fs.readFileSync(AUTH_PATH, 'utf8')) : {};
  const { meta, config } = classifyHosted(env, fileExists);
  evidence.meta = meta;

  const hosted = meta.hostedConnectionPossible;
  if (!hosted || !config) {
    evidence.decision = 'HOSTED VERIFICATION BLOCKED';
    evidence.readOnlyConfirmed = false;
    fs.writeFileSync(OUT_PATH, JSON.stringify(evidence, null, 2));
    process.exit(0);
  }

  const client = new pg.Client(config);
  try {
    await client.connect();
    await client.query('SET default_transaction_read_only = on');
    const ro = await runCatalog(client);
    evidence.readOnly = ro.readOnly;
    const roOn =
      String(ro.readOnly?.setting).toLowerCase() === 'on' ||
      String(ro.readOnly?.show).toLowerCase() === 'on';
    evidence.readOnlyConfirmed = roOn;
    if (!roOn) {
      evidence.decision = 'HOSTED VERIFICATION BLOCKED — READ-ONLY MODE NOT CONFIRMED';
      fs.writeFileSync(OUT_PATH, JSON.stringify(evidence, null, 2));
      await client.end();
      process.exit(0);
    }
    Object.assign(evidence, ro);
    evidence.decision = 'PENDING_RECONCILIATION';
  } catch (e) {
    evidence.connectionError = String(e.message).slice(0, 200);
    evidence.decision = 'HOSTED VERIFICATION BLOCKED';
    evidence.readOnlyConfirmed = false;
  } finally {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(evidence, null, 2));
}

main().catch((e) => {
  const evidence = {
    fatal: String(e.message).slice(0, 200),
    decision: 'HOSTED VERIFICATION BLOCKED',
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(evidence, null, 2));
  process.exit(1);
});
