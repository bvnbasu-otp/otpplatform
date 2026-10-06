-- =============================================================================
-- 00240: P1-D - The buyer's selected payment plan drives the PO, its schedule and its document.
--
-- Discovery:
--   * The buyer's choice (Single / 30-50-20 / 4x25) IS persisted today, as the preset's value
--     string in requirements.commercial.paymentTerms (Tier1TellOtpCard -> draft patch). That is
--     the authoritative buyer declaration and is reused (no second copy of the choice).
--   * It never reached the PO: purchase_orders has no plan column, the decision-receipt snapshot
--     hard-coded 'MILESTONE_BASED' (00222), and work_order_milestones were never created for new
--     POs (only a one-off 20/40/30/10 backfill in 00167).
--
-- After:
--   * resolve_declared_payment_structure(text): deterministic mapping of the declared terms to
--     SINGLE_PAYMENT | THREE_PART_PAYMENT | MILESTONE_BASED | CUSTOM_TERMS (mirrors the
--     domain DECLARED_PAYMENT_PLANS). Missing terms resolve to SINGLE_PAYMENT, the intake default
--     the buyer is shown ("100% on delivery").
--   * purchase_orders.payment_structure / payment_terms_text / payment_schedule persist the plan
--     frozen at PO creation (immutable even if the requirement is edited later).
--   * create_purchase_order_from_award stamps the plan on the PO and creates the work-order
--     milestone schedule from it (cumulative target_percentage, allocated_amount from the PO total).
--     CUSTOM_TERMS creates no invented schedule.
--   * The issued PO document lists the plan in its notes.
--   No payment gateway, no change to simulated checkout.
-- =============================================================================

BEGIN;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS payment_structure  text,
  ADD COLUMN IF NOT EXISTS payment_terms_text text,
  ADD COLUMN IF NOT EXISTS payment_schedule   jsonb;

ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_payment_structure_check;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_payment_structure_check
  CHECK (payment_structure IS NULL OR payment_structure IN
    ('SINGLE_PAYMENT', 'THREE_PART_PAYMENT', 'MILESTONE_BASED', 'CUSTOM_TERMS'));

CREATE OR REPLACE FUNCTION public.resolve_declared_payment_structure(p_terms text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH t AS (
    SELECT COALESCE(array_agg((m[1])::int ORDER BY (m[1])::int), ARRAY[]::int[]) AS pcts
    FROM regexp_matches(COALESCE(p_terms, ''), '([0-9]+)\s*%', 'g') AS m
  )
  SELECT CASE
    WHEN p_terms IS NULL OR btrim(p_terms) = '' THEN 'SINGLE_PAYMENT'
    WHEN pcts = ARRAY[100] AND btrim(p_terms) ~* '^100\s*%\s*(on\s+)?(delivery|completion)' THEN 'SINGLE_PAYMENT'
    WHEN pcts = ARRAY[20, 30, 50] THEN 'THREE_PART_PAYMENT'
    WHEN pcts = ARRAY[25, 25, 25, 25] THEN 'MILESTONE_BASED'
    ELSE 'CUSTOM_TERMS'
  END
  FROM t;
$$;

-- Canonical splits (mirror packages/domain DECLARED_PAYMENT_PLANS).
CREATE OR REPLACE FUNCTION public.declared_payment_splits(p_structure text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_structure
    WHEN 'SINGLE_PAYMENT' THEN jsonb_build_array(
      jsonb_build_object('label', '100% On Delivery & Sign-off', 'percentage', 100))
    WHEN 'THREE_PART_PAYMENT' THEN jsonb_build_array(
      jsonb_build_object('label', 'Stage 1: Mobilization Advance', 'percentage', 30),
      jsonb_build_object('label', 'Stage 2: Material Dispatch & Delivery', 'percentage', 50),
      jsonb_build_object('label', 'Stage 3: Testing & Final Acceptance', 'percentage', 20))
    WHEN 'MILESTONE_BASED' THEN jsonb_build_array(
      jsonb_build_object('label', 'Milestone 1: Kickoff & Mobilization', 'percentage', 25),
      jsonb_build_object('label', 'Milestone 2: Dispatch & In-Transit', 'percentage', 25),
      jsonb_build_object('label', 'Milestone 3: Installation & Inspection', 'percentage', 25),
      jsonb_build_object('label', 'Milestone 4: Final Sign-off & Warranty', 'percentage', 25))
    ELSE '[]'::jsonb
  END;
$$;

REVOKE ALL ON FUNCTION public.resolve_declared_payment_structure(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.declared_payment_splits(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_declared_payment_structure(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.declared_payment_splits(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- create_purchase_order_from_award: 00222 body + persisted plan + milestone schedule.
-- ---------------------------------------------------------------------------
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
    v_total, v_currency, v_total, 0, 0, 0, 0, v_version.snapshot,
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

REVOKE ALL ON FUNCTION public.create_purchase_order_from_award(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_order_from_award(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- PO document snapshot: 00222 body + payment plan in the notes (only what is persisted).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.issue_po_document_snapshots(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_po purchase_orders%ROWTYPE;
  v_org organizations%ROWTYPE;
  v_supplier suppliers%ROWTYPE;
  v_rfq rfqs%ROWTYPE;
  v_generated timestamptz := now();
  v_proc jsonb;
  v_payload jsonb;
  v_digest text;
  v_perspectives text[] := ARRAY['BUYER', 'SUPPLIER'];
  v_p text;
  v_viewer text;
  v_idem text;
  v_persona text;
  v_notes jsonb;
  v_plan_note text;
BEGIN
  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_org FROM organizations WHERE id = v_po.organization_id;
  SELECT * INTO v_supplier FROM suppliers WHERE id = v_po.supplier_id;
  SELECT * INTO v_rfq FROM rfqs WHERE id = v_po.rfq_id;
  v_persona := private.org_type_to_otp_referred_profile_kind(v_org.org_type);
  IF v_persona NOT IN ('RWA', 'MSME') THEN v_persona := 'INDIVIDUAL'; END IF;

  v_notes := jsonb_build_array('Direct bilateral contract between buyer and supplier.');
  IF v_po.payment_structure IS NOT NULL THEN
    IF v_po.payment_structure = 'CUSTOM_TERMS' THEN
      v_plan_note := 'Payment terms (buyer-declared): ' || COALESCE(v_po.payment_terms_text, 'as agreed');
    ELSE
      SELECT 'Payment plan (' || v_po.payment_structure || '): ' ||
             string_agg((s->>'label') || ' ' || (s->>'percentage')
                        || '% (' || COALESCE(v_po.currency, 'INR') || ' ' || (s->>'amount') || ')', '; ' ORDER BY (s->>'index')::int)
      INTO v_plan_note
      FROM jsonb_array_elements(COALESCE(v_po.payment_schedule, '[]'::jsonb)) s;
    END IF;
    IF v_plan_note IS NOT NULL THEN
      v_notes := v_notes || jsonb_build_array(v_plan_note);
    END IF;
  END IF;

  FOREACH v_p IN ARRAY v_perspectives LOOP
    v_viewer := lower(v_p);
    v_idem := 'po:' || v_po.id::text || ':POST_REVEAL:' || v_p;
    v_proc := jsonb_build_object(
      'kind', 'PURCHASE_ORDER',
      'phase', 'POST_AWARD',
      'viewerRole', v_viewer,
      'referenceNumber', v_po.po_number,
      'recordId', v_po.id::text,
      'title', COALESCE(v_rfq.title, 'Purchase Order'),
      'issuedAt', COALESCE(v_po.issued_at, v_po.created_at),
      'generatedAt', v_generated,
      'currency', COALESCE(v_po.currency, 'INR'),
      'buyer', jsonb_build_object('name', COALESCE(v_org.legal_name, v_org.name), 'gstin', NULL),
      'suppliers', jsonb_build_array(jsonb_build_object(
        'id', v_supplier.id::text,
        'name', COALESCE(v_supplier.business_name, v_supplier.trade_name, 'Awarded supplier'),
        'gstin', v_supplier.gstin
      )),
      'lines', jsonb_build_array(jsonb_build_object(
        'description', COALESCE(v_rfq.title, 'Scope of work'),
        'quantity', 1,
        'unit', 'Lot',
        'rate', COALESCE(v_po.taxable_total, v_po.total_amount),
        'taxableAmount', COALESCE(v_po.taxable_total, v_po.total_amount),
        'gstRate', 0,
        'gstAmount', 0,
        'totalAmount', v_po.total_amount
      )),
      'notes', v_notes
    );
    v_digest := public.compute_procurement_a4_digest_v1(v_proc);
    v_proc := v_proc || jsonb_build_object(
      'verification', jsonb_build_object('label', 'Document Integrity Reference', 'value', v_digest)
    );
    v_payload := jsonb_build_object(
      'schemaVersion', '1',
      'canonicalDecisionReceipt', NULL,
      'reputationAppendix', NULL,
      'procurementDocumentInput', v_proc,
      'sourceAuditRefs', jsonb_build_object(
        'awardId', v_po.award_id::text,
        'purchaseOrderId', v_po.id::text,
        'invoiceId', NULL,
        'rfqId', v_po.rfq_id::text,
        'quoteId', NULL,
        'quoteVersion', NULL
      )
    );
    PERFORM public.issue_document_snapshot_atomic(
      v_idem,
      v_po.organization_id,
      'PURCHASE_ORDER',
      v_po.po_number,
      'PURCHASE_ORDER',
      v_po.id,
      CASE WHEN v_p = 'SUPPLIER' THEN v_supplier.id ELSE NULL END,
      '{}'::jsonb,
      v_persona,
      v_p,
      'POST_REVEAL',
      '{}'::jsonb,
      'procurement-a4-v1',
      v_payload,
      v_digest,
      'OTP_PROCUREMENT_A4_V1',
      v_generated,
      private.get_profile_id(),
      false
    );
  END LOOP;
END;
$$;

COMMIT;
