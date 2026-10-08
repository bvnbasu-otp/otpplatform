-- =============================================================================
-- 02_verify.sql  —  READ-ONLY.  Run after 01 (and after 01b / 03 if used).
-- =============================================================================
-- One result grid: check | signature | status | detail
--   status for 01 targets:  CONTAINED | EXPOSED | NOT PRESENT
--   status for 01b targets: APPLIED | NOT APPLIED | NOT PRESENT
--   first row = overall verdict for 01.
-- Expected right after 01:            verdict "01 CONTAINED: n/n", 0 EXPOSED.
-- Expected right after 03_rollback:   verdict "01 NOT IN EFFECT", every 01 row EXPOSED,
--                                     every 01b row NOT APPLIED.
-- =============================================================================

WITH
targets(chk, grp, sig) AS (
  VALUES
  ('01', 'A', 'public.seed_simulated_quotes_for_rfq(uuid, integer)'),
  ('01', 'A', 'public.auto_submit_pilot_quotes(uuid)'),
  ('01', 'B', 'public.admin_review_signup_request(uuid, text, text, text)'),
  ('01', 'B', 'public.review_signup_request(uuid, text, text, text)'),
  ('01', 'B', 'public.admin_bypass_approval_gate(uuid, text)'),
  ('01', 'B', 'public.admin_clear_audit_logs_and_notifications()'),
  ('01', 'B', 'public.admin_clear_audit_logs_and_notifications(text)'),
  ('01', 'B', 'public.admin_clear_notifications()'),
  ('01', 'B', 'public.admin_clear_notifications(text, uuid)'),
  ('01', 'B', 'public.admin_create_db_backup(text, text)'),
  ('01', 'B', 'public.admin_execute_service_action(text, text, jsonb)'),
  ('01', 'B', 'public.admin_fix_buyer_issue(text, text, text, text)'),
  ('01', 'B', 'public.admin_fix_seller_issue(text, text, text, text)'),
  ('01', 'B', 'public.admin_force_transition_order_state(uuid, text, text)'),
  ('01', 'B', 'public.admin_generate_proactive_maintenance_alerts()'),
  ('01', 'B', 'public.admin_get_all_notifications(integer, integer, text)'),
  ('01', 'B', 'public.admin_get_all_notifications(integer, integer, text, text)'),
  ('01', 'B', 'public.admin_get_audit_trail(text, text, integer, integer, text)'),
  ('01', 'B', 'public.admin_get_db_backups()'),
  ('01', 'B', 'public.admin_get_entity_audit_trail(text)'),
  ('01', 'B', 'public.admin_get_live_transactions(integer, integer, text, boolean)'),
  ('01', 'B', 'public.admin_get_live_transactions(integer, integer, text, boolean, text)'),
  ('01', 'B', 'public.admin_get_seller_orders(integer, integer, text, text)'),
  ('01', 'B', 'public.admin_get_seller_orders(integer, integer, text, text, text)'),
  ('01', 'B', 'public.admin_get_signup_requests(text)'),
  ('01', 'B', 'public.admin_get_support_tickets(text, text, integer, integer, text)'),
  ('01', 'B', 'public.admin_get_system_alerts()'),
  ('01', 'B', 'public.admin_get_system_health()'),
  ('01', 'B', 'public.admin_get_system_health(text)'),
  ('01', 'B', 'public.admin_get_users_and_organizations()'),
  ('01', 'B', 'public.admin_mark_all_notifications_read(text)'),
  ('01', 'B', 'public.admin_purge_all_transactional_records()'),
  ('01', 'B', 'public.admin_purge_all_transactional_records(text)'),
  ('01', 'B', 'public.admin_resolve_support_ticket(uuid, text, text)'),
  ('01', 'B', 'public.admin_restore_db_backup(uuid, text)'),
  ('01', 'B', 'public.admin_retry_invoice_payment_webhook(uuid, text)'),
  ('01', 'B', 'public.admin_run_buyer_diagnostics(text, text)'),
  ('01', 'B', 'public.admin_run_diagnostic_query(text)'),
  ('01', 'B', 'public.admin_run_seller_diagnostics(text, text)'),
  ('01', 'B', 'public.admin_run_test_case(text, text)'),
  ('01', 'B', 'public.admin_search_entities(text, integer)'),
  ('01', 'B', 'public.admin_search_entities(text, integer, text)'),
  ('01', 'B', 'public.admin_simulate_po_acceptance(uuid, text)'),
  ('01', 'B', 'public.admin_toggle_demo_mode(boolean)'),
  ('01', 'B', 'public.admin_toggle_entity_gst_compliance(uuid, text, boolean, boolean, text)'),
  ('01', 'B', 'public.admin_toggle_maintenance_mode(boolean, text)'),
  ('01', 'B', 'public.admin_unblock_sealed_quote(uuid, text)'),
  ('01', 'B', 'public.clear_all_transactional_data()'),
  ('01', 'B', 'public.admin_toggle_supplier_network_stub(boolean)'),
  ('01', 'B', 'public.admin_mark_notification_read(uuid)'),
  ('01', 'B', 'public.admin_bulk_delete_users(uuid[], boolean)'),
  ('01', 'B', 'public.lock_and_reveal_award_atomic(uuid, uuid, text, boolean)'),
  ('01', 'B', 'public.get_organization_subscription(uuid)'),
  ('01', 'B', 'public.get_purchase_order_invoicing_summary(uuid)'),
  ('01', 'B', 'public.supplier_rfq_message_payload(uuid, uuid)'),
  ('01', 'B', 'public.apply_tds_withholding_atomic(uuid, uuid, text, numeric, numeric, text, text, boolean, text, text)'),
  ('01', 'B', 'public.accept_delivery_inspection(uuid, text, numeric)'),
  ('01', 'B', 'public.get_current_procurement_step(uuid)'),
  ('01', 'B', 'public.advance_procurement_step(uuid, integer, integer, text, text, uuid, uuid, jsonb)'),
  ('01', 'B', 'public.create_system_notification(uuid, text, text, text, text, text, jsonb)'),
  ('01', 'B', 'public.request_profile_credential_otp(text, text)'),
  ('01', 'B', 'public.verify_and_update_profile_credential(text, text, text)'),
  ('01', 'B', 'public.assert_production_data_integrity()'),
  -- 01b: "applied" means authenticated (S1/S2) or anon+authenticated (S3) no longer execute
  ('01b', 'S1', 'public.admin_review_signup_request(uuid, text, text, text)'),
  ('01b', 'S1', 'public.review_signup_request(uuid, text, text, text)'),
  ('01b', 'S2', 'public.admin_run_diagnostic_query(text)'),
  ('01b', 'S2', 'public.admin_purge_all_transactional_records()'),
  ('01b', 'S2', 'public.admin_purge_all_transactional_records(text)'),
  ('01b', 'S2', 'public.clear_all_transactional_data()'),
  ('01b', 'S2', 'public.admin_restore_db_backup(uuid, text)'),
  ('01b', 'S2', 'public.admin_bulk_delete_users(uuid[], boolean)'),
  ('01b', 'S2', 'public.admin_execute_service_action(text, text, jsonb)'),
  ('01b', 'S2', 'public.admin_clear_audit_logs_and_notifications()'),
  ('01b', 'S2', 'public.admin_clear_audit_logs_and_notifications(text)'),
  ('01b', 'S2', 'public.admin_simulate_po_acceptance(uuid, text)'),
  ('01b', 'S2', 'public.admin_force_transition_order_state(uuid, text, text)'),
  ('01b', 'S2', 'public.admin_bypass_approval_gate(uuid, text)'),
  ('01b', 'S2', 'public.admin_toggle_supplier_network_stub(boolean)'),
  ('01b', 'S2', 'public.admin_toggle_demo_mode(boolean)'),
  ('01b', 'S3', 'public.request_whatsapp_password_reset(text)'),
  ('01b', 'S3', 'public.request_profile_verification_otp(text)'),
  ('01b', 'S3', 'public.request_profile_credential_otp(text, text)')
),
fn AS (
  SELECT t.*, to_regprocedure(t.sig) AS oid FROM targets t
),
st AS (
  SELECT f.*,
         has_function_privilege('anon',          f.oid, 'EXECUTE') AS anon_x,
         has_function_privilege('authenticated', f.oid, 'EXECUTE') AS auth_x,
         has_function_privilege('service_role',  f.oid, 'EXECUTE') AS svc_x,
         EXISTS (SELECT 1 FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
                 WHERE p.oid = f.oid AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_x
  FROM fn f WHERE f.oid IS NOT NULL
),
res AS (
  SELECT chk, grp, sig,
         CASE
           WHEN chk = '01' AND grp = 'A' AND NOT anon_x AND NOT auth_x AND NOT public_x THEN 'CONTAINED'
           WHEN chk = '01' AND grp = 'B' AND NOT anon_x AND NOT public_x              THEN 'CONTAINED'
           WHEN chk = '01'                                                            THEN 'EXPOSED'
           WHEN grp IN ('S1', 'S2') AND NOT auth_x AND NOT anon_x                     THEN 'APPLIED'
           WHEN grp = 'S3' AND NOT auth_x AND NOT anon_x AND NOT public_x             THEN 'APPLIED'
           ELSE 'NOT APPLIED'
         END AS status,
         'anon=' || anon_x || ' authenticated=' || auth_x || ' service_role=' || svc_x || ' PUBLIC=' || public_x AS detail
  FROM st
  UNION ALL
  SELECT chk, grp, sig, 'NOT PRESENT', '' FROM fn WHERE oid IS NULL
)
SELECT 0 AS o, 'VERDICT' AS check_group, '01_containment' AS signature,
       CASE WHEN count(*) FILTER (WHERE status = 'EXPOSED') = 0
            THEN '01 CONTAINED: ' || count(*) FILTER (WHERE status = 'CONTAINED') || '/' || count(*) FILTER (WHERE status <> 'NOT PRESENT')
            WHEN count(*) FILTER (WHERE status = 'CONTAINED') = 0
            THEN '01 NOT IN EFFECT: ' || count(*) FILTER (WHERE status = 'EXPOSED') || ' exposed'
            ELSE '01 PARTIAL: ' || count(*) FILTER (WHERE status = 'EXPOSED') || ' still exposed' END AS status,
       'not present: ' || count(*) FILTER (WHERE status = 'NOT PRESENT') AS detail
FROM res WHERE chk = '01'
UNION ALL
SELECT 1, '01b S4 stub', 'demo_settings.supplier_network_stub_enabled',
       CASE WHEN EXISTS (SELECT 1 FROM public.demo_settings WHERE supplier_network_stub_enabled IS FALSE) THEN 'APPLIED (stub off)'
            ELSE 'NOT APPLIED (stub on or no row => on)' END,
       COALESCE((SELECT string_agg('stub=' || COALESCE(supplier_network_stub_enabled::text, 'null'), ',') FROM public.demo_settings), 'no row')
UNION ALL
SELECT CASE chk WHEN '01' THEN 2 ELSE 3 END, chk || ' ' || grp, sig, status, detail FROM res
ORDER BY 1, 2, 3;
