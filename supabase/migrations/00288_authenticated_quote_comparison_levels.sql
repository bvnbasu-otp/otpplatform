-- 00288: authenticated comparison uses only persisted, comparable quotes.
-- Public DEMO_RFQ data is not part of this view.

BEGIN;

CREATE OR REPLACE FUNCTION private.quote_snapshot_numeric(p_snapshot jsonb, p_key text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_value text := p_snapshot ->> p_key;
BEGIN
  IF v_value IS NULL OR v_value !~ '^[0-9]+([.][0-9]+)?$' THEN
    RETURN NULL;
  END IF;
  RETURN v_value::numeric;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.quote_snapshot_numeric(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.quote_snapshot_numeric(jsonb, text) TO authenticated, service_role;

-- One comparison-eligibility rule, shared by the masked view and allowance consumption.
CREATE OR REPLACE FUNCTION private.quote_is_comparison_eligible(p_quote_id uuid, p_snapshot jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_supplier_id uuid;
  v_rfq_id uuid;
  v_delivery text;
BEGIN
  SELECT supplier_id, rfq_id INTO v_supplier_id, v_rfq_id FROM public.quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  -- Direct callers learn only a boolean, and only for an RFQ they can access
  -- or a quote belonging to their supplier. Triggers run with the supplier's JWT.
  IF COALESCE(current_setting('request.jwt.claims', true), '') ~ '"role"[[:space:]]*:[[:space:]]*"(authenticated|anon)"'
     AND NOT (
       private.can_access_rfq_as_buyer(v_rfq_id)
       OR private.can_access_rfq_as_committee(v_rfq_id)
       OR private.is_supplier_user_for(v_supplier_id)
     ) THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.suppliers s
    WHERE s.id = v_supplier_id
      AND s.status = 'ACTIVE'
      AND s.blocked_at IS NULL
      AND s.deleted_at IS NULL
      AND s.lifecycle_state NOT IN ('SUSPENDED', 'VERIFICATION_FAILED')
      AND EXISTS (
        SELECT 1
        FROM public.supplier_users su
        JOIN public.profiles p ON p.id = su.profile_id
        JOIN auth.users u ON u.id = p.auth_user_id
        WHERE su.supplier_id = s.id
      )
  ) THEN
    RETURN false;
  END IF;
  IF p_snapshot IS NULL OR upper(COALESCE(p_snapshot ->> 'currency', '')) <> 'INR' THEN
    RETURN false;
  END IF;
  IF COALESCE(p_snapshot ->> 'basePrice', '') !~ '^[0-9]+([.][0-9]+)?$'
     OR COALESCE(p_snapshot ->> 'totalCost', '') !~ '^[0-9]+([.][0-9]+)?$' THEN
    RETURN false;
  END IF;
  v_delivery := COALESCE(p_snapshot ->> 'deliveryDays', '');
  IF v_delivery !~ '^[0-9]+$' OR length(v_delivery) > 9 OR v_delivery::integer <= 0 THEN
    RETURN false;
  END IF;
  IF private.quote_snapshot_numeric(p_snapshot, 'basePrice') IS NULL
     OR private.quote_snapshot_numeric(p_snapshot, 'basePrice') <= 0
     OR private.quote_snapshot_numeric(p_snapshot, 'totalCost') IS NULL
     OR private.quote_snapshot_numeric(p_snapshot, 'totalCost') <= 0 THEN
    RETURN false;
  END IF;
  IF abs(
    private.quote_snapshot_numeric(p_snapshot, 'totalCost')
    - (
      private.quote_snapshot_numeric(p_snapshot, 'basePrice')
      + COALESCE(private.quote_snapshot_numeric(p_snapshot, 'gstAmount'), 0)
      + COALESCE(private.quote_snapshot_numeric(p_snapshot, 'transportCost'), 0)
    )
  ) > 0.01 THEN
    RETURN false;
  END IF;
  IF (
    p_snapshot ? 'cgstAmount'
    OR p_snapshot ? 'sgstAmount'
    OR p_snapshot ? 'utgstAmount'
    OR p_snapshot ? 'igstAmount'
  ) AND abs(
    COALESCE(private.quote_snapshot_numeric(p_snapshot, 'gstAmount'), 0)
    - (
      COALESCE(private.quote_snapshot_numeric(p_snapshot, 'cgstAmount'), 0)
      + COALESCE(private.quote_snapshot_numeric(p_snapshot, 'sgstAmount'), 0)
      + COALESCE(private.quote_snapshot_numeric(p_snapshot, 'utgstAmount'), 0)
      + COALESCE(private.quote_snapshot_numeric(p_snapshot, 'igstAmount'), 0)
    )
  ) > 0.01 THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION private.quote_is_comparison_eligible(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.quote_is_comparison_eligible(uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.quotes_identity_protected
WITH (security_barrier = true) AS
WITH eligible AS (
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
    private.quote_snapshot_numeric(qv.snapshot, 'basePrice')::numeric(14,2) AS base_price,
    COALESCE(private.quote_snapshot_numeric(qv.snapshot, 'gstAmount'), 0)::numeric(14,2) AS gst_amount,
    COALESCE(private.quote_snapshot_numeric(qv.snapshot, 'transportCost'), 0)::numeric(14,2) AS transport_cost,
    private.quote_snapshot_numeric(qv.snapshot, 'totalCost')::numeric(14,2) AS total_cost,
    CASE WHEN COALESCE(qv.snapshot ->> 'deliveryDays', '') ~ '^[0-9]+$'
      THEN (qv.snapshot ->> 'deliveryDays')::integer END AS delivery_days,
    CASE WHEN COALESCE(qv.snapshot ->> 'warrantyMonths', '') ~ '^[0-9]+$'
      THEN (qv.snapshot ->> 'warrantyMonths')::integer ELSE 0 END AS warranty_months,
    CASE WHEN COALESCE(qv.snapshot ->> 'paymentTermsDays', '') ~ '^[0-9]+$'
      THEN (qv.snapshot ->> 'paymentTermsDays')::integer END AS payment_terms_days,
    (round(s.rating_avg * 2) / 2)::numeric(3,1) AS rating_band,
    (round(s.on_time_percent / 5) * 5)::integer AS on_time_band,
    CASE
      WHEN s.completed_jobs >= 50 THEN '50+'
      WHEN s.completed_jobs >= 20 THEN '20-49'
      WHEN s.completed_jobs >= 5 THEN '5-19'
      WHEN s.completed_jobs >= 1 THEN '1-4'
      ELSE 'New'
    END AS experience_band,
    s.verification_status,
    COALESCE(s.gst_verified, false) AS is_gst_verified,
    COALESCE(private.quote_snapshot_numeric(qv.snapshot, 'cgstAmount'), 0)::numeric(14,2) AS cgst_amount,
    COALESCE(private.quote_snapshot_numeric(qv.snapshot, 'sgstAmount'), 0)::numeric(14,2) AS sgst_amount,
    COALESCE(private.quote_snapshot_numeric(qv.snapshot, 'utgstAmount'), 0)::numeric(14,2) AS utgst_amount,
    COALESCE(private.quote_snapshot_numeric(qv.snapshot, 'igstAmount'), 0)::numeric(14,2) AS igst_amount,
    CASE
      WHEN COALESCE(private.quote_snapshot_numeric(qv.snapshot, 'igstAmount'), 0) > 0 THEN 'IGST'
      WHEN COALESCE(private.quote_snapshot_numeric(qv.snapshot, 'utgstAmount'), 0) > 0 THEN 'CGST_UTGST'
      WHEN COALESCE(private.quote_snapshot_numeric(qv.snapshot, 'sgstAmount'), 0) > 0 THEN 'CGST_SGST'
      WHEN COALESCE(private.quote_snapshot_numeric(qv.snapshot, 'gstAmount'), 0) = 0 THEN 'ZERO_GST'
      ELSE 'AGGREGATE_GST'
    END AS tax_structure
  FROM public.quotes q
  JOIN public.rfq_invitations ri ON ri.id = q.invitation_id
  JOIN public.rfqs r ON r.id = q.rfq_id
  JOIN public.suppliers s ON s.id = q.supplier_id
  JOIN public.quote_versions qv ON qv.quote_id = q.id AND qv.version = q.current_version
  WHERE r.reveal_status IN ('PROTECTED', 'BLIND')
    -- Award locking may mark eligible offers SELECTED / NOT_SELECTED before
    -- reveal. They remain comparable and identity-protected until reveal.
    AND q.status IN ('SUBMITTED', 'REVISED', 'FINAL', 'SELECTED', 'NOT_SELECTED')
    AND private.quote_is_comparison_eligible(q.id, qv.snapshot)
    AND (
      private.can_access_rfq_as_buyer(q.rfq_id)
      OR private.can_access_rfq_as_committee(q.rfq_id)
    )
), ranked AS (
  SELECT
    eligible.*,
    row_number() OVER (
      PARTITION BY rfq_id
      ORDER BY total_cost ASC, evaluation_score DESC NULLS LAST, submitted_at ASC NULLS LAST, quote_id
    ) AS comparable_rank,
    count(*) OVER (PARTITION BY rfq_id) AS eligible_quote_count
  FROM eligible
)
SELECT
  quote_id, anonymous_label, rfq_id, status, version, evaluation_score,
  submitted_at, created_at, updated_at, base_price, gst_amount, transport_cost,
  total_cost, delivery_days, warranty_months, payment_terms_days, rating_band,
  on_time_band, experience_band, verification_status, is_gst_verified,
  comparable_rank,
  CASE
    WHEN eligible_quote_count >= 3 THEN 'L3'
    WHEN eligible_quote_count = 2 THEN 'L2'
    WHEN eligible_quote_count = 1 THEN 'L1'
    ELSE NULL
  END AS comparison_level,
  eligible_quote_count,
  cgst_amount, sgst_amount, utgst_amount, igst_amount, tax_structure
FROM ranked;

REVOKE ALL ON public.quotes_identity_protected FROM PUBLIC, anon;
GRANT SELECT ON public.quotes_identity_protected TO authenticated, service_role;

-- Allowance consumption uses the same eligibility rule as comparison.
CREATE OR REPLACE FUNCTION private.trg_consume_pilot_allowance_on_quote_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
DECLARE
  v_status public.quote_status;
  v_rfq_id uuid;
BEGIN
  SELECT status, rfq_id INTO v_status, v_rfq_id FROM public.quotes WHERE id = NEW.quote_id;
  IF v_status IS NULL OR v_status NOT IN ('SUBMITTED', 'REVISED', 'FINAL') THEN
    RETURN NEW;
  END IF;
  IF NOT private.quote_is_comparison_eligible(NEW.quote_id, NEW.snapshot) THEN
    RETURN NEW;
  END IF;
  PERFORM private.consume_pilot_allowance_for_quote(v_rfq_id, NEW.quote_id, NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_consume_pilot_allowance_on_quote_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
DECLARE
  v_version_id uuid;
  v_snapshot jsonb;
BEGIN
  IF NEW.status NOT IN ('SUBMITTED', 'REVISED', 'FINAL') THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('SUBMITTED', 'REVISED', 'FINAL') THEN
    RETURN NEW;
  END IF;
  SELECT qv.id, qv.snapshot INTO v_version_id, v_snapshot
  FROM public.quote_versions qv
  WHERE qv.quote_id = NEW.id
  ORDER BY qv.version DESC
  LIMIT 1;
  IF v_version_id IS NULL OR NOT private.quote_is_comparison_eligible(NEW.id, v_snapshot) THEN
    RETURN NEW;
  END IF;
  PERFORM private.consume_pilot_allowance_for_quote(NEW.rfq_id, NEW.id, v_version_id);
  RETURN NEW;
END;
$$;

COMMIT;
