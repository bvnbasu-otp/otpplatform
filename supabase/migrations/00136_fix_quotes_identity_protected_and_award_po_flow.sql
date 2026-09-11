-- 00136_fix_quotes_identity_protected_and_award_po_flow.sql
-- 1. Fix quotes_identity_protected and masked views to remain visible post-award
-- 2. Ensure create_purchase_order_from_award issues PO and creates work order
-- 3. Enhance reveal_award to automatically create purchase order
-- 4. Fix notify_quote_submitted trigger to include 'FINAL' status quotes with clean ASCII
-- 5. Cascade delete on purchase_orders foreign keys to allow clean teardowns
-- 6. Clean match_reasons in discovery engine to ensure supplier sources are never leaked
-- 7. Backfill missing purchase orders for existing revealed awards

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Foreign Key Cascades on purchase_orders
-- ---------------------------------------------------------------------------

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_award_id_fkey,
  ADD CONSTRAINT purchase_orders_award_id_fkey
    FOREIGN KEY (award_id) REFERENCES public.awards (id) ON DELETE CASCADE;

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_rfq_id_fkey,
  ADD CONSTRAINT purchase_orders_rfq_id_fkey
    FOREIGN KEY (rfq_id) REFERENCES public.rfqs (id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. Drop and Recreate Canonical Views to Preserve Quote Visibility Post-Award
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.quotes_blind CASCADE;
DROP VIEW IF EXISTS public.rfq_clarification_blind CASCADE;
DROP VIEW IF EXISTS public.quote_attachments_blind CASCADE;
DROP VIEW IF EXISTS public.quote_evaluations_blind CASCADE;
DROP VIEW IF EXISTS public.rfq_invitations_blind CASCADE;

DROP VIEW IF EXISTS public.quotes_identity_protected CASCADE;
DROP VIEW IF EXISTS public.rfq_clarifications_masked CASCADE;
DROP VIEW IF EXISTS public.quote_attachments_masked CASCADE;
DROP VIEW IF EXISTS public.quote_evaluations_masked CASCADE;
DROP VIEW IF EXISTS public.rfq_invitations_masked CASCADE;

CREATE VIEW public.quotes_identity_protected
WITH (security_barrier = true) AS
SELECT
    q.id AS quote_id,
    ri.anonymous_label,
    q.rfq_id,
    q.status,
    q.current_version AS version,
    q.evaluation_score,
    q.submitted_at,
    q.created_at,
    q.updated_at,
    ((qv.snapshot ->> 'basePrice'::text))::numeric(14,2) AS base_price,
    ((qv.snapshot ->> 'gstAmount'::text))::numeric(14,2) AS gst_amount,
    ((qv.snapshot ->> 'transportCost'::text))::numeric(14,2) AS transport_cost,
    ((qv.snapshot ->> 'totalCost'::text))::numeric(14,2) AS total_cost,
    ((qv.snapshot ->> 'deliveryDays'::text))::integer AS delivery_days,
    ((qv.snapshot ->> 'warrantyMonths'::text))::integer AS warranty_months,
    ((qv.snapshot ->> 'paymentTermsDays'::text))::integer AS payment_terms_days,
    ((round((s.rating_avg * (2)::numeric)) / (2)::numeric))::numeric(3,1) AS rating_band,
    ((round((s.on_time_percent / (5)::numeric)) * (5)::numeric))::integer AS on_time_band,
    CASE
        WHEN (s.completed_jobs >= 50) THEN '50+'::text
        WHEN (s.completed_jobs >= 20) THEN '20-49'::text
        WHEN (s.completed_jobs >= 5) THEN '5-19'::text
        WHEN (s.completed_jobs >= 1) THEN '1-4'::text
        ELSE 'New'::text
    END AS experience_band,
    s.verification_status,
    COALESCE(s.gst_verified, false) AS is_gst_verified
FROM quotes q
JOIN rfq_invitations ri ON ri.id = q.invitation_id
JOIN rfqs r ON r.id = q.rfq_id
JOIN suppliers s ON s.id = q.supplier_id
LEFT JOIN quote_versions qv ON qv.quote_id = q.id AND qv.version = q.current_version
WHERE
    q.status NOT IN ('DRAFT'::public.quote_status, 'DRAFT_FROM_MESSAGING'::public.quote_status, 'WITHDRAWN'::public.quote_status)
    AND (
        private.can_access_rfq_as_buyer(q.rfq_id)
        OR private.can_access_rfq_as_committee(q.rfq_id)
    );

CREATE VIEW public.rfq_clarifications_masked
WITH (security_barrier = true) AS
SELECT
    m.id AS message_id,
    m.rfq_id,
    m.invitation_id,
    ri.anonymous_label,
    m.author_side,
    CASE
        WHEN m.author_side = 'BUYER'::public.clarification_author_side THEN 'Buyer organization'::text
        ELSE ri.anonymous_label
    END AS author_display,
    m.body,
    m.created_at,
    m.redactions
FROM rfq_clarification_messages m
JOIN rfq_invitations ri ON ri.id = m.invitation_id
JOIN rfqs r ON r.id = m.rfq_id
WHERE
    (
        private.can_access_rfq_as_buyer(m.rfq_id)
        OR private.can_access_rfq_as_committee(m.rfq_id)
    );

CREATE VIEW public.quote_attachments_masked
WITH (security_barrier = true) AS
SELECT
    a.id AS attachment_id,
    a.quote_id,
    a.rfq_id,
    ri.anonymous_label,
    a.kind,
    a.display_name,
    a.content_type,
    a.size_bytes,
    a.duration_seconds,
    a.storage_path,
    a.created_at
FROM attachments a
JOIN quotes q ON q.id = a.quote_id
JOIN rfq_invitations ri ON ri.id = q.invitation_id
JOIN rfqs r ON r.id = a.rfq_id
WHERE a.scope = 'QUOTE'::attachment_scope
  AND r.reveal_status IN ('PROTECTED'::public.rfq_reveal_status, 'BLIND'::public.rfq_reveal_status)
  AND (
    private.can_access_rfq_as_buyer(a.rfq_id)
    OR private.can_access_rfq_as_committee(a.rfq_id)
  );

CREATE VIEW public.quote_evaluations_masked
WITH (security_barrier = true) AS
SELECT
    e.id AS evaluation_id,
    e.quote_id,
    e.rfq_id,
    ri.anonymous_label,
    e.version_evaluated,
    e.evaluation_score,
    private.band_evaluation_breakdown(e.breakdown) AS breakdown,
    e.status,
    e.computed_at
FROM quote_evaluations e
JOIN quotes q ON q.id = e.quote_id
JOIN rfq_invitations ri ON ri.id = q.invitation_id
JOIN rfqs r ON r.id = e.rfq_id
WHERE (
    private.can_access_rfq_as_buyer(e.rfq_id)
    OR private.can_access_rfq_as_committee(e.rfq_id)
  );

CREATE VIEW public.rfq_invitations_masked
WITH (security_barrier = true) AS
SELECT
    ri.id AS invitation_id,
    ri.rfq_id,
    ri.anonymous_label,
    ri.status,
    ri.invited_at,
    ri.viewed_at,
    ri.declined_at
FROM rfq_invitations ri
JOIN rfqs r ON r.id = ri.rfq_id
WHERE private.can_access_rfq_as_committee(ri.rfq_id);

-- Re-establish Backward-Compatibility Views
CREATE VIEW public.quotes_blind WITH (security_barrier = true) AS SELECT * FROM public.quotes_identity_protected;
CREATE VIEW public.rfq_clarification_blind WITH (security_barrier = true) AS SELECT * FROM public.rfq_clarifications_masked;
CREATE VIEW public.quote_attachments_blind WITH (security_barrier = true) AS SELECT * FROM public.quote_attachments_masked;
CREATE VIEW public.quote_evaluations_blind WITH (security_barrier = true) AS SELECT * FROM public.quote_evaluations_masked;
CREATE VIEW public.rfq_invitations_blind WITH (security_barrier = true) AS SELECT * FROM public.rfq_invitations_masked;

GRANT SELECT ON public.quotes_identity_protected TO authenticated, anon, service_role;
GRANT SELECT ON public.rfq_clarifications_masked TO authenticated, anon, service_role;
GRANT SELECT ON public.quote_attachments_masked TO authenticated, anon, service_role;
GRANT SELECT ON public.quote_evaluations_masked TO authenticated, anon, service_role;
GRANT SELECT ON public.rfq_invitations_masked TO authenticated, anon, service_role;

GRANT SELECT ON public.quotes_blind TO authenticated, anon, service_role;
GRANT SELECT ON public.rfq_clarification_blind TO authenticated, anon, service_role;
GRANT SELECT ON public.quote_attachments_blind TO authenticated, anon, service_role;
GRANT SELECT ON public.quote_evaluations_blind TO authenticated, anon, service_role;
GRANT SELECT ON public.rfq_invitations_blind TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 3. Clean match_reasons in discovery engine & existing rows
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.auto_discover_and_invite_suppliers(
  p_rfq_id uuid,
  p_exclude uuid[] DEFAULT '{}'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq        rfqs%ROWTYPE;
  v_req        requirements%ROWTYPE;
  v_candidate  record;
  v_invited    integer := 0;
  v_label      text;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_req FROM requirements WHERE id = v_rfq.requirement_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Pass 1: Strict capability matching based on requirement structured specs
  FOR v_candidate IN
    SELECT sm.supplier_id, sm.match_score, sm.match_reasons
    FROM private.match_suppliers_for_requirement(v_req.id, 4, p_exclude) sm
    WHERE NOT EXISTS (
      SELECT 1 FROM rfq_invitations
      WHERE rfq_id = p_rfq_id AND supplier_id = sm.supplier_id
    )
  LOOP
    v_label := private.assign_anonymous_label(p_rfq_id, v_candidate.supplier_id);

    INSERT INTO rfq_invitations (
      rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons
    ) VALUES (
      p_rfq_id,
      v_candidate.supplier_id,
      v_label,
      'INVITED',
      v_candidate.match_score,
      v_candidate.match_reasons
    );

    v_invited := v_invited + 1;
  END LOOP;

  -- Pass 2: Fallback for requirements without structured capabilities (clean objective match reasons)
  IF (v_invited + (SELECT count(*)::int FROM rfq_invitations WHERE rfq_id = p_rfq_id)) < 4 THEN
    FOR v_candidate IN
      SELECT s.id AS supplier_id, COALESCE(s.rating_avg, 4.0) * 20 AS match_score,
             ARRAY['category_match', 'verified_supplier'] AS match_reasons
      FROM suppliers s
      WHERE s.status = 'ACTIVE'
        AND NOT (s.id = ANY(COALESCE(p_exclude, '{}')))
        AND NOT EXISTS (
          SELECT 1 FROM rfq_invitations
          WHERE rfq_id = p_rfq_id AND supplier_id = s.id
        )
      ORDER BY s.rating_avg DESC NULLS LAST
      LIMIT (4 - (SELECT count(*)::int FROM rfq_invitations WHERE rfq_id = p_rfq_id))
    LOOP
      v_label := private.assign_anonymous_label(p_rfq_id, v_candidate.supplier_id);

      INSERT INTO rfq_invitations (
        rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons
      ) VALUES (
        p_rfq_id,
        v_candidate.supplier_id,
        v_label,
        'INVITED',
        v_candidate.match_score,
        v_candidate.match_reasons
      );

      v_invited := v_invited + 1;
    END LOOP;
  END IF;

  RETURN v_invited;
END;
$$;

UPDATE public.rfq_invitations
SET match_reasons = array_remove(
  array_remove(
    array_remove(
      array_remove(
        array_remove(
          array_remove(match_reasons, 'source:DIRECT'),
          'source:BNI'),
        'source:ONDC'),
      'source:ASSOCIATION'),
    'source:REFERRAL'),
  'source:LOCAL_REGISTRY')
WHERE match_reasons::text LIKE '%source%';

-- ---------------------------------------------------------------------------
-- 4. Enhanced create_purchase_order_from_award RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_purchase_order_from_award(p_award_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_award       awards%ROWTYPE;
  v_rfq         rfqs%ROWTYPE;
  v_quote       quotes%ROWTYPE;
  v_version     quote_versions%ROWTYPE;
  v_existing_po purchase_orders%ROWTYPE;
  v_po_id       uuid;
  v_po_number   text;
  v_total       numeric;
  v_currency    text;
BEGIN
  SELECT * INTO v_award FROM awards WHERE id = p_award_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award not found';
  END IF;

  IF v_award.status <> 'REVEALED' THEN
    RAISE EXCEPTION 'Award must be REVEALED before creating a Purchase Order';
  END IF;

  SELECT * INTO v_rfq FROM rfqs WHERE id = v_award.rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT private.is_org_member(v_rfq.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO v_existing_po FROM purchase_orders WHERE award_id = p_award_id;
  IF FOUND THEN
    -- Ensure work order exists
    IF NOT EXISTS (SELECT 1 FROM work_orders WHERE purchase_order_id = v_existing_po.id) THEN
      INSERT INTO work_orders (
        purchase_order_id, supplier_id, status, title, progress_percent, created_at, updated_at
      ) VALUES (
        v_existing_po.id, v_existing_po.supplier_id, 'NOT_STARTED', 'Work order - ' || v_existing_po.po_number, 0, now(), now()
      );
    END IF;
    RETURN jsonb_build_object('po_id', v_existing_po.id, 'po_number', v_existing_po.po_number);
  END IF;

  SELECT * INTO v_quote FROM quotes WHERE id = v_award.quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Awarded quote not found';
  END IF;

  SELECT * INTO v_version
  FROM quote_versions
  WHERE quote_id = v_quote.id AND version = v_quote.current_version;

  v_total := COALESCE((v_version.snapshot->>'totalCost')::numeric, (v_version.snapshot->>'basePrice')::numeric, 0);
  v_currency := COALESCE(v_version.snapshot->>'currency', 'INR');
  v_po_number := 'PO-' || to_char(now(), 'YYYY-MM-DD') || '-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 8));

  INSERT INTO purchase_orders (
    award_id,
    rfq_id,
    organization_id,
    supplier_id,
    po_number,
    status,
    total_amount,
    currency,
    issued_at,
    created_at,
    updated_at
  ) VALUES (
    v_award.id,
    v_award.rfq_id,
    v_rfq.organization_id,
    v_quote.supplier_id,
    v_po_number,
    'ISSUED',
    v_total,
    v_currency,
    now(),
    now(),
    now()
  )
  RETURNING id INTO v_po_id;

  -- Auto-create work order record for execution tracking
  INSERT INTO work_orders (
    purchase_order_id,
    supplier_id,
    status,
    title,
    progress_percent,
    created_at,
    updated_at
  ) VALUES (
    v_po_id,
    v_quote.supplier_id,
    'NOT_STARTED',
    'Work order - ' || v_po_number,
    0,
    now(),
    now()
  );

  INSERT INTO audit_events (
    event_type,
    actor_id,
    organization_id,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    'purchase_order.created',
    COALESCE(private.get_profile_id(), v_rfq.created_by),
    v_rfq.organization_id,
    'purchase_order',
    v_po_id::text,
    jsonb_build_object('po_number', v_po_number, 'amount', v_total, 'currency', v_currency)
  );

  -- Notify buyer
  IF v_rfq.created_by IS NOT NULL THEN
    PERFORM public.create_system_notification(
      v_rfq.created_by,
      '[ORDER] Purchase Order Issued',
      'Official Purchase Order ' || v_po_number || ' has been generated and issued.',
      '/purchase-orders',
      'purchase_order.created',
      'PO_ISSUED',
      jsonb_build_object('poId', v_po_id, 'poNumber', v_po_number, 'rfqId', v_rfq.id)
    );
  END IF;

  -- Notify winning supplier users
  PERFORM public.create_system_notification(
    su.profile_id,
    '[ORDER] New Purchase Order Received',
    'You have received official Purchase Order ' || v_po_number || ' for "' || COALESCE(v_rfq.title, 'Requirement') || '".',
    '/purchase-orders',
    'purchase_order.received',
    'PO_RECEIVED',
    jsonb_build_object('poId', v_po_id, 'poNumber', v_po_number, 'rfqId', v_rfq.id)
  )
  FROM supplier_users su
  WHERE su.supplier_id = v_quote.supplier_id;

  RETURN jsonb_build_object('po_id', v_po_id, 'po_number', v_po_number);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_purchase_order_from_award(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Enhanced reveal_award RPC (Auto-Creates Purchase Order)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reveal_award(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq         rfqs%ROWTYPE;
  v_award       awards%ROWTYPE;
  v_supplier_id uuid;
  v_business    text;
  v_phone       text;
  v_email       text;
  v_alias       text;
  v_now         timestamptz := now();
  v_po_id       uuid;
  v_po_number   text;
  v_po_res      jsonb;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT private.is_org_manager_or_above(v_rfq.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a manager or owner can reveal the winner';
  END IF;

  SELECT * INTO v_award FROM awards WHERE rfq_id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Identity can only be revealed after the award is locked';
  END IF;

  SELECT s.id, s.business_name, s.contact_phone, s.contact_email, ri.anonymous_label
  INTO v_supplier_id, v_business, v_phone, v_email, v_alias
  FROM quotes q
  JOIN suppliers s ON s.id = q.supplier_id
  JOIN rfq_invitations ri ON ri.id = q.invitation_id
  WHERE q.id = v_award.quote_id;

  IF v_rfq.reveal_status = 'REVEALED' THEN
    -- Look up existing PO
    SELECT id, po_number INTO v_po_id, v_po_number
    FROM purchase_orders WHERE award_id = v_award.id;

    -- If PO does not exist yet, generate it now
    IF v_po_id IS NULL THEN
      BEGIN
        v_po_res := public.create_purchase_order_from_award(v_award.id);
        v_po_id := (v_po_res->>'po_id')::uuid;
        v_po_number := v_po_res->>'po_number';
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Auto PO creation encountered: %', SQLERRM;
      END;
    END IF;

    -- Idempotent: already revealed stays revealed.
    RETURN jsonb_build_object(
      'already_revealed', true,
      'supplier_id', v_supplier_id,
      'business_name', v_business,
      'contact_phone', v_phone,
      'contact_email', v_email,
      'alias_before_reveal', v_alias,
      'po_id', v_po_id,
      'po_number', v_po_number
    );
  END IF;

  UPDATE rfqs SET reveal_status = 'REVEALED', updated_at = v_now WHERE id = p_rfq_id;

  UPDATE awards
  SET status = 'REVEALED', revealed_at = v_now
  WHERE id = v_award.id;

  -- Automatically generate the legally binding Purchase Order
  BEGIN
    v_po_res := public.create_purchase_order_from_award(v_award.id);
    v_po_id := (v_po_res->>'po_id')::uuid;
    v_po_number := v_po_res->>'po_number';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Auto PO creation on reveal encountered: %', SQLERRM;
  END;

  -- The winner is told their side of the glass has cleared.
  INSERT INTO notifications (profile_id, channel, event_type, payload)
  SELECT
    su.profile_id,
    'IN_APP',
    'rfq.buyer_revealed',
    jsonb_build_object(
      'rfqId', p_rfq_id,
      'publicRef', v_rfq.public_ref,
      'alias', v_alias
    )
  FROM supplier_users su
  WHERE su.supplier_id = v_supplier_id;

  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'identity.revealed',
    COALESCE(private.get_profile_id(), v_rfq.created_by),
    v_rfq.organization_id,
    'award',
    v_award.id::text,
    jsonb_build_object(
      'rfq_id', p_rfq_id,
      'quote_id', v_award.quote_id,
      'supplier_id', v_supplier_id,
      'business_name', v_business,
      'alias_before_reveal', v_alias,
      'awarded_at', v_award.awarded_at,
      'buyer_released_to_supplier', true,
      'po_number', v_po_number
    )
  );

  RETURN jsonb_build_object(
    'supplier_id', v_supplier_id,
    'business_name', v_business,
    'contact_phone', v_phone,
    'contact_email', v_email,
    'alias_before_reveal', v_alias,
    'revealed_at', v_now,
    'buyer_released_to_supplier', true,
    'po_id', v_po_id,
    'po_number', v_po_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reveal_award(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Clean ASCII Quote Submitted Notification Trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_quote_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq RECORD;
BEGIN
  IF NEW.status IN ('SUBMITTED'::public.quote_status, 'FINAL'::public.quote_status)
     AND (OLD IS NULL OR OLD.status NOT IN ('SUBMITTED'::public.quote_status, 'FINAL'::public.quote_status)) THEN
    SELECT r.id, r.title, r.created_by, r.organization_id
    INTO v_rfq
    FROM rfqs r
    WHERE r.id = NEW.rfq_id;

    IF v_rfq.created_by IS NOT NULL THEN
      PERFORM public.create_system_notification(
        v_rfq.created_by,
        '[QUOTE] New Quote Received',
        'A supplier has submitted a quote for "' || COALESCE(v_rfq.title, 'RFQ') || '". Objective evaluation is updating.',
        '/rfq/' || NEW.rfq_id::text || '/evaluation',
        'quote.submitted',
        'QUOTE_RECEIVED',
        jsonb_build_object('rfqId', NEW.rfq_id, 'quoteId', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_quote_submitted ON quotes;
CREATE TRIGGER trg_notify_quote_submitted
  AFTER INSERT OR UPDATE OF status ON quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_quote_submitted();

-- ---------------------------------------------------------------------------
-- 7. Clean ASCII Unawarded Suppliers Notification Trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_unawarded_suppliers_on_award()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq           rfqs%ROWTYPE;
  v_winning_quote quotes%ROWTYPE;
  v_inv           record;
  v_user          record;
  v_has_quote     boolean;
  v_title         text;
  v_body          text;
  v_action_type   text;
  v_event_type    text;
BEGIN
  IF NEW.quote_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_rfq FROM rfqs WHERE id = NEW.rfq_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_winning_quote FROM quotes WHERE id = NEW.quote_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  FOR v_inv IN
    SELECT ri.id as invitation_id, ri.supplier_id, ri.anonymous_label, s.business_name
    FROM rfq_invitations ri
    JOIN suppliers s ON s.id = ri.supplier_id
    WHERE ri.rfq_id = NEW.rfq_id
      AND ri.supplier_id <> v_winning_quote.supplier_id
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.rfq_id = NEW.rfq_id AND q.supplier_id = v_inv.supplier_id
    ) INTO v_has_quote;

    IF v_has_quote THEN
      v_title       := '[CLOSED] Tender Concluded: Not Awarded';
      v_body        := 'The buyer has concluded evaluation for "' || COALESCE(v_rfq.title, 'Requirement') || '" and placed the order with another supplier. Thank you for your submission.';
      v_action_type := 'RFQ_NOT_AWARDED';
      v_event_type  := 'rfq.not_awarded';
    ELSE
      v_title       := '[CLOSED] Bidding Closed: Requirement Awarded';
      v_body        := 'The requirement "' || COALESCE(v_rfq.title, 'Requirement') || '" is now closed and has been awarded. It is no longer accepting new quotes.';
      v_action_type := 'RFQ_CLOSED_UNRESPONSIVE';
      v_event_type  := 'rfq.closed_unresponsive';
    END IF;

    FOR v_user IN
      SELECT profile_id
      FROM supplier_users
      WHERE supplier_id = v_inv.supplier_id
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM notifications
        WHERE profile_id = v_user.profile_id
          AND event_type IN ('rfq.not_awarded', 'rfq.closed_unresponsive')
          AND payload->>'rfqId' = NEW.rfq_id::text
      ) THEN
        PERFORM public.create_system_notification(
          v_user.profile_id,
          v_title,
          v_body,
          '/supplier/rfq/' || NEW.rfq_id::text,
          v_event_type,
          v_action_type,
          jsonb_build_object(
            'rfqId', NEW.rfq_id,
            'awardId', NEW.id,
            'supplierId', v_inv.supplier_id,
            'hasQuote', v_has_quote
          )
        );
      END IF;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Backfill Missing Purchase Orders for Existing Revealed Awards
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_rec record;
BEGIN
  FOR v_rec IN
    SELECT a.id, a.rfq_id
    FROM awards a
    WHERE a.status = 'REVEALED'
      AND NOT EXISTS (SELECT 1 FROM purchase_orders po WHERE po.award_id = a.id)
  LOOP
    BEGIN
      PERFORM public.create_purchase_order_from_award(v_rec.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping backfill for award %: %', v_rec.id, SQLERRM;
    END;
  END LOOP;
END $$;

COMMIT;
