-- =============================================================================
-- 03_rollback.sql  —  undo 01_containment.sql AND every section of 01b.
-- =============================================================================
-- Re-grants EXECUTE to PUBLIC, anon, authenticated, service_role on every
-- signature 01/01b touched. That is exactly the pre-containment ACL produced
-- by migrations <=00195 (every target was
--   {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}).
-- GRANT is idempotent, so running this when 01b was never applied is harmless.
--
-- CHECK FIRST: in the saved 00_preflight output, section "9 ROLLBACK_GEN".
-- If every line there ends "TO PUBLIC, anon, authenticated, service_role;",
-- this file restores the pre-containment state exactly. If any line differs,
-- run those saved GRANT lines instead of this file for those functions.
--
-- S4 (stub flag) is a data change and is NOT undone automatically — see bottom.
-- =============================================================================

BEGIN;

DO $rollback$
DECLARE
  v_sigs text[] := ARRAY[
    -- 01 group A
    'public.seed_simulated_quotes_for_rfq(uuid, integer)',
    'public.auto_submit_pilot_quotes(uuid)',
    -- 01 group B
    'public.admin_review_signup_request(uuid, text, text, text)',
    'public.review_signup_request(uuid, text, text, text)',
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
    'public.assert_production_data_integrity()',
    -- 01b S3 (the only 01b signatures not already listed above)
    'public.request_whatsapp_password_reset(text)',
    'public.request_profile_verification_otp(text)'
  ];
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY v_sigs LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE NOTICE 'rollback: % not present, skipped', v_sig;
      CONTINUE;
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC, anon, authenticated, service_role', v_sig);
  END LOOP;
END
$rollback$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- -----------------------------------------------------------------------------
-- S4 undo (ONLY if you ran 01b S4). Put back the value recorded in 00 section 7:
--
--   UPDATE public.demo_settings SET supplier_network_stub_enabled = true, updated_at = now() WHERE id;
--
-- If 00 section 7 said "NO ROW", the pre-S4 state was "no row"; restoring it
-- exactly would be   DELETE FROM public.demo_settings WHERE id;   — only do
-- that if nothing else has written to demo_settings since.
-- -----------------------------------------------------------------------------
