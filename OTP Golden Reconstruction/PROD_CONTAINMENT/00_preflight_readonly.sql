-- =============================================================================
-- 00_preflight_readonly.sql  —  RUN FIRST.  READ-ONLY.
-- =============================================================================
-- One SELECT, one result grid (the Supabase SQL editor only shows the last
-- statement's result). Columns: section | item | value.
-- Nothing here writes, locks, or changes anything. Save the full output
-- (Download CSV) before running 01.
--
-- Sections
--   1 MIGRATION     what the deploy tracking tables say (both of them —
--                   scripts/deploy-migrations.ts writes public.otp_schema_migrations
--                   (version = '00195_x.sql') AND supabase_migrations.schema_migrations
--                   (version = '00195_x', no .sql); it reads the UNION of both)
--   2 SCHEMA_MARKER objects that prove which later migrations did / did not land
--   3 FUNCTION      every containment target: present? SECURITY DEFINER? who can EXECUTE
--   4 BODY          fingerprints proving the vulnerable 00161/00188 bodies are live
--   5 NEW_FN        (iii) do the 00196+/00202+/00208+ functions exist?
--   6 ENUM          supplier_verification_status labels
--   7 RUNTIME       demo_settings flags (pilot quote stub!)
--   8 ADMIN_EMAIL   hard-coded admin-allowlist emails: do they exist yet?
--   9 ROLLBACK_GEN  exact GRANT statements that recreate today's ACLs (keep this!)
-- =============================================================================

WITH
targets(grp, sig) AS (
  VALUES
  -- A. quote simulators (01 revokes PUBLIC, anon, authenticated)
  ('A_simulator', 'public.seed_simulated_quotes_for_rfq(uuid, integer)'),
  ('A_simulator', 'public.auto_submit_pilot_quotes(uuid)'),
  -- B. signup approval (01 revokes PUBLIC, anon; keeps authenticated)
  ('B_signup', 'public.admin_review_signup_request(uuid, text, text, text)'),
  ('B_signup', 'public.review_signup_request(uuid, text, text, text)'),
  -- B. admin RPCs with always-true guards (00199 sweep list; 01 revokes PUBLIC, anon)
  ('B_admin', 'public.admin_bypass_approval_gate(uuid, text)'),
  ('B_admin', 'public.admin_clear_audit_logs_and_notifications()'),
  ('B_admin', 'public.admin_clear_audit_logs_and_notifications(text)'),
  ('B_admin', 'public.admin_clear_notifications()'),
  ('B_admin', 'public.admin_clear_notifications(text, uuid)'),
  ('B_admin', 'public.admin_create_db_backup(text, text)'),
  ('B_admin', 'public.admin_execute_service_action(text, text, jsonb)'),
  ('B_admin', 'public.admin_fix_buyer_issue(text, text, text, text)'),
  ('B_admin', 'public.admin_fix_seller_issue(text, text, text, text)'),
  ('B_admin', 'public.admin_force_transition_order_state(uuid, text, text)'),
  ('B_admin', 'public.admin_generate_proactive_maintenance_alerts()'),
  ('B_admin', 'public.admin_get_all_notifications(integer, integer, text)'),
  ('B_admin', 'public.admin_get_all_notifications(integer, integer, text, text)'),
  ('B_admin', 'public.admin_get_audit_trail(text, text, integer, integer, text)'),
  ('B_admin', 'public.admin_get_db_backups()'),
  ('B_admin', 'public.admin_get_entity_audit_trail(text)'),
  ('B_admin', 'public.admin_get_live_transactions(integer, integer, text, boolean)'),
  ('B_admin', 'public.admin_get_live_transactions(integer, integer, text, boolean, text)'),
  ('B_admin', 'public.admin_get_seller_orders(integer, integer, text, text)'),
  ('B_admin', 'public.admin_get_seller_orders(integer, integer, text, text, text)'),
  ('B_admin', 'public.admin_get_signup_requests(text)'),
  ('B_admin', 'public.admin_get_support_tickets(text, text, integer, integer, text)'),
  ('B_admin', 'public.admin_get_system_alerts()'),
  ('B_admin', 'public.admin_get_system_health()'),
  ('B_admin', 'public.admin_get_system_health(text)'),
  ('B_admin', 'public.admin_get_users_and_organizations()'),
  ('B_admin', 'public.admin_mark_all_notifications_read(text)'),
  ('B_admin', 'public.admin_purge_all_transactional_records()'),
  ('B_admin', 'public.admin_purge_all_transactional_records(text)'),
  ('B_admin', 'public.admin_resolve_support_ticket(uuid, text, text)'),
  ('B_admin', 'public.admin_restore_db_backup(uuid, text)'),
  ('B_admin', 'public.admin_retry_invoice_payment_webhook(uuid, text)'),
  ('B_admin', 'public.admin_run_buyer_diagnostics(text, text)'),
  ('B_admin', 'public.admin_run_diagnostic_query(text)'),
  ('B_admin', 'public.admin_run_seller_diagnostics(text, text)'),
  ('B_admin', 'public.admin_run_test_case(text, text)'),
  ('B_admin', 'public.admin_search_entities(text, integer)'),
  ('B_admin', 'public.admin_search_entities(text, integer, text)'),
  ('B_admin', 'public.admin_simulate_po_acceptance(uuid, text)'),
  ('B_admin', 'public.admin_toggle_demo_mode(boolean)'),
  ('B_admin', 'public.admin_toggle_entity_gst_compliance(uuid, text, boolean, boolean, text)'),
  ('B_admin', 'public.admin_toggle_maintenance_mode(boolean, text)'),
  ('B_admin', 'public.admin_unblock_sealed_quote(uuid, text)'),
  ('B_admin', 'public.clear_all_transactional_data()'),
  -- B. other RPCs main 00198-00211 later revoke from anon (01 revokes PUBLIC, anon)
  ('B_other', 'public.admin_toggle_supplier_network_stub(boolean)'),
  ('B_other', 'public.admin_mark_notification_read(uuid)'),
  ('B_other', 'public.admin_bulk_delete_users(uuid[], boolean)'),
  ('B_other', 'public.lock_and_reveal_award_atomic(uuid, uuid, text, boolean)'),
  ('B_other', 'public.get_organization_subscription(uuid)'),
  ('B_other', 'public.get_purchase_order_invoicing_summary(uuid)'),
  ('B_other', 'public.supplier_rfq_message_payload(uuid, uuid)'),
  ('B_other', 'public.apply_tds_withholding_atomic(uuid, uuid, text, numeric, numeric, text, text, boolean, text, text)'),
  ('B_other', 'public.accept_delivery_inspection(uuid, text, numeric)'),
  ('B_other', 'public.get_current_procurement_step(uuid)'),
  ('B_other', 'public.advance_procurement_step(uuid, integer, integer, text, text, uuid, uuid, jsonb)'),
  ('B_other', 'public.create_system_notification(uuid, text, text, text, text, text, jsonb)'),
  ('B_other', 'public.request_profile_credential_otp(text, text)'),
  ('B_other', 'public.verify_and_update_profile_credential(text, text, text)'),
  ('B_other', 'public.assert_production_data_integrity()'),
  -- FLAGGED only (NOT touched by 01; optional in 01b — revoking breaks live flows)
  ('FLAG_otp', 'public.request_whatsapp_password_reset(text)'),
  ('FLAG_otp', 'public.request_profile_verification_otp(text)'),
  -- INFO only (never touched)
  ('INFO', 'public.discover_and_invite_for_rfq(uuid, integer, uuid[])'),
  ('INFO', 'public.demo_generate_quotes(uuid, integer, quote_status)'),
  ('INFO', 'public.demo_generate_votes(uuid)'),
  ('INFO', 'public.demo_simulate_supplier_message(uuid, text, text, jsonb, text)'),
  ('INFO', 'public.verify_whatsapp_password_reset(text, text, text)'),
  ('INFO', 'public.verify_profile_verification_otp(text, text)'),
  ('INFO', 'public.submit_signup_request(jsonb)')
),
resolved AS (
  SELECT t.grp, t.sig, to_regprocedure(t.sig) AS oid FROM targets t
),
fn AS (
  SELECT r.grp, r.sig, r.oid, p.prosecdef, p.proowner,
         COALESCE(p.proacl, acldefault('f', p.proowner)) AS acl,
         p.proacl
  FROM resolved r LEFT JOIN pg_proc p ON p.oid = r.oid
),
mig_otp AS (
  SELECT (xpath('/row/version/text()', x))[1]::text AS version,
         (xpath('/row/applied_at/text()', x))[1]::text AS stamp
  FROM unnest(xpath('/table/row', query_to_xml(
    CASE WHEN to_regclass('public.otp_schema_migrations') IS NOT NULL
         THEN 'SELECT version, applied_at::text AS applied_at FROM public.otp_schema_migrations'
         ELSE 'SELECT NULL::text AS version, NULL::text AS applied_at WHERE false' END,
    true, false, ''))) AS x
),
mig_sb AS (
  SELECT (xpath('/row/version/text()', x))[1]::text AS version,
         (xpath('/row/name/text()', x))[1]::text AS stamp
  FROM unnest(xpath('/table/row', query_to_xml(
    CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NOT NULL
         THEN 'SELECT m.version, to_jsonb(m)->>''name'' AS name FROM supabase_migrations.schema_migrations m'
         ELSE 'SELECT NULL::text AS version, NULL::text AS name WHERE false' END,
    true, false, ''))) AS x
),
mig_all AS (
  SELECT left(btrim(version), 5) AS num, 'otp_schema_migrations' AS src, version, stamp FROM mig_otp
  UNION ALL
  SELECT left(btrim(version), 5), 'supabase_migrations.schema_migrations', version, stamp FROM mig_sb
),
rows AS (
  -- 1. MIGRATION ------------------------------------------------------------
  SELECT 10 AS o, '1 MIGRATION' AS section, 'tracking tables present' AS item,
         'otp_schema_migrations=' || (to_regclass('public.otp_schema_migrations') IS NOT NULL)
         || ', supabase_migrations.schema_migrations=' || (to_regclass('supabase_migrations.schema_migrations') IS NOT NULL) AS value
  UNION ALL
  SELECT 11, '1 MIGRATION', 'summary: ' || src,
         'rows=' || count(*) || ', highest=' || COALESCE(max(version), '(none)')
  FROM mig_all GROUP BY src
  UNION ALL
  SELECT 12, '1 MIGRATION', 'migrations 00196..00211 recorded (either table)',
         COALESCE(string_agg(DISTINCT num, ', ' ORDER BY num), 'NONE  (consistent with prod stuck at <=00195)')
  FROM mig_all WHERE num ~ '^\d{5}$' AND num::int BETWEEN 196 AND 211
  UNION ALL
  SELECT * FROM (
    SELECT 13, '1 MIGRATION', 'last 20: ' || src, version || COALESCE('  [' || stamp || ']', '')
    FROM (SELECT *, row_number() OVER (PARTITION BY src ORDER BY version DESC) rn FROM mig_all) z
    WHERE rn <= 20
  ) last20

  -- 2. SCHEMA_MARKER --------------------------------------------------------
  UNION ALL
  SELECT 20, '2 SCHEMA_MARKER', 'organization_invitations.role column exists (00190; makes main 00196 fail)',
         (EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'organization_invitations' AND column_name = 'role'))::text
  UNION ALL
  SELECT 21, '2 SCHEMA_MARKER', 'private.seed_simulated_quotes_for_rfq_impl exists (would mean 00198 applied)',
         (to_regprocedure('private.seed_simulated_quotes_for_rfq_impl(uuid, integer)') IS NOT NULL)::text
  UNION ALL
  SELECT 22, '2 SCHEMA_MARKER', 'private.assert_synthetic_quotes_allowed exists (00198)',
         (to_regprocedure('private.assert_synthetic_quotes_allowed(uuid)') IS NOT NULL)::text

  -- 3. FUNCTION -------------------------------------------------------------
  UNION ALL
  SELECT 30, '3 FUNCTION', grp || ' | ' || sig,
         CASE WHEN oid IS NULL THEN 'NOT PRESENT'
         ELSE 'secdef=' || prosecdef
           || ' anon=' || has_function_privilege('anon', oid, 'EXECUTE')
           || ' authenticated=' || has_function_privilege('authenticated', oid, 'EXECUTE')
           || ' service_role=' || has_function_privilege('service_role', oid, 'EXECUTE')
           || ' PUBLIC=' || EXISTS (SELECT 1 FROM aclexplode(acl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
           || ' proacl=' || COALESCE(proacl::text, 'NULL(default: PUBLIC can execute)')
         END
  FROM fn

  -- 4. BODY -----------------------------------------------------------------
  UNION ALL
  SELECT 40, '4 BODY', 'admin_review_signup_request has 00161 fallback (auth.role() IN (authenticated, anon) => admin)',
         COALESCE((SELECT (pg_get_functiondef(p) ~* 'auth\.role\(\)\s+IN\s*\(\s*''authenticated''\s*,\s*''anon''\s*\)')::text
                   FROM to_regprocedure('public.admin_review_signup_request(uuid, text, text, text)') p WHERE p IS NOT NULL), 'NOT PRESENT')
  UNION ALL
  SELECT 41, '4 BODY', 'review_signup_request delegates to admin_review_signup_request (alias bypass if only one is revoked)',
         COALESCE((SELECT (pg_get_functiondef(p) ~* 'admin_review_signup_request')::text
                   FROM to_regprocedure('public.review_signup_request(uuid, text, text, text)') p WHERE p IS NOT NULL), 'NOT PRESENT')
  UNION ALL
  SELECT 42, '4 BODY', 'seed_simulated_quotes_for_rfq is the unguarded 00188 body (writes simulated=true, no admin/is_demo guard)',
         COALESCE((SELECT (pg_get_functiondef(p) ~* '''simulated'',\s*true'
                           AND pg_get_functiondef(p) !~* 'assert_synthetic_quotes_allowed')::text
                   FROM to_regprocedure('public.seed_simulated_quotes_for_rfq(uuid, integer)') p WHERE p IS NOT NULL), 'NOT PRESENT')
  UNION ALL
  SELECT 43, '4 BODY', 'auto_submit_pilot_quotes is the unguarded 00188 body (writes simulated=FALSE on REAL rfqs)',
         COALESCE((SELECT (pg_get_functiondef(p) ~* '''simulated'',\s*false'
                           AND pg_get_functiondef(p) !~* 'assert_synthetic_quotes_allowed')::text
                   FROM to_regprocedure('public.auto_submit_pilot_quotes(uuid)') p WHERE p IS NOT NULL), 'NOT PRESENT')
  UNION ALL
  SELECT 44, '4 BODY', 'discover_and_invite_for_rfq still calls auto_submit_pilot_quotes when stub is on (pre-00198)',
         COALESCE((SELECT (pg_get_functiondef(p) ~* 'SELECT\s+public\.auto_submit_pilot_quotes')::text
                   FROM to_regprocedure('public.discover_and_invite_for_rfq(uuid, integer, uuid[])') p WHERE p IS NOT NULL), 'NOT PRESENT')
  UNION ALL
  SELECT 45, '4 BODY', 'admin_run_diagnostic_query guard is always-true for anon/authenticated',
         COALESCE((SELECT (pg_get_functiondef(p) ~* 'OR\s+auth\.role\(\)\s*=\s*''anon''')::text
                   FROM to_regprocedure('public.admin_run_diagnostic_query(text)') p WHERE p IS NOT NULL), 'NOT PRESENT')
  UNION ALL
  SELECT 46, '4 BODY', 'request_whatsapp_password_reset returns the plaintext otp_code to the caller',
         COALESCE((SELECT (pg_get_functiondef(p) ~* '''otp_code''\s*,\s*v_')::text
                   FROM to_regprocedure('public.request_whatsapp_password_reset(text)') p WHERE p IS NOT NULL), 'NOT PRESENT')
  UNION ALL
  SELECT 47, '4 BODY', 'request_profile_verification_otp returns the plaintext otp_code to the caller',
         COALESCE((SELECT (pg_get_functiondef(p) ~* '''otp_code''\s*,\s*v_')::text
                   FROM to_regprocedure('public.request_profile_verification_otp(text)') p WHERE p IS NOT NULL), 'NOT PRESENT')
  UNION ALL
  SELECT 48, '4 BODY', 'all anon-executable SECURITY DEFINER public fns with an always-true auth.role() guard (count)',
         count(*)::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND (pg_get_functiondef(p.oid) ~* 'OR\s+auth\.role\(\)\s*=\s*''(authenticated|anon)'''
         OR pg_get_functiondef(p.oid) ~* 'auth\.role\(\)\s+IN\s*\(\s*''authenticated''\s*,\s*''anon''\s*\)')

  -- 5. NEW_FN (iii) ---------------------------------------------------------
  UNION ALL
  SELECT 50, '5 NEW_FN', nm,
         COALESCE((SELECT string_agg(p.oid::regprocedure::text, ' ; ')
                   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = nm), 'NOT PRESENT')
  FROM unnest(ARRAY['upsert_buyer_address_atomic', 'get_buyer_addresses', 'issue_activation_credential_otp',
                    'issue_profile_credential_otp', 'log_client_audit_event']) AS nm

  -- 6. ENUM -----------------------------------------------------------------
  UNION ALL
  SELECT 60, '6 ENUM', 'supplier_verification_status labels (in sort order)',
         COALESCE((SELECT string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
                   FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                   WHERE t.typname = 'supplier_verification_status'), 'TYPE NOT PRESENT')
  UNION ALL
  SELECT 61, '6 ENUM', 'suppliers.verification_status distribution',
         COALESCE((SELECT string_agg(k || '=' || c, ', ' ORDER BY k)
                   FROM (SELECT verification_status::text k, count(*) c FROM public.suppliers GROUP BY 1) z), '(no suppliers)')

  -- 7. RUNTIME --------------------------------------------------------------
  UNION ALL
  SELECT 70, '7 RUNTIME', 'demo_settings rows (supplier_network_stub_enabled=true means every real-RFQ discovery fabricates quotes)',
         COALESCE((SELECT string_agg(to_jsonb(d)::text, ' | ') FROM public.demo_settings d), 'NO ROW (<=00195 stub function then defaults to TRUE)')

  -- 8. ADMIN_EMAIL ----------------------------------------------------------
  UNION ALL
  SELECT 80, '8 ADMIN_EMAIL', e,
         'auth.users=' || EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = e)
         || ', profiles=' || EXISTS (SELECT 1 FROM public.profiles p WHERE lower(p.email) = e)
         || ', signup_requests=' || COALESCE((SELECT string_agg(s.status::text || '@' || s.created_at::date, ',')
                                              FROM public.signup_requests s WHERE lower(s.email) = e), 'none')
  FROM unnest(ARRAY['admin@otp.test', 'bvnbasu@gmail.com', 'ops@otp.test', 'superadmin@otp.test',
                    'admin@otp.ai', 'ops@otp.ai', 'admin@procureos.test']) AS e

  -- 9. ROLLBACK_GEN ---------------------------------------------------------
  UNION ALL
  SELECT 90, '9 ROLLBACK_GEN', sig,
         'GRANT EXECUTE ON FUNCTION ' || sig || ' TO '
         || string_agg(CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END, ', '
                       ORDER BY a.grantee) || ';'
  FROM fn, aclexplode(fn.acl) a
  WHERE fn.oid IS NOT NULL AND fn.grp <> 'INFO' AND a.privilege_type = 'EXECUTE' AND a.grantee <> fn.proowner
  GROUP BY sig, oid
)
SELECT section, item, value FROM rows ORDER BY o, section, item, value;
