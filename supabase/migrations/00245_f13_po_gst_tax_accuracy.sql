-- =============================================================================
-- 00245: F-13 - The purchase order carries the awarded quote's real GST, not zero.
--
-- Discovery (traced, not assumed):
--   * The awarded quote version snapshot (append-only, INV-064) holds basePrice, gstAmount,
--     transportCost and totalCost = basePrice + gstAmount + transportCost (GST-inclusive; written
--     by apps/web supplier toSnapshotPayload). It holds NO CGST/SGST/IGST components and, in
--     production, no isInterState.
--   * 00240 create_purchase_order_from_award inserted total_amount = v_total (the quote totalCost,
--     correct) but ALSO taxable_total = v_total and cgst/sgst/utgst/igst_total = 0 -- i.e. a
--     GST-inclusive amount booked as the tax-exclusive taxable value with no GST at all.
--   * 00240 private.issue_po_document_snapshots hard-coded gstRate 0 / gstAmount 0 on the issued
--     PO document line.
--   * The 00241 decision receipt (private.issue_decision_receipt_snapshots_for_award) derives:
--       taxable = snapshot basePrice, GST = snapshot gstAmount, total = snapshot totalCost, and the
--       statutory split ONLY from snapshot isInterState, else both registered state codes
--       (RFQ delivery address snapshot vs supplier registered address), else the split is
--       UNAVAILABLE (components 0, never assumed). Intra-state: CGST = SGST = gst / 2; inter-state:
--       IGST = gst. It never produces UTGST. This migration reuses that rule verbatim.
--
-- After (this migration only REPLACES the two functions; no schema change):
--   * total_amount   = awarded quote totalCost (unchanged meaning; GST NOT added again).
--   * taxable_total  = quote basePrice (tax-exclusive taxable value, same as the receipt line).
--                      Transport stays inside total_amount only (GST is computed on basePrice in the
--                      quote model, and the receipt's taxable line is basePrice) -- not double counted.
--   * cgst/sgst/igst = the receipt's split of snapshot gstAmount; utgst_total = 0 (receipt has none);
--                      when the split basis is UNAVAILABLE all components stay 0 and the GST total
--                      remains available as tax_snapshot.gstAmount.
--   * tax_snapshot   = the quote snapshot plus taxSplitBasis (+ isInterState when determined).
--   * Issued PO document line: taxableAmount = taxable_total, gstAmount = persisted GST (sum of the
--     persisted components; tax_snapshot.gstAmount only when the split is UNAVAILABLE), gstRate =
--     gstAmount / taxable_total, totalAmount = total_amount. A transport note is added when the
--     snapshot carries transport. Nothing is recalculated beyond reading what the row stores.
--   * Authorisation, supplier verification, approval-stage gate, lifecycle, payment plan and
--     milestone schedule (00240) are preserved byte-for-byte in behaviour.
-- =============================================================================

BEGIN;

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
    v_cgst := 0; v_sgst := 0; v_igst := 0;
  ELSIF v_inter THEN
    v_cgst := 0; v_sgst := 0; v_igst := v_gst;
  ELSE
    v_cgst := round(v_gst / 2, 2);
    v_sgst := v_gst - v_cgst;   -- remainder, so CGST + SGST equals the quote GST exactly
    v_igst := 0;
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
    v_total, v_currency, v_base, v_cgst, v_sgst, 0, v_igst, v_tax_snapshot,
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
-- PO document snapshot: 00240 body; GST is read from what the PO row persists (no hard-coded 0).
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
  v_taxable numeric;
  v_gst numeric;
  v_gst_rate numeric;
  v_transport numeric;
BEGIN
  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_org FROM organizations WHERE id = v_po.organization_id;
  SELECT * INTO v_supplier FROM suppliers WHERE id = v_po.supplier_id;
  SELECT * INTO v_rfq FROM rfqs WHERE id = v_po.rfq_id;
  v_persona := private.org_type_to_otp_referred_profile_kind(v_org.org_type);
  IF v_persona NOT IN ('RWA', 'MSME') THEN v_persona := 'INDIVIDUAL'; END IF;

  -- F-13: GST as persisted on the PO. The statutory components are the stored values; when the
  -- split basis was UNAVAILABLE at creation (components all 0) the quote GST total kept in
  -- tax_snapshot is shown instead. Nothing is recalculated.
  v_taxable := COALESCE(v_po.taxable_total, v_po.total_amount);
  v_gst := COALESCE(v_po.cgst_total, 0) + COALESCE(v_po.sgst_total, 0)
         + COALESCE(v_po.utgst_total, 0) + COALESCE(v_po.igst_total, 0);
  IF v_gst = 0 AND v_po.tax_snapshot->>'taxSplitBasis' = 'UNAVAILABLE' THEN
    v_gst := COALESCE((v_po.tax_snapshot->>'gstAmount')::numeric, 0);
  END IF;
  v_gst_rate := CASE WHEN v_taxable > 0 THEN round((v_gst / v_taxable) * 100, 2) ELSE 0 END;
  v_transport := COALESCE((v_po.tax_snapshot->>'transportCost')::numeric, 0);

  v_notes := jsonb_build_array('Direct bilateral contract between buyer and supplier.');
  IF v_transport > 0 THEN
    v_notes := v_notes || jsonb_build_array(
      'Total includes transport charges of ' || COALESCE(v_po.currency, 'INR') || ' ' || v_transport::text
      || ', which are not part of the taxable value shown.');
  END IF;
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
        'rate', v_taxable,
        'taxableAmount', v_taxable,
        'gstRate', v_gst_rate,
        'gstAmount', v_gst,
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
