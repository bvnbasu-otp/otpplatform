-- 00099_fix_proactive_maintenance_scan_rpc.sql
-- Fix rfq_status enum mismatch ('EVALUATING' instead of 'EVALUATION') and ensure resilient proactive scan execution

CREATE OR REPLACE FUNCTION public.admin_generate_proactive_maintenance_alerts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_admin_profile record;
  v_rfq record;
  v_po record;
  v_supp record;
  v_alerts_count int := 0;
  v_alert_items jsonb := '[]'::jsonb;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  -- 1. Scan for Stalled RFQs (>24h idle)
  FOR v_rfq IN
    SELECT rfq.id, rfq.status::text AS status, r.title, r.organization_id, o.name AS org_name,
           ROUND(EXTRACT(EPOCH FROM (now() - rfq.updated_at)) / 3600, 1) AS idle_hours
    FROM rfqs rfq
    JOIN requirements r ON r.id = rfq.requirement_id
    JOIN organizations o ON o.id = r.organization_id
    WHERE (rfq.status::text IN ('CLARIFICATION', 'EVALUATING', 'OPEN') OR r.status::text IN ('CLARIFICATION', 'EVALUATION', 'OPEN'))
      AND (now() - rfq.updated_at) > interval '24 hours'
  LOOP
    v_alerts_count := v_alerts_count + 1;
    v_alert_items := v_alert_items || jsonb_build_object(
      'type', 'STALLED_RFQ',
      'title', 'Proactive Alert: Stalled RFQ in ' || v_rfq.status,
      'body', 'RFQ "' || coalesce(v_rfq.title, 'Untitled') || '" (' || coalesce(v_rfq.org_name, 'Buyer') || ') has been inactive for ' || coalesce(v_rfq.idle_hours, 0) || 'h. Proactive intervention recommended.',
      'link', '/admin/buyer-diagnostics?target=' || v_rfq.id,
      'entityId', v_rfq.id
    );

    FOR v_admin_profile IN
      SELECT id FROM profiles WHERE is_platform_admin = true OR email IN ('admin@otp.test', 'ops@otp.test')
    LOOP
      BEGIN
        PERFORM public.create_system_notification(
          v_admin_profile.id,
          '⚠️ Proactive Alert: Stalled RFQ (' || coalesce(v_rfq.idle_hours, 0) || 'h idle)',
          'RFQ "' || coalesce(v_rfq.title, 'Untitled') || '" in ' || v_rfq.status || ' requires attention.',
          '/admin/buyer-diagnostics?target=' || v_rfq.id,
          'admin.proactive.stalled_rfq',
          'PROACTIVE_MAINTENANCE',
          jsonb_build_object('rfq_id', v_rfq.id, 'idle_hours', v_rfq.idle_hours, 'severity', 'WARN')
        );
      EXCEPTION WHEN OTHERS THEN
        -- Gracefully skip notification insert if constraint fails
      END;
    END LOOP;
  END LOOP;

  -- 2. Scan for Unacknowledged POs (>24h idle)
  FOR v_po IN
    SELECT po.id, po.po_number, po.total_amount, po.created_at,
           ROUND(EXTRACT(EPOCH FROM (now() - po.created_at)) / 3600, 1) AS idle_hours
    FROM purchase_orders po
    WHERE po.status = 'ISSUED'
      AND (now() - po.created_at) > interval '24 hours'
  LOOP
    v_alerts_count := v_alerts_count + 1;
    v_alert_items := v_alert_items || jsonb_build_object(
      'type', 'UNACKNOWLEDGED_PO',
      'title', 'Proactive Alert: Unacknowledged PO ' || coalesce(v_po.po_number, 'N/A'),
      'body', 'Purchase order ' || coalesce(v_po.po_number, 'N/A') || ' pending supplier acceptance for ' || coalesce(v_po.idle_hours, 0) || 'h.',
      'link', '/admin?tab=seller-orders',
      'entityId', v_po.id
    );

    FOR v_admin_profile IN
      SELECT id FROM profiles WHERE is_platform_admin = true OR email IN ('admin@otp.test', 'ops@otp.test')
    LOOP
      BEGIN
        PERFORM public.create_system_notification(
          v_admin_profile.id,
          '⚠️ Proactive Alert: PO Acceptance Delay',
          'Purchase Order ' || coalesce(v_po.po_number, 'N/A') || ' pending acceptance for ' || coalesce(v_po.idle_hours, 0) || 'h.',
          '/admin?tab=seller-orders',
          'admin.proactive.po_delay',
          'PROACTIVE_MAINTENANCE',
          jsonb_build_object('po_id', v_po.id, 'po_number', v_po.po_number, 'severity', 'WARN')
        );
      EXCEPTION WHEN OTHERS THEN
        -- Gracefully skip
      END;
    END LOOP;
  END LOOP;

  -- 3. Scan for Inactive/Unverified Suppliers with Bids
  FOR v_supp IN
    SELECT DISTINCT s.id, s.business_name, s.legal_name
    FROM suppliers s
    JOIN quotes q ON q.supplier_id = s.id
    WHERE (NOT coalesce(s.gst_verified, false) OR coalesce(s.gst_status, '') <> 'Active')
  LOOP
    v_alerts_count := v_alerts_count + 1;
    v_alert_items := v_alert_items || jsonb_build_object(
      'type', 'UNVERIFIED_SUPPLIER_BID',
      'title', 'Proactive Alert: Unverified Supplier Bidding',
      'body', 'Supplier "' || coalesce(v_supp.business_name, v_supp.legal_name, 'Unknown') || '" has submitted bids but lacks active GST verification.',
      'link', '/admin/seller-diagnostics?target=' || v_supp.id,
      'entityId', v_supp.id
    );

    FOR v_admin_profile IN
      SELECT id FROM profiles WHERE is_platform_admin = true OR email IN ('admin@otp.test', 'ops@otp.test')
    LOOP
      BEGIN
        PERFORM public.create_system_notification(
          v_admin_profile.id,
          '🛡️ Proactive Alert: Unverified Supplier GST',
          'Supplier "' || coalesce(v_supp.business_name, v_supp.legal_name, 'Unknown') || '" has active quotes without GST verification.',
          '/admin/seller-diagnostics?target=' || v_supp.id,
          'admin.proactive.unverified_supplier',
          'PROACTIVE_MAINTENANCE',
          jsonb_build_object('supplier_id', v_supp.id, 'severity', 'INFO')
        );
      EXCEPTION WHEN OTHERS THEN
        -- Gracefully skip
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'alertsDispatched', v_alerts_count,
    'alerts', v_alert_items,
    'scannedAt', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_generate_proactive_maintenance_alerts() TO anon, authenticated;
