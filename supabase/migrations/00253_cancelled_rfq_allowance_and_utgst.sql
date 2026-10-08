-- 00253: cancelled RFQs do not consume the pilot allowance, and intra-state
-- Union Territory GST is CGST + UTGST.
--
-- 00248 counted every RFQ in the month, including CANCELLED, so a cancelled
-- enquiry still used one of the three monthly slots and could consume the
-- yearly quarterly bonus. This replaces that counter only. Individual, RWA,
-- and MSME keep the same 3-a-month rule and the same one-bonus quarter rule.
--
-- 00245 stored utgst_total as 0 and put an intra-state split into CGST + SGST.
-- 00168 already treats state codes 04, 25, 26, 31, 35, 38, and 97 as Union
-- Territories. New purchase orders and decision receipts use that same list.
-- Inter-state remains IGST. An unavailable state split remains zero. Historical
-- rows are not backfilled. 00245 and 00241 are not edited.

BEGIN;

CREATE OR REPLACE FUNCTION private.gst_component_split(
  p_gst numeric,
  p_inter boolean,
  p_state text,
  OUT cgst numeric,
  OUT sgst numeric,
  OUT utgst numeric,
  OUT igst numeric
)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE WHEN p_inter OR p_gst IS NULL THEN 0 ELSE round(p_gst / 2, 2) END,
    CASE
      WHEN p_inter OR p_gst IS NULL THEN 0
      WHEN COALESCE(p_state, '') IN ('04', '25', '26', '31', '35', '38', '97') THEN 0
      ELSE p_gst - round(p_gst / 2, 2)
    END,
    CASE
      WHEN p_inter OR p_gst IS NULL THEN 0
      WHEN COALESCE(p_state, '') IN ('04', '25', '26', '31', '35', '38', '97') THEN p_gst - round(p_gst / 2, 2)
      ELSE 0
    END,
    CASE WHEN p_inter THEN COALESCE(p_gst, 0) ELSE 0 END;
$$;

REVOKE ALL ON FUNCTION private.gst_component_split(numeric, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.gst_component_split(numeric, boolean, text) TO service_role;

CREATE OR REPLACE FUNCTION private.enforce_pilot_rfq_allowance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_allowance CONSTANT integer := 3;
  v_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_quarter_start timestamptz := date_trunc('quarter', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_used integer;
  v_bonus_used integer := 0;
  v_plan text := '';
  v_status text := '';
  v_expires timestamptz;
  v_org_type text := '';
  v_yearly boolean := false;
BEGIN
  IF private.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  -- Defaults fill created_at before this trigger. A caller-supplied timestamp
  -- outside this month would not be counted and could be repeated without limit.
  IF NEW.created_at < v_month_start OR NEW.created_at >= v_month_start + interval '1 month' THEN
    RAISE EXCEPTION 'Pilot Allowance: an RFQ counts in the current UTC calendar month and cannot be recorded outside that month.'
      USING ERRCODE = 'P0001', HINT = 'PILOT_ALLOWANCE_EXHAUSTED';
  END IF;

  SELECT upper(btrim(COALESCE(subscription_plan, ''))),
         COALESCE(NULLIF(upper(btrim(COALESCE(subscription_status, ''))), ''), 'ACTIVE'),
         subscription_expires_at,
         upper(btrim(COALESCE(org_type::text, '')))
    INTO v_plan, v_status, v_expires, v_org_type
  FROM public.organizations
  WHERE id = NEW.organization_id
  FOR UPDATE;

  IF FOUND THEN
    v_yearly := v_plan = 'YEARLY'
      AND v_status = 'ACTIVE'
      AND (v_expires IS NULL OR v_expires >= now())
      AND v_org_type IN ('INDIVIDUAL', 'COMMUNITY', 'MSME');
  END IF;

  SELECT count(*)::integer INTO v_used
  FROM public.rfqs
  WHERE organization_id = NEW.organization_id
    AND created_at >= v_month_start
    AND created_at < v_month_start + interval '1 month'
    AND status IS DISTINCT FROM 'CANCELLED'::public.rfq_status;

  IF v_used < v_allowance THEN
    RETURN NEW;
  END IF;

  -- Exactly one extra row once this month is full, and only if no earlier
  -- month in this UTC calendar quarter already used the bonus.
  IF v_yearly AND v_used = v_allowance THEN
    SELECT COALESCE(SUM(GREATEST(month_count - v_allowance, 0)), 0)::integer
      INTO v_bonus_used
    FROM (
      SELECT count(*)::integer AS month_count
      FROM public.rfqs
      WHERE organization_id = NEW.organization_id
        AND created_at >= v_quarter_start
        AND created_at < v_quarter_start + interval '3 months'
        AND status IS DISTINCT FROM 'CANCELLED'::public.rfq_status
      GROUP BY date_trunc('month', created_at AT TIME ZONE 'UTC')
    ) quarter_months;

    IF COALESCE(v_bonus_used, 0) < 1 THEN
      RETURN NEW;
    END IF;
  END IF;

  IF v_yearly THEN
    RAISE EXCEPTION 'Pilot Allowance: 0 of % RFQs remaining this month (₹0 charged in Pilot Mode). The yearly plan quarterly bonus RFQ for this UTC calendar quarter is already used and does not carry into the next month.', v_allowance
      USING ERRCODE = 'P0001', HINT = 'PILOT_ALLOWANCE_EXHAUSTED';
  END IF;

  RAISE EXCEPTION 'Pilot Allowance: 0 of % RFQs remaining this month (₹0 charged in Pilot Mode). You have used all RFQs in this month''s pilot allowance. It resets on the 1st of next month.', v_allowance
    USING ERRCODE = 'P0001', HINT = 'PILOT_ALLOWANCE_EXHAUSTED';
END;
$$;


CREATE OR REPLACE FUNCTION public.create_purchase_order_from_award(p_award_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_award           awards%ROWTYPE;
  v_rfq             rfqs%ROWTYPE;
  v_quote           quotes%ROWTYPE;
  v_supplier        suppliers%ROWTYPE;
  v_version         quote_versions%ROWTYPE;
  v_existing_po     purchase_orders%ROWTYPE;
  v_po_id           uuid;
  v_po_number       text;
  v_total           numeric;
  v_currency        text;
  v_pending_stages  integer := 0;
  v_terms           text;
  v_structure       text;
  v_splits          jsonb;
  v_schedule        jsonb := '[]'::jsonb;
  v_wo_id           uuid;
  v_split           jsonb;
  v_idx             integer := 0;
  v_n               integer;
  v_cum             numeric := 0;
  v_alloc           numeric;
  v_alloc_sum       numeric := 0;
  -- F-13 tax derivation (mirrors the 00241 decision receipt).
  v_base            numeric;
  v_gst             numeric;
  v_cgst            numeric;
  v_sgst            numeric;
  v_igst            numeric;
  v_utgst           numeric;
  v_inter           boolean;
  v_tax_basis       text;
  v_delivery_state  text;
  v_supplier_state  text;
  v_tax_snapshot    jsonb;
BEGIN
  SELECT * INTO v_award FROM awards WHERE id = p_award_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Award not found'; END IF;
  IF v_award.status <> 'REVEALED' THEN RAISE EXCEPTION 'Award must be REVEALED before creating a Purchase Order'; END IF;
  SELECT * INTO v_rfq FROM rfqs WHERE id = v_award.rfq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found'; END IF;
  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR private.is_platform_admin()
    OR private.is_org_member(v_rfq.organization_id)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  SELECT COUNT(*) INTO v_pending_stages FROM public.rfq_approval_stages WHERE rfq_id = v_rfq.id AND status != 'APPROVED';
  IF v_pending_stages > 0 THEN RAISE EXCEPTION 'Cannot create Purchase Order: Required approval tier(s) are pending satisfaction.'; END IF;
  SELECT * INTO v_quote FROM quotes WHERE id = v_award.quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Awarded quote not found'; END IF;
  SELECT * INTO v_supplier FROM suppliers WHERE id = v_quote.supplier_id;
  IF v_supplier.lifecycle_state <> 'VERIFIED' OR v_supplier.verification_status <> 'VERIFIED' THEN
    RAISE EXCEPTION 'Cannot create Purchase Order: Supplier must complete onboarding and verification before PO creation.';
  END IF;
  SELECT * INTO v_existing_po FROM purchase_orders WHERE award_id = p_award_id;
  IF FOUND THEN
    PERFORM private.issue_po_document_snapshots(v_existing_po.id);
    IF NOT EXISTS (SELECT 1 FROM work_orders WHERE purchase_order_id = v_existing_po.id) THEN
      INSERT INTO work_orders (purchase_order_id, supplier_id, status, title, progress_percent, created_at, updated_at)
      VALUES (v_existing_po.id, v_existing_po.supplier_id, 'NOT_STARTED', 'Work order - ' || v_existing_po.po_number, 0, now(), now());
    END IF;
    RETURN jsonb_build_object('po_id', v_existing_po.id, 'po_number', v_existing_po.po_number);
  END IF;
  SELECT * INTO v_version FROM quote_versions WHERE quote_id = v_quote.id AND version = v_quote.current_version;
  v_total := COALESCE((v_version.snapshot->>'totalCost')::numeric, (v_version.snapshot->>'basePrice')::numeric, 0);
  v_currency := COALESCE(v_version.snapshot->>'currency', 'INR');
  v_po_number := 'PO-' || to_char(now(), 'YYYY-MM-DD') || '-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 8));

  -- F-13: tax-exclusive taxable value and GST from the awarded quote snapshot, split exactly as the
  -- 00241 decision receipt splits it (snapshot isInterState, else both state codes, else UNAVAILABLE).
  v_base := COALESCE((v_version.snapshot->>'basePrice')::numeric, (v_version.snapshot->>'totalCost')::numeric, 0);
  v_gst := COALESCE((v_version.snapshot->>'gstAmount')::numeric, 0);
  v_delivery_state := NULLIF(btrim(COALESCE(v_rfq.delivery_address_snapshot->>'stateCode', '')), '');
  v_supplier_state := NULLIF(btrim(COALESCE(v_supplier.registered_address->>'stateCode', '')), '');
  IF v_version.snapshot ? 'isInterState' THEN
    v_inter := (v_version.snapshot->>'isInterState')::boolean;
    v_tax_basis := 'QUOTE_SNAPSHOT';
  ELSIF v_delivery_state IS NOT NULL AND v_supplier_state IS NOT NULL THEN
    v_inter := (v_delivery_state <> v_supplier_state);
    v_tax_basis := 'STATE_CODES';
  ELSE
    v_inter := false;
    v_tax_basis := 'UNAVAILABLE';
  END IF;
  IF v_tax_basis = 'UNAVAILABLE' THEN
    v_cgst := 0; v_sgst := 0; v_utgst := 0; v_igst := 0;
  ELSE
    SELECT cgst, sgst, utgst, igst INTO v_cgst, v_sgst, v_utgst, v_igst
    FROM private.gst_component_split(v_gst, v_inter, CASE WHEN v_inter THEN NULL ELSE COALESCE(v_delivery_state, v_supplier_state) END);
  END IF;
  v_tax_snapshot := COALESCE(v_version.snapshot, '{}'::jsonb)
    || jsonb_build_object('taxSplitBasis', v_tax_basis)
    || CASE WHEN v_tax_basis = 'UNAVAILABLE' THEN '{}'::jsonb
            ELSE jsonb_build_object('isInterState', v_inter) END;

  -- Buyer's declared plan (authoritative: requirements.commercial.paymentTerms).
  SELECT NULLIF(btrim(r.commercial->>'paymentTerms'), '') INTO v_terms
  FROM public.requirements r WHERE r.id = v_rfq.requirement_id;
  v_structure := public.resolve_declared_payment_structure(v_terms);
  v_splits := public.declared_payment_splits(v_structure);
  v_n := jsonb_array_length(v_splits);
  IF v_n > 0 THEN
    FOR v_split IN SELECT * FROM jsonb_array_elements(v_splits) LOOP
      v_idx := v_idx + 1;
      v_cum := v_cum + (v_split->>'percentage')::numeric;
      v_alloc := CASE WHEN v_idx = v_n THEN v_total - v_alloc_sum
                      ELSE round(v_total * (v_split->>'percentage')::numeric / 100, 2) END;
      v_alloc_sum := v_alloc_sum + v_alloc;
      v_schedule := v_schedule || jsonb_build_array(jsonb_build_object(
        'index', v_idx, 'label', v_split->>'label', 'percentage', (v_split->>'percentage')::numeric,
        'cumulativePercentage', v_cum, 'amount', v_alloc));
    END LOOP;
  END IF;

  INSERT INTO purchase_orders (
    award_id, rfq_id, organization_id, supplier_id, po_number, status, total_amount, currency,
    taxable_total, cgst_total, sgst_total, utgst_total, igst_total, tax_snapshot,
    delivery_address_snapshot, billing_address_snapshot, issued_at, created_at, updated_at,
    payment_structure, payment_terms_text, payment_schedule
  ) VALUES (
    p_award_id, v_rfq.id, v_rfq.organization_id, v_quote.supplier_id, v_po_number, 'ISSUED'::public.purchase_order_status,
    v_total, v_currency, v_base, v_cgst, v_sgst, v_utgst, v_igst, v_tax_snapshot,
    v_rfq.delivery_address_snapshot, v_rfq.billing_address_snapshot, now(), now(), now(),
    v_structure, v_terms, v_schedule
  ) RETURNING id INTO v_po_id;
  INSERT INTO work_orders (purchase_order_id, supplier_id, status, title, progress_percent, created_at, updated_at)
  VALUES (v_po_id, v_quote.supplier_id, 'NOT_STARTED', 'Work order - ' || v_po_number, 0, now(), now())
  RETURNING id INTO v_wo_id;

  IF v_n > 0 THEN
    INSERT INTO work_order_milestones (work_order_id, milestone_index, milestone_title, target_percentage, allocated_amount, status)
    SELECT v_wo_id, (s->>'index')::int, s->>'label', (s->>'cumulativePercentage')::numeric::int, (s->>'amount')::numeric, 'PENDING'
    FROM jsonb_array_elements(v_schedule) s;
  END IF;

  PERFORM private.issue_po_document_snapshots(v_po_id);
  RETURN jsonb_build_object('po_id', v_po_id, 'po_number', v_po_number,
    'payment_structure', v_structure, 'payment_schedule', v_schedule);
END;
$$;


CREATE OR REPLACE FUNCTION private.issue_decision_receipt_snapshots_for_award(
  p_award_id uuid,
  p_identity_state text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_award awards%ROWTYPE;
  v_rfq rfqs%ROWTYPE;
  v_quote quotes%ROWTYPE;
  v_org organizations%ROWTYPE;
  v_req requirements%ROWTYPE;
  v_supplier suppliers%ROWTYPE;
  v_inv rfq_invitations%ROWTYPE;
  v_version quote_versions%ROWTYPE;
  v_profile profiles%ROWTYPE;
  v_persona text;
  v_receipt_id text;
  v_generated timestamptz := now();
  v_revealed boolean;
  v_base numeric;
  v_gst numeric;
  v_total numeric;
  v_gst_rate numeric;
  v_cgst numeric;
  v_sgst numeric;
  v_igst numeric;
  v_utgst numeric;
  v_inter boolean;
  v_canonical jsonb;
  v_payload jsonb;
  v_proc jsonb;
  v_hash text;
  v_phase text;
  v_identity text;
  v_supplier_id text;
  v_mask text;
  v_supplier_name text;
  v_supplier_gstin text;
  v_idem text;
  v_perspectives text[] := ARRAY['BUYER'];
  v_p text;
  v_viewer text;
  v_governance jsonb;
  v_quote_count integer;
  v_can_base jsonb;
  v_can_loop jsonb;
  v_category_name text;
  v_delivery_state text;
  v_supplier_state text;
  v_delivery_days integer;
  v_warranty_months integer;
  v_eval_count integer;
  v_scored_count integer;
  v_costed_count integer;
  v_rank integer;
  v_lowest numeric;
  v_selected_is_lowest boolean;
  v_score numeric;
  v_has_gst boolean;
  v_tax_basis text;
  v_payment_structure text;
  v_awarded_role text;
BEGIN
  SELECT * INTO v_award FROM awards WHERE id = p_award_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_rfq FROM rfqs WHERE id = v_award.rfq_id;
  SELECT * INTO v_quote FROM quotes WHERE id = v_award.quote_id;
  SELECT * INTO v_org FROM organizations WHERE id = v_rfq.organization_id;
  SELECT * INTO v_req FROM requirements WHERE id = v_rfq.requirement_id;
  SELECT * INTO v_supplier FROM suppliers WHERE id = v_quote.supplier_id;
  SELECT * INTO v_inv FROM rfq_invitations WHERE id = v_quote.invitation_id;
  SELECT * INTO v_version FROM quote_versions WHERE quote_id = v_quote.id AND version = v_quote.current_version;
  SELECT * INTO v_profile FROM profiles WHERE id = v_award.awarded_by;
  v_persona := private.org_type_to_otp_referred_profile_kind(v_org.org_type);
  IF v_persona = 'RWA' THEN v_persona := 'RWA'; ELSIF v_persona = 'MSME' THEN v_persona := 'MSME'; ELSE v_persona := 'INDIVIDUAL'; END IF;

  v_base := COALESCE((v_version.snapshot->>'basePrice')::numeric, (v_version.snapshot->>'totalCost')::numeric, 0);
  v_has_gst := (v_version.snapshot ? 'gstAmount');
  v_gst := COALESCE((v_version.snapshot->>'gstAmount')::numeric, 0);
  v_total := COALESCE((v_version.snapshot->>'totalCost')::numeric, v_base + v_gst);
  v_gst_rate := CASE WHEN v_base > 0 THEN round((v_gst / v_base) * 100, 2) ELSE 0 END;
  v_delivery_state := NULLIF(btrim(COALESCE(v_rfq.delivery_address_snapshot->>'stateCode', '')), '');
  v_supplier_state := NULLIF(btrim(COALESCE(v_supplier.registered_address->>'stateCode', '')), '');
  -- Statutory split only from authoritative data: the quote's own isInterState, else both
  -- registered state codes. Otherwise the split is reported as unavailable (never assumed).
  IF v_version.snapshot ? 'isInterState' THEN
    v_inter := (v_version.snapshot->>'isInterState')::boolean;
    v_tax_basis := 'QUOTE_SNAPSHOT';
  ELSIF v_delivery_state IS NOT NULL AND v_supplier_state IS NOT NULL THEN
    v_inter := (v_delivery_state <> v_supplier_state);
    v_tax_basis := 'STATE_CODES';
  ELSE
    v_inter := false;
    v_tax_basis := 'UNAVAILABLE';
  END IF;
  IF v_tax_basis = 'UNAVAILABLE' THEN
    v_cgst := 0; v_sgst := 0; v_utgst := 0; v_igst := 0;
  ELSE
    SELECT cgst, sgst, utgst, igst INTO v_cgst, v_sgst, v_utgst, v_igst
    FROM private.gst_component_split(v_gst, v_inter, CASE WHEN v_inter THEN NULL ELSE COALESCE(v_delivery_state, v_supplier_state) END);
  END IF;

  SELECT c.name INTO v_category_name FROM public.requirement_categories c WHERE c.id = v_req.category_id;
  v_delivery_days := CASE WHEN v_version.snapshot ? 'deliveryDays'
                          THEN NULLIF(v_version.snapshot->>'deliveryDays', '')::numeric::int END;
  v_warranty_months := CASE WHEN v_version.snapshot ? 'warrantyMonths'
                            THEN NULLIF(v_version.snapshot->>'warrantyMonths', '')::numeric::int END;
  v_payment_structure := public.resolve_declared_payment_structure(NULLIF(btrim(v_req.commercial->>'paymentTerms'), ''));
  SELECT om.role::text INTO v_awarded_role
  FROM public.organization_members om
  WHERE om.organization_id = v_rfq.organization_id AND om.profile_id = v_award.awarded_by;
  v_mask := COALESCE(v_inv.anonymous_label, 'Supplier #01');
  v_revealed := (p_identity_state = 'POST_REVEAL');
  v_identity := p_identity_state;
  v_phase := CASE WHEN v_revealed THEN 'POST_AWARD' ELSE 'PRE_AWARD' END;
  v_receipt_id := 'REC-' || upper(substr(v_award.id::text, 1, 8)) || '-' || upper(substr(v_identity, 1, 3));
  v_supplier_id := CASE WHEN v_revealed THEN v_supplier.id::text ELSE NULL END;
  v_supplier_name := CASE WHEN v_revealed THEN v_supplier.business_name ELSE v_mask END;
  v_supplier_gstin := CASE WHEN v_revealed THEN v_supplier.gstin ELSE NULL END;

  -- Comparable set = live quotes (not DRAFT / WITHDRAWN). Every merit fact below is computed from it.
  WITH cmp AS (
    SELECT q.id, q.evaluation_score,
           COALESCE((qv.snapshot->>'totalCost')::numeric,
                    (qv.snapshot->>'basePrice')::numeric + COALESCE((qv.snapshot->>'gstAmount')::numeric, 0)) AS total_cost
    FROM quotes q
    LEFT JOIN quote_versions qv ON qv.quote_id = q.id AND qv.version = q.current_version
    WHERE q.rfq_id = v_rfq.id AND q.status NOT IN ('DRAFT'::public.quote_status, 'WITHDRAWN'::public.quote_status)
  )
  SELECT count(*), count(evaluation_score), count(total_cost), min(total_cost)
  INTO v_eval_count, v_scored_count, v_costed_count, v_lowest
  FROM cmp;
  v_quote_count := v_eval_count;
  -- Rank only when the selected quote and every comparable quote carry a calculated score.
  IF v_quote.evaluation_score IS NOT NULL AND v_scored_count = v_eval_count AND v_eval_count > 0 THEN
    SELECT 1 + count(*) INTO v_rank
    FROM quotes q
    WHERE q.rfq_id = v_rfq.id AND q.status NOT IN ('DRAFT'::public.quote_status, 'WITHDRAWN'::public.quote_status)
      AND q.evaluation_score > v_quote.evaluation_score;
  ELSE
    v_rank := NULL;
  END IF;
  -- Lowest cost only when every comparable quote has a cost; the selected-is-lowest claim only when true.
  IF v_costed_count <> v_eval_count OR v_eval_count = 0 THEN
    v_lowest := NULL;
    v_selected_is_lowest := NULL;
  ELSE
    v_selected_is_lowest := (v_total <= v_lowest);
  END IF;
  -- evaluation_score is stored 0-100; the receipt reports /10 (same convention as the award screen).
  v_score := CASE WHEN v_quote.evaluation_score IS NULL THEN NULL ELSE round(v_quote.evaluation_score / 10.0, 2) END;

  v_governance := jsonb_build_object('persona', v_persona);
  IF v_persona = 'INDIVIDUAL' THEN
    v_governance := v_governance || jsonb_build_object('individualConfirmation', jsonb_build_object(
      'confirmedAt', v_award.awarded_at, 'confirmedBy', v_award.awarded_by::text));
  END IF;

  v_canonical := jsonb_build_object(
    'receiptId', v_receipt_id,
    'rfqId', v_rfq.id::text,
    'rfqRefNumber', COALESCE(v_rfq.public_ref, 'RFQ-' || upper(substr(v_rfq.id::text, 1, 8))),
    'rfqTitle', COALESCE(v_rfq.title, 'Procurement RFQ'),
    'buyerPersona', v_persona,
    'buyerContext', jsonb_build_object(
      'organizationId', v_org.id::text,
      'organizationName', v_org.name,
      'buyerName', COALESCE(v_profile.full_name, v_profile.email, v_award.awarded_by::text),
      'buyerEmail', v_profile.email,
      'buyerPhone', v_profile.phone,
      'buyerGstin', NULL,
      'buyerPan', NULL,
      'deliveryStateCode', v_delivery_state
    ),
    'requirementSnapshot', jsonb_build_object(
      'requirementId', v_req.id::text,
      'title', COALESCE(v_req.title, v_rfq.title),
      'categoryName', v_category_name,
      'mode', COALESCE(v_req.requirement_type::text, 'DIRECT_PURCHASE'),
      'budgetAmount', NULL
    ),
    'selectedOffer', jsonb_build_object(
      'quoteId', v_quote.id::text,
      'quoteVersion', v_quote.current_version,
      'supplierId', v_supplier_id,
      'maskedSupplierLabel', v_mask,
      'businessName', CASE WHEN v_revealed THEN v_supplier.business_name ELSE NULL END,
      'supplierGstin', v_supplier_gstin,
      'supplierStateCode', v_supplier_state,
      'baseAmount', v_base,
      'gstRate', CASE WHEN v_has_gst THEN v_gst_rate ELSE NULL END,
      'gstAmount', CASE WHEN v_has_gst THEN v_gst ELSE NULL END,
      'taxSplitBasis', v_tax_basis,
      'cgstAmount', v_cgst,
      'sgstAmount', v_sgst,
      'utgstAmount', v_utgst,
      'igstAmount', v_igst,
      'isInterState', v_inter,
      'totalLandedCost', v_total,
      'deliveryTimelineDays', v_delivery_days,
      'warrantyPeriodMonths', v_warranty_months,
      'paymentStructure', v_payment_structure
    ),
    'meritEvaluation', jsonb_build_object(
      'rank', v_rank,
      'score', v_score,
      'totalQuotesEvaluated', v_quote_count,
      'lowestTotalCost', v_lowest,
      'selectedIsLowestCost', v_selected_is_lowest,
      'costAvoidedComparedToIncumbent', NULL,
      'consensusJustification', NULLIF(btrim(COALESCE(v_award.justification->>'text', '')), '')
    ),
    'authorityAttribution', jsonb_build_object(
      'awardedByProfileId', v_award.awarded_by::text,
      'awardedByName', COALESCE(v_profile.full_name, v_profile.email, v_award.awarded_by::text),
      'awardedByRole', v_awarded_role,
      'isDelegated', false,
      'delegatorProfileId', NULL,
      'delegationId', NULL
    ),
    'governanceRecord', v_governance,
    'timestamps', jsonb_build_object(
      'awardedAt', v_award.awarded_at,
      'revealedAt', v_award.revealed_at,
      'receiptGeneratedAt', v_generated
    )
  );

  v_can_base := v_canonical;

  IF p_identity_state = 'POST_REVEAL' THEN
    v_perspectives := ARRAY['BUYER', 'SUPPLIER'];
  END IF;

  FOREACH v_p IN ARRAY v_perspectives LOOP
    v_viewer := lower(v_p);
    v_idem := 'decision:' || v_award.id::text || ':' || v_identity || ':' || v_p;
    IF v_p = 'SUPPLIER' THEN
      v_idem := v_idem || ':' || v_supplier.id::text;
    END IF;
    v_can_loop := v_can_base;
    IF v_p = 'SUPPLIER' THEN
      v_can_loop := jsonb_set(v_can_loop, '{governanceRecord}', jsonb_build_object('persona', v_persona));
    END IF;
    v_hash := public.compute_decision_receipt_digest_v1(v_can_loop);
    v_can_loop := v_can_loop || jsonb_build_object('cryptographicAuditHash', v_hash);
    v_proc := jsonb_build_object(
      'kind', 'DECISION_RECEIPT',
      'phase', v_phase,
      'viewerRole', v_viewer,
      'referenceNumber', v_receipt_id,
      'recordId', v_rfq.id::text,
      'title', COALESCE(v_rfq.title, 'Decision Receipt'),
      'issuedAt', v_award.awarded_at,
      'generatedAt', v_generated,
      'currency', 'INR',
      'buyer', jsonb_build_object('name', v_org.name, 'gstin', NULL),
      'suppliers', jsonb_build_array(jsonb_build_object(
        'id', v_supplier_id,
        'name', v_supplier_name,
        'gstin', v_supplier_gstin
      )),
      'lines', jsonb_build_array(jsonb_build_object(
        'description', COALESCE(v_rfq.title, 'Awarded scope'),
        'quantity', 1,
        'unit', 'Lot',
        'rate', v_base,
        'taxableAmount', v_base,
        'gstRate', v_gst_rate,
        'gstAmount', v_gst,
        'totalAmount', v_total
      )),
      'verification', jsonb_build_object('label', 'Document Integrity Reference', 'value', v_hash),
      'notes', jsonb_build_array('Integrity digest (OTP internal algorithm). Not a statutory digital signature under IT Act eSign/DSC.')
    );
    v_payload := jsonb_build_object(
      'schemaVersion', '1',
      'canonicalDecisionReceipt', v_can_loop,
      'reputationAppendix', NULL,
      'procurementDocumentInput', v_proc,
      'sourceAuditRefs', jsonb_build_object(
        'awardId', v_award.id::text,
        'purchaseOrderId', NULL,
        'invoiceId', NULL,
        'rfqId', v_rfq.id::text,
        'quoteId', v_quote.id::text,
        'quoteVersion', v_quote.current_version
      )
    );
    PERFORM public.issue_document_snapshot_atomic(
      v_idem,
      v_rfq.organization_id,
      'DECISION_RECEIPT',
      v_receipt_id,
      'AWARD',
      v_award.id,
      CASE WHEN v_p = 'SUPPLIER' THEN v_supplier.id ELSE NULL END,
      '{}'::jsonb,
      v_persona,
      v_p,
      v_identity,
      '{}'::jsonb,
      'procurement-a4-v1',
      v_payload,
      v_hash,
      'OTP_DECISION_RECEIPT_V1',
      v_generated,
      private.get_profile_id(),
      false
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.create_purchase_order_from_award(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_order_from_award(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
