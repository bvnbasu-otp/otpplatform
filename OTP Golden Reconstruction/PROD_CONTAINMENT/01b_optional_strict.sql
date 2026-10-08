-- =============================================================================
-- 01b_optional_strict.sql  —  OPTIONAL.  Each section BREAKS a live flow.
-- =============================================================================
-- Run 01_containment.sql first. Then run ONLY the sections you decide to
-- accept (highlight one section, Run). Each section is its own transaction
-- and is idempotent. 03_rollback.sql undoes every section of this file too.
--
-- S1  signup approval: revoke authenticated
-- S2  destructive / privilege-granting admin RPCs: revoke authenticated
-- S3  plaintext-OTP RPCs: revoke anon (+ authenticated)
-- S4  DATA CHANGE: turn the pilot-quote stub off
-- =============================================================================


-- -----------------------------------------------------------------------------
-- S1. admin_review_signup_request / review_signup_request: authenticated too
-- -----------------------------------------------------------------------------
-- Closes: any signed-in user approving any pending signup (and setting the new
--         account's password via p_initial_password, including for an
--         admin-allowlisted email that has no account yet => platform admin).
-- Breaks: the Approve / Reject buttons in the admin console. While S1 is in
--         force, approve from the SQL editor instead (session_user = postgres
--         satisfies private.is_platform_admin() at <=00195):
--
--   select public.admin_review_signup_request(
--     '<signup_request uuid>'::uuid, 'APPROVE',
--     'Approved via SQL editor during containment',
--     '<one-off temporary password>');
--
BEGIN;
DO $s1$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.admin_review_signup_request(uuid, text, text, text)',
    'public.review_signup_request(uuid, text, text, text)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE NOTICE 'S1: % not present, skipped', v_sig;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
  END LOOP;
END
$s1$;
NOTIFY pgrst, 'reload schema';
COMMIT;


-- -----------------------------------------------------------------------------
-- S2. Destructive / escalation admin RPCs: authenticated too
-- -----------------------------------------------------------------------------
-- At <=00195 each of these accepts ANY signed-in user as admin
-- (`OR auth.role() = 'authenticated'`). 01 only closed the anon path.
-- admin_run_diagnostic_query runs arbitrary SELECT/WITH as the function owner
-- (reads auth.users, every table, and can call any other function).
-- Breaks: the matching admin-console buttons (SQL diagnostic terminal, purge,
--         restore backup, bulk delete users, service actions, clear audit logs,
--         simulate PO acceptance, force order state, bypass approval gate,
--         supplier-network-stub toggle, demo-mode toggle). Admins can still do
--         these from the SQL editor.
BEGIN;
DO $s2$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.admin_run_diagnostic_query(text)',
    'public.admin_purge_all_transactional_records()',
    'public.admin_purge_all_transactional_records(text)',
    'public.clear_all_transactional_data()',
    'public.admin_restore_db_backup(uuid, text)',
    'public.admin_bulk_delete_users(uuid[], boolean)',
    'public.admin_execute_service_action(text, text, jsonb)',
    'public.admin_clear_audit_logs_and_notifications()',
    'public.admin_clear_audit_logs_and_notifications(text)',
    'public.admin_simulate_po_acceptance(uuid, text)',
    'public.admin_force_transition_order_state(uuid, text, text)',
    'public.admin_bypass_approval_gate(uuid, text)',
    'public.admin_toggle_supplier_network_stub(boolean)',
    'public.admin_toggle_demo_mode(boolean)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE NOTICE 'S2: % not present, skipped', v_sig;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
  END LOOP;
END
$s2$;
NOTIFY pgrst, 'reload schema';
COMMIT;


-- -----------------------------------------------------------------------------
-- S3. Plaintext-OTP RPCs
-- -----------------------------------------------------------------------------
-- At <=00195 these return the generated OTP code in the RPC response:
--   request_whatsapp_password_reset(text)   anon: request reset for ANY phone/email,
--        read the code, then verify_whatsapp_password_reset => account takeover
--   request_profile_verification_otp(text)  anon: code returned, verification is moot
--   request_profile_credential_otp(text,text) authenticated: link any phone/email
-- Breaks (on a <=00195 backend, where the otp-dispatch edge-function path has
-- no issue_* SQL functions to call):
--   * "Forgot password" via WhatsApp/SMS/email OTP
--   * signup contact verification OTP (portal/api/signup.ts in the previous frontend)
--   * profile phone/email change OTP
BEGIN;
DO $s3$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.request_whatsapp_password_reset(text)',
    'public.request_profile_verification_otp(text)',
    'public.request_profile_credential_otp(text, text)'
  ] LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE NOTICE 'S3: % not present, skipped', v_sig;
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
  END LOOP;
END
$s3$;
NOTIFY pgrst, 'reload schema';
COMMIT;


-- -----------------------------------------------------------------------------
-- S4. DATA CHANGE — pilot supplier-network stub OFF
-- -----------------------------------------------------------------------------
-- 01 cannot stop this path: at <=00195 discover_and_invite_for_rfq (called by
-- every buyer's "find suppliers") runs as its owner and calls
-- auto_submit_pilot_quotes whenever private.supplier_network_stub_enabled() is
-- true — which is also the default when demo_settings has no row. Those
-- quotes are stored with snapshot.simulated = false (indistinguishable from
-- real bids except by their fixed note texts; see 04).
-- Record the current value from 00 section 7 before running this.
-- Breaks: nothing a real user relies on; pilot RFQs stop receiving auto quotes.
-- Undo:   see 03_rollback.sql, S4.
BEGIN;
INSERT INTO public.demo_settings (id, supplier_network_stub_enabled, updated_at)
VALUES (true, false, now())
ON CONFLICT (id) DO UPDATE
SET supplier_network_stub_enabled = false,
    updated_at = now();
COMMIT;
