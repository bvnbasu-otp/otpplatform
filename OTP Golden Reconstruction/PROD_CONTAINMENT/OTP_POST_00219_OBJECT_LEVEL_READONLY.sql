-- OTP POST-00219 READ-ONLY PRODUCTION CATALOG EVIDENCE
-- NO INSERT / UPDATE / DELETE / DDL

SELECT
  'MIGRATION' AS section,
  version,
  name
FROM supabase_migrations.schema_migrations
WHERE version IN ('00216','00217','00218','00219')
ORDER BY version;

SELECT
  'ANON_EXECUTE' AS section,
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  r.rolname AS grantee,
  has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS has_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN pg_roles r
WHERE r.rolname = 'anon'
  AND has_function_privilege(r.rolname, p.oid, 'EXECUTE')
ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid);

SELECT
  'PUBLIC_EXECUTE' AS section,
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE has_function_privilege('public', p.oid, 'EXECUTE')
ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid);

SELECT
  'DEMO_STATUS' AS section,
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_userbyid(p.proowner) AS owner,
  p.prosecdef AS security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'demo_status';

SELECT
  'SENSITIVE_FUNCTIONS' AS section,
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_userbyid(p.proowner) AS owner,
  p.prosecdef AS security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE
  p.proname ILIKE ANY (ARRAY[
    '%wallet%',
    '%reward%',
    '%cashback%',
    '%referral%',
    '%success%',
    '%fee%',
    '%award%',
    '%reveal%',
    '%purchase%',
    '%invoice%',
    '%deploy%',
    '%authority%',
    '%delegat%',
    '%vote%',
    '%appointment%',
    '%rfq%'
  ])
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

SELECT
  'RFQ_TRIGGERS' AS section,
  n.nspname AS schema_name,
  c.relname AS table_name,
  t.tgname AS trigger_name,
  t.tgenabled,
  pg_get_triggerdef(t.oid, true) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND (
    c.relname ILIKE '%rfq%'
    OR c.relname ILIKE '%requirement%'
    OR t.tgname ILIKE '%rfq%'
    OR t.tgname ILIKE '%approval%'
    OR t.tgname ILIKE '%status%'
  )
ORDER BY n.nspname, c.relname, t.tgname;

SELECT
  'RFQ_TRIGGER_FUNCTIONS' AS section,
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE
  p.proname ILIKE ANY (ARRAY[
    '%rfq%',
    '%requirement%',
    '%approval%',
    '%status%'
  ])
ORDER BY p.proname;

SELECT
  'RLS_TABLES' AS section,
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND c.relrowsecurity
  AND (
    c.relname ILIKE ANY (ARRAY[
      '%rfq%',
      '%requirement%',
      '%quote%',
      '%organisation%',
      '%organization%',
      '%member%',
      '%appointment%',
      '%vote%',
      '%wallet%',
      '%reward%',
      '%fee%',
      '%purchase%',
      '%invoice%',
      '%supplier%',
      '%identity%',
      '%audit%'
    ])
  )
ORDER BY n.nspname, c.relname;

SELECT
  'RLS_POLICIES' AS section,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE
  tablename ILIKE ANY (ARRAY[
    '%rfq%',
    '%requirement%',
    '%quote%',
    '%organisation%',
    '%organization%',
    '%member%',
    '%appointment%',
    '%vote%',
    '%wallet%',
    '%reward%',
    '%fee%',
    '%purchase%',
    '%invoice%',
    '%supplier%',
    '%identity%',
    '%audit%'
  ])
ORDER BY schemaname, tablename, policyname;

SELECT
  'FUNCTION_SECURITY_PROPERTIES' AS section,
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_userbyid(p.proowner) AS owner,
  p.prosecdef AS security_definer,
  p.provolatile AS volatility,
  p.proleakproof AS leakproof,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, p.proname;

SELECT
  'FINAL_COUNTS' AS section,
  (
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE has_function_privilege('anon', p.oid, 'EXECUTE')
  ) AS anon_execute_count,
  (
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE has_function_privilege('public', p.oid, 'EXECUTE')
  ) AS public_execute_count,
  (
    SELECT count(*)
    FROM supabase_migrations.schema_migrations
    WHERE version = '00219'
  ) AS migration_00219_present;
