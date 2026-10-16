-- 00286: consume one pilot RFQ allowance on the first qualifying supplier quote.
--
-- Approved rule: creating an RFQ does not consume an allowance. The first
-- persisted qualifying quote for that RFQ consumes one, exactly once.
-- Further quotes, revisions, and retries for the same RFQ do not.
--
-- Qualifying means an invited quote in SUBMITTED, REVISED, or FINAL whose
-- latest priced snapshot has a positive totalCost or basePrice, while the
-- existing quoting window still accepts it. DRAFT, WITHDRAWN, unpriced, and
-- non-positive snapshots do not qualify. A cancelled RFQ has no consumption
-- unless a qualifying quote was already persisted; cancellation does not
-- refund that consumption. There is no separate reservation and no invented
-- reservation timeout.
--
-- Monthly accounting uses the consumption timestamp, in the same UTC month
-- window 00248 and 00282 used for the consuming event. The included allowance
-- stays 3. An active YEARLY plan for INDIVIDUAL, COMMUNITY, or MSME still
-- adds one non-carrying bonus in the current UTC quarter, counted from
-- consumption rows rather than RFQ insert rows.
--
-- A quote whose UTC month differs from the RFQ's created_at month is refused
-- with PILOT_ALLOWANCE_PERIOD_UNDECIDED. The previous policy never had to
-- choose a month for that case, because consumption and creation were the
-- same statement. This is a fail-closed hold, not a charging rule.
--
-- Platform-admin sessions, including local seeds, do not consume a buyer's
-- allowance. The row lock and the unique rfq_id are the exactly-once guard.
--
-- Rollback: restore the 00282 body of private.enforce_pilot_rfq_allowance and
-- drop this table's trigger. Do not drop the RFQ trigger without restoring
-- a cap.

BEGIN;

CREATE TABLE IF NOT EXISTS public.rfq_allowance_consumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL UNIQUE REFERENCES public.rfqs (id) ON DELETE CASCADE,
  organization_id uuid,
  owner_profile_id uuid,
  quote_id uuid NOT NULL REFERENCES public.quotes (id) ON DELETE CASCADE,
  quote_version_id uuid NOT NULL REFERENCES public.quote_versions (id) ON DELETE CASCADE,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  used_quarterly_bonus boolean NOT NULL DEFAULT false,
  qualification_reason text NOT NULL DEFAULT 'FIRST_QUALIFYING_QUOTE',
  CHECK (num_nonnulls(organization_id, owner_profile_id) >= 1)
);

-- Demo fixtures are the only supported quote/version deletion path. Cascading
-- the derived consumption row avoids an order-dependent RESTRICT failure while
-- production quote/version rows remain append-only under their existing guards.
ALTER TABLE public.rfq_allowance_consumptions
  DROP CONSTRAINT IF EXISTS rfq_allowance_consumptions_quote_id_fkey,
  DROP CONSTRAINT IF EXISTS rfq_allowance_consumptions_quote_version_id_fkey;
ALTER TABLE public.rfq_allowance_consumptions
  ADD CONSTRAINT rfq_allowance_consumptions_quote_id_fkey
    FOREIGN KEY (quote_id) REFERENCES public.quotes (id) ON DELETE CASCADE,
  ADD CONSTRAINT rfq_allowance_consumptions_quote_version_id_fkey
    FOREIGN KEY (quote_version_id) REFERENCES public.quote_versions (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS rfq_allowance_consumptions_owner_month
  ON public.rfq_allowance_consumptions (organization_id, owner_profile_id, consumed_at);

ALTER TABLE public.rfq_allowance_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_allowance_consumptions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rfq_allowance_consumptions_select ON public.rfq_allowance_consumptions;
CREATE POLICY rfq_allowance_consumptions_select ON public.rfq_allowance_consumptions
  FOR SELECT TO authenticated
  USING (
    private.is_platform_admin()
    OR private.is_buyer_scope_member(organization_id, owner_profile_id)
  );

REVOKE ALL ON public.rfq_allowance_consumptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rfq_allowance_consumptions TO authenticated;
GRANT ALL ON public.rfq_allowance_consumptions TO service_role;

CREATE OR REPLACE FUNCTION private.enforce_pilot_rfq_allowance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
BEGIN
  -- 00286 moved consumption to the first qualifying quote. Publishing an RFQ
  -- must not take the allowance.
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_pilot_rfq_allowance() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.consume_pilot_allowance_for_quote(
  p_rfq_id uuid,
  p_quote_id uuid,
  p_quote_version_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
DECLARE
  v_allowance CONSTANT integer := 3;
  v_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_quarter_start timestamptz := date_trunc('quarter', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_rfq public.rfqs%ROWTYPE;
  v_used integer;
  v_bonus_used integer := 0;
  v_plan text := '';
  v_status text := '';
  v_expires timestamptz;
  v_org_type text := '';
  v_yearly boolean := false;
  v_found boolean := false;
  v_bonus boolean := false;
BEGIN
  IF private.is_platform_admin() THEN
    RETURN;
  END IF;

  SELECT * INTO v_rfq FROM public.rfqs WHERE id = p_rfq_id FOR UPDATE;
  IF NOT FOUND OR v_rfq.status = 'CANCELLED'::public.rfq_status THEN
    RETURN;
  END IF;

  IF date_trunc('month', v_rfq.created_at AT TIME ZONE 'UTC')
     IS DISTINCT FROM date_trunc('month', now() AT TIME ZONE 'UTC') THEN
    RAISE EXCEPTION 'Pilot Allowance: this quote is outside the RFQ''s UTC month, and that boundary is not an approved charging rule.'
      USING ERRCODE = 'P0001', HINT = 'PILOT_ALLOWANCE_PERIOD_UNDECIDED';
  END IF;

  IF v_rfq.organization_id IS NOT NULL THEN
    SELECT upper(btrim(COALESCE(subscription_plan, ''))),
           COALESCE(NULLIF(upper(btrim(COALESCE(subscription_status, ''))), ''), 'ACTIVE'),
           subscription_expires_at,
           upper(btrim(COALESCE(org_type::text, '')))
      INTO v_plan, v_status, v_expires, v_org_type
    FROM public.organizations
    WHERE id = v_rfq.organization_id
    FOR UPDATE;
    v_found := FOUND;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(v_rfq.owner_profile_id::text, 0));
    SELECT upper(btrim(COALESCE(subscription_plan, ''))),
           COALESCE(NULLIF(upper(btrim(COALESCE(subscription_status, ''))), ''), 'ACTIVE'),
           subscription_expires_at,
           'INDIVIDUAL'
      INTO v_plan, v_status, v_expires, v_org_type
    FROM public.personal_subscriptions
    WHERE profile_id = v_rfq.owner_profile_id;
    v_found := FOUND;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.rfq_allowance_consumptions WHERE rfq_id = p_rfq_id
  ) THEN
    RETURN;
  END IF;

  IF v_found THEN
    v_yearly := v_plan = 'YEARLY'
      AND v_status = 'ACTIVE'
      AND (v_expires IS NULL OR v_expires >= now())
      AND v_org_type IN ('INDIVIDUAL', 'COMMUNITY', 'MSME');
  END IF;

  SELECT count(*)::integer INTO v_used
  FROM public.rfq_allowance_consumptions
  WHERE organization_id IS NOT DISTINCT FROM v_rfq.organization_id
    AND owner_profile_id IS NOT DISTINCT FROM v_rfq.owner_profile_id
    AND consumed_at >= v_month_start
    AND consumed_at < v_month_start + interval '1 month';

  IF v_used >= v_allowance THEN
    IF v_yearly AND v_used = v_allowance THEN
      SELECT COALESCE(SUM(GREATEST(month_count - v_allowance, 0)), 0)::integer
        INTO v_bonus_used
      FROM (
        SELECT count(*)::integer AS month_count
        FROM public.rfq_allowance_consumptions
        WHERE organization_id IS NOT DISTINCT FROM v_rfq.organization_id
          AND owner_profile_id IS NOT DISTINCT FROM v_rfq.owner_profile_id
          AND consumed_at >= v_quarter_start
          AND consumed_at < v_quarter_start + interval '3 months'
        GROUP BY date_trunc('month', consumed_at AT TIME ZONE 'UTC')
      ) quarter_months;
      IF COALESCE(v_bonus_used, 0) >= 1 THEN
        RAISE EXCEPTION 'Pilot Allowance: 0 of % RFQs remaining this month (₹0 charged in Pilot Mode). The yearly plan quarterly bonus RFQ for this UTC calendar quarter is already used and does not carry into the next month.', v_allowance
          USING ERRCODE = 'P0001', HINT = 'PILOT_ALLOWANCE_EXHAUSTED';
      END IF;
      v_bonus := true;
    ELSE
      RAISE EXCEPTION 'Pilot Allowance: 0 of % RFQs remaining this month (₹0 charged in Pilot Mode). You have used all RFQs in this month''s pilot allowance. It resets on the 1st of next month.', v_allowance
        USING ERRCODE = 'P0001', HINT = 'PILOT_ALLOWANCE_EXHAUSTED';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.rfq_allowance_consumptions (
      rfq_id, organization_id, owner_profile_id, quote_id, quote_version_id,
      used_quarterly_bonus, qualification_reason
    ) VALUES (
      p_rfq_id, v_rfq.organization_id, v_rfq.owner_profile_id, p_quote_id, p_quote_version_id,
      v_bonus, 'FIRST_QUALIFYING_QUOTE'
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN;
  END;
END;
$$;

REVOKE ALL ON FUNCTION private.consume_pilot_allowance_for_quote(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.quote_snapshot_price(p_snapshot jsonb)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_price numeric;
BEGIN
  IF p_snapshot IS NULL THEN
    RETURN 0;
  END IF;
  BEGIN
    v_price := COALESCE(
      NULLIF(p_snapshot->>'totalCost', '')::numeric,
      NULLIF(p_snapshot->>'basePrice', '')::numeric,
      0
    );
  EXCEPTION
    WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RETURN 0;
  END;
  RETURN COALESCE(v_price, 0);
END;
$$;

REVOKE ALL ON FUNCTION private.quote_snapshot_price(jsonb) FROM PUBLIC, anon, authenticated;

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
  IF private.quote_snapshot_price(NEW.snapshot) <= 0 THEN
    RETURN NEW;
  END IF;
  PERFORM private.consume_pilot_allowance_for_quote(v_rfq_id, NEW.quote_id, NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.trg_consume_pilot_allowance_on_quote_version() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_consume_pilot_allowance_on_quote_version ON public.quote_versions;
CREATE TRIGGER trg_consume_pilot_allowance_on_quote_version
  AFTER INSERT ON public.quote_versions
  FOR EACH ROW EXECUTE FUNCTION private.trg_consume_pilot_allowance_on_quote_version();

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
  IF v_version_id IS NULL OR private.quote_snapshot_price(v_snapshot) <= 0 THEN
    RETURN NEW;
  END IF;
  PERFORM private.consume_pilot_allowance_for_quote(NEW.rfq_id, NEW.id, v_version_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.trg_consume_pilot_allowance_on_quote_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_consume_pilot_allowance_on_quote_status ON public.quotes;
CREATE TRIGGER trg_consume_pilot_allowance_on_quote_status
  BEFORE UPDATE OF status ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION private.trg_consume_pilot_allowance_on_quote_status();

-- The web path used two PostgREST statements for one logical quote. A failed
-- version/allowance insert could therefore leave a SUBMITTED base quote with no
-- version. These RPCs keep quote, version, invitation, and allowance in one
-- database transaction. Direct client writes that could recreate the split
-- transaction are rejected; DRAFT creation and status-only FINAL transitions
-- remain available through their existing guarded paths.
CREATE OR REPLACE FUNCTION private.require_atomic_quote_persistence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF current_setting('otp.atomic_quote_write', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'quote_versions' THEN
    RAISE EXCEPTION 'Quote versions must be persisted through the atomic quote RPC (QUOTE-ATOMIC-WRITE-REQUIRED)'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status <> 'DRAFT'::public.quote_status THEN
    RAISE EXCEPTION 'A submitted quote must be persisted through the atomic quote RPC (QUOTE-ATOMIC-WRITE-REQUIRED)'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.current_version IS DISTINCT FROM OLD.current_version THEN
    RAISE EXCEPTION 'A quote revision must be persisted through the atomic quote RPC (QUOTE-ATOMIC-WRITE-REQUIRED)'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.require_atomic_quote_persistence() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_a_require_atomic_quote_persistence ON public.quotes;
CREATE TRIGGER trg_a_require_atomic_quote_persistence
  BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION private.require_atomic_quote_persistence();

DROP TRIGGER IF EXISTS trg_a_require_atomic_quote_persistence ON public.quote_versions;
CREATE TRIGGER trg_a_require_atomic_quote_persistence
  BEFORE INSERT ON public.quote_versions
  FOR EACH ROW EXECUTE FUNCTION private.require_atomic_quote_persistence();

CREATE OR REPLACE FUNCTION public.submit_supplier_quote_atomic(
  p_rfq_id uuid,
  p_invitation_id uuid,
  p_supplier_id uuid,
  p_snapshot jsonb,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
DECLARE
  v_profile uuid := private.get_profile_id();
  v_quote_id uuid;
  v_version_id uuid;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL
     OR NOT private.is_supplier_user_for(p_supplier_id) THEN
    RAISE EXCEPTION 'Supplier authorization is required (QUOTE-SUPPLIER-AUTH)'
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.rfq_invitations i
    WHERE i.id = p_invitation_id
      AND i.rfq_id = p_rfq_id
      AND i.supplier_id = p_supplier_id
  ) THEN
    RAISE EXCEPTION 'The invitation does not belong to this RFQ and supplier (QUOTE-INVITATION-MISMATCH)'
      USING ERRCODE = '42501';
  END IF;
  -- Lock the parent before the quote INSERT takes its FK key-share lock. Two
  -- suppliers racing on one RFQ would otherwise each hold a key-share lock and
  -- deadlock while the consumption trigger upgrades to FOR UPDATE.
  PERFORM 1 FROM public.rfqs WHERE id = p_rfq_id FOR UPDATE;
  IF private.quoting_refusal(p_rfq_id) IS NOT NULL THEN
    RAISE EXCEPTION 'This enquiry is not accepting quotes (QUOTE-WINDOW-CLOSED)'
      USING ERRCODE = '42501';
  END IF;
  IF private.quote_snapshot_price(p_snapshot) <= 0 THEN
    RAISE EXCEPTION 'A qualifying quote requires a positive comparable price (QUOTE-PRICE-INVALID)'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('otp.atomic_quote_write', 'on', true);
  INSERT INTO public.quotes (
    rfq_id, supplier_id, invitation_id, status, current_version, submitted_at
  ) VALUES (
    p_rfq_id, p_supplier_id, p_invitation_id, 'SUBMITTED', 1, now()
  )
  RETURNING id INTO v_quote_id;

  INSERT INTO public.quote_versions (quote_id, version, snapshot, notes, created_by)
  VALUES (v_quote_id, 1, p_snapshot, p_notes, v_profile)
  RETURNING id INTO v_version_id;

  UPDATE public.rfq_invitations
  SET status = 'QUOTED', viewed_at = COALESCE(viewed_at, now())
  WHERE id = p_invitation_id;

  RETURN jsonb_build_object(
    'ok', true,
    'quoteId', v_quote_id,
    'versionId', v_version_id,
    'allowanceConsumed', EXISTS (
      SELECT 1 FROM public.rfq_allowance_consumptions c WHERE c.rfq_id = p_rfq_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_supplier_quote_atomic(uuid, uuid, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_supplier_quote_atomic(uuid, uuid, uuid, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.revise_supplier_quote_atomic(
  p_quote_id uuid,
  p_snapshot jsonb,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
DECLARE
  v_profile uuid := private.get_profile_id();
  v_quote public.quotes%ROWTYPE;
  v_next integer;
  v_version_id uuid;
BEGIN
  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR v_profile IS NULL
     OR NOT private.is_supplier_user_for(v_quote.supplier_id) THEN
    RAISE EXCEPTION 'Quote not found or supplier authorization is required (QUOTE-SUPPLIER-AUTH)'
      USING ERRCODE = '42501';
  END IF;
  IF v_quote.status NOT IN ('SUBMITTED', 'REVISED') THEN
    RAISE EXCEPTION 'Quote cannot be revised in its current status (QUOTE-STATUS)'
      USING ERRCODE = '42501';
  END IF;
  IF private.quoting_refusal(v_quote.rfq_id) IS NOT NULL THEN
    RAISE EXCEPTION 'This enquiry is not accepting quote revisions (QUOTE-WINDOW-CLOSED)'
      USING ERRCODE = '42501';
  END IF;
  IF private.quote_snapshot_price(p_snapshot) <= 0 THEN
    RAISE EXCEPTION 'A quote revision requires a positive comparable price (QUOTE-PRICE-INVALID)'
      USING ERRCODE = '22023';
  END IF;

  v_next := v_quote.current_version + 1;
  PERFORM set_config('otp.atomic_quote_write', 'on', true);
  INSERT INTO public.quote_versions (quote_id, version, snapshot, notes, created_by)
  VALUES (p_quote_id, v_next, p_snapshot, p_notes, v_profile)
  RETURNING id INTO v_version_id;

  UPDATE public.quotes
  SET status = 'REVISED',
      current_version = v_next,
      submitted_at = now(),
      evaluation_score = NULL
  WHERE id = p_quote_id;

  RETURN jsonb_build_object(
    'ok', true,
    'quoteId', p_quote_id,
    'versionId', v_version_id,
    'version', v_next,
    'allowanceConsumed', EXISTS (
      SELECT 1 FROM public.rfq_allowance_consumptions c WHERE c.rfq_id = v_quote.rfq_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revise_supplier_quote_atomic(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revise_supplier_quote_atomic(uuid, jsonb, text) TO authenticated;

COMMIT;
