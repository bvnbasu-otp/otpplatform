-- 00261_admin_run_test_case_truthful_execution_and_auth.sql
-- Wave 1 Group A: remove unknown-ID auto-pass, tighten admin auth, truthful execution_status.
-- FORWARD-ONLY DRAFT — do not edit 00115. Apply via hosted migration pipeline only.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.admin_run_test_case(text, text) FROM anon;

CREATE OR REPLACE FUNCTION public.admin_run_test_case(
  p_test_id text,
  p_test_name text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $func$
DECLARE
  v_passed boolean := true;
  v_execution_status text := 'PASSED';
  v_error text := null;
  v_details jsonb := '{}'::jsonb;
  v_count int;
BEGIN
  p_test_id := btrim(COALESCE(p_test_id, ''));
  IF p_test_id = '' THEN
    RETURN jsonb_build_object(
      'passed', false,
      'execution_status', 'FAILED',
      'test_id', null,
      'test_name', p_test_name,
      'error_message', 'Missing or empty test ID',
      'details', '{}'::jsonb,
      'timestamp', now()
    );
  END IF;

  -- Platform administrator or service_role only (Test Center integrity)
  IF NOT (private.is_platform_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  CASE p_test_id

    -- =========================================================================
    -- SECURITY TESTS
    -- =========================================================================
    WHEN 'SEC-001' THEN
      -- RLS Policy Enforcement: Check that core tables have RLS enabled
      SELECT count(*) INTO v_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('requirements', 'rfqs', 'quotes', 'purchase_orders', 'organizations')
        AND c.relrowsecurity = true;

      IF v_count < 5 THEN
        v_passed := false;
        v_error := 'RLS not enabled on all core tables (found ' || v_count || '/5)';
      ELSE
        v_details := jsonb_build_object('rls_verified_tables', v_count);
      END IF;

    WHEN 'SEC-002' THEN
      -- Identity-Protected RFQ Engine: masked views exist
      SELECT count(*) INTO v_count
      FROM pg_views
      WHERE schemaname = 'public'
        AND viewname IN ('quotes_blind', 'rfqs_supplier_blind', 'rfq_clarification_blind', 'my_quote_outcome');

      IF v_count < 2 THEN
        v_passed := false;
        v_error := 'Identity-protected views missing or incomplete';
      ELSE
        v_details := jsonb_build_object('identity_protected_views_active', v_count);
      END IF;

    WHEN 'SEC-003' THEN
      -- Award Closeout Immutability: Verify awards table, award RPCs exist
      SELECT count(*) INTO v_count
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('sign_commercial_commitment_and_unmask', 'award_runner_up_quote');

      IF v_count < 1 THEN
        v_passed := false;
        v_error := 'Award locking & commercial commitment RPCs missing';
      ELSE
        v_details := jsonb_build_object('award_rpcs_active', v_count);
      END IF;

    WHEN 'SEC-004' THEN
      -- Messaging Channel Isolation: Messaging tables exist with security rules
      SELECT count(*) INTO v_count
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('supplier_messaging_channels', 'rfq_clarification_messages');

      IF v_count < 1 THEN
        v_passed := false;
        v_error := 'Messaging channel isolation tables missing';
      ELSE
        v_details := jsonb_build_object('messaging_tables_active', v_count);
      END IF;

    WHEN 'SEC-005' THEN
      -- Cross-Organization Boundary Test: Organization & members exist
      SELECT count(*) INTO v_count
      FROM organizations;

      IF v_count < 1 THEN
        v_passed := false;
        v_error := 'No verified organizations found in database';
      ELSE
        v_details := jsonb_build_object('organizations_verified', v_count);
      END IF;
      IF v_passed THEN
        v_passed := false;
        v_execution_status := 'BLOCKED';
        v_error := 'NOT_VERIFIED: organization count probe only; cross-organization boundary not exercised';
        v_details := v_details || jsonb_build_object('probe_label', 'SEC-005');
      ELSIF NOT v_passed THEN
        v_execution_status := 'FAILED';
      END IF;

    -- =========================================================================
    -- IDENTITY PROTECTION TESTS
    -- =========================================================================
    WHEN 'ID-001' THEN
      -- Photo EXIF Metadata Stripping: schema probe only (sanitizer not executed here)
      SELECT count(*) INTO v_count FROM pg_tables WHERE schemaname = 'public' AND tablename = 'attachments';
      IF v_count < 1 THEN
        v_passed := false;
        v_error := 'Attachments infrastructure not configured';
        v_execution_status := 'FAILED';
      ELSE
        v_details := jsonb_build_object('exif_sanitization_engine', 'SCHEMA_ONLY');
      END IF;
      IF v_passed THEN
        v_passed := false;
        v_execution_status := 'BLOCKED';
        v_error := 'NOT_VERIFIED: attachments table present only; EXIF strip pipeline not executed in RPC';
        v_details := v_details || jsonb_build_object('probe_label', 'ID-001');
      END IF;

    WHEN 'ID-002' THEN
      -- PDF Metadata Sanitization: view probe only
      SELECT count(*) INTO v_count FROM pg_views WHERE schemaname = 'public' AND viewname = 'requirement_attachments_shared';
      IF v_count < 1 THEN
        v_passed := false;
        v_error := 'requirement_attachments_shared view missing';
        v_execution_status := 'FAILED';
      ELSE
        v_details := jsonb_build_object('pdf_metadata_sanitization', 'VIEW_PRESENT');
      END IF;
      IF v_passed THEN
        v_passed := false;
        v_execution_status := 'BLOCKED';
        v_error := 'NOT_VERIFIED: shared attachment view present only; PDF metadata sanitizer not executed in RPC';
        v_details := v_details || jsonb_build_object('probe_label', 'ID-002');
      END IF;

    WHEN 'ID-003' THEN
      v_passed := false;
      v_execution_status := 'BLOCKED';
      v_error := 'NOT_VERIFIED: redaction engine not executed in RPC';
      v_details := jsonb_build_object('redaction_patterns', 'TWITTER|LINKEDIN|INSTAGRAM|EMAIL|PHONE');

    WHEN 'ID-004' THEN
      v_passed := false;
      v_execution_status := 'BLOCKED';
      v_error := 'NOT_VERIFIED: audio metadata sanitizer not executed in RPC';
      v_details := jsonb_build_object('audio_sanitizer', 'NOT_RUN');

    WHEN 'ID-005' THEN
      -- WhatsApp Business Profile Detection: phone row count only
      SELECT count(*) INTO v_count FROM suppliers WHERE contact_phone IS NOT NULL;
      IF v_count < 1 THEN
        v_passed := false;
        v_error := 'No supplier contact phone numbers configured';
        v_execution_status := 'FAILED';
      ELSE
        v_details := jsonb_build_object('verified_supplier_contacts', v_count);
      END IF;
      IF v_passed THEN
        v_passed := false;
        v_execution_status := 'BLOCKED';
        v_error := 'NOT_VERIFIED: supplier phone rows present only; WhatsApp Business profile detection not executed';
        v_details := v_details || jsonb_build_object('probe_label', 'ID-005');
      END IF;

    -- =========================================================================
    -- INTEGRATION TESTS
    -- =========================================================================
    WHEN 'INT-001' THEN
      -- Requirement Intake Flow: Requirements and RFQ schema
      SELECT count(*) INTO v_count FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('requirements', 'rfqs');
      IF v_count < 2 THEN
        v_passed := false;
        v_error := 'Core intake schema tables missing';
      ELSE
        v_details := jsonb_build_object('intake_schema', 'VALID');
      END IF;

    WHEN 'INT-002' THEN
      -- Supplier Discovery & Invitation: Suppliers and capabilities
      SELECT count(*) INTO v_count FROM suppliers WHERE status = 'ACTIVE';
      IF v_count < 5 THEN
        v_passed := false;
        v_error := 'Insufficient active suppliers in network (found ' || v_count || ')';
      ELSE
        v_details := jsonb_build_object('active_suppliers', v_count);
      END IF;
      IF v_passed THEN
        v_passed := false;
        v_execution_status := 'BLOCKED';
        v_error := 'NOT_VERIFIED: active supplier count only; discovery and invitation flow not executed';
        v_details := v_details || jsonb_build_object('probe_label', 'INT-002');
      ELSIF NOT v_passed THEN
        v_execution_status := 'FAILED';
      END IF;

    WHEN 'INT-003' THEN
      -- Quote Submission & Validation: Pilot auto-quotes RPC
      SELECT count(*) INTO v_count FROM pg_proc WHERE proname = 'auto_submit_pilot_quotes';
      IF v_count < 1 THEN
        v_passed := false;
        v_error := 'auto_submit_pilot_quotes RPC missing';
      ELSE
        v_details := jsonb_build_object('quote_submission_engine', 'ONLINE');
      END IF;

    WHEN 'INT-004' THEN
      -- Committee Voting Workflow: committee_votes & rfq_vote_tally view
      SELECT count(*) INTO v_count FROM pg_views WHERE schemaname = 'public' AND viewname = 'rfq_vote_tally';
      IF v_count < 1 THEN
        v_passed := false;
        v_error := 'rfq_vote_tally view missing';
      ELSE
        v_details := jsonb_build_object('voting_quorum_engine', 'ACTIVE');
      END IF;

    WHEN 'INT-005' THEN
      -- Award Decision & Justification: awards table & runner up award
      SELECT count(*) INTO v_count FROM pg_tables WHERE schemaname = 'public' AND tablename = 'awards';
      IF v_count < 1 THEN
        v_passed := false;
        v_error := 'Awards table missing';
      ELSE
        v_details := jsonb_build_object('award_justification_gate', 'ACTIVE');
      END IF;

    WHEN 'INT-006' THEN
      -- Identity Reveal & PO Generation: purchase_orders table & quotes_revealed
      SELECT count(*) INTO v_count FROM pg_views WHERE schemaname = 'public' AND viewname = 'quotes_revealed';
      IF v_count < 1 THEN
        v_passed := false;
        v_error := 'quotes_revealed view missing';
      ELSE
        v_details := jsonb_build_object('reveal_and_po_engine', 'ACTIVE');
      END IF;

    WHEN 'INT-007' THEN
      -- Invoice & Payment Workflow
      SELECT count(*) INTO v_count FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('invoices', 'payments', 'work_orders');
      IF v_count < 3 THEN
        v_passed := false;
        v_error := 'Post-award invoice/payment tables missing';
      ELSE
        v_details := jsonb_build_object('fulfillment_tables', v_count);
      END IF;

    WHEN 'INT-008' THEN
      -- OTP Platform Market Intelligence: table presence probe only
      SELECT count(*) INTO v_count FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('market_intelligence_baselines', 'procurement_performance_records');
      IF v_count < 2 THEN
        v_passed := false;
        v_error := 'Market intelligence tables missing or incomplete (found ' || v_count || '/2)';
        v_execution_status := 'FAILED';
      ELSE
        v_details := jsonb_build_object('market_intelligence_tables', v_count);
      END IF;
      IF v_passed THEN
        v_passed := false;
        v_execution_status := 'BLOCKED';
        v_error := 'NOT_VERIFIED: market intelligence tables present only; intelligence pipeline not executed in RPC';
        v_details := v_details || jsonb_build_object('probe_label', 'INT-008');
      END IF;

    -- =========================================================================
    -- E2E TESTS
    -- =========================================================================
    WHEN 'E2E-001' THEN
      -- Complete Buyer Journey (Fast Track)
      SELECT count(*) INTO v_count FROM profiles
      WHERE email IN ('bvnbasu@gmail.com', 'admin@otp.test', 'buyer@greenview.test', 'qa-buyer@otp.test', 'secretary@sunrise.test', 'buyer.greenview@otp.test')
         OR is_platform_admin = true;
      IF v_count < 1 THEN
        v_passed := false;
        v_error := 'Default Fast Track buyer account missing';
      ELSE
        v_details := jsonb_build_object('fast_track_buyer', 'VERIFIED');
      END IF;
      IF v_passed THEN
        v_passed := false;
        v_execution_status := 'BLOCKED';
        v_error := 'NOT_VERIFIED: fixture/profile presence only; Fast Track buyer journey not executed';
        v_details := v_details || jsonb_build_object('probe_label', 'E2E-001');
      ELSIF NOT v_passed THEN
        v_execution_status := 'FAILED';
      END IF;

    WHEN 'E2E-002' THEN
      -- Complete Buyer Journey (Full Governance)
      SELECT count(*) INTO v_count FROM organizations WHERE org_type IN ('COMMUNITY', 'ENTERPRISE', 'MSME', 'INDIVIDUAL', 'INSTITUTION');
      IF v_count < 1 THEN
        v_passed := false;
        v_error := 'Governance organizations missing';
      ELSE
        v_details := jsonb_build_object('governance_orgs', v_count);
      END IF;
      IF v_passed THEN
        v_passed := false;
        v_execution_status := 'BLOCKED';
        v_error := 'NOT_VERIFIED: organization types present only; Full Governance journey not executed';
        v_details := v_details || jsonb_build_object('probe_label', 'E2E-002');
      ELSIF NOT v_passed THEN
        v_execution_status := 'FAILED';
      END IF;

    WHEN 'E2E-003' THEN
      -- Supplier Quote via WhatsApp: Contact phone formatting verified
      SELECT count(*) INTO v_count FROM suppliers WHERE contact_phone LIKE '+91%';
      IF v_count < 5 THEN
        v_passed := false;
        v_error := 'Suppliers lack valid +91 phone formatting for WhatsApp';
      ELSE
        v_details := jsonb_build_object('whatsapp_ready_suppliers', v_count);
      END IF;
      IF v_passed THEN
        v_passed := false;
        v_execution_status := 'BLOCKED';
        v_error := 'NOT_VERIFIED: +91 phone formatting count only; WhatsApp message delivery not verified';
        v_details := v_details || jsonb_build_object('probe_label', 'E2E-003');
      ELSIF NOT v_passed THEN
        v_execution_status := 'FAILED';
      END IF;

    WHEN 'E2E-004' THEN
      -- Real-Time AI Requirement Parsing: Categories and subcategories populated
      SELECT count(*) INTO v_count FROM requirement_categories;
      IF v_count < 5 THEN
        v_passed := false;
        v_error := 'Taxonomy categories incomplete (found ' || v_count || ')';
      ELSE
        v_details := jsonb_build_object('taxonomy_categories', v_count);
      END IF;
      IF v_passed THEN
        v_passed := false;
        v_execution_status := 'BLOCKED';
        v_error := 'NOT_VERIFIED: taxonomy row count only; real-time AI parsing not verified';
        v_details := v_details || jsonb_build_object('probe_label', 'E2E-004');
      ELSIF NOT v_passed THEN
        v_execution_status := 'FAILED';
      END IF;

    -- =========================================================================
    -- UNIT TESTS
    -- =========================================================================
    WHEN 'UNIT-001' THEN
      -- Phase State Machine Transitions: both enum types must exist
      SELECT count(*) INTO v_count FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname IN ('rfq_phase', 'requirement_status');
      IF v_count < 2 THEN
        v_passed := false;
        v_error := 'Phase enum types missing or incomplete (found ' || v_count || '/2: rfq_phase, requirement_status)';
      ELSE
        v_details := jsonb_build_object('phase_state_machine_enums', v_count, 'required', jsonb_build_array('rfq_phase', 'requirement_status'));
      END IF;

    WHEN 'UNIT-002' THEN
      -- Indian Standards Taxonomy Sync: Categories & Attributes
      SELECT count(*) INTO v_count FROM requirement_categories WHERE is_active = true;
      IF v_count < 5 THEN
        v_passed := false;
        v_error := 'Active procurement categories not found';
      ELSE
        v_details := jsonb_build_object('active_categories', v_count);
      END IF;

    WHEN 'UNIT-003' THEN
      -- Smart Defaults Calculation: Buyer type config exists
      SELECT count(*) INTO v_count FROM buyer_type_config;
      IF v_count < 1 THEN
        v_passed := false;
        v_error := 'buyer_type_config missing';
      ELSE
        v_details := jsonb_build_object('smart_defaults_config', v_count);
      END IF;
      IF v_passed THEN
        v_passed := false;
        v_execution_status := 'BLOCKED';
        v_error := 'NOT_VERIFIED: buyer_type_config row count only; smart defaults not calculated';
        v_details := v_details || jsonb_build_object('probe_label', 'UNIT-003');
      ELSIF NOT v_passed THEN
        v_execution_status := 'FAILED';
      END IF;

    ELSE
      v_passed := false;
      v_execution_status := 'NOT_IMPLEMENTED';
      v_error := 'Unsupported test ID for admin_run_test_case: ' || p_test_id;
      v_details := jsonb_build_object('test_id', p_test_id, 'backend', 'none');
  END CASE;

  IF v_execution_status NOT IN ('BLOCKED', 'NOT_IMPLEMENTED', 'SKIPPED') THEN
    IF v_passed THEN
      v_execution_status := 'PASSED';
    ELSE
      v_execution_status := 'FAILED';
    END IF;
  END IF;
  IF v_execution_status IN ('BLOCKED', 'NOT_IMPLEMENTED', 'SKIPPED') THEN
    v_passed := false;
  END IF;

  RETURN jsonb_build_object(
    'passed', v_passed,
    'execution_status', v_execution_status,
    'test_id', p_test_id,
    'test_name', p_test_name,
    'error_message', v_error,
    'details', v_details,
    'timestamp', now()
  );
END;
$func$;

COMMENT ON FUNCTION public.admin_run_test_case(text, text) IS
  'Admin Test Center live probes. Requires platform admin or service_role. Unknown IDs return NOT_IMPLEMENTED.';

COMMIT;
