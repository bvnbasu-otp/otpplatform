SELECT
  'MIGRATION' AS section,
  version || ' | ' || name AS evidence
FROM supabase_migrations.schema_migrations
WHERE version IN ('00216','00217','00218','00219')

UNION ALL

SELECT
  'ANON_EXECUTE',
  n.nspname || '.' ||
  p.proname || '(' ||
  pg_get_function_identity_arguments(p.oid) ||
  ') | anon=TRUE'
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND has_function_privilege('anon', p.oid, 'EXECUTE')

UNION ALL

SELECT
  'PUBLIC_EXECUTE',
  n.nspname || '.' ||
  p.proname || '(' ||
  pg_get_function_identity_arguments(p.oid) ||
  ') | public=TRUE'
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND has_function_privilege('public', p.oid, 'EXECUTE')

UNION ALL

SELECT
  'DEMO_STATUS',
  n.nspname || '.' ||
  p.proname || '(' ||
  pg_get_function_identity_arguments(p.oid) ||
  ')' ||
  ' | anon=' || has_function_privilege('anon', p.oid, 'EXECUTE') ||
  ' | public=' || has_function_privilege('public', p.oid, 'EXECUTE') ||
  ' | authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE') ||
  ' | security_definer=' || p.prosecdef
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'demo_status'

UNION ALL

SELECT
  'TARGET_FUNCTION',
  n.nspname || '.' ||
  p.proname || '(' ||
  pg_get_function_identity_arguments(p.oid) ||
  ')' ||
  ' | anon=' || has_function_privilege('anon', p.oid, 'EXECUTE') ||
  ' | public=' || has_function_privilege('public', p.oid, 'EXECUTE') ||
  ' | authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE') ||
  ' | security_definer=' || p.prosecdef
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'submit_signup_request',
    'verify_profile_verification_otp',
    'verify_whatsapp_password_reset',
    'platform_heartbeat',
    'service_categories',
    'served_cities',
    'get_maintenance_status',
    'redeem_supplier_magic_link',
    'messaging_quote_context',
    'submit_messaging_quote',
    'complete_supplier_onboarding_atomic'
  )

UNION ALL

SELECT
  'RFQ_TRIGGER',
  n.nspname || '.' || c.relname ||
  ' | trigger=' || t.tgname ||
  ' | ' || pg_get_triggerdef(t.oid, true)
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

UNION ALL

SELECT
  'RLS_TABLE',
  n.nspname || '.' || c.relname ||
  ' | rls=' || c.relrowsecurity ||
  ' | forced=' || c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND c.relrowsecurity
  AND n.nspname = 'public'
  AND c.relname ILIKE ANY (ARRAY[
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

UNION ALL

SELECT
  'FINAL_COUNT',
  'public application anon EXECUTE count = ' ||
  (
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  )

UNION ALL

SELECT
  'FINAL_COUNT',
  'public application PUBLIC EXECUTE count = ' ||
  (
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND has_function_privilege('public', p.oid, 'EXECUTE')
  )

ORDER BY section, evidence;
