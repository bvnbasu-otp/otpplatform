-- =============================================================================
-- 00241: P1-E — Decision receipt shows only what the authoritative records support.
--
-- Before (00222 private.issue_decision_receipt_snapshots_for_award):
--   rank always 1; lowestTotalCost = the selected quote's own total; categoryName
--   'General Procurement'; delivery 7 days / warranty 12 months defaults; delivery & supplier
--   state '29'; paymentStructure 'MILESTONE_BASED'; awardedByRole 'MANAGER'; a canned
--   consensus text; GST split assumed intra-state.
--
-- After (same function, same signature, same snapshot tables / digest algorithm):
--   * rank      = 1 + #quotes with a higher calculated evaluation_score, only when the selected
--                 quote and EVERY live comparable quote have a calculated score; otherwise NULL.
--   * score     = quotes.evaluation_score / 10 when calculated, else NULL (no "Top Evaluated").
--   * lowestTotalCost = true minimum landed cost over live quotes (NULL unless every live quote has
--                 a cost); selectedIsLowestCost = true/false/NULL accordingly.
--   * totalQuotesEvaluated = live quotes (not DRAFT / WITHDRAWN).
--   * categoryName = requirement_categories.name via the requirement; NULL if unclassified.
--   * deliveryTimelineDays / warrantyPeriodMonths = the quote version snapshot only; NULL if absent.
--   * deliveryStateCode = RFQ delivery address snapshot only; supplierStateCode = supplier registered
--     address only. GST split only from quote isInterState or both state codes; else taxSplitBasis
--     = 'UNAVAILABLE' and the split is not shown. gstRate / gstAmount NULL when the quote has none.
--   * paymentStructure = resolve_declared_payment_structure(requirement paymentTerms) (00240).
--   * awardedByRole = awarding member's real organisation role (NULL if not a member).
--   * consensusJustification = the award justification text only (NULL if blank).
--   The digest (compute_decision_receipt_digest_v1) does not cover the changed merit fields.
-- =============================================================================

BEGIN;
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
    v_cgst := 0; v_sgst := 0; v_igst := 0;
  ELSE
    v_cgst := CASE WHEN v_inter THEN 0 ELSE round(v_gst / 2, 2) END;
    v_sgst := v_cgst;
    v_igst := CASE WHEN v_inter THEN v_gst ELSE 0 END;
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

COMMIT;
