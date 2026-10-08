-- OTP POST-00219 SINGLE-RESULT READ-ONLY PRODUCTION CATALOG EVIDENCE
-- ONE SELECT ONLY
-- NO INSERT / UPDATE / DELETE / DDL

WITH
migration_rows AS (
  SELECT jsonb_agg(
    jsonb_build_object(
      'version', version,
      'name', name
    )
    ORDER BY version
  ) AS rows
  FROM supabase_migrations.schema_migrations
  WHERE version IN ('00216','00217','00218','00219')
),

anon_rows AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'function', p.proname,
        'arguments', pg_get_function_identity_arguments(p.oid),
        'grantee', 'anon',
        'execute', has_function_privilege('anon', p.oid, 'EXECUTE')
      )
      ORDER BY n.nspname, p.proname,
               pg_get_function_identity_arguments(p.oid)
    ),
    '[]'::jsonb
  ) AS rows
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema')
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
),

public_rows AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'function', p.proname,
        'arguments', pg_get_function_identity_arguments(p.oid),
        'public_execute', has_function_privilege('public', p.oid, 'EXECUTE')
      )
      ORDER BY n.nspname, p.proname,
               pg_get_function_identity_arguments(p.oid)
    ),
    '[]'::jsonb
  ) AS rows
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema')
    AND has_function_privilege('public', p.oid, 'EXECUTE')
),

demo_rows AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'function', p.proname,
        'arguments', pg_get_function_identity_arguments(p.oid),
        'owner', pg_get_userbyid(p.proowner),
        'security_definer', p.prosecdef,
        'anon_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
        'public_execute', has_function_privilege('public', p.oid, 'EXECUTE'),
        'authenticated_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
    ),
    '[]'::jsonb
  ) AS rows
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'demo_status'
    AND n.nspname NOT IN ('pg_catalog','information_schema')
),

target_anon_rows AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'function', p.proname,
        'arguments', pg_get_function_identity_arguments(p.oid),
        'anon_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
        'public_execute', has_function_privilege('public', p.oid, 'EXECUTE'),
        'authenticated_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
        'security_definer', p.prosecdef
      )
      ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)
    ),
    '[]'::jsonb
  ) AS rows
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (
      (p.proname = 'submit_signup_request')
      OR (p.proname = 'verify_profile_verification_otp')
      OR (p.proname = 'verify_whatsapp_password_reset')
      OR (p.proname = 'platform_heartbeat')
      OR (p.proname = 'service_categories')
      OR (p.proname = 'served_cities')
      OR (p.proname = 'get_maintenance_status')
      OR (p.proname = 'redeem_supplier_magic_link')
      OR (p.proname = 'messaging_quote_context')
      OR (p.proname = 'submit_messaging_quote')
      OR (p.proname = 'complete_supplier_onboarding_atomic')
    )
),

sensitive_rows AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'function', p.proname,
        'arguments', pg_get_function_identity_arguments(p.oid),
        'owner', pg_get_userbyid(p.proowner),
        'security_definer', p.prosecdef,
        'anon_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
        'public_execute', has_function_privilege('public', p.oid, 'EXECUTE'),
        'authenticated_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
      ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)
    ),
    '[]'::jsonb
  ) AS rows
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog','information_schema')
    AND p.proname ILIKE ANY (ARRAY[
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
),

rfq_trigger_rows AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'table', c.relname,
        'trigger', t.tgname,
        'enabled', t.tgenabled,
        'definition', pg_get_triggerdef(t.oid, true)
      )
      ORDER BY n.nspname, c.relname, t.tgname
    ),
    '[]'::jsonb
  ) AS rows
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
),

rls_table_rows AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'table', c.relname,
        'rls_enabled', c.relrowsecurity,
        'rls_forced', c.relforcerowsecurity
      )
      ORDER BY n.nspname, c.relname
    ),
    '[]'::jsonb
  ) AS rows
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind = 'r'
    AND c.relrowsecurity
    AND n.nspname NOT IN ('pg_catalog','information_schema')
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
),

rls_policy_rows AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'schema', schemaname,
        'table', tablename,
        'policy', policyname,
        'permissive', permissive,
        'roles', roles,
        'command', cmd,
        'using', qual,
        'with_check', with_check
      )
      ORDER BY schemaname, tablename, policyname
    ),
    '[]'::jsonb
  ) AS rows
  FROM pg_policies
  WHERE tablename ILIKE ANY (ARRAY[
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
),

security_definer_rows AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'schema', n.nspname,
        'function', p.proname,
        'arguments', pg_get_function_identity_arguments(p.oid),
        'owner', pg_get_userbyid(p.proowner),
        'security_definer', p.prosecdef,
        'volatility', p.provolatile,
        'leakproof', p.proleakproof
      )
      ORDER BY n.nspname, p.proname
    ),
    '[]'::jsonb
  ) AS rows
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prosecdef
    AND n.nspname NOT IN ('pg_catalog','information_schema')
)

SELECT
  jsonb_build_object(
    'MIGRATION', (SELECT rows FROM migration_rows),
    'ANON_EXECUTE', (SELECT rows FROM anon_rows),
    'PUBLIC_EXECUTE', (SELECT rows FROM public_rows),
    'DEMO_STATUS', (SELECT rows FROM demo_rows),
    'TARGET_ANON_FUNCTIONS', (SELECT rows FROM target_anon_rows),
    'SENSITIVE_FUNCTIONS', (SELECT rows FROM sensitive_rows),
    'RFQ_TRIGGERS', (SELECT rows FROM rfq_trigger_rows),
    'RLS_TABLES', (SELECT rows FROM rls_table_rows),
    'RLS_POLICIES', (SELECT rows FROM rls_policy_rows),
    'SECURITY_DEFINER_FUNCTIONS', (SELECT rows FROM security_definer_rows),
    'FINAL_COUNTS',
      jsonb_build_object(
        'application_anon_execute_count',
        (
          SELECT count(*)
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND has_function_privilege('anon', p.oid, 'EXECUTE')
        ),
        'application_public_execute_count',
        (
          SELECT count(*)
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND has_function_privilege('public', p.oid, 'EXECUTE')
        ),
        'migration_00216',
        EXISTS (
          SELECT 1 FROM supabase_migrations.schema_migrations
          WHERE version = '00216'
        ),
        'migration_00217',
        EXISTS (
          SELECT 1 FROM supabase_migrations.schema_migrations
          WHERE version = '00217'
        ),
        'migration_00218',
        EXISTS (
          SELECT 1 FROM supabase_migrations.schema_migrations
          WHERE version = '00218'
        ),
        'migration_00219',
        EXISTS (
          SELECT 1 FROM supabase_migrations.schema_migrations
          WHERE version = '00219'
        )
      )
  ) AS otp_post_00219_catalog_evidence;
