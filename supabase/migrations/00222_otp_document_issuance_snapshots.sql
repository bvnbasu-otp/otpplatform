-- Migration 00222: Issued document snapshots (R2-31 Phase 2B)
-- Local apply only unless operator release. Do not edit 00221 or earlier.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Counter table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.issued_document_id_counters (
  organization_id   uuid NOT NULL REFERENCES public.organizations(id),
  counter_key       text NOT NULL,
  last_value        bigint NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, counter_key)
);

ALTER TABLE public.issued_document_id_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issued_document_id_counters FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.issued_document_id_counters FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.issued_document_id_counters TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Snapshots + audits
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.issued_document_snapshots (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id                 text NOT NULL,
  organization_id             uuid NOT NULL REFERENCES public.organizations(id),
  document_kind               text NOT NULL
    CHECK (document_kind IN (
      'DECISION_RECEIPT',
      'PURCHASE_ORDER',
      'TAX_INVOICE',
      'QUOTE_COMPARISON',
      'SETTLEMENT_CERTIFICATE'
    )),
  document_number             text NOT NULL,
  source_entity_type          text NOT NULL
    CHECK (source_entity_type IN ('AWARD', 'PURCHASE_ORDER', 'INVOICE', 'SETTLEMENT')),
  source_entity_id            uuid NOT NULL,
  source_supplier_id          uuid REFERENCES public.suppliers(id),
  transaction_refs            jsonb NOT NULL DEFAULT '{}',
  persona                     text NOT NULL,
  perspective                 text NOT NULL
    CHECK (perspective IN ('BUYER', 'SUPPLIER', 'PLATFORM')),
  identity_state              text NOT NULL
    CHECK (identity_state IN ('PRE_REVEAL', 'POST_REVEAL')),
  visibility_context          jsonb NOT NULL DEFAULT '{}',
  template_version            text NOT NULL DEFAULT 'procurement-a4-v1',
  schema_version              text NOT NULL DEFAULT '1',
  payload_json                jsonb NOT NULL,
  verification_digest         text NOT NULL,
  verification_algorithm      text NOT NULL,
  verification_ref            text,
  idempotency_key             text NOT NULL,
  generated_at                timestamptz NOT NULL,
  generated_by                uuid REFERENCES public.profiles(id),
  status                      text NOT NULL DEFAULT 'ISSUED'
    CHECK (status IN ('ISSUED', 'SUPERSEDED', 'VOID')),
  supersedes_document_id      uuid REFERENCES public.issued_document_snapshots(id),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT issued_document_snapshots_document_id_key UNIQUE (document_id),
  CONSTRAINT issued_document_snapshots_idempotency_key_key UNIQUE (idempotency_key),
  CONSTRAINT issued_document_snapshots_verification_ref_key UNIQUE (verification_ref)
);

CREATE INDEX IF NOT EXISTS idx_issued_doc_org_kind_generated
  ON public.issued_document_snapshots (organization_id, document_kind, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_issued_doc_source
  ON public.issued_document_snapshots (source_entity_type, source_entity_id, identity_state, document_kind);
CREATE INDEX IF NOT EXISTS idx_issued_doc_supplier
  ON public.issued_document_snapshots (source_supplier_id)
  WHERE source_supplier_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_issued_doc_one_active_per_slice
  ON public.issued_document_snapshots (
    organization_id,
    document_kind,
    source_entity_type,
    source_entity_id,
    identity_state,
    perspective
  )
  WHERE status = 'ISSUED';

CREATE TABLE IF NOT EXISTS public.issued_document_status_audits (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id       uuid NOT NULL REFERENCES public.issued_document_snapshots(id),
  previous_status   text NOT NULL,
  new_status        text NOT NULL,
  changed_by        uuid REFERENCES public.profiles(id),
  changed_at        timestamptz NOT NULL DEFAULT now(),
  reason            text NOT NULL,
  audit_event_id    uuid REFERENCES public.audit_events(id)
);
CREATE INDEX IF NOT EXISTS idx_issued_doc_status_audit_snapshot
  ON public.issued_document_status_audits (snapshot_id, changed_at DESC);
ALTER TABLE public.issued_document_status_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issued_document_status_audits FORCE ROW LEVEL SECURITY;

ALTER TABLE public.issued_document_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issued_document_snapshots FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.issued_document_snapshots FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.issued_document_snapshots TO authenticated;
GRANT ALL ON TABLE public.issued_document_snapshots TO service_role;

CREATE POLICY issued_doc_snapshots_select ON public.issued_document_snapshots
  FOR SELECT TO authenticated
  USING (
    private.is_platform_admin()
    OR (
      perspective IN ('BUYER', 'PLATFORM')
      AND private.is_org_member(organization_id)
    )
    OR (
      perspective = 'SUPPLIER'
      AND source_supplier_id IS NOT NULL
      AND private.is_supplier_user_for(source_supplier_id)
    )
  );

CREATE POLICY issued_doc_snapshots_admin_update ON public.issued_document_snapshots
  FOR UPDATE TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 3. Immutability trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_issued_document_snapshot_payload()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.payload_json IS DISTINCT FROM OLD.payload_json
       OR NEW.verification_digest IS DISTINCT FROM OLD.verification_digest
       OR NEW.verification_algorithm IS DISTINCT FROM OLD.verification_algorithm
       OR NEW.document_id IS DISTINCT FROM OLD.document_id
       OR NEW.document_number IS DISTINCT FROM OLD.document_number
       OR NEW.identity_state IS DISTINCT FROM OLD.identity_state
       OR NEW.generated_at IS DISTINCT FROM OLD.generated_at
    THEN
      RAISE EXCEPTION 'Issued document snapshot payload is immutable (DOC-SNAPSHOT-FROZEN)';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        OLD.status = 'ISSUED' AND NEW.status IN ('SUPERSEDED', 'VOID')
        AND private.is_platform_admin()
      ) THEN
        RAISE EXCEPTION 'Issued document status may only transition ISSUED -> SUPERSEDED|VOID by platform admin (DOC-SNAPSHOT-STATUS)';
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Issued document snapshots cannot be deleted (DOC-SNAPSHOT-RETENTION)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_issued_document_snapshot ON public.issued_document_snapshots;
CREATE TRIGGER trg_protect_issued_document_snapshot
  BEFORE UPDATE OR DELETE ON public.issued_document_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.protect_issued_document_snapshot_payload();

-- ---------------------------------------------------------------------------
-- 4. Deterministic HMAC port (matches computeDeterministicHmac in domain TS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.js_imul(a integer, b integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  x bigint;
  y bigint;
  z bigint;
BEGIN
  x := (a::bigint & 4294967295);
  IF x >= 2147483648 THEN x := x - 4294967296; END IF;
  y := (b::bigint & 4294967295);
  IF y >= 2147483648 THEN y := y - 4294967296; END IF;
  z := (x * y) & 4294967295;
  IF z >= 2147483648 THEN z := z - 4294967296; END IF;
  RETURN z::integer;
END;
$$;

CREATE OR REPLACE FUNCTION private.js_imul64(a bigint, b bigint)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  x bigint;
  y bigint;
  z bigint;
BEGIN
  x := (a & 4294967295);
  IF x >= 2147483648 THEN x := x - 4294967296; END IF;
  y := (b & 4294967295);
  IF y >= 2147483648 THEN y := y - 4294967296; END IF;
  z := (x * y) & 4294967295;
  IF z >= 2147483648 THEN z := z - 4294967296; END IF;
  RETURN z;
END;
$$;

CREATE OR REPLACE FUNCTION private.js_urshift32(a integer, b integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT ((a::bigint & 4294967295) >> b)::integer;
$$;

CREATE OR REPLACE FUNCTION private.otp_deterministic_hmac(p_message text, p_secret text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public, private
AS $$
DECLARE
  v_combined text;
  v_i integer;
  v_ch integer;
  h1 bigint := -559038737;
  h2 bigint := 1101455703;
  h3 bigint := -2048144777;
  h4 bigint := -1028476643;
  v_hex text;
BEGIN
  v_combined := p_secret || ':' || p_message;
  FOR v_i IN 1 .. length(v_combined) LOOP
    v_ch := ascii(substr(v_combined, v_i, 1));
    h1 := private.js_imul64(h1 # v_ch, 2654435761);
    h2 := private.js_imul64(h2 # v_ch, 1597334677);
    h3 := private.js_imul64(h3 # v_ch, 2246822507);
    h4 := private.js_imul64(h4 # v_ch, 3266489909);
  END LOOP;
  h1 := private.js_imul64(h1 # (h1 & 4294967295) >> 16, 2246822507)
    # private.js_imul64(h2 # (h2 & 4294967295) >> 13, 3266489909);
  h2 := private.js_imul64(h2 # (h2 & 4294967295) >> 16, 1597334677)
    # private.js_imul64(h3 # (h3 & 4294967295) >> 13, 2654435761);
  h3 := private.js_imul64(h3 # (h3 & 4294967295) >> 16, 3266489909)
    # private.js_imul64(h4 # (h4 & 4294967295) >> 13, 2246822507);
  h4 := private.js_imul64(h4 # (h4 & 4294967295) >> 16, 2654435761)
    # private.js_imul64(h1 # (h1 & 4294967295) >> 13, 1597334677);
  v_hex := lpad(to_hex(h1 & 4294967295), 8, '0')
        || lpad(to_hex(h2 & 4294967295), 8, '0')
        || lpad(to_hex(h3 & 4294967295), 8, '0')
        || lpad(to_hex(h4 & 4294967295), 8, '0');
  RETURN v_hex || v_hex;
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_decision_receipt_digest_v1(p_receipt jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public, private
AS $$
DECLARE
  v_msg text;
BEGIN
  v_msg := json_build_object(
    'receiptId', p_receipt->>'receiptId',
    'rfqId', p_receipt->>'rfqId',
    'rfqRefNumber', p_receipt->>'rfqRefNumber',
    'buyerPersona', p_receipt->>'buyerPersona',
    'buyerOrgId', p_receipt->'buyerContext'->>'organizationId',
    'buyerGstin', p_receipt->'buyerContext'->>'buyerGstin',
    'requirementId', p_receipt->'requirementSnapshot'->>'requirementId',
    'quoteId', p_receipt->'selectedOffer'->>'quoteId',
    'supplierId', p_receipt->'selectedOffer'->>'supplierId',
    'totalLandedCost', (p_receipt->'selectedOffer'->>'totalLandedCost')::numeric,
    'baseAmount', (p_receipt->'selectedOffer'->>'baseAmount')::numeric,
    'gstAmount', (p_receipt->'selectedOffer'->>'gstAmount')::numeric,
    'isInterState', (p_receipt->'selectedOffer'->>'isInterState')::boolean,
    'cgstAmount', (p_receipt->'selectedOffer'->>'cgstAmount')::numeric,
    'sgstAmount', (p_receipt->'selectedOffer'->>'sgstAmount')::numeric,
    'igstAmount', (p_receipt->'selectedOffer'->>'igstAmount')::numeric,
    'awardedByProfileId', p_receipt->'authorityAttribution'->>'awardedByProfileId',
    'awardedByRole', p_receipt->'authorityAttribution'->>'awardedByRole',
    'isDelegated', (p_receipt->'authorityAttribution'->>'isDelegated')::boolean,
    'delegationId', p_receipt->'authorityAttribution'->>'delegationId',
    'governancePersona', p_receipt->'governanceRecord'->>'persona',
    'awardedAt', p_receipt->'timestamps'->>'awardedAt',
    'receiptGeneratedAt', p_receipt->'timestamps'->>'receiptGeneratedAt'
  )::text;
  RETURN private.otp_deterministic_hmac(v_msg, 'OTP-DECISION-RECEIPT-INTEGRITY-SALT-2026');
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_procurement_a4_digest_v1(p_input jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public, private
AS $$
DECLARE
  v_stripped jsonb;
BEGIN
  v_stripped := p_input - 'verification';
  RETURN private.otp_deterministic_hmac(v_stripped::text, 'OTP-ISSUED-PROCUREMENT-A4-V1');
END;
$$;

REVOKE ALL ON FUNCTION public.compute_decision_receipt_digest_v1(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.compute_procurement_a4_digest_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_decision_receipt_digest_v1(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.compute_procurement_a4_digest_v1(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Issuance + verify RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_document_snapshot_atomic(
  p_idempotency_key           text,
  p_organization_id           uuid,
  p_document_kind             text,
  p_document_number           text,
  p_source_entity_type        text,
  p_source_entity_id          uuid,
  p_source_supplier_id        uuid,
  p_transaction_refs          jsonb,
  p_persona                   text,
  p_perspective               text,
  p_identity_state            text,
  p_visibility_context        jsonb,
  p_template_version          text,
  p_payload_json              jsonb,
  p_verification_digest       text,
  p_verification_algorithm    text,
  p_generated_at              timestamptz,
  p_actor_profile_id          uuid DEFAULT NULL,
  p_supersede_prior_active    boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_existing public.issued_document_snapshots%ROWTYPE;
  v_calc text;
  v_doc_id text;
  v_counter_year text;
  v_last bigint;
  v_snap_id uuid;
  v_vref text;
BEGIN
  SELECT * INTO v_existing FROM public.issued_document_snapshots WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'duplicate', true,
      'snapshot_id', v_existing.id,
      'document_id', v_existing.document_id,
      'verification_digest', v_existing.verification_digest
    );
  END IF;

  IF p_verification_algorithm = 'OTP_DECISION_RECEIPT_V1' THEN
    v_calc := public.compute_decision_receipt_digest_v1(p_payload_json->'canonicalDecisionReceipt');
  ELSIF p_verification_algorithm = 'OTP_PROCUREMENT_A4_V1' THEN
    v_calc := public.compute_procurement_a4_digest_v1(p_payload_json->'procurementDocumentInput');
  ELSE
    RAISE EXCEPTION 'Unknown verification algorithm %', p_verification_algorithm;
  END IF;

  IF v_calc IS DISTINCT FROM p_verification_digest THEN
    RAISE EXCEPTION 'Issued document digest mismatch (DOC-SNAPSHOT-DIGEST)';
  END IF;

  IF p_supersede_prior_active AND private.is_platform_admin() THEN
    UPDATE public.issued_document_snapshots s
    SET status = 'SUPERSEDED'
    WHERE s.organization_id = p_organization_id
      AND s.document_kind = p_document_kind
      AND s.source_entity_type = p_source_entity_type
      AND s.source_entity_id = p_source_entity_id
      AND s.identity_state = p_identity_state
      AND s.perspective = p_perspective
      AND s.status = 'ISSUED';
  END IF;

  v_counter_year := to_char(p_generated_at AT TIME ZONE 'Asia/Kolkata', 'YYYY');
  INSERT INTO public.issued_document_id_counters (organization_id, counter_key, last_value)
  VALUES (p_organization_id, 'DOC_ID:' || v_counter_year, 0)
  ON CONFLICT (organization_id, counter_key) DO NOTHING;
  SELECT last_value INTO v_last
  FROM public.issued_document_id_counters
  WHERE organization_id = p_organization_id AND counter_key = 'DOC_ID:' || v_counter_year
  FOR UPDATE;
  v_last := v_last + 1;
  UPDATE public.issued_document_id_counters SET last_value = v_last, updated_at = now()
  WHERE organization_id = p_organization_id AND counter_key = 'DOC_ID:' || v_counter_year;
  -- Include UUID tail segment so demo orgs sharing the same 8-char prefix stay globally unique.
  v_doc_id := 'OTP-DOC-' || upper(substr(p_organization_id::text, 1, 8))
    || upper(split_part(p_organization_id::text, '-', 5))
    || '-' || v_counter_year || '-' || lpad(v_last::text, 6, '0');

  INSERT INTO public.issued_document_id_counters (organization_id, counter_key, last_value)
  VALUES (p_organization_id, 'VERIFY_REF', 0)
  ON CONFLICT (organization_id, counter_key) DO NOTHING;
  SELECT last_value INTO v_last FROM public.issued_document_id_counters
  WHERE organization_id = p_organization_id AND counter_key = 'VERIFY_REF' FOR UPDATE;
  v_last := v_last + 1;
  UPDATE public.issued_document_id_counters SET last_value = v_last, updated_at = now()
  WHERE organization_id = p_organization_id AND counter_key = 'VERIFY_REF';
  v_vref := 'VR-' || upper(substr(p_organization_id::text, 1, 8))
    || upper(split_part(p_organization_id::text, '-', 5))
    || '-' || lpad(v_last::text, 8, '0');

  INSERT INTO public.issued_document_snapshots (
    document_id, organization_id, document_kind, document_number,
    source_entity_type, source_entity_id, source_supplier_id, transaction_refs,
    persona, perspective, identity_state, visibility_context,
    template_version, schema_version, payload_json,
    verification_digest, verification_algorithm, verification_ref,
    idempotency_key, generated_at, generated_by, status
  ) VALUES (
    v_doc_id, p_organization_id, p_document_kind, p_document_number,
    p_source_entity_type, p_source_entity_id, p_source_supplier_id, COALESCE(p_transaction_refs, '{}'::jsonb),
    p_persona, p_perspective, p_identity_state, COALESCE(p_visibility_context, '{}'::jsonb),
    COALESCE(p_template_version, 'procurement-a4-v1'), '1', p_payload_json,
    p_verification_digest, p_verification_algorithm, v_vref,
    p_idempotency_key, p_generated_at, p_actor_profile_id, 'ISSUED'
  ) RETURNING id INTO v_snap_id;

  RETURN jsonb_build_object(
    'ok', true, 'duplicate', false,
    'snapshot_id', v_snap_id,
    'document_id', v_doc_id,
    'verification_digest', p_verification_digest,
    'verification_ref', v_vref
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_issued_document_digest(p_document_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_row public.issued_document_snapshots%ROWTYPE;
  v_calc text;
  v_valid boolean;
BEGIN
  SELECT * INTO v_row FROM public.issued_document_snapshots WHERE document_id = p_document_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_row.verification_algorithm = 'OTP_DECISION_RECEIPT_V1' THEN
    v_calc := public.compute_decision_receipt_digest_v1(v_row.payload_json->'canonicalDecisionReceipt');
  ELSIF v_row.verification_algorithm = 'OTP_PROCUREMENT_A4_V1' THEN
    v_calc := public.compute_procurement_a4_digest_v1(v_row.payload_json->'procurementDocumentInput');
  ELSE
    v_calc := NULL;
  END IF;
  v_valid := v_calc IS NOT NULL AND v_calc = v_row.verification_digest;
  RETURN jsonb_build_object(
    'ok', true,
    'document_id', p_document_id,
    'algorithm', v_row.verification_algorithm,
    'valid', v_valid,
    'stored_digest', v_row.verification_digest,
    'calculated_digest', v_calc
  );
END;
$$;

REVOKE ALL ON FUNCTION public.issue_document_snapshot_atomic(
  text, uuid, text, text, text, uuid, uuid, jsonb, text, text, text, jsonb, text, jsonb, text, text, timestamptz, uuid, boolean
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_issued_document_digest(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_issued_document_digest(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Award / PO issuance helpers (authoritative DB loaders — not AwardService)
-- ---------------------------------------------------------------------------
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
  v_gst := COALESCE((v_version.snapshot->>'gstAmount')::numeric, 0);
  v_total := COALESCE((v_version.snapshot->>'totalCost')::numeric, v_base + v_gst);
  v_gst_rate := CASE WHEN v_base > 0 THEN round((v_gst / v_base) * 100, 2) ELSE 0 END;
  v_inter := COALESCE((v_version.snapshot->>'isInterState')::boolean, false);
  v_cgst := CASE WHEN v_inter THEN 0 ELSE round(v_gst / 2, 2) END;
  v_sgst := v_cgst;
  v_igst := CASE WHEN v_inter THEN v_gst ELSE 0 END;
  v_mask := COALESCE(v_inv.anonymous_label, 'Supplier #01');
  v_revealed := (p_identity_state = 'POST_REVEAL');
  v_identity := p_identity_state;
  v_phase := CASE WHEN v_revealed THEN 'POST_AWARD' ELSE 'PRE_AWARD' END;
  v_receipt_id := 'REC-' || upper(substr(v_award.id::text, 1, 8)) || '-' || upper(substr(v_identity, 1, 3));
  v_supplier_id := CASE WHEN v_revealed THEN v_supplier.id::text ELSE NULL END;
  v_supplier_name := CASE WHEN v_revealed THEN v_supplier.business_name ELSE v_mask END;
  v_supplier_gstin := CASE WHEN v_revealed THEN v_supplier.gstin ELSE NULL END;

  SELECT count(*) INTO v_quote_count FROM quotes WHERE rfq_id = v_rfq.id AND status NOT IN ('WITHDRAWN'::public.quote_status);

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
      'deliveryStateCode', COALESCE(v_rfq.delivery_address_snapshot->>'stateCode', v_org.state_code, '29')
    ),
    'requirementSnapshot', jsonb_build_object(
      'requirementId', v_req.id::text,
      'title', COALESCE(v_req.title, v_rfq.title),
      'categoryName', 'General Procurement',
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
      'supplierStateCode', COALESCE(v_supplier.registered_address->>'stateCode', '29'),
      'baseAmount', v_base,
      'gstRate', v_gst_rate,
      'gstAmount', v_gst,
      'cgstAmount', v_cgst,
      'sgstAmount', v_sgst,
      'igstAmount', v_igst,
      'isInterState', v_inter,
      'totalLandedCost', v_total,
      'deliveryTimelineDays', COALESCE((v_version.snapshot->>'deliveryDays')::int, 7),
      'warrantyPeriodMonths', COALESCE((v_version.snapshot->>'warrantyMonths')::int, 12),
      'paymentStructure', 'MILESTONE_BASED'
    ),
    'meritEvaluation', jsonb_build_object(
      'rank', 1,
      'score', v_quote.evaluation_score,
      'totalQuotesEvaluated', GREATEST(v_quote_count, 1),
      'lowestTotalCost', v_total,
      'costAvoidedComparedToIncumbent', NULL,
      'consensusJustification', COALESCE(v_award.justification->>'text', 'Award locked per governance policy.')
    ),
    'authorityAttribution', jsonb_build_object(
      'awardedByProfileId', v_award.awarded_by::text,
      'awardedByName', COALESCE(v_profile.full_name, v_profile.email, v_award.awarded_by::text),
      'awardedByRole', 'MANAGER',
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

-- ---------------------------------------------------------------------------
-- 7. PO snapshot helper
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
BEGIN
  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_org FROM organizations WHERE id = v_po.organization_id;
  SELECT * INTO v_supplier FROM suppliers WHERE id = v_po.supplier_id;
  SELECT * INTO v_rfq FROM rfqs WHERE id = v_po.rfq_id;
  v_persona := private.org_type_to_otp_referred_profile_kind(v_org.org_type);
  IF v_persona NOT IN ('RWA', 'MSME') THEN v_persona := 'INDIVIDUAL'; END IF;

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
      'notes', jsonb_build_array('Direct bilateral contract between buyer and supplier.')
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

-- ---------------------------------------------------------------------------
-- 8. Hook: create_purchase_order_from_award (00206 body + PO snapshots)
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
  INSERT INTO purchase_orders (
    award_id, rfq_id, organization_id, supplier_id, po_number, status, total_amount, currency,
    taxable_total, cgst_total, sgst_total, utgst_total, igst_total, tax_snapshot,
    delivery_address_snapshot, billing_address_snapshot, issued_at, created_at, updated_at
  ) VALUES (
    p_award_id, v_rfq.id, v_rfq.organization_id, v_quote.supplier_id, v_po_number, 'ISSUED'::public.purchase_order_status,
    v_total, v_currency, v_total, 0, 0, 0, 0, v_version.snapshot,
    v_rfq.delivery_address_snapshot, v_rfq.billing_address_snapshot, now(), now(), now()
  ) RETURNING id INTO v_po_id;
  INSERT INTO work_orders (purchase_order_id, supplier_id, status, title, progress_percent, created_at, updated_at)
  VALUES (v_po_id, v_quote.supplier_id, 'NOT_STARTED', 'Work order - ' || v_po_number, 0, now(), now());
  PERFORM private.issue_po_document_snapshots(v_po_id);
  RETURN jsonb_build_object('po_id', v_po_id, 'po_number', v_po_number);
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Hook: lock_and_reveal_award_atomic (00216 + issuance)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lock_and_reveal_award_atomic(
  p_rfq_id uuid,
  p_quote_id uuid,
  p_justification text,
  p_auto_reveal boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_rfq rfqs%ROWTYPE;
  v_quote quotes%ROWTYPE;
  v_org organizations%ROWTYPE;
  v_award_id uuid;
  v_now timestamptz := now();
  v_tally jsonb;
  v_po_res jsonb;
  v_po_id uuid;
  v_po_number text;
  v_supplier_id uuid;
  v_supplier suppliers%ROWTYPE;
  v_business text;
  v_phone text;
  v_email text;
  v_alias text;
  v_existing_award awards%ROWTYPE;
  v_pending_stages integer := 0;
  v_can_reveal boolean := false;
  v_vote_count integer := 0;
BEGIN
  SELECT * INTO v_rfq FROM public.rfqs WHERE id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'RFQ not found'); END IF;
  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR private.is_platform_admin()
    OR (private.get_profile_id() IS NOT NULL AND COALESCE(private.is_org_manager_or_above(v_rfq.organization_id), false))
  ) THEN
    RAISE EXCEPTION 'Only an owner or manager of the buying organization can lock an award (AWARD-UNAUTHORIZED)';
  END IF;
  IF v_rfq.status = 'OPEN' THEN RAISE EXCEPTION 'Cannot lock award while RFQ is still OPEN'; END IF;
  IF v_rfq.status NOT IN ('CLARIFICATION', 'CLOSED', 'EVALUATING', 'AWARDED') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RFQ is not in an awardable state. Current status: ' || v_rfq.status);
  END IF;
  SELECT COUNT(*) INTO v_pending_stages FROM public.rfq_approval_stages WHERE rfq_id = p_rfq_id AND status != 'APPROVED';
  IF v_pending_stages > 0 THEN RAISE EXCEPTION 'Cannot lock award: Required approval tier(s) are pending satisfaction.'; END IF;
  SELECT * INTO v_org FROM public.organizations WHERE id = v_rfq.organization_id;
  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id AND rfq_id = p_rfq_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Winning quote does not belong to specified RFQ'); END IF;
  IF v_quote.status = 'WITHDRAWN' THEN RAISE EXCEPTION 'Cannot award a withdrawn quote'; END IF;
  IF v_org.org_type = 'COMMUNITY' THEN
    SELECT COUNT(DISTINCT cv.profile_id) INTO v_vote_count
    FROM public.committee_votes cv
    WHERE cv.rfq_id = p_rfq_id AND cv.recommended_quote_id = p_quote_id
      AND cv.choice = 'RECOMMEND'::public.vote_choice
      AND NOT EXISTS (
        SELECT 1 FROM public.conflict_of_interest_declarations coi
        WHERE coi.rfq_id = p_rfq_id AND coi.profile_id = cv.profile_id AND coi.status = 'DECLARED_CONFLICT'
      );
    IF v_vote_count < 2 THEN RAISE EXCEPTION 'Committee quorum not met: at least 2 unconflicted votes required for this award'; END IF;
  END IF;
  SELECT * INTO v_supplier FROM public.suppliers WHERE id = v_quote.supplier_id;
  IF v_supplier.lifecycle_state = 'VERIFIED' AND v_supplier.verification_status = 'VERIFIED' THEN
    v_can_reveal := p_auto_reveal;
  ELSE
    v_can_reveal := false;
    IF v_supplier.lifecycle_state = 'QUOTE_PARTICIPANT' THEN
      UPDATE public.suppliers SET lifecycle_state = 'ONBOARDING_REQUIRED', updated_at = v_now WHERE id = v_supplier.id;
    END IF;
  END IF;
  SELECT * INTO v_existing_award FROM public.awards WHERE rfq_id = p_rfq_id;
  IF FOUND THEN
    v_award_id := v_existing_award.id;
  ELSE
    SELECT jsonb_build_object('locked_at', v_now, 'votes', COALESCE(jsonb_agg(jsonb_build_object(
      'quote_id', v.recommended_quote_id, 'choice', v.choice, 'voting_power', v.voting_power)), '[]'::jsonb))
    INTO v_tally FROM (
      SELECT DISTINCT ON (cv.profile_id) cv.* FROM public.committee_votes cv
      WHERE cv.rfq_id = p_rfq_id AND cv.cast_at <= v_now
      ORDER BY cv.profile_id, cv.cast_at DESC, cv.id DESC
    ) v;
    INSERT INTO public.awards (rfq_id, quote_id, awarded_by, justification, status, awarded_at, revealed_at, votes_locked_at, vote_snapshot)
    VALUES (
      p_rfq_id, p_quote_id, COALESCE(private.get_profile_id(), v_rfq.created_by),
      jsonb_build_object('text', p_justification),
      CASE WHEN v_can_reveal THEN 'REVEALED'::public.award_status ELSE 'PENDING_REVEAL'::public.award_status END,
      v_now, CASE WHEN v_can_reveal THEN v_now ELSE NULL END, v_now, COALESCE(v_tally, '{}'::jsonb)
    ) RETURNING id INTO v_award_id;
  END IF;
  UPDATE quotes SET status = 'SELECTED', updated_at = v_now WHERE id = p_quote_id;
  UPDATE quotes SET status = 'NOT_SELECTED', updated_at = v_now WHERE rfq_id = p_rfq_id AND id <> p_quote_id;
  UPDATE rfqs SET status = 'AWARDED',
    reveal_status = CASE WHEN v_can_reveal THEN 'REVEALED'::public.rfq_reveal_status ELSE reveal_status END,
    updated_at = v_now WHERE id = p_rfq_id;
  UPDATE requirements SET status = 'AWARDED', updated_at = v_now WHERE id = v_rfq.requirement_id;
  PERFORM private.notify_bidders_of_outcome(p_rfq_id);
  PERFORM private.issue_decision_receipt_snapshots_for_award(v_award_id, 'PRE_REVEAL');
  IF v_can_reveal THEN
    PERFORM private.issue_decision_receipt_snapshots_for_award(v_award_id, 'POST_REVEAL');
    v_po_res := public.create_purchase_order_from_award(v_award_id);
    v_po_id := (v_po_res->>'po_id')::uuid;
    v_po_number := v_po_res->>'po_number';
    SELECT s.id, s.business_name, s.contact_phone, s.contact_email, ri.anonymous_label
    INTO v_supplier_id, v_business, v_phone, v_email, v_alias
    FROM quotes q JOIN suppliers s ON s.id = q.supplier_id JOIN rfq_invitations ri ON ri.id = q.invitation_id
    WHERE q.id = p_quote_id;
    RETURN jsonb_build_object('ok', true, 'award_id', v_award_id, 'revealed', true, 'po_id', v_po_id,
      'business_name', v_business, 'contact_phone', v_phone, 'contact_email', v_email);
  END IF;
  RETURN jsonb_build_object('ok', true, 'award_id', v_award_id, 'revealed', false,
    'supplier_verification_required', (v_supplier.lifecycle_state <> 'VERIFIED'));
END;
$$;

-- lock_award delegates to lock_and_reveal_award_atomic(..., false) per 00151 — unchanged body.

-- ---------------------------------------------------------------------------
-- 10. Hook: reveal_award + POST_REVEAL issuance
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
  v_now timestamptz := now();
  v_po_id uuid;
  v_po_number text;
  v_po_res jsonb;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found'; END IF;
  IF auth.uid() IS NOT NULL
     AND NOT private.is_org_manager_or_above(v_rfq.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a manager or owner can reveal the winner';
  END IF;
  SELECT * INTO v_award FROM awards WHERE rfq_id = p_rfq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Identity can only be revealed after the award is locked'; END IF;
  SELECT s.id, s.business_name, s.contact_phone, s.contact_email, ri.anonymous_label
  INTO v_supplier_id, v_business, v_phone, v_email, v_alias
  FROM quotes q JOIN suppliers s ON s.id = q.supplier_id JOIN rfq_invitations ri ON ri.id = q.invitation_id
  WHERE q.id = v_award.quote_id;
  IF v_rfq.reveal_status = 'REVEALED' THEN
    PERFORM private.issue_decision_receipt_snapshots_for_award(v_award.id, 'POST_REVEAL');
    SELECT id, po_number INTO v_po_id, v_po_number FROM purchase_orders WHERE award_id = v_award.id;
    IF v_po_id IS NULL THEN
      BEGIN
        v_po_res := public.create_purchase_order_from_award(v_award.id);
        v_po_id := (v_po_res->>'po_id')::uuid;
        v_po_number := v_po_res->>'po_number';
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Auto PO creation on idempotent reveal encountered: %', SQLERRM;
      END;
    END IF;
    RETURN jsonb_build_object('already_revealed', true, 'supplier_id', v_supplier_id, 'business_name', v_business,
      'contact_phone', v_phone, 'contact_email', v_email, 'alias_before_reveal', v_alias,
      'po_id', v_po_id, 'po_number', v_po_number);
  END IF;
  UPDATE rfqs SET reveal_status = 'REVEALED', updated_at = v_now WHERE id = p_rfq_id;
  UPDATE awards SET status = 'REVEALED', revealed_at = v_now WHERE id = v_award.id;
  BEGIN
    v_po_res := public.create_purchase_order_from_award(v_award.id);
    v_po_id := (v_po_res->>'po_id')::uuid;
    v_po_number := v_po_res->>'po_number';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Auto PO creation on reveal encountered: %', SQLERRM;
  END;
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

-- ---------------------------------------------------------------------------
-- 11. TAX_INVOICE snapshots on approve (minimal authoritative loader)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.issue_tax_invoice_snapshots(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_inv invoices%ROWTYPE;
  v_po purchase_orders%ROWTYPE;
  v_org organizations%ROWTYPE;
  v_supplier suppliers%ROWTYPE;
  v_generated timestamptz := now();
  v_proc jsonb;
  v_payload jsonb;
  v_digest text;
  v_p text;
  v_persona text;
BEGIN
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND OR v_inv.status::text NOT IN ('APPROVED', 'PAID') THEN RETURN; END IF;
  IF v_inv.tax_snapshot IS NULL OR v_inv.tax_snapshot = '{}'::jsonb THEN
    RAISE EXCEPTION 'Cannot issue tax invoice snapshot without tax_snapshot';
  END IF;
  SELECT * INTO v_po FROM purchase_orders WHERE id = v_inv.purchase_order_id;
  SELECT * INTO v_org FROM organizations WHERE id = v_po.organization_id;
  SELECT * INTO v_supplier FROM suppliers WHERE id = v_inv.supplier_id;
  v_persona := private.org_type_to_otp_referred_profile_kind(v_org.org_type);
  IF v_persona NOT IN ('RWA', 'MSME') THEN v_persona := 'INDIVIDUAL'; END IF;
  FOREACH v_p IN ARRAY ARRAY['BUYER', 'SUPPLIER'] LOOP
    v_proc := jsonb_build_object(
      'kind', 'TAX_INVOICE',
      'phase', 'POST_AWARD',
      'viewerRole', lower(v_p),
      'referenceNumber', v_inv.invoice_number,
      'recordId', v_inv.id::text,
      'title', 'Tax Invoice ' || v_inv.invoice_number,
      'issuedAt', COALESCE(v_inv.approved_at, v_inv.submitted_at),
      'generatedAt', v_generated,
      'currency', 'INR',
      'buyer', jsonb_build_object('name', COALESCE(v_org.legal_name, v_org.name), 'gstin', v_inv.tax_snapshot->>'buyerGstin'),
      'suppliers', jsonb_build_array(jsonb_build_object(
        'id', v_supplier.id::text,
        'name', COALESCE(v_supplier.business_name, 'Supplier'),
        'gstin', v_inv.tax_snapshot->>'supplierGstin'
      )),
      'lines', jsonb_build_array(jsonb_build_object(
        'description', 'Invoice line summary',
        'quantity', 1,
        'unit', 'Lot',
        'rate', COALESCE(v_inv.taxable_total, v_inv.amount),
        'taxableAmount', COALESCE(v_inv.taxable_total, v_inv.amount),
        'gstRate', 0,
        'gstAmount', COALESCE(v_inv.cgst_total, 0) + COALESCE(v_inv.sgst_total, 0) + COALESCE(v_inv.igst_total, 0),
        'totalAmount', v_inv.amount
      )),
      'notes', jsonb_build_array('Bilateral tax summary — not a statutory e-invoice / IRN document.')
    );
    v_digest := public.compute_procurement_a4_digest_v1(v_proc);
    v_proc := v_proc || jsonb_build_object('verification', jsonb_build_object('label', 'Document Integrity Reference', 'value', v_digest));
    v_payload := jsonb_build_object(
      'schemaVersion', '1',
      'canonicalDecisionReceipt', NULL,
      'reputationAppendix', NULL,
      'procurementDocumentInput', v_proc,
      'sourceAuditRefs', jsonb_build_object(
        'awardId', v_po.award_id::text,
        'purchaseOrderId', v_po.id::text,
        'invoiceId', v_inv.id::text,
        'rfqId', v_po.rfq_id::text,
        'quoteId', NULL,
        'quoteVersion', NULL
      )
    );
    PERFORM public.issue_document_snapshot_atomic(
      'invoice:' || v_inv.id::text || ':POST_REVEAL:' || v_p,
      v_po.organization_id,
      'TAX_INVOICE',
      v_inv.invoice_number,
      'INVOICE',
      v_inv.id,
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

CREATE OR REPLACE FUNCTION public.trg_issue_tax_invoice_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF NEW.status::text = 'APPROVED' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM private.issue_tax_invoice_snapshots(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_issue_tax_invoice_document_snapshots ON public.invoices;
CREATE TRIGGER trg_issue_tax_invoice_document_snapshots
  AFTER UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_issue_tax_invoice_snapshots();



COMMIT;
