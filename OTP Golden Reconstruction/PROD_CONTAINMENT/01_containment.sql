-- =============================================================================
-- 01_containment.sql  —  EXECUTE-privilege containment for production at <=00195
-- =============================================================================
-- What it does (ONLY this):
--   * REVOKE EXECUTE on exact function signatures from PUBLIC / anon
--     (and from authenticated for the two quote simulators);
--   * re-GRANT EXECUTE to authenticated / service_role wherever that role had
--     it immediately before this script ran (so logged-in flows keep working —
--     revoking from PUBLIC would otherwise silently take it away from them);
--   * NOTIFY pgrst so the Data API picks up the change immediately.
-- What it does NOT do: no CREATE/ALTER/DROP of any function, table, policy or
-- row; no function body is touched; no data is read or written.
--
-- Idempotent: safe to run twice. A signature that does not exist is skipped
-- with a NOTICE (02_verify.sql reports it as NOT PRESENT).
-- All-or-nothing: one transaction; any error rolls the whole thing back.
--
-- Group A  simulators          -> revoke PUBLIC, anon, authenticated (keep service_role)
-- Group B  signup + admin + other RPCs main 00198-00211 revoke from anon
--                               -> revoke PUBLIC, anon (keep authenticated, service_role)
-- The stricter, flow-breaking options are in 01b_optional_strict.sql.
-- =============================================================================

BEGIN;

DO $containment$
DECLARE
  v_group_a text[] := ARRAY[
    'public.seed_simulated_quotes_for_rfq(uuid, integer)',
    'public.auto_submit_pilot_quotes(uuid)'
  ];
  v_group_b text[] := ARRAY[
    -- signup approval (00161 body treats every anon/authenticated caller as admin)
    'public.admin_review_signup_request(uuid, text, text, text)',
    'public.review_signup_request(uuid, text, text, text)',
    -- admin RPCs with always-true guards (main 00199 sweep list, every overload present at <=00195)
    'public.admin_bypass_approval_gate(uuid, text)',
    'public.admin_clear_audit_logs_and_notifications()',
    'public.admin_clear_audit_logs_and_notifications(text)',
    'public.admin_clear_notifications()',
    'public.admin_clear_notifications(text, uuid)',
    'public.admin_create_db_backup(text, text)',
    'public.admin_execute_service_action(text, text, jsonb)',
    'public.admin_fix_buyer_issue(text, text, text, text)',
    'public.admin_fix_seller_issue(text, text, text, text)',
    'public.admin_force_transition_order_state(uuid, text, text)',
    'public.admin_generate_proactive_maintenance_alerts()',
    'public.admin_get_all_notifications(integer, integer, text)',
    'public.admin_get_all_notifications(integer, integer, text, text)',
    'public.admin_get_audit_trail(text, text, integer, integer, text)',
    'public.admin_get_db_backups()',
    'public.admin_get_entity_audit_trail(text)',
    'public.admin_get_live_transactions(integer, integer, text, boolean)',
    'public.admin_get_live_transactions(integer, integer, text, boolean, text)',
    'public.admin_get_seller_orders(integer, integer, text, text)',
    'public.admin_get_seller_orders(integer, integer, text, text, text)',
    'public.admin_get_signup_requests(text)',
    'public.admin_get_support_tickets(text, text, integer, integer, text)',
    'public.admin_get_system_alerts()',
    'public.admin_get_system_health()',
    'public.admin_get_system_health(text)',
    'public.admin_get_users_and_organizations()',
    'public.admin_mark_all_notifications_read(text)',
    'public.admin_purge_all_transactional_records()',
    'public.admin_purge_all_transactional_records(text)',
    'public.admin_resolve_support_ticket(uuid, text, text)',
    'public.admin_restore_db_backup(uuid, text)',
    'public.admin_retry_invoice_payment_webhook(uuid, text)',
    'public.admin_run_buyer_diagnostics(text, text)',
    'public.admin_run_diagnostic_query(text)',
    'public.admin_run_seller_diagnostics(text, text)',
    'public.admin_run_test_case(text, text)',
    'public.admin_search_entities(text, integer)',
    'public.admin_search_entities(text, integer, text)',
    'public.admin_simulate_po_acceptance(uuid, text)',
    'public.admin_toggle_demo_mode(boolean)',
    'public.admin_toggle_entity_gst_compliance(uuid, text, boolean, boolean, text)',
    'public.admin_toggle_maintenance_mode(boolean, text)',
    'public.admin_unblock_sealed_quote(uuid, text)',
    'public.clear_all_transactional_data()',
    -- other RPCs that main 00198-00211 revoke from anon; none has a signed-out caller
    'public.admin_toggle_supplier_network_stub(boolean)',
    'public.admin_mark_notification_read(uuid)',
    'public.admin_bulk_delete_users(uuid[], boolean)',
    'public.lock_and_reveal_award_atomic(uuid, uuid, text, boolean)',
    'public.get_organization_subscription(uuid)',
    'public.get_purchase_order_invoicing_summary(uuid)',
    'public.supplier_rfq_message_payload(uuid, uuid)',
    'public.apply_tds_withholding_atomic(uuid, uuid, text, numeric, numeric, text, text, boolean, text, text)',
    'public.accept_delivery_inspection(uuid, text, numeric)',
    'public.get_current_procurement_step(uuid)',
    'public.advance_procurement_step(uuid, integer, integer, text, text, uuid, uuid, jsonb)',
    'public.create_system_notification(uuid, text, text, text, text, text, jsonb)',
    'public.request_profile_credential_otp(text, text)',
    'public.verify_and_update_profile_credential(text, text, text)',
    'public.assert_production_data_integrity()'
  ];
  v_sig  text;
  v_fn   regprocedure;
  v_auth boolean;
  v_svc  boolean;
BEGIN
  FOREACH v_sig IN ARRAY v_group_a LOOP
    v_fn := to_regprocedure(v_sig);
    IF v_fn IS NULL THEN
      RAISE NOTICE 'containment: % not present, skipped', v_sig;
      CONTINUE;
    END IF;
    v_svc := has_function_privilege('service_role', v_fn, 'EXECUTE');
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_sig);
    IF v_svc THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
    END IF;
    RAISE NOTICE 'containment A: % revoked from PUBLIC, anon, authenticated', v_sig;
  END LOOP;

  FOREACH v_sig IN ARRAY v_group_b LOOP
    v_fn := to_regprocedure(v_sig);
    IF v_fn IS NULL THEN
      RAISE NOTICE 'containment: % not present, skipped', v_sig;
      CONTINUE;
    END IF;
    v_auth := has_function_privilege('authenticated', v_fn, 'EXECUTE');
    v_svc  := has_function_privilege('service_role', v_fn, 'EXECUTE');
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', v_sig);
    IF v_auth THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_sig);
    END IF;
    IF v_svc THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
    END IF;
    RAISE NOTICE 'containment B: % revoked from PUBLIC, anon (authenticated kept=%)', v_sig, v_auth;
  END LOOP;
END
$containment$;

NOTIFY pgrst, 'reload schema';

COMMIT;
