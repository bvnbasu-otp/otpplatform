-- OTP POST-00219 production catalog evidence â€” SELECT ONLY
-- Project ref: qsuvtcezffomtwzwyrso
-- Run in authenticated user shell only.

-- ---------- 1A environment ----------
SELECT '1A' AS section, 'postgres_version' AS item, version() AS value
UNION ALL
SELECT '1A', 'current_database', current_database()
UNION ALL
SELECT '1A', 'current_user', current_user
UNION ALL
SELECT '1A', 'session_user', session_user;

SELECT '1A' AS section, 'otp_schema_migrations_exists' AS item,
       (to_regclass('public.otp_schema_migrations') IS NOT NULL)::text AS value
UNION ALL
SELECT '1A', 'supabase_schema_migrations_exists',
       (to_regclass('supabase_migrations.schema_migrations') IS NOT NULL)::text;

SELECT '1A' AS section, src, max_version, row_count
FROM (
  SELECT 'otp_schema_migrations' AS src,
         max(version) AS max_version,
         count(*)::bigint AS row_count
  FROM public.otp_schema_migrations
  WHERE to_regclass('public.otp_schema_migrations') IS NOT NULL
  UNION ALL
  SELECT 'supabase_migrations.schema_migrations',
         max(version),
         count(*)::bigint
  FROM supabase_migrations.schema_migrations
  WHERE to_regclass('supabase_migrations.schema_migrations') IS NOT NULL
) z;

-- ---------- 1B migration history (00216â€“00219) ----------
SELECT '1B' AS section, 'supabase_migrations' AS ledger, m.version, m.name
FROM supabase_migrations.schema_migrations m
WHERE left(btrim(m.version), 5) IN ('00216','00217','00218','00219')
   OR m.version IN ('00216','00217','00218','00219')
ORDER BY m.version;

SELECT '1B' AS section, 'otp_schema_migrations' AS ledger, o.version, o.applied_at::text AS applied_at
FROM public.otp_schema_migrations o
WHERE to_regclass('public.otp_schema_migrations') IS NOT NULL
  AND (
    left(btrim(o.version), 5) IN ('00216','00217','00218','00219')
    OR o.version LIKE '00216%'
    OR o.version LIKE '00217%'
    OR o.version LIKE '00218%'
    OR o.version LIKE '00219%'
  )
ORDER BY o.version;

-- ---------- 1C every function with EXECUTE to anon ----------
SELECT '1C' AS section,
       n.nspname AS schema_name,
       p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS identity_args,
       a.privilege_type,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
       pg_get_userbyid(a.grantor) AS grantor
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a ON true
WHERE p.prokind IN ('f','p')
  AND a.privilege_type = 'EXECUTE'
  AND (
    a.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'anon')
    OR has_function_privilege('anon', p.oid, 'EXECUTE')
  )
ORDER BY n.nspname, p.proname, identity_args;

-- 1C classification vs expected names (repository intent; compare live signatures)
WITH expected(name) AS (
  VALUES
    ('submit_signup_request'),
    ('verify_profile_verification_otp'),
    ('verify_whatsapp_password_reset'),
    ('platform_heartbeat'),
    ('service_categories'),
    ('served_cities'),
    ('get_maintenance_status'),
    ('redeem_supplier_magic_link'),
    ('messaging_quote_context'),
    ('submit_messaging_quote'),
    ('complete_supplier_onboarding_atomic')
),
anon_pub AS (
  SELECT n.nspname AS schema_name, p.proname, p.oid,
         pg_get_function_identity_arguments(p.oid) AS identity_args,
         p.prosecdef,
         has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
),
matched AS (
  SELECT e.name AS expected_name,
         a.schema_name, a.proname, a.identity_args, a.anon_exec,
         CASE
           WHEN a.oid IS NULL THEN 'MISSING'
           WHEN NOT a.anon_exec THEN 'MISSING'
           ELSE 'EXPECTED'
         END AS classification
  FROM expected e
  LEFT JOIN anon_pub a ON a.proname = e.name
),
unexpected AS (
  SELECT a.schema_name, a.proname, a.identity_args, 'UNEXPECTED' AS classification
  FROM anon_pub a
  WHERE a.anon_exec
    AND NOT EXISTS (SELECT 1 FROM expected e WHERE e.name = a.proname)
)
SELECT '1C' AS section, expected_name, schema_name, proname, identity_args, classification
FROM matched
UNION ALL
SELECT '1C', NULL, schema_name, proname, identity_args, classification
FROM unexpected
ORDER BY 2 NULLS LAST, 4;

-- ---------- 1D every function with EXECUTE to PUBLIC ----------
SELECT '1D' AS section,
       n.nspname AS schema_name,
       p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS identity_args,
       p.prosecdef AS security_definer,
       a.privilege_type,
       pg_get_userbyid(a.grantor) AS grantor
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a ON true
WHERE p.prokind IN ('f','p')
  AND a.privilege_type = 'EXECUTE'
  AND a.grantee = 0
ORDER BY n.nspname, p.proname, identity_args;

-- ---------- 1E demo_status (if present) ----------
SELECT '1E' AS section, 'demo_status_regprocedure' AS item,
       to_regprocedure('public.demo_status()')::text AS oid
UNION ALL
SELECT '1E', 'demo_status_exists',
       EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'demo_status'
       )::text;

SELECT '1E' AS section, p.oid::regprocedure::text AS signature,
       pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       EXISTS (
         SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
         WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
       ) AS public_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'demo_status';

SELECT '1E' AS section, 'privilege_rows' AS item,
       CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
       a.privilege_type, pg_get_userbyid(a.grantor) AS grantor
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a ON true
WHERE n.nspname = 'public' AND p.proname = 'demo_status'
  AND a.privilege_type = 'EXECUTE';

-- ---------- 1F sensitive routines (name filter) ----------
SELECT '1F' AS section,
       n.nspname AS schema_name,
       p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS identity_args,
       pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       EXISTS (
         SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) ax
         WHERE ax.grantee = 0 AND ax.privilege_type = 'EXECUTE'
       ) AS public_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       CASE
         WHEN p.proname ILIKE '%wallet%' THEN 'wallet / ledger'
         WHEN p.proname ILIKE '%reward%' OR p.proname ILIKE '%award%' THEN 'reward or award'
         WHEN p.proname ILIKE '%reveal%' THEN 'sealed quote / reveal'
         WHEN p.proname ILIKE '%purchase_order%' OR p.proname ILIKE '%invoice%' THEN 'PO or invoice'
         WHEN p.proname ILIKE '%deploy%' OR p.proname ILIKE '%dry_run%' THEN 'deploy / dry_run'
         WHEN p.proname ILIKE '%appoint%' OR p.proname ILIKE '%vote%' OR p.proname ILIKE '%delegat%' THEN 'governance'
         WHEN p.proname ILIKE '%rfq%' THEN 'RFQ workflow'
         ELSE 'matched keyword'
       END AS relevance
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prokind = 'f'
  AND (
    p.proname ILIKE '%wallet%'
    OR p.proname ILIKE '%reward%'
    OR p.proname ILIKE '%award%'
    OR p.proname ILIKE '%reveal%'
    OR p.proname ILIKE '%purchase_order%'
    OR p.proname ILIKE '%invoice%'
    OR p.proname ILIKE '%deploy%'
    OR p.proname ILIKE '%dry_run%'
    OR p.proname ILIKE '%appoint%'
    OR p.proname ILIKE '%vote%'
    OR p.proname ILIKE '%delegat%'
    OR p.proname ILIKE '%rfq%'
  )
ORDER BY n.nspname, p.proname, identity_args;

-- ---------- 1G security definer + proconfig search_path (sensitive + 00218/00219 guards) ----------
SELECT '1G' AS section,
       n.nspname AS schema_name,
       p.proname,
       pg_get_function_identity_arguments(p.oid) AS identity_args,
       p.prosecdef,
       (SELECT string_agg(unnest, ', ') FROM unnest(p.proconfig) AS unnest) AS proconfig,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prokind = 'f'
  AND (
    p.proname IN (
      'guard_rfq_status_transition',
      'rfq_status_transition_allowed',
      'guard_rfq_approval_stage_direct_write'
    )
    OR p.proname ILIKE '%wallet%'
    OR p.proname ILIKE '%reward%'
    OR p.proname ILIKE '%reveal%'
    OR p.proname ILIKE '%lock_and_reveal%'
    OR p.proname ILIKE '%invoice%'
    OR p.proname ILIKE '%purchase_order%'
  )
ORDER BY n.nspname, p.proname;

-- Function bodies (SQL/plpgsql definitions; redact manually if any secret appears)
SELECT '1G_BODY' AS section,
       p.oid::regprocedure::text AS signature,
       left(pg_get_functiondef(p.oid), 8000) AS functiondef_excerpt
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'guard_rfq_status_transition',
  'rfq_status_transition_allowed',
  'guard_rfq_approval_stage_direct_write'
)
ORDER BY signature;

-- ---------- 1H 00218 triggers on rfqs ----------
SELECT '1H' AS section,
       t.tgname AS trigger_name,
       t.tgenabled AS enabled_code,
       CASE t.tgenabled
         WHEN 'O' THEN 'origin'
         WHEN 'D' THEN 'disabled'
         WHEN 'R' THEN 'replica'
         WHEN 'A' THEN 'always'
         ELSE t.tgenabled::text
       END AS enabled_meaning,
       c.relname AS table_name,
       p.oid::regprocedure::text AS function_signature,
       pg_get_userbyid(p.proowner) AS function_owner,
       p.prosecdef
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
  AND n.nspname = 'public'
  AND c.relname = 'rfqs'
  AND (t.tgname = 'trg_guard_rfq_status' OR p.proname = 'guard_rfq_status_transition');

-- ---------- 1I 00219 trigger on rfq_approval_stages ----------
SELECT '1I' AS section,
       t.tgname AS trigger_name,
       t.tgenabled AS enabled_code,
       c.relname AS table_name,
       p.oid::regprocedure::text AS function_signature,
       p.prosecdef
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
  AND n.nspname = 'public'
  AND c.relname = 'rfq_approval_stages';

-- ---------- 1J RLS priority tables ----------
SELECT '1J' AS section,
       n.nspname AS schema_name,
       c.relname AS table_name,
       c.relrowsecurity,
       c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'rfqs', 'rfq_approval_stages', 'quotes', 'organizations', 'organization_members',
    'votes', 'wallets', 'wallet_transactions', 'buyer_reward_allocations',
    'purchase_orders', 'invoices', 'suppliers'
  )
ORDER BY c.relname;

SELECT '1J' AS section,
       schemaname, tablename, policyname, permissive, roles, cmd, qual AS using_expr, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'rfqs', 'rfq_approval_stages', 'quotes', 'organizations', 'organization_members',
    'votes', 'wallets', 'wallet_transactions', 'buyer_reward_allocations',
    'purchase_orders', 'invoices', 'suppliers'
  )
ORDER BY tablename, policyname;

-- ---------- 1K consolidated grant table (eleven expected + sensitive from 1F) ----------
WITH targets AS (
  SELECT unnest(ARRAY[
    'submit_signup_request','verify_profile_verification_otp','verify_whatsapp_password_reset',
    'platform_heartbeat','service_categories','served_cities','get_maintenance_status',
    'redeem_supplier_magic_link','messaging_quote_context','submit_messaging_quote',
    'complete_supplier_onboarding_atomic'
  ]) AS proname
  UNION
  SELECT DISTINCT p.proname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public','private')
    AND p.prokind = 'f'
    AND (
      p.proname ILIKE '%wallet%' OR p.proname ILIKE '%reward%' OR p.proname ILIKE '%reveal%'
      OR p.proname ILIKE '%invoice%' OR p.proname ILIKE '%purchase_order%'
      OR p.proname IN ('guard_rfq_status_transition','guard_rfq_approval_stage_direct_write')
    )
)
SELECT '1K' AS section,
       n.nspname || '.' || p.proname AS function_fqn,
       pg_get_function_identity_arguments(p.oid) AS signature,
       pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer,
       EXISTS (
         SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
         WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
       ) AS public_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       CASE
         WHEN p.proname IN ('guard_rfq_status_transition','guard_rfq_approval_stage_direct_write',
                            'rfq_status_transition_allowed') THEN '00218/00219'
         WHEN t.proname IN (
           'submit_signup_request','verify_profile_verification_otp','verify_whatsapp_password_reset',
           'platform_heartbeat','service_categories','served_cities','get_maintenance_status',
           'redeem_supplier_magic_link','messaging_quote_context','submit_messaging_quote',
           'complete_supplier_onboarding_atomic'
         ) THEN '00216/00217 anon allowlist'
         ELSE 'sensitive surface'
       END AS relevant_to_00216_219
FROM targets t
JOIN pg_proc p ON p.proname = t.proname
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public','private')
ORDER BY function_fqn, signature;

-- ---------- 1L classification placeholders (fill after capturing rows) ----------
SELECT '1L' AS section, control_id, classification, notes
FROM (VALUES
  ('migration_ceiling_219', 'NOT PROVEN BY CATALOG', 'agent shell blocked; run 1B'),
  ('anon_allowlist_eleven', 'NOT PROVEN BY CATALOG', 'run 1C; do not trust count-only PASS'),
  ('public_execute_zero_public_schema', 'NOT PROVEN BY CATALOG', 'run 1D'),
  ('demo_status_anon_denied', 'NOT PROVEN BY CATALOG', 'run 1E'),
  ('00218_rfq_status_trigger', 'NOT PROVEN BY CATALOG', 'CATALOG vs RUNTIME: trigger != behaviour'),
  ('00219_approval_stage_trigger', 'NOT PROVEN BY CATALOG', 'CATALOG vs RUNTIME: trigger != behaviour'),
  ('priority_table_rls', 'NOT PROVEN BY CATALOG', 'run 1J')
) AS v(control_id, classification, notes);
