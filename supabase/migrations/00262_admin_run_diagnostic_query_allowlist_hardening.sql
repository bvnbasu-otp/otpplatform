-- 00262_admin_run_diagnostic_query_allowlist_hardening.sql
-- Forward-only DRAFT — not in supabase/migrations chain. Apply via hosted pipeline only.
--
-- Replaces arbitrary client SQL (00074 / prior SELECT-prefix-only drafts) with a fixed
-- allowlist of named operations. Signature kept as admin_run_diagnostic_query(text) for
-- RPC compatibility: p_sql MUST be either
--   (a) a bare operation key: ^[a-z][a-z0-9_]{0,63}$
--   (b) JSON: {"operation":"<key>","params":{"limit":<int>}}  (limit capped server-side)
-- Any string that looks like SQL (SELECT/WITH, semicolons, DML/DDL keywords) is rejected.
--
-- Callers (repo): apps/web AdminQueryTerminal + runDiagnosticQuery (admin-ops.ts);
-- tests/security/verified-remediation-00216-database.test.ts (DB); 00199 sweep name list.
--
-- Auth: private.is_platform_admin() OR auth.role() = service_role only.
-- Grants: REVOKE anon/PUBLIC; GRANT authenticated + service_role (00199 pattern).
--
-- Audit / errors: audit payload stores operation key + row count only (no raw SQL).
-- Client-facing execution failures return a generic message; details stay in server logs only.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.admin_run_diagnostic_query(text) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.admin_run_diagnostic_query(
  p_sql text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_input text;
  v_op text;
  v_limit int := 20;
  v_res jsonb;
  v_err_msg text;
  v_lower text;
  v_params jsonb;
BEGIN
  IF NOT (
    COALESCE(private.is_platform_admin(), false)
    OR COALESCE(auth.role(), '') = 'service_role'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Super Admin access required.',
      'rowsCount', 0,
      'data', '[]'::jsonb
    );
  END IF;

  v_input := btrim(COALESCE(p_sql, ''));
  IF v_input = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Empty diagnostic operation',
      'rowsCount', 0,
      'data', '[]'::jsonb
    );
  END IF;

  v_lower := lower(v_input);

  -- Reject free-form SQL and multi-statement attempts (compat shim: no EXECUTE of user text).
  IF v_lower ~ '(^|\s)(select|with|insert|update|delete|merge|truncate|copy|grant|revoke|alter|create|drop|call|execute|prepare|deallocate)\s'
     OR v_input ~ ';'
     OR v_lower ~ '(pg_read_file|pg_ls_dir|lo_import|lo_export|dblink|pg_sleep\s*\(\s*[1-9])' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Safety Guard: Free-form SQL is not permitted. Use a named diagnostic operation key.',
      'rowsCount', 0,
      'data', '[]'::jsonb
    );
  END IF;

  IF v_input ~ '^\s*\{' THEN
    BEGIN
      v_params := v_input::jsonb;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Invalid diagnostic operation payload',
        'rowsCount', 0,
        'data', '[]'::jsonb
      );
    END;
    v_op := lower(btrim(COALESCE(v_params->>'operation', '')));
    IF v_params ? 'params' AND jsonb_typeof(v_params->'params') = 'object'
       AND (v_params->'params' ? 'limit')
       AND (v_params->'params'->>'limit') ~ '^\d+$' THEN
      v_limit := least(greatest((v_params->'params'->>'limit')::int, 1), 100);
    ELSIF (v_params ? 'limit') AND (v_params->>'limit') ~ '^\d+$' THEN
      v_limit := least(greatest((v_params->>'limit')::int, 1), 100);
    END IF;
  ELSIF v_input ~ '^[a-z][a-z0-9_]{0,63}$' THEN
    v_op := v_input;
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unknown or malformed diagnostic operation',
      'rowsCount', 0,
      'data', '[]'::jsonb
    );
  END IF;

  CASE v_op
    WHEN 'stalled_order_diagnostics' THEN
      EXECUTE format(
        $q$
        SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
        FROM (
          SELECT
            r.id AS req_id,
            r.title,
            r.status AS req_status,
            rfq.status AS rfq_status,
            po.status AS po_status,
            ROUND(EXTRACT(EPOCH FROM (NOW() - COALESCE(wo.updated_at, po.updated_at, rfq.updated_at, r.updated_at))) / 3600, 1) AS idle_hours,
            o.name AS buyer_org,
            s.business_name AS supplier_name,
            CASE
              WHEN r.status = 'CANCELLED' OR rfq.status = 'CANCELLED' THEN 'STALLED (Cancelled)'
              WHEN po.status = 'ISSUED' AND po.acknowledged_at IS NULL AND NOW() - po.created_at > INTERVAL '24 HOURS' THEN 'STALLED (PO Unacknowledged > 24h)'
              WHEN rfq.status = 'EVALUATING' AND (SELECT count(*) FROM committee_votes cv WHERE cv.rfq_id = rfq.id) = 0 THEN 'STALLED (Evaluation Quorum Missing)'
              WHEN rfq.status IN ('OPEN', 'CLARIFICATION') AND rfq.updated_at < NOW() - INTERVAL '24 HOURS' THEN 'STALLED (Quoting Idle > 24h)'
              ELSE 'PENDING_ACTION'
            END AS diagnostic_flag
          FROM requirements r
          LEFT JOIN organizations o ON o.id = r.organization_id
          LEFT JOIN rfqs rfq ON rfq.requirement_id = r.id
          LEFT JOIN purchase_orders po ON po.rfq_id = rfq.id
          LEFT JOIN suppliers s ON s.id = po.supplier_id
          LEFT JOIN work_orders wo ON wo.purchase_order_id = po.id
          WHERE r.status NOT IN ('COMPLETED', 'DRAFT') OR r.status = 'CANCELLED'
          ORDER BY idle_hours DESC NULLS LAST
          LIMIT %s
        ) t
        $q$,
        v_limit
      ) INTO v_res;

    WHEN 'quote_submission_integrity' THEN
      EXECUTE format(
        $q$
        SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
        FROM (
          SELECT
            rfq.id AS rfq_id,
            r.title AS requirement_title,
            rfq.status AS rfq_status,
            COUNT(q.id) AS total_quotes_created,
            COUNT(CASE WHEN q.status = 'SUBMITTED' THEN 1 END) AS submitted_quotes_count,
            COUNT(CASE WHEN q.status = 'DRAFT' THEN 1 END) AS unsubmitted_draft_quotes,
            COUNT(qv.id) AS quote_versions_count,
            COUNT(CASE WHEN (qv.snapshot->>'pricing_total')::numeric > 0 THEN 1 END) AS valid_priced_payloads,
            COUNT(CASE WHEN qv.snapshot IS NULL OR (qv.snapshot->>'pricing_total') IS NULL THEN 1 END) AS sealed_or_unpriced_locks,
            CASE
              WHEN rfq.status = 'EVALUATING' AND COUNT(CASE WHEN q.status = 'SUBMITTED' THEN 1 END) = 0
                THEN 'CRITICAL: In Evaluation but 0 Submitted Quotes'
              WHEN COUNT(CASE WHEN q.status = 'DRAFT' THEN 1 END) > 0
                THEN 'WARN: Unsubmitted Supplier Drafts Detected'
              ELSE 'HEALTHY'
            END AS integrity_status
          FROM rfqs rfq
          JOIN requirements r ON r.id = rfq.requirement_id
          LEFT JOIN quotes q ON q.rfq_id = rfq.id
          LEFT JOIN quote_versions qv ON qv.quote_id = q.id AND qv.version = q.current_version
          WHERE rfq.status IN ('OPEN', 'CLARIFICATION', 'EVALUATING')
          GROUP BY rfq.id, r.title, rfq.status
          ORDER BY rfq.created_at DESC
          LIMIT %s
        ) t
        $q$,
        v_limit
      ) INTO v_res;

    WHEN 'awarding_lock_verification' THEN
      EXECUTE format(
        $q$
        SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
        FROM (
          SELECT
            aw.id AS award_id,
            aw.rfq_id,
            r.title AS requirement_title,
            aw.quote_id AS winning_quote_id,
            s.business_name AS awarded_supplier,
            aw.awarded_at,
            po.id AS po_id,
            po.po_number,
            po.status AS po_status,
            po.created_at AS po_created_at,
            po.acknowledged_at,
            ROUND(EXTRACT(EPOCH FROM (COALESCE(po.acknowledged_at, NOW()) - po.created_at)) / 3600, 1) AS ack_delay_hours,
            CASE
              WHEN po.id IS NULL THEN 'ERROR: Awarded without Purchase Order'
              WHEN po.status = 'ISSUED' AND po.acknowledged_at IS NULL THEN 'ACTION_REQUIRED: Pending Supplier Acceptance'
              WHEN po.status = 'ACCEPTED' THEN 'HEALTHY: Accepted'
              ELSE po.status::text
            END AS lock_status
          FROM awards aw
          JOIN rfqs rfq ON rfq.id = aw.rfq_id
          JOIN requirements r ON r.id = rfq.requirement_id
          JOIN quotes q ON q.id = aw.quote_id
          JOIN suppliers s ON s.id = q.supplier_id
          LEFT JOIN purchase_orders po ON po.award_id = aw.id
          ORDER BY aw.awarded_at DESC
          LIMIT %s
        ) t
        $q$,
        v_limit
      ) INTO v_res;

    WHEN 'financial_gst_reconciliation' THEN
      EXECUTE format(
        $q$
        SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
        FROM (
          SELECT
            po.po_number,
            po.total_amount AS po_total,
            inv.invoice_number,
            inv.amount AS invoice_amount,
            inv.status AS invoice_status,
            pay.amount AS payment_amount,
            pay.status AS payment_status,
            wo.status AS wo_status,
            (wo.status = 'COMPLETED') AS is_settled,
            (COALESCE(inv.amount, 0) - po.total_amount) AS amount_variance,
            CASE
              WHEN inv.id IS NULL THEN 'PO_AWAITING_INVOICE'
              WHEN inv.amount <> po.total_amount THEN 'VARIANCE_MISMATCH: Invoice <> PO'
              WHEN pay.status = 'VERIFIED' AND wo.status <> 'COMPLETED' THEN 'ANOMALY: Paid but Not Settled'
              WHEN pay.status = 'VERIFIED' AND wo.status = 'COMPLETED' THEN 'HEALTHY: Reconciled & Settled'
              ELSE 'IN_PROGRESS'
            END AS financial_health
          FROM purchase_orders po
          JOIN work_orders wo ON wo.purchase_order_id = po.id
          LEFT JOIN invoices inv ON inv.work_order_id = wo.id
          LEFT JOIN payments pay ON pay.invoice_id = inv.id
          WHERE po.status IN ('ISSUED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED')
          ORDER BY po.created_at DESC
          LIMIT %s
        ) t
        $q$,
        v_limit
      ) INTO v_res;

    WHEN 'gst_verification_diagnostics' THEN
      EXECUTE format(
        $q$
        SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
        FROM (
          SELECT
            po.po_number,
            r.title AS order_title,
            o.name AS buyer_name,
            COALESCE(o.tax_registration, 'MISSING_BUYER_GSTIN') AS buyer_gstin,
            COALESCE(o.gst_verified, false) AS buyer_gst_verified,
            COALESCE(o.tax_exempt, false) AS buyer_tax_exempt,
            s.business_name AS supplier_name,
            COALESCE(s.gstin, 'MISSING_SUPPLIER_GSTIN') AS supplier_gstin,
            COALESCE(s.gst_status, 'UNVERIFIED') AS supplier_gst_status,
            COALESCE(s.gst_verified, false) AS supplier_gst_verified,
            inv.invoice_number,
            inv.status AS invoice_status,
            CASE
              WHEN s.gstin IS NULL OR LENGTH(s.gstin) < 15 THEN 'BLOCKER: Supplier Missing 15-digit GSTIN'
              WHEN NOT COALESCE(s.gst_verified, false) THEN 'BLOCKER: Supplier GST Unverified'
              WHEN o.tax_registration IS NULL AND NOT COALESCE(o.tax_exempt, false) THEN 'WARN: Buyer Tax Registration Missing'
              ELSE 'GST_COMPLIANT'
            END AS gst_compliance_gate
          FROM purchase_orders po
          JOIN organizations o ON o.id = po.organization_id
          JOIN suppliers s ON s.id = po.supplier_id
          JOIN rfqs rfq ON rfq.id = po.rfq_id
          JOIN requirements r ON r.id = rfq.requirement_id
          LEFT JOIN work_orders wo ON wo.purchase_order_id = po.id
          LEFT JOIN invoices inv ON inv.work_order_id = wo.id
          ORDER BY po.created_at DESC
          LIMIT %s
        ) t
        $q$,
        v_limit
      ) INTO v_res;

    WHEN 'state_transition_audit_trail' THEN
      v_limit := least(greatest(v_limit, 1), 100);
      EXECUTE format(
        $q$
        SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
        FROM (
          SELECT
            ae.id AS audit_event_id,
            ae.occurred_at,
            ae.event_type,
            ae.entity_type,
            ae.entity_id,
            ae.actor_id,
            p.full_name AS actor_name,
            ae.payload->>'reason' AS reason,
            ae.payload->>'from_state' AS from_state,
            ae.payload->>'to_state' AS to_state,
            ae.payload->>'error' AS error_message,
            ae.payload
          FROM audit_events ae
          LEFT JOIN profiles p ON p.id = ae.actor_id
          WHERE ae.event_type LIKE '%transition%'
             OR ae.event_type LIKE '%state%'
             OR ae.event_type LIKE '%troubleshoot%'
             OR ae.event_type LIKE '%override%'
             OR ae.event_type LIKE '%advance%'
             OR ae.event_type LIKE '%revert%'
             OR ae.event_type LIKE '%admin%'
          ORDER BY ae.occurred_at DESC
          LIMIT %s
        ) t
        $q$,
        v_limit
      ) INTO v_res;

    WHEN 'profiles_active_count' THEN
      EXECUTE $q$
        SELECT jsonb_build_array(jsonb_build_object('active_profiles', COUNT(*) FILTER (WHERE status = 'ACTIVE')))
        FROM profiles
        WHERE deleted_at IS NULL
      $q$ INTO v_res;

    ELSE
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Unknown diagnostic operation: %s', v_op),
        'rowsCount', 0,
        'data', '[]'::jsonb
      );
  END CASE;

  INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
  VALUES (
    'admin.diagnostic_query.executed',
    'SQL_TERMINAL',
    gen_random_uuid()::text,
    jsonb_build_object(
      'operation', v_op,
      'limit', v_limit,
      'rows_returned', coalesce(jsonb_array_length(v_res), 0),
      'status', 'PASSED',
      'timestamp', now()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'operation', v_op,
    'rowsCount', coalesce(jsonb_array_length(v_res), 0),
    'data', coalesce(v_res, '[]'::jsonb),
    'timestamp', now()
  );

EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_err_msg = MESSAGE_TEXT;

  INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
  VALUES (
    'admin.diagnostic_query.failed',
    'SQL_TERMINAL',
    gen_random_uuid()::text,
    jsonb_build_object(
      'operation', coalesce(v_op, 'unknown'),
      'status', 'FAILED',
      'error_class', SQLSTATE,
      'timestamp', now()
    )
  );

  RAISE LOG 'admin_run_diagnostic_query failed op=% error=%', coalesce(v_op, 'unknown'), v_err_msg;

  RETURN jsonb_build_object(
    'success', false,
    'error', 'Diagnostic query failed.',
    'errorDetail', '',
    'errorHint', '',
    'rowsCount', 0,
    'data', '[]'::jsonb,
    'timestamp', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_run_diagnostic_query(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_run_diagnostic_query(text) IS
  'Platform-admin-only named diagnostic operations (allowlist). p_sql is an operation key or JSON {"operation","params"}; free-form SQL rejected.';

COMMIT;
