-- Personal ownership for issued procurement documents (continues 00282).
--
-- issued_document_snapshots and its id counters were keyed by organization_id NOT NULL, so
-- awarding a personal buyer's RFQ failed when the decision receipt / PO snapshot was issued.
-- Documents now carry the same organization-XOR-owner scope as the records they describe:
--   * issued_document_snapshots gains owner_profile_id (exactly one of organization/owner).
--   * personal document numbering uses its own counter table, keyed by owner.
--   * issue_document_snapshot_atomic resolves the personal owner from the source entity
--     (award, purchase order or invoice) when no organization is supplied, so its signature
--     and callers are unchanged. It never trusts a caller-supplied owner.
--   * the three snapshot builders fall back to the personal buyer's name when no
--     organization exists. No GSTIN or legal name is invented.
--   * buyer-side read access follows the owner-aware scope helper.

BEGIN;

ALTER TABLE public.issued_document_snapshots ADD COLUMN IF NOT EXISTS owner_profile_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.issued_document_snapshots ALTER COLUMN organization_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'issued_document_snapshots_single_owner') THEN
    ALTER TABLE public.issued_document_snapshots
      ADD CONSTRAINT issued_document_snapshots_single_owner CHECK (num_nonnulls(organization_id, owner_profile_id) = 1);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_issued_doc_one_active_per_slice_personal
  ON public.issued_document_snapshots (owner_profile_id, document_kind, source_entity_type, source_entity_id, identity_state, perspective)
  WHERE status = 'ISSUED' AND owner_profile_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.issued_document_personal_counters (
  owner_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  counter_key text NOT NULL,
  last_value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_profile_id, counter_key)
);
ALTER TABLE public.issued_document_personal_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.issued_document_personal_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.issued_document_personal_counters TO service_role;

DO $$
DECLARE
  p record;
  v_q text;
BEGIN
  FOR p IN SELECT policyname, qual FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'issued_document_snapshots' AND qual IS NOT NULL
  LOOP
    v_q := replace(p.qual, 'private.is_org_member(organization_id)',
                   'private.is_buyer_scope_member(organization_id, owner_profile_id)');
    IF v_q IS DISTINCT FROM p.qual THEN
      EXECUTE format('ALTER POLICY %I ON public.issued_document_snapshots USING (%s)', p.policyname, v_q);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.issue_document_snapshot_atomic(
  p_idempotency_key text, p_organization_id uuid, p_document_kind text, p_document_number text,
  p_source_entity_type text, p_source_entity_id uuid, p_source_supplier_id uuid, p_transaction_refs jsonb,
  p_persona text, p_perspective text, p_identity_state text, p_visibility_context jsonb,
  p_template_version text, p_payload_json jsonb, p_verification_digest text, p_verification_algorithm text,
  p_generated_at timestamp with time zone, p_actor_profile_id uuid DEFAULT NULL::uuid,
  p_supersede_prior_active boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
DECLARE
  v_existing public.issued_document_snapshots%ROWTYPE;
  v_calc text;
  v_doc_id text;
  v_counter_year text;
  v_last bigint;
  v_snap_id uuid;
  v_vref text;
  v_owner uuid;
  v_scope text;
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

  -- Personal scope: the owner comes from the source record, never from the caller.
  IF p_organization_id IS NULL THEN
    v_owner := CASE p_source_entity_type
      WHEN 'PURCHASE_ORDER' THEN (SELECT po.owner_profile_id FROM public.purchase_orders po WHERE po.id = p_source_entity_id)
      WHEN 'AWARD' THEN (SELECT r.owner_profile_id FROM public.awards a JOIN public.rfqs r ON r.id = a.rfq_id WHERE a.id = p_source_entity_id)
      WHEN 'INVOICE' THEN (SELECT po.owner_profile_id FROM public.invoices i JOIN public.purchase_orders po ON po.id = i.purchase_order_id WHERE i.id = p_source_entity_id)
    END;
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'Issued document needs an organization or a personal owner (DOC-SNAPSHOT-OWNER)';
    END IF;
    v_scope := v_owner::text;
  ELSE
    v_scope := p_organization_id::text;
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
    WHERE s.organization_id IS NOT DISTINCT FROM p_organization_id
      AND s.owner_profile_id IS NOT DISTINCT FROM v_owner
      AND s.document_kind = p_document_kind
      AND s.source_entity_type = p_source_entity_type
      AND s.source_entity_id = p_source_entity_id
      AND s.identity_state = p_identity_state
      AND s.perspective = p_perspective
      AND s.status = 'ISSUED';
  END IF;

  v_counter_year := to_char(p_generated_at AT TIME ZONE 'Asia/Kolkata', 'YYYY');

  IF p_organization_id IS NOT NULL THEN
    INSERT INTO public.issued_document_id_counters (organization_id, counter_key, last_value)
    VALUES (p_organization_id, 'DOC_ID:' || v_counter_year, 0)
    ON CONFLICT (organization_id, counter_key) DO NOTHING;
    SELECT last_value INTO v_last FROM public.issued_document_id_counters
    WHERE organization_id = p_organization_id AND counter_key = 'DOC_ID:' || v_counter_year FOR UPDATE;
    v_last := v_last + 1;
    UPDATE public.issued_document_id_counters SET last_value = v_last, updated_at = now()
    WHERE organization_id = p_organization_id AND counter_key = 'DOC_ID:' || v_counter_year;
  ELSE
    INSERT INTO public.issued_document_personal_counters (owner_profile_id, counter_key, last_value)
    VALUES (v_owner, 'DOC_ID:' || v_counter_year, 0)
    ON CONFLICT (owner_profile_id, counter_key) DO NOTHING;
    SELECT last_value INTO v_last FROM public.issued_document_personal_counters
    WHERE owner_profile_id = v_owner AND counter_key = 'DOC_ID:' || v_counter_year FOR UPDATE;
    v_last := v_last + 1;
    UPDATE public.issued_document_personal_counters SET last_value = v_last, updated_at = now()
    WHERE owner_profile_id = v_owner AND counter_key = 'DOC_ID:' || v_counter_year;
  END IF;
  v_doc_id := 'OTP-DOC-' || upper(substr(v_scope, 1, 8))
    || upper(split_part(v_scope, '-', 5))
    || '-' || v_counter_year || '-' || lpad(v_last::text, 6, '0');

  IF p_organization_id IS NOT NULL THEN
    INSERT INTO public.issued_document_id_counters (organization_id, counter_key, last_value)
    VALUES (p_organization_id, 'VERIFY_REF', 0)
    ON CONFLICT (organization_id, counter_key) DO NOTHING;
    SELECT last_value INTO v_last FROM public.issued_document_id_counters
    WHERE organization_id = p_organization_id AND counter_key = 'VERIFY_REF' FOR UPDATE;
    v_last := v_last + 1;
    UPDATE public.issued_document_id_counters SET last_value = v_last, updated_at = now()
    WHERE organization_id = p_organization_id AND counter_key = 'VERIFY_REF';
  ELSE
    INSERT INTO public.issued_document_personal_counters (owner_profile_id, counter_key, last_value)
    VALUES (v_owner, 'VERIFY_REF', 0)
    ON CONFLICT (owner_profile_id, counter_key) DO NOTHING;
    SELECT last_value INTO v_last FROM public.issued_document_personal_counters
    WHERE owner_profile_id = v_owner AND counter_key = 'VERIFY_REF' FOR UPDATE;
    v_last := v_last + 1;
    UPDATE public.issued_document_personal_counters SET last_value = v_last, updated_at = now()
    WHERE owner_profile_id = v_owner AND counter_key = 'VERIFY_REF';
  END IF;
  v_vref := 'VR-' || upper(substr(v_scope, 1, 8))
    || upper(split_part(v_scope, '-', 5))
    || '-' || lpad(v_last::text, 8, '0');

  INSERT INTO public.issued_document_snapshots (
    document_id, organization_id, owner_profile_id, document_kind, document_number,
    source_entity_type, source_entity_id, source_supplier_id, transaction_refs,
    persona, perspective, identity_state, visibility_context,
    template_version, schema_version, payload_json,
    verification_digest, verification_algorithm, verification_ref,
    idempotency_key, generated_at, generated_by, status
  ) VALUES (
    v_doc_id, p_organization_id, v_owner, p_document_kind, p_document_number,
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
$function$;

-- Whitespace-insensitive, exactly-once patcher (same contract as 00282).
CREATE OR REPLACE FUNCTION pg_temp.patch_fn(p_proc regprocedure, p_old text[], p_new text[], p_marker text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_def text := pg_get_functiondef(p_proc);
  v_rx text;
  v_count integer;
  i integer;
BEGIN
  IF position(p_marker IN v_def) > 0 THEN
    RETURN;
  END IF;
  FOR i IN 1 .. array_length(p_old, 1) LOOP
    v_rx := regexp_replace(
              regexp_replace(p_old[i], '([.\[\]\(\)\{\}\*\+\?\^\$\|\\])', '\\\1', 'g'),
              '\s+', '\s+', 'g');
    SELECT count(*) INTO v_count FROM regexp_matches(v_def, v_rx, 'g');
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'patch % fragment % matched % times (expected exactly 1)', p_proc, i, v_count;
    END IF;
    v_def := regexp_replace(v_def, v_rx, replace(replace(p_new[i], '\', '\\'), '&', '\&'));
  END LOOP;
  EXECUTE v_def;
END;
$$;

SELECT pg_temp.patch_fn(
  'private.issue_po_document_snapshots(uuid)'::regprocedure,
  ARRAY['SELECT * INTO v_org FROM organizations WHERE id = v_po.organization_id;'],
  ARRAY['SELECT * INTO v_org FROM organizations WHERE id = v_po.organization_id;
  IF NOT FOUND AND v_po.owner_profile_id IS NOT NULL THEN
    v_org.org_type := ''INDIVIDUAL'';
    v_org.name := (SELECT full_name FROM profiles WHERE id = v_po.owner_profile_id);
  END IF;'],
  'v_po.owner_profile_id IS NOT NULL THEN');

SELECT pg_temp.patch_fn(
  'private.issue_tax_invoice_snapshots(uuid)'::regprocedure,
  ARRAY['SELECT * INTO v_org FROM organizations WHERE id = v_po.organization_id;'],
  ARRAY['SELECT * INTO v_org FROM organizations WHERE id = v_po.organization_id;
  IF NOT FOUND AND v_po.owner_profile_id IS NOT NULL THEN
    v_org.org_type := ''INDIVIDUAL'';
    v_org.name := (SELECT full_name FROM profiles WHERE id = v_po.owner_profile_id);
  END IF;'],
  'v_po.owner_profile_id IS NOT NULL THEN');

SELECT pg_temp.patch_fn(
  'private.issue_decision_receipt_snapshots_for_award(uuid, text)'::regprocedure,
  ARRAY['SELECT * INTO v_org FROM organizations WHERE id = v_rfq.organization_id;'],
  ARRAY['SELECT * INTO v_org FROM organizations WHERE id = v_rfq.organization_id;
  IF NOT FOUND AND v_rfq.owner_profile_id IS NOT NULL THEN
    v_org.org_type := ''INDIVIDUAL'';
    v_org.name := (SELECT full_name FROM profiles WHERE id = v_rfq.owner_profile_id);
  END IF;'],
  'v_rfq.owner_profile_id IS NOT NULL THEN');

COMMIT;
