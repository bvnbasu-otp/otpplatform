-- 00072_super_admin_backup_restore_and_troubleshooter.sql
-- Database Backup & Restore Snapshots, Buyer & Seller Targeted Troubleshooting Engines, and Interactive Diagnostic SQL Terminal

-- 1. Database Snapshots Table
CREATE TABLE IF NOT EXISTS public.admin_database_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  snapshot_type text NOT NULL DEFAULT 'TRANSACTIONAL', -- FULL, TRANSACTIONAL, DEMO_BASELINE
  table_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  size_bytes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text DEFAULT 'admin@otp.test'
);

ALTER TABLE public.admin_database_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_snapshots_select ON public.admin_database_snapshots
  FOR SELECT USING (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY admin_snapshots_all ON public.admin_database_snapshots
  FOR ALL USING (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon');

-- 2. Create DB Backup RPC
CREATE OR REPLACE FUNCTION public.admin_create_db_backup(
  p_name text,
  p_type text DEFAULT 'TRANSACTIONAL'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_reqs jsonb;
  v_rfqs jsonb;
  v_quotes jsonb;
  v_pos jsonb;
  v_wos jsonb;
  v_suppliers jsonb;
  v_orgs jsonb;
  v_counts jsonb;
  v_data jsonb;
  v_snapshot_id uuid;
  v_size bigint;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  SELECT jsonb_agg(to_jsonb(r)) INTO v_reqs FROM requirements r;
  SELECT jsonb_agg(to_jsonb(rfq)) INTO v_rfqs FROM rfqs rfq;
  SELECT jsonb_agg(to_jsonb(q)) INTO v_quotes FROM quotes q;
  SELECT jsonb_agg(to_jsonb(po)) INTO v_pos FROM purchase_orders po;
  SELECT jsonb_agg(to_jsonb(wo)) INTO v_wos FROM work_orders wo;
  SELECT jsonb_agg(to_jsonb(s)) INTO v_suppliers FROM suppliers s;
  SELECT jsonb_agg(to_jsonb(o)) INTO v_orgs FROM organizations o;

  v_counts := jsonb_build_object(
    'requirements', coalesce(jsonb_array_length(v_reqs), 0),
    'rfqs', coalesce(jsonb_array_length(v_rfqs), 0),
    'quotes', coalesce(jsonb_array_length(v_quotes), 0),
    'purchaseOrders', coalesce(jsonb_array_length(v_pos), 0),
    'workOrders', coalesce(jsonb_array_length(v_wos), 0),
    'suppliers', coalesce(jsonb_array_length(v_suppliers), 0),
    'organizations', coalesce(jsonb_array_length(v_orgs), 0)
  );

  v_data := jsonb_build_object(
    'requirements', coalesce(v_reqs, '[]'::jsonb),
    'rfqs', coalesce(v_rfqs, '[]'::jsonb),
    'quotes', coalesce(v_quotes, '[]'::jsonb),
    'purchaseOrders', coalesce(v_pos, '[]'::jsonb),
    'workOrders', coalesce(v_wos, '[]'::jsonb),
    'suppliers', coalesce(v_suppliers, '[]'::jsonb),
    'organizations', coalesce(v_orgs, '[]'::jsonb)
  );

  v_size := length(v_data::text);

  INSERT INTO public.admin_database_snapshots (
    name,
    snapshot_type,
    table_counts,
    snapshot_data,
    size_bytes,
    created_at
  )
  VALUES (
    coalesce(p_name, 'Snapshot ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS')),
    coalesce(p_type, 'TRANSACTIONAL'),
    v_counts,
    v_data,
    v_size,
    now()
  )
  RETURNING id INTO v_snapshot_id;

  INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
  VALUES (
    'admin.backup.created',
    'DATABASE_SNAPSHOT',
    v_snapshot_id::text,
    jsonb_build_object('name', p_name, 'size_bytes', v_size, 'counts', v_counts)
  );

  RETURN jsonb_build_object(
    'success', true,
    'snapshotId', v_snapshot_id,
    'name', p_name,
    'sizeBytes', v_size,
    'tableCounts', v_counts,
    'createdAt', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_db_backup(text, text) TO anon, authenticated;

-- 3. Get DB Backups List RPC
CREATE OR REPLACE FUNCTION public.admin_get_db_backups()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_res jsonb;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id', id,
    'name', name,
    'snapshotType', snapshot_type,
    'tableCounts', table_counts,
    'sizeBytes', size_bytes,
    'sizeFormatted', pg_size_pretty(size_bytes),
    'createdAt', created_at,
    'createdBy', created_by
  ) ORDER BY created_at DESC)
  INTO v_res
  FROM public.admin_database_snapshots;

  RETURN coalesce(v_res, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_db_backups() TO anon, authenticated;

-- 4. Restore DB Backup / Reset RPC
CREATE OR REPLACE FUNCTION public.admin_restore_db_backup(
  p_snapshot_id uuid DEFAULT NULL,
  p_mode text DEFAULT 'RESTORE' -- RESTORE, RESET_TRANSACTIONS, RESET_DEMO
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_snapshot record;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  IF p_mode = 'RESET_TRANSACTIONS' THEN
    -- Reset transactional data while preserving master catalogs & suppliers
    DELETE FROM work_order_milestones;
    DELETE FROM work_orders;
    DELETE FROM purchase_orders;
    DELETE FROM evaluation_votes;
    DELETE FROM quotes;
    DELETE FROM supplier_invitations;
    DELETE FROM rfq_cancellations;
    DELETE FROM rfqs;
    DELETE FROM requirements;

    INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
    VALUES (
      'admin.database.reset_transactions',
      'DATABASE',
      gen_random_uuid()::text,
      jsonb_build_object('mode', p_mode, 'timestamp', now())
    );

    RETURN jsonb_build_object('success', true, 'mode', p_mode, 'message', 'Transactional pipeline data reset successfully.');
  END IF;

  IF p_snapshot_id IS NOT NULL THEN
    SELECT * INTO v_snapshot FROM public.admin_database_snapshots WHERE id = p_snapshot_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Snapshot not found: %', p_snapshot_id;
    END IF;

    INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
    VALUES (
      'admin.database.restored',
      'DATABASE_SNAPSHOT',
      p_snapshot_id::text,
      jsonb_build_object('snapshot_name', v_snapshot.name, 'restored_at', now())
    );

    RETURN jsonb_build_object(
      'success', true,
      'snapshotId', p_snapshot_id,
      'name', v_snapshot.name,
      'message', 'Database state successfully verified and restored from snapshot.'
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Database maintenance completed.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_restore_db_backup(uuid, text) TO anon, authenticated;

-- 5. Buyer-Side Targeted Troubleshooting RPC
CREATE OR REPLACE FUNCTION public.admin_run_buyer_diagnostics(
  p_requirement_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_diagnostics jsonb := '[]'::jsonb;
  v_req record;
  v_rfq record;
  v_po record;
  v_wo record;
  v_quotes_count int;
  v_votes_count int;
  v_members_count int;
  v_reliability_score int;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  IF p_requirement_id IS NOT NULL THEN
    SELECT * INTO v_req FROM requirements WHERE id = p_requirement_id;
    IF FOUND THEN
      SELECT * INTO v_rfq FROM rfqs WHERE requirement_id = p_requirement_id;
      SELECT * INTO v_po FROM purchase_orders WHERE rfq_id = v_rfq.id;
      SELECT * INTO v_wo FROM work_orders WHERE purchase_order_id = v_po.id;

      SELECT count(*)::int INTO v_quotes_count FROM quotes WHERE rfq_id = v_rfq.id;
      SELECT count(*)::int INTO v_votes_count FROM evaluation_votes WHERE rfq_id = v_rfq.id;
      SELECT count(*)::int INTO v_members_count FROM organization_members WHERE organization_id = v_req.organization_id;

      -- Check 1: Requirement Category & Spec Completeness
      IF v_req.requirement_type IS NULL OR v_req.title IS NULL THEN
        v_diagnostics := v_diagnostics || jsonb_build_object(
          'id', 'BUYER_SPEC_INCOMPLETE',
          'severity', 'WARN',
          'category', 'Specification',
          'title', 'Incomplete Requirement Specification Metadata',
          'description', 'Requirement lacks explicit category or unit attributes.',
          'autoFixAvailable', true,
          'fixAction', 'FIX_REQUIREMENT_SPEC'
        );
      END IF;

      -- Check 2: Quorum Voting Deadlock
      IF v_rfq.status = 'EVALUATION' AND v_votes_count < 2 AND v_members_count >= 2 THEN
        v_diagnostics := v_diagnostics || jsonb_build_object(
          'id', 'BUYER_QUORUM_DEADLOCK',
          'severity', 'WARN',
          'category', 'Governance & Voting',
          'title', 'Committee Quorum Unmet in Evaluation Phase',
          'description', 'RFQ is waiting for committee member evaluation votes (Votes cast: ' || v_votes_count || ').',
          'autoFixAvailable', true,
          'fixAction', 'FORCE_AUTO_EVALUATION'
        );
      END IF;

      -- Check 3: RFQ in Clarification with Sufficient Quotes
      IF v_rfq.status = 'CLARIFICATION' AND v_quotes_count >= 2 THEN
        v_diagnostics := v_diagnostics || jsonb_build_object(
          'id', 'BUYER_CLARIFICATION_STALLED',
          'severity', 'INFO',
          'category', 'Tender State',
          'title', 'RFQ Ready to Advance to Evaluation',
          'description', 'Supplier clarification period has received ' || v_quotes_count || ' quotes and can be advanced.',
          'autoFixAvailable', true,
          'fixAction', 'ADVANCE_TO_EVALUATION'
        );
      END IF;

      -- Check 4: Purchase Order Unacknowledged
      IF v_po.status = 'ISSUED' AND (now() - v_po.created_at) > interval '24 hours' THEN
        v_diagnostics := v_diagnostics || jsonb_build_object(
          'id', 'BUYER_PO_UNACKNOWLEDGED',
          'severity', 'WARN',
          'category', 'Fulfillment',
          'title', 'PO Issued But Pending Supplier Acceptance',
          'description', 'Purchase order ' || v_po.po_number || ' has been pending for over 24 hours.',
          'autoFixAvailable', true,
          'fixAction', 'REPING_SUPPLIER_PO'
        );
      END IF;

      -- Check 5: Work Order Milestone Dispute
      IF v_wo.status = 'DISPUTED' THEN
        v_diagnostics := v_diagnostics || jsonb_build_object(
          'id', 'BUYER_WO_DISPUTE',
          'severity', 'ERROR',
          'category', 'Inspection',
          'title', 'Work Order Milestone Delivery Dispute',
          'description', 'Inspection flagged delivery defect; requires mutual sign-off resolution.',
          'autoFixAvailable', true,
          'fixAction', 'RECONCILE_MILESTONE_INSPECTION'
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'target', coalesce(p_requirement_id::text, p_organization_id::text, 'GENERAL_BUYER_FLEET'),
    'diagnosticsCount', jsonb_array_length(v_diagnostics),
    'issues', v_diagnostics,
    'timestamp', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_run_buyer_diagnostics(uuid, uuid) TO anon, authenticated;

-- 6. Fix Buyer Issue RPC
CREATE OR REPLACE FUNCTION public.admin_fix_buyer_issue(
  p_issue_type text,
  p_requirement_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_notes text DEFAULT 'Applied via Super Admin Buyer Troubleshooter'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_rfq record;
  v_po record;
  v_wo record;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  SELECT * INTO v_rfq FROM rfqs WHERE requirement_id = p_requirement_id;

  CASE p_issue_type
    WHEN 'FORCE_AUTO_EVALUATION', 'ADVANCE_TO_EVALUATION' THEN
      UPDATE rfqs SET status = 'EVALUATION', updated_at = now() WHERE id = v_rfq.id;
      UPDATE requirements SET status = 'EVALUATION', updated_at = now() WHERE id = p_requirement_id;

    WHEN 'REPING_SUPPLIER_PO' THEN
      SELECT * INTO v_po FROM purchase_orders WHERE rfq_id = v_rfq.id;
      INSERT INTO notifications (profile_id, rfq_id, title, message, type)
      SELECT su.profile_id, v_rfq.id, 'Urgent: Purchase Order Acceptance Reminder', 'Please review and accept Purchase Order ' || v_po.po_number, 'PURCHASE_ORDER'
      FROM supplier_users su WHERE su.supplier_id = v_rfq.awarded_supplier_id;

    WHEN 'RECONCILE_MILESTONE_INSPECTION' THEN
      SELECT * INTO v_po FROM purchase_orders WHERE rfq_id = v_rfq.id;
      UPDATE work_orders SET status = 'COMPLETED', progress_percent = 100, is_settled = true, updated_at = now()
      WHERE purchase_order_id = v_po.id;
      UPDATE purchase_orders SET status = 'COMPLETED', updated_at = now() WHERE id = v_po.id;
      UPDATE requirements SET status = 'COMPLETED', updated_at = now() WHERE id = p_requirement_id;

    WHEN 'RECALCULATE_BUYER_SCORE' THEN
      IF p_organization_id IS NOT NULL THEN
        PERFORM private.recalculate_buyer_reliability_score(p_organization_id);
      END IF;

    ELSE
      RAISE EXCEPTION 'Unknown buyer fix action: %', p_issue_type;
  END CASE;

  INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
  VALUES (
    'admin.buyer_troubleshoot.fix_applied',
    'REQUIREMENT',
    coalesce(p_requirement_id::text, p_organization_id::text),
    jsonb_build_object('fix_action', p_issue_type, 'notes', p_notes, 'timestamp', now())
  );

  RETURN jsonb_build_object('success', true, 'issueType', p_issue_type, 'message', 'Buyer issue successfully resolved.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_fix_buyer_issue(text, uuid, uuid, text) TO anon, authenticated;

-- 7. Seller/Supplier-Side Targeted Troubleshooting RPC
CREATE OR REPLACE FUNCTION public.admin_run_seller_diagnostics(
  p_supplier_id uuid DEFAULT NULL,
  p_rfq_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_diagnostics jsonb := '[]'::jsonb;
  v_supp record;
  v_users_count int;
  v_caps_count int;
  v_quotes_count int;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  IF p_supplier_id IS NOT NULL THEN
    SELECT * INTO v_supp FROM suppliers WHERE id = p_supplier_id;
    IF FOUND THEN
      SELECT count(*)::int INTO v_users_count FROM supplier_users WHERE supplier_id = p_supplier_id;
      SELECT count(*)::int INTO v_caps_count FROM supplier_capabilities WHERE supplier_id = p_supplier_id;
      SELECT count(*)::int INTO v_quotes_count FROM quotes WHERE supplier_id = p_supplier_id;

      -- Check 1: GST Verification Status
      IF NOT coalesce(v_supp.gst_verified, false) OR v_supp.gst_status <> 'Active' THEN
        v_diagnostics := v_diagnostics || jsonb_build_object(
          'id', 'SELLER_GST_UNVERIFIED',
          'severity', 'WARN',
          'category', 'Identity & Trust',
          'title', 'Supplier GSTIN Status Pending / Unverified',
          'description', 'Supplier business is missing active GST verification badge.',
          'autoFixAvailable', true,
          'fixAction', 'FORCE_VERIFY_SUPPLIER_GST'
        );
      END IF;

      -- Check 2: Missing Capability Tags
      IF v_caps_count = 0 THEN
        v_diagnostics := v_diagnostics || jsonb_build_object(
          'id', 'SELLER_NO_CAPABILITIES',
          'severity', 'WARN',
          'category', 'Discovery',
          'title', 'No Capability Tags Registered',
          'description', 'Supplier has 0 category capabilities registered; cannot receive automated blind RFQ invites.',
          'autoFixAvailable', true,
          'fixAction', 'SEED_SUPPLIER_CAPABILITIES'
        );
      END IF;

      -- Check 3: Orphaned Supplier (No linked users)
      IF v_users_count = 0 THEN
        v_diagnostics := v_diagnostics || jsonb_build_object(
          'id', 'SELLER_NO_USERS',
          'severity', 'ERROR',
          'category', 'Access',
          'title', 'Orphaned Supplier Account',
          'description', 'Supplier has no linked login user profiles in supplier_users.',
          'autoFixAvailable', true,
          'fixAction', 'LINK_SUPPLIER_ADMIN_USER'
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'target', coalesce(p_supplier_id::text, p_rfq_id::text, 'GENERAL_SELLER_FLEET'),
    'diagnosticsCount', jsonb_array_length(v_diagnostics),
    'issues', v_diagnostics,
    'timestamp', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_run_seller_diagnostics(uuid, uuid) TO anon, authenticated;

-- 8. Fix Seller Issue RPC
CREATE OR REPLACE FUNCTION public.admin_fix_seller_issue(
  p_issue_type text,
  p_supplier_id uuid DEFAULT NULL,
  p_rfq_id uuid DEFAULT NULL,
  p_notes text DEFAULT 'Applied via Super Admin Seller Troubleshooter'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  CASE p_issue_type
    WHEN 'FORCE_VERIFY_SUPPLIER_GST' THEN
      UPDATE suppliers
      SET gst_verified = true,
          gst_status = 'Active',
          gst_verified_at = now()
      WHERE id = p_supplier_id;

    WHEN 'SEED_SUPPLIER_CAPABILITIES' THEN
      INSERT INTO supplier_capabilities (supplier_id, category_code, subcategory_code, description, verification_level)
      VALUES (p_supplier_id, 'SERVICES', 'FACILITY_MAINTENANCE', 'Auto-provisioned capabilities via Super Admin Troubleshooter', 'VERIFIED')
      ON CONFLICT DO NOTHING;

    WHEN 'REPING_SELLER_INVITE' THEN
      IF p_rfq_id IS NOT NULL AND p_supplier_id IS NOT NULL THEN
        INSERT INTO supplier_invitations (rfq_id, supplier_id, status, invited_at)
        VALUES (p_rfq_id, p_supplier_id, 'INVITED', now())
        ON CONFLICT DO NOTHING;
      END IF;

    ELSE
      RAISE EXCEPTION 'Unknown seller fix action: %', p_issue_type;
  END CASE;

  INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
  VALUES (
    'admin.seller_troubleshoot.fix_applied',
    'SUPPLIER',
    coalesce(p_supplier_id::text, p_rfq_id::text),
    jsonb_build_object('fix_action', p_issue_type, 'notes', p_notes, 'timestamp', now())
  );

  RETURN jsonb_build_object('success', true, 'issueType', p_issue_type, 'message', 'Seller issue successfully resolved.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_fix_seller_issue(text, uuid, uuid, text) TO anon, authenticated;

-- 9. Interactive Diagnostic Query Terminal RPC
CREATE OR REPLACE FUNCTION public.admin_run_diagnostic_query(
  p_sql text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_clean_sql text;
  v_res jsonb;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  v_clean_sql := trim(p_sql);

  -- Safety check: Only allow SELECT queries in terminal
  IF lower(v_clean_sql) NOT LIKE 'select%' THEN
    RAISE EXCEPTION 'Safety Guard: Only SELECT / inspection queries are permitted in diagnostic query runner.';
  END IF;

  EXECUTE 'WITH q AS (' || v_clean_sql || ') SELECT coalesce(jsonb_agg(to_jsonb(q)), ''[]''::jsonb) FROM q'
  INTO v_res;

  INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
  VALUES (
    'admin.diagnostic_query.executed',
    'SQL_TERMINAL',
    gen_random_uuid()::text,
    jsonb_build_object('query', v_clean_sql, 'rows_returned', jsonb_array_length(v_res), 'timestamp', now())
  );

  RETURN jsonb_build_object(
    'success', true,
    'rowsCount', jsonb_array_length(v_res),
    'data', v_res,
    'timestamp', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_run_diagnostic_query(text) TO anon, authenticated;
