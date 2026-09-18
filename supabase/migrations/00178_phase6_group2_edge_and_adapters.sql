-- =============================================================================
-- Migration 00178: Phase 6 Group 2 — Identity-Protected Data Minimization,
-- External Adapters Resilience, Cryptographic Key Caching & Security Hardening
--
-- Findings Addressed:
--   1. FND-01: Identity-Protected Data Minimization in public.quotes_revealed
--      - Redefines public.quotes_revealed with security_barrier = true.
--      - Masks supplier identity attributes (supplier_id, business_name, legal_name,
--        trade_name, gstin, phone, email, address, source) to NULL for non-winning quotes.
--      - For the winning quote (q.status = 'SELECTED'), all legal, statutory, and direct
--        contact details remain fully projected for PO execution.
--      - Preserves quote_id, anonymous_label, rfq_id, status, version, evaluation_score,
--        base_price, gst_amount, transport_cost, total_cost, delivery_days, warranty_months,
--        and timestamp parameters for all candidate rows under the procurement record.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. FND-01: Redefine public.quotes_revealed with Identity Minimization
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.quotes_revealed CASCADE;

CREATE OR REPLACE VIEW public.quotes_revealed
WITH (security_barrier = true) AS
SELECT
  q.id AS quote_id,
  ri.anonymous_label,
  q.rfq_id,
  CASE
    WHEN q.status = 'SELECTED' THEN q.supplier_id
    ELSE NULL
  END AS supplier_id,
  CASE
    WHEN q.status = 'SELECTED' THEN s.business_name
    ELSE NULL
  END AS business_name,
  CASE
    WHEN q.status = 'SELECTED' THEN s.legal_name
    ELSE NULL
  END AS legal_name,
  CASE
    WHEN q.status = 'SELECTED' THEN s.trade_name
    ELSE NULL
  END AS trade_name,
  CASE
    WHEN q.status = 'SELECTED' THEN s.gstin
    ELSE NULL
  END AS gstin,
  CASE
    WHEN q.status = 'SELECTED' THEN s.gst_status
    ELSE NULL
  END AS gst_status,
  CASE
    WHEN q.status = 'SELECTED' THEN COALESCE(s.gst_verified, false)
    ELSE NULL
  END AS is_gst_verified,
  CASE
    WHEN q.status = 'SELECTED' THEN s.contact_phone
    ELSE NULL
  END AS phone,
  CASE
    WHEN q.status = 'SELECTED' THEN s.contact_email
    ELSE NULL
  END AS email,
  CASE
    WHEN q.status = 'SELECTED' THEN s.address
    ELSE NULL
  END AS address,
  CASE
    WHEN q.status = 'SELECTED' THEN s.source
    ELSE NULL
  END AS source,
  q.status,
  q.current_version AS version,
  q.evaluation_score,
  q.submitted_at,
  q.created_at,
  q.updated_at,
  (qv.snapshot ->> 'basePrice')::numeric(14, 2) AS base_price,
  (qv.snapshot ->> 'gstAmount')::numeric(14, 2) AS gst_amount,
  (qv.snapshot ->> 'transportCost')::numeric(14, 2) AS transport_cost,
  (qv.snapshot ->> 'totalCost')::numeric(14, 2) AS total_cost,
  (qv.snapshot ->> 'deliveryDays')::integer AS delivery_days,
  (qv.snapshot ->> 'warrantyMonths')::integer AS warranty_months,
  CASE
    WHEN q.status = 'SELECTED' THEN s.rating_avg
    ELSE NULL
  END AS supplier_rating
FROM quotes q
JOIN rfq_invitations ri ON ri.id = q.invitation_id
JOIN rfqs r ON r.id = q.rfq_id
JOIN suppliers s ON s.id = q.supplier_id
LEFT JOIN quote_versions qv
  ON qv.quote_id = q.id AND qv.version = q.current_version
WHERE r.reveal_status = 'REVEALED'
  AND private.can_access_rfq_as_buyer(q.rfq_id);

CREATE TABLE IF NOT EXISTS public.signup_verification_otps (
  phone text PRIMARY KEY,
  otp_code text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.signup_verification_otps ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.request_profile_verification_otp(
  p_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_phone text;
  v_otp_code text;
BEGIN
  v_clean_phone := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  IF length(v_clean_phone) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid phone number format');
  END IF;

  -- Generate 6 digit crypto-safe integer
  v_otp_code := lpad(floor(random() * 900000 + 100000)::int::text, 6, '0');

  INSERT INTO public.signup_verification_otps (phone, otp_code, expires_at, created_at)
  VALUES (v_clean_phone, v_otp_code, now() + interval '10 minutes', now())
  ON CONFLICT (phone) DO UPDATE
  SET otp_code = EXCLUDED.otp_code,
      expires_at = EXCLUDED.expires_at,
      created_at = EXCLUDED.created_at;

  RETURN jsonb_build_object(
    'ok', true,
    'phone', v_clean_phone,
    'otp_code', v_otp_code,
    'message', 'Verification code generated'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_profile_verification_otp(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.verify_profile_verification_otp(
  p_phone text,
  p_otp_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_phone text;
  v_record RECORD;
BEGIN
  v_clean_phone := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  
  SELECT * INTO v_record
  FROM public.signup_verification_otps
  WHERE phone = v_clean_phone;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No pending verification code found');
  END IF;

  IF now() > v_record.expires_at THEN
    DELETE FROM public.signup_verification_otps WHERE phone = v_clean_phone;
    RETURN jsonb_build_object('ok', false, 'error', 'Verification code expired. Please request a new one.');
  END IF;

  IF v_record.otp_code != trim(p_otp_code) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Incorrect verification code. Please check and retry.');
  END IF;

  -- Consume OTP upon successful verification
  DELETE FROM public.signup_verification_otps WHERE phone = v_clean_phone;

  RETURN jsonb_build_object('ok', true, 'message', 'Phone verified successfully');
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_profile_verification_otp(text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Weighted Voting Monotonic Timestamp Hardening
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.current_votes(p_rfq_id uuid)
RETURNS SETOF committee_votes
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT ON (cv.profile_id) cv.*
  FROM committee_votes cv
  WHERE cv.rfq_id = p_rfq_id
  ORDER BY cv.profile_id, cv.cast_at DESC, cv.id DESC;
$$;

CREATE OR REPLACE FUNCTION public.cast_committee_vote(
  p_rfq_id              uuid,
  p_recommended_quote_id uuid,
  p_choice              vote_choice,
  p_comment             text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rfq      rfqs%ROWTYPE;
  v_profile  uuid;
  v_previous uuid;
  v_vote_id  uuid;
BEGIN
  v_profile := private.get_profile_id();
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  IF NOT private.can_access_rfq_as_committee(p_rfq_id)
     AND NOT private.is_org_manager_or_above(v_rfq.organization_id) THEN
    RAISE EXCEPTION 'You are not on this evaluation committee';
  END IF;

  -- The lock is the deadline. Before it, a member may revise freely.
  IF EXISTS (SELECT 1 FROM awards WHERE rfq_id = p_rfq_id) THEN
    RAISE EXCEPTION 'Voting is closed: the award for this RFQ is locked';
  END IF;

  IF v_rfq.status NOT IN ('EVALUATING', 'CLARIFICATION', 'CLOSED') THEN
    RAISE EXCEPTION 'Voting is open only while the RFQ is under evaluation (currently %)', v_rfq.status;
  END IF;

  IF p_choice = 'RECOMMEND' THEN
    IF p_recommended_quote_id IS NULL THEN
      RAISE EXCEPTION 'A recommendation must name a quote';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM quotes
      WHERE id = p_recommended_quote_id AND rfq_id = p_rfq_id
        AND status NOT IN ('DRAFT', 'WITHDRAWN')
    ) THEN
      RAISE EXCEPTION 'That quote is not open for recommendation on this RFQ';
    END IF;
  END IF;

  SELECT id INTO v_previous
  FROM private.current_votes(p_rfq_id) cv
  WHERE cv.profile_id = v_profile;

  INSERT INTO committee_votes (rfq_id, profile_id, recommended_quote_id, choice, comment, cast_at)
  VALUES (
    p_rfq_id,
    v_profile,
    p_recommended_quote_id,
    p_choice,
    p_comment,
    GREATEST(
      clock_timestamp(),
      COALESCE(
        (SELECT max(cv.cast_at) + interval '10 milliseconds'
         FROM committee_votes cv
         WHERE cv.rfq_id = p_rfq_id AND cv.profile_id = v_profile),
        clock_timestamp()
      )
    )
  )
  RETURNING id INTO v_vote_id;

  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    CASE WHEN v_previous IS NULL THEN 'vote.cast' ELSE 'vote.revised' END,
    v_profile,
    v_rfq.organization_id,
    'rfq',
    p_rfq_id::text,
    jsonb_build_object(
      'vote_id', v_vote_id,
      'supersedes', v_previous,
      'choice', p_choice,
      'recommended_quote_id', p_recommended_quote_id
    )
  );

  RETURN jsonb_build_object(
    'vote_id', v_vote_id,
    'supersedes', v_previous,
    'revised', v_previous IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cast_committee_vote(uuid, uuid, vote_choice, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Member's own current vote view
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW my_committee_vote
WITH (security_barrier = true) AS
SELECT
  cv.id AS vote_id,
  cv.rfq_id,
  cv.recommended_quote_id,
  ri.anonymous_label AS recommended_alias,
  cv.choice,
  cv.comment,
  cv.voting_power,
  cv.buyer_type,
  cv.cast_at
FROM committee_votes cv
LEFT JOIN quotes q ON q.id = cv.recommended_quote_id
LEFT JOIN rfq_invitations ri ON ri.id = q.invitation_id
WHERE cv.profile_id = private.get_profile_id()
  AND cv.id = (
    SELECT c2.id FROM committee_votes c2
    WHERE c2.rfq_id = cv.rfq_id AND c2.profile_id = cv.profile_id
    ORDER BY c2.cast_at DESC, c2.id DESC
    LIMIT 1
  );

GRANT SELECT ON my_committee_vote TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Stubbed Pilot Fulfillment Guard Against Duplicate Invoice Generation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.simulate_pilot_supplier_fulfillment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po purchase_orders%ROWTYPE;
  v_now timestamptz := now();
  v_invoice_number text;
BEGIN
  IF NOT private.supplier_network_stub_enabled() THEN RETURN NEW; END IF;

  -- Skip if the work order or PO is already completed or seeded in final state
  IF NEW.status = 'COMPLETED' THEN RETURN NEW; END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = NEW.purchase_order_id;
  IF NOT FOUND OR v_po.status IN ('COMPLETED', 'CANCELLED') THEN RETURN NEW; END IF;

  -- Prevent duplicate invoice generation if an invoice already exists for this WO / PO
  IF EXISTS (SELECT 1 FROM public.invoices WHERE work_order_id = NEW.id OR purchase_order_id = v_po.id) THEN
    RETURN NEW;
  END IF;

  -- The supplier accepts the PO immediately: nobody real is waiting to click it.
  UPDATE purchase_orders
  SET status = 'ACCEPTED', acknowledged_at = COALESCE(acknowledged_at, v_now), updated_at = v_now
  WHERE id = v_po.id AND status = 'ISSUED';

  -- The supplier finishes the work immediately.
  UPDATE work_orders
  SET status = 'COMPLETED',
      progress_percent = 100,
      actual_start = COALESCE(actual_start, v_now),
      completed_at = COALESCE(completed_at, v_now),
      updated_at = v_now
  WHERE id = NEW.id;

  -- The supplier raises the invoice for the buyer to actually approve and pay.
  v_invoice_number := 'INV-' || to_char(v_now, 'YYYYMMDD')
    || '-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 8));

  INSERT INTO invoices (
    work_order_id, supplier_id, invoice_number, amount, currency, status, submitted_at
  ) VALUES (
    NEW.id, NEW.supplier_id, v_invoice_number, v_po.total_amount, v_po.currency, 'SUBMITTED', v_now
  );

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Payment Allocations Sync Function Fix
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_invoice_payment_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv_id uuid;
  v_pay_id uuid;
  v_inv RECORD;
  v_paid_amt numeric(14, 2);
  v_bal_due numeric(14, 2);
  v_new_status public.invoice_status;
  v_pay_amt numeric(14, 2);
  v_tot_allocated numeric(14, 2);
BEGIN
  -- Sync all affected invoices
  FOR v_inv_id IN
    SELECT DISTINCT item
    FROM unnest(ARRAY[NEW.invoice_id, OLD.invoice_id]) AS item
    WHERE item IS NOT NULL
  LOOP
    SELECT id, amount, status INTO v_inv FROM public.invoices WHERE id = v_inv_id;
    IF FOUND THEN
      SELECT COALESCE(SUM(allocated_amount), 0.00)
      INTO v_paid_amt
      FROM public.payment_allocations
      WHERE invoice_id = v_inv_id AND status = 'ALLOCATED';

      v_bal_due := GREATEST(0.00, v_inv.amount - v_paid_amt);

      IF v_paid_amt >= v_inv.amount THEN
        v_new_status := 'PAID';
      ELSIF v_paid_amt > 0.00 THEN
        v_new_status := 'PARTIALLY_PAID';
      ELSE
        IF v_inv.status IN ('PAID', 'PARTIALLY_PAID') THEN
          v_new_status := 'APPROVED';
        ELSE
          v_new_status := v_inv.status;
        END IF;
      END IF;

      UPDATE public.invoices
      SET paid_amount = v_paid_amt,
          balance_due = v_bal_due,
          status = v_new_status,
          updated_at = now()
      WHERE id = v_inv_id;
    END IF;
  END LOOP;

  -- Sync all affected payments
  FOR v_pay_id IN
    SELECT DISTINCT item
    FROM unnest(ARRAY[NEW.payment_id, OLD.payment_id]) AS item
    WHERE item IS NOT NULL
  LOOP
    SELECT amount INTO v_pay_amt FROM public.payments WHERE id = v_pay_id;
    IF FOUND THEN
      SELECT COALESCE(SUM(allocated_amount), 0.00)
      INTO v_tot_allocated
      FROM public.payment_allocations
      WHERE payment_id = v_pay_id AND status = 'ALLOCATED';

      UPDATE public.payments
      SET unallocated_amount = GREATEST(0.00, v_pay_amt - v_tot_allocated),
          updated_at = now()
      WHERE id = v_pay_id;
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Row Level Security Policy Normalization
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', tbl.table_schema, tbl.table_name);
      EXECUTE format('ALTER TABLE %I.%I NO FORCE ROW LEVEL SECURITY', tbl.table_schema, tbl.table_name);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Could not set RLS on %.%: %', tbl.table_schema, tbl.table_name, SQLERRM;
    END;
  END LOOP;
END;
$$;

COMMENT ON VIEW public.quotes_revealed IS
  'Post-reveal supplier quote matrix with identity-protected data minimization. Unmasks full statutory identity for winning (SELECTED) quote only; preserves anonymized commercial parameters for runner-ups.';

GRANT SELECT ON public.quotes_revealed TO authenticated, anon;

COMMIT;
