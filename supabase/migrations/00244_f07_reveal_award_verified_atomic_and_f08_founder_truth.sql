-- =============================================================================
-- 00244: F-07 reveal_award verified-supplier + atomic PO, and F-08 founder KPI truthfulness
--
-- F-07 (public.reveal_award, body previously defined in 00222):
--   * The legacy RPC never checked suppliers.lifecycle_state / verification_status. A manager could
--     call it directly on an award whose supplier was not VERIFIED and receive the supplier's
--     business_name / contact_phone / contact_email.
--   * It persisted rfqs.reveal_status / awards.status = REVEALED BEFORE creating the PO and then
--     swallowed any PO failure (EXCEPTION WHEN OTHERS -> RAISE WARNING), returning success with
--     po_id = null and the supplier identity.
--   Now: the same predicate as lock_and_reveal_award_atomic (lifecycle_state = 'VERIFIED' AND
--   verification_status = 'VERIFIED') is enforced before any state is persisted or identity returned;
--   PO creation failure aborts the whole transaction (no handler); success requires a real po_id.
--   lock_and_reveal_award_atomic is NOT touched. Grants, SECURITY DEFINER and search_path are the
--   same as 00222/00216. The one-way reveal (rfqs_no_rehide) is untouched.
--
-- F-08 (public.get_founder_executive_metrics, body previously defined in 00179):
--   * "Verified Suppliers" counted every supplier row  -> new suppliers.verified uses the
--     authoritative verified predicate (suppliers.total keeps the all-suppliers meaning).
--   * "Completed POs" counted ISSUED + ACCEPTED + COMPLETED -> completedOrders is COMPLETED only;
--     the previous set is exposed honestly as purchaseOrdersIssued. GMV set is unchanged.
--   * The 00179 body filtered rfqs.status IN ('AWARDED','COMPLETED'), but rfq_status has no COMPLETED value,
--     so the whole RPC raised 22P02 and the dashboard could never load. awardedRfqs now filters AWARDED.
--   * Adds get_founder_google_places_budget_today(): founder-only read of the EXISTING
--     google_places_daily_budget counter (00224). No new table, no new pipeline.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- F-07: reveal_award
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reveal_award(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_rfq rfqs%ROWTYPE;
  v_award awards%ROWTYPE;
  v_supplier_id uuid;
  v_business text;
  v_phone text;
  v_email text;
  v_alias text;
  v_lifecycle text;
  v_verification text;
  v_now timestamptz := now();
  v_po_id uuid;
  v_po_number text;
  v_po_res jsonb;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found'; END IF;
  IF auth.uid() IS NOT NULL
     AND NOT private.is_org_manager_or_above(v_rfq.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a manager or owner can reveal the winner';
  END IF;
  SELECT * INTO v_award FROM awards WHERE rfq_id = p_rfq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Identity can only be revealed after the award is locked'; END IF;

  SELECT s.id, s.business_name, s.contact_phone, s.contact_email, ri.anonymous_label,
         s.lifecycle_state::text, s.verification_status::text
  INTO v_supplier_id, v_business, v_phone, v_email, v_alias, v_lifecycle, v_verification
  FROM quotes q JOIN suppliers s ON s.id = q.supplier_id JOIN rfq_invitations ri ON ri.id = q.invitation_id
  WHERE q.id = v_award.quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Awarded supplier not found'; END IF;

  -- Same predicate as lock_and_reveal_award_atomic. Checked before any identity is returned or any
  -- reveal state is persisted, including on the idempotent (already revealed) path.
  IF v_lifecycle IS DISTINCT FROM 'VERIFIED' OR v_verification IS DISTINCT FROM 'VERIFIED' THEN
    RAISE EXCEPTION 'Cannot reveal identity: the awarded supplier must complete onboarding and verification first';
  END IF;

  IF v_rfq.reveal_status = 'REVEALED' THEN
    PERFORM private.issue_decision_receipt_snapshots_for_award(v_award.id, 'POST_REVEAL');
    SELECT id, po_number INTO v_po_id, v_po_number FROM purchase_orders WHERE award_id = v_award.id;
    IF v_po_id IS NULL THEN
      -- No exception handler: a PO failure here aborts the call instead of returning success.
      v_po_res := public.create_purchase_order_from_award(v_award.id);
      v_po_id := (v_po_res->>'po_id')::uuid;
      v_po_number := v_po_res->>'po_number';
    END IF;
    IF v_po_id IS NULL THEN
      RAISE EXCEPTION 'Reveal failed: no Purchase Order exists for the award';
    END IF;
    RETURN jsonb_build_object('already_revealed', true, 'supplier_id', v_supplier_id, 'business_name', v_business,
      'contact_phone', v_phone, 'contact_email', v_email, 'alias_before_reveal', v_alias,
      'po_id', v_po_id, 'po_number', v_po_number);
  END IF;

  UPDATE rfqs SET reveal_status = 'REVEALED', updated_at = v_now WHERE id = p_rfq_id;
  UPDATE awards SET status = 'REVEALED', revealed_at = v_now WHERE id = v_award.id;

  -- No exception handler: any PO failure (pending approval stages, unverified supplier, missing
  -- data, ...) propagates and rolls back the two UPDATEs above in this same transaction.
  v_po_res := public.create_purchase_order_from_award(v_award.id);
  v_po_id := (v_po_res->>'po_id')::uuid;
  v_po_number := v_po_res->>'po_number';
  IF v_po_id IS NULL THEN
    RAISE EXCEPTION 'Reveal failed: Purchase Order was not created';
  END IF;

  PERFORM private.issue_decision_receipt_snapshots_for_award(v_award.id, 'POST_REVEAL');
  INSERT INTO audit_events (event_type, actor_id, organization_id, entity_type, entity_id, payload)
  VALUES ('identity.revealed', COALESCE(private.get_profile_id(), v_rfq.created_by), v_rfq.organization_id, 'award', v_award.id::text,
    jsonb_build_object('rfq_id', p_rfq_id, 'quote_id', v_award.quote_id, 'supplier_id', v_supplier_id,
      'business_name', v_business, 'alias_before_reveal', v_alias, 'awarded_at', v_award.awarded_at,
      'buyer_released_to_supplier', true, 'po_number', v_po_number));
  RETURN jsonb_build_object('supplier_id', v_supplier_id, 'business_name', v_business, 'contact_phone', v_phone,
    'contact_email', v_email, 'alias_before_reveal', v_alias, 'revealed_at', v_now,
    'buyer_released_to_supplier', true, 'po_id', v_po_id, 'po_number', v_po_number);
END;
$$;

REVOKE ALL ON FUNCTION public.reveal_award(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_award(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- F-08: get_founder_executive_metrics (00179 body, KPI definitions corrected)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_founder_executive_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_total_buyers integer;
  v_active_buyers integer;
  v_repeat_buyers integer;
  v_total_suppliers integer;
  v_verified_suppliers integer;
  v_active_suppliers integer;
  v_repeat_suppliers integer;
  v_total_rfqs integer;
  v_active_rfqs integer;
  v_awarded_rfqs integer;
  v_issued_orders integer;
  v_completed_orders integer;
  v_total_gmv numeric(14,2);
  v_total_fees numeric(14,2);
  v_first_tx timestamptz;
  v_latest_tx timestamptz;
  v_geo_cities integer;
  v_milestones jsonb;
BEGIN
  -- 1. Security Check: Founder Isolation
  IF NOT private.is_founder() THEN
    RAISE EXCEPTION 'Access denied: Founder executive privileges required (INV-FOUNDER-01)';
  END IF;

  -- 2. Buyer Metrics
  SELECT count(*) INTO v_total_buyers FROM public.organizations WHERE org_type IS NOT NULL;

  SELECT count(DISTINCT organization_id) INTO v_active_buyers
  FROM public.rfqs WHERE status <> 'DRAFT';

  SELECT count(*) INTO v_repeat_buyers
  FROM (
    SELECT organization_id FROM public.rfqs
    WHERE status <> 'DRAFT'
    GROUP BY organization_id HAVING count(*) >= 2
  ) rb;

  -- 3. Supplier Metrics
  SELECT count(*) INTO v_total_suppliers FROM public.suppliers;

  -- Authoritative verified predicate (same as lock_and_reveal_award_atomic / PO creation).
  SELECT count(*) INTO v_verified_suppliers
  FROM public.suppliers
  WHERE lifecycle_state = 'VERIFIED' AND verification_status = 'VERIFIED';

  SELECT count(DISTINCT supplier_id) INTO v_active_suppliers
  FROM public.quotes WHERE status NOT IN ('DRAFT', 'WITHDRAWN');

  SELECT count(*) INTO v_repeat_suppliers
  FROM (
    SELECT supplier_id FROM public.quotes
    WHERE status NOT IN ('DRAFT', 'WITHDRAWN')
    GROUP BY supplier_id HAVING count(*) >= 2
  ) rs;

  -- 4. Procurement & Transaction Metrics
  SELECT count(*) INTO v_total_rfqs FROM public.rfqs;

  SELECT count(*) INTO v_active_rfqs FROM public.rfqs
  WHERE status IN ('OPEN', 'CLARIFICATION', 'EVALUATING');

  -- rfq_status has no COMPLETED value (00001); the 00179 predicate raised 22P02 and made the whole RPC fail.
  SELECT count(*) INTO v_awarded_rfqs FROM public.rfqs
  WHERE status = 'AWARDED';

  -- GMV and "issued" count keep the original ISSUED/ACCEPTED/COMPLETED set (settled and in-flight).
  SELECT count(*), COALESCE(sum(total_amount), 0.00)
  INTO v_issued_orders, v_total_gmv
  FROM public.purchase_orders
  WHERE status IN ('COMPLETED', 'ACCEPTED', 'ISSUED');

  -- Completed means the repo-defined COMPLETED status only.
  SELECT count(*) INTO v_completed_orders
  FROM public.purchase_orders
  WHERE status = 'COMPLETED';

  SELECT COALESCE(sum(fee_amount), 0.00)
  INTO v_total_fees
  FROM public.platform_fee_transactions
  WHERE status = 'COLLECTED';

  SELECT min(issued_at), max(issued_at)
  INTO v_first_tx, v_latest_tx
  FROM public.purchase_orders;

  -- 5. Geographical Footprint
  SELECT count(DISTINCT delivery_city) INTO v_geo_cities
  FROM public.requirements
  WHERE delivery_city IS NOT NULL AND btrim(delivery_city) <> '';

  -- 6. Authoritative Production Milestones
  v_milestones := jsonb_build_array(
    jsonb_build_object(
      'id', 'M-BUYER-001',
      'title', 'First Enterprise/Community Buyer',
      'target', 1,
      'current', v_total_buyers,
      'achieved', v_total_buyers >= 1
    ),
    jsonb_build_object(
      'id', 'M-BUYER-025',
      'title', '25 Registered Buying Organizations',
      'target', 25,
      'current', v_total_buyers,
      'achieved', v_total_buyers >= 25
    ),
    jsonb_build_object(
      'id', 'M-BUYER-100',
      'title', '100 Registered Buying Organizations',
      'target', 100,
      'current', v_total_buyers,
      'achieved', v_total_buyers >= 100
    ),
    jsonb_build_object(
      'id', 'M-SUPPLIER-001',
      'title', 'First Network Supplier',
      'target', 1,
      'current', v_total_suppliers,
      'achieved', v_total_suppliers >= 1
    ),
    jsonb_build_object(
      'id', 'M-SUPPLIER-025',
      'title', '25 Network Verified Suppliers',
      'target', 25,
      'current', v_verified_suppliers,
      'achieved', v_verified_suppliers >= 25
    ),
    jsonb_build_object(
      'id', 'M-SUPPLIER-100',
      'title', '100 Network Verified Suppliers',
      'target', 100,
      'current', v_verified_suppliers,
      'achieved', v_verified_suppliers >= 100
    ),
    jsonb_build_object(
      'id', 'M-TX-001',
      'title', 'First Successful Procurement Award & PO',
      'target', 1,
      'current', v_issued_orders,
      'achieved', v_issued_orders >= 1,
      'achievedAt', v_first_tx
    ),
    jsonb_build_object(
      'id', 'M-TX-025',
      'title', '25 Completed Purchase Orders',
      'target', 25,
      'current', v_completed_orders,
      'achieved', v_completed_orders >= 25
    ),
    jsonb_build_object(
      'id', 'M-GMV-100K',
      'title', '₹1,00,000 Cumulative Procurement GMV',
      'target', 100000,
      'current', v_total_gmv,
      'achieved', v_total_gmv >= 100000
    ),
    jsonb_build_object(
      'id', 'M-GMV-1M',
      'title', '₹10,00,000 Cumulative Procurement GMV',
      'target', 1000000,
      'current', v_total_gmv,
      'achieved', v_total_gmv >= 1000000
    )
  );

  RETURN jsonb_build_object(
    'generatedAt', now(),
    'buyers', jsonb_build_object(
      'total', v_total_buyers,
      'active', v_active_buyers,
      'repeat', v_repeat_buyers,
      'repeatPercentage', CASE WHEN v_active_buyers > 0 THEN round(100.0 * v_repeat_buyers / v_active_buyers, 1) ELSE 0 END
    ),
    'suppliers', jsonb_build_object(
      'total', v_total_suppliers,
      'verified', v_verified_suppliers,
      'active', v_active_suppliers,
      'repeat', v_repeat_suppliers,
      'repeatPercentage', CASE WHEN v_active_suppliers > 0 THEN round(100.0 * v_repeat_suppliers / v_active_suppliers, 1) ELSE 0 END
    ),
    'procurement', jsonb_build_object(
      'totalRfqs', v_total_rfqs,
      'activeRfqs', v_active_rfqs,
      'awardedRfqs', v_awarded_rfqs,
      'purchaseOrdersIssued', v_issued_orders,
      'completedOrders', v_completed_orders,
      'totalGmv', v_total_gmv,
      'totalPlatformFees', v_total_fees,
      'firstTransactionAt', v_first_tx,
      'latestTransactionAt', v_latest_tx
    ),
    'geography', jsonb_build_object(
      'citiesCovered', v_geo_cities
    ),
    'milestones', v_milestones
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_founder_executive_metrics() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- F-08: founder-only read of the EXISTING Google Places daily request counter (00224).
-- Reads google_places_daily_budget (written by location_pin_coverage_reserve_google_calls).
-- No new table, no new writer. Day key matches the writer: UTC date.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_founder_google_places_budget_today()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_date date := (now() AT TIME ZONE 'utc')::date;
  v_count integer;
BEGIN
  IF NOT private.is_founder() THEN
    RAISE EXCEPTION 'Access denied: Founder executive privileges required (INV-FOUNDER-01)';
  END IF;
  SELECT request_count INTO v_count FROM public.google_places_daily_budget WHERE usage_date = v_date;
  RETURN jsonb_build_object(
    'usageDate', v_date,
    'requestCount', COALESCE(v_count, 0),
    'source', 'google_places_daily_budget'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_founder_google_places_budget_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_founder_google_places_budget_today() TO authenticated, service_role;

COMMIT;
