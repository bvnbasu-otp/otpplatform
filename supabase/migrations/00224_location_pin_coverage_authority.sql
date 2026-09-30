-- GAP-01: Durable location PIN coverage authority (freshness, generation lock, daily Google budget, persisted discoveries).
-- Service-role RPCs only; edge + application workers share this store (not in-memory Maps).

CREATE TABLE IF NOT EXISTS public.location_pin_coverage_scope (
  scope_key text PRIMARY KEY,
  state text NOT NULL,
  city text NOT NULL,
  pincode text NOT NULL,
  category text NOT NULL,
  last_successful_discovery_at timestamptz,
  supplier_count integer NOT NULL DEFAULT 0 CHECK (supplier_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.location_pin_coverage_supplier (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key text NOT NULL REFERENCES public.location_pin_coverage_scope(scope_key) ON DELETE CASCADE,
  place_id text NOT NULL,
  supplier_json jsonb NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_key, place_id)
);

CREATE INDEX IF NOT EXISTS idx_location_pin_coverage_supplier_scope
  ON public.location_pin_coverage_supplier (scope_key);

CREATE TABLE IF NOT EXISTS public.location_pin_coverage_generation (
  scope_key text PRIMARY KEY,
  lock_token uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('in_progress', 'completed', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_code text
);

CREATE TABLE IF NOT EXISTS public.google_places_daily_budget (
  usage_date date PRIMARY KEY DEFAULT ((now() AT TIME ZONE 'utc')::date),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0)
);

ALTER TABLE public.location_pin_coverage_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_pin_coverage_supplier ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_pin_coverage_generation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_places_daily_budget ENABLE ROW LEVEL SECURITY;

CREATE POLICY location_pin_coverage_scope_service ON public.location_pin_coverage_scope
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY location_pin_coverage_supplier_service ON public.location_pin_coverage_supplier
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY location_pin_coverage_generation_service ON public.location_pin_coverage_generation
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY google_places_daily_budget_service ON public.google_places_daily_budget
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.location_pin_coverage_build_scope_key(
  p_state text,
  p_city text,
  p_pincode text,
  p_category text
) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(p_state)) || ':' || lower(trim(p_city)) || ':' || trim(p_pincode) || ':' || lower(trim(p_category));
$$;

CREATE OR REPLACE FUNCTION public.location_pin_coverage_ensure_scope_row(
  p_scope_key text,
  p_state text,
  p_city text,
  p_pincode text,
  p_category text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.location_pin_coverage_scope (scope_key, state, city, pincode, category)
  VALUES (p_scope_key, p_state, p_city, p_pincode, p_category)
  ON CONFLICT (scope_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.location_pin_coverage_assess(
  p_scope_key text,
  p_freshness_days integer DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.location_pin_coverage_scope%ROWTYPE;
  v_age_days integer;
  v_status text;
BEGIN
  SELECT * INTO v_row FROM public.location_pin_coverage_scope WHERE scope_key = p_scope_key;
  IF NOT FOUND OR v_row.supplier_count <= 0 OR v_row.last_successful_discovery_at IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'NEVER_DISCOVERED',
      'knownSupplierCount', COALESCE(v_row.supplier_count, 0),
      'ageInDays', NULL
    );
  END IF;

  v_age_days := floor(extract(epoch FROM (now() - v_row.last_successful_discovery_at)) / 86400)::integer;
  IF v_age_days < p_freshness_days THEN
    v_status := 'FRESH';
  ELSE
    v_status := 'REFRESH_ELIGIBLE';
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'knownSupplierCount', v_row.supplier_count,
    'ageInDays', v_age_days,
    'lastSuccessfulDiscoveryAt', v_row.last_successful_discovery_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.location_pin_coverage_reserve_google_calls(
  p_calls integer,
  p_daily_limit integer DEFAULT 1500
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date date := (now() AT TIME ZONE 'utc')::date;
  v_count integer;
BEGIN
  IF p_calls <= 0 THEN
    RETURN jsonb_build_object('allowed', true, 'requestCount', 0, 'remaining', p_daily_limit);
  END IF;

  INSERT INTO public.google_places_daily_budget (usage_date, request_count)
  VALUES (v_date, 0)
  ON CONFLICT (usage_date) DO NOTHING;

  UPDATE public.google_places_daily_budget
  SET request_count = request_count + p_calls
  WHERE usage_date = v_date
    AND request_count + p_calls <= p_daily_limit
  RETURNING request_count INTO v_count;

  IF NOT FOUND THEN
    SELECT request_count INTO v_count FROM public.google_places_daily_budget WHERE usage_date = v_date;
    RETURN jsonb_build_object(
      'allowed', false,
      'requestCount', COALESCE(v_count, p_daily_limit),
      'remaining', greatest(0, p_daily_limit - COALESCE(v_count, p_daily_limit)),
      'error', 'QUOTA_EXHAUSTED'
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'requestCount', v_count,
    'remaining', greatest(0, p_daily_limit - v_count)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.location_pin_coverage_try_acquire_generation(
  p_scope_key text,
  p_lock_token uuid,
  p_stale_minutes integer DEFAULT 15
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.location_pin_coverage_generation%ROWTYPE;
BEGIN
  SELECT * INTO v_existing FROM public.location_pin_coverage_generation WHERE scope_key = p_scope_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.status = 'in_progress'
       AND v_existing.started_at > now() - make_interval(mins => p_stale_minutes) THEN
      RETURN 'wait';
    END IF;
    UPDATE public.location_pin_coverage_generation
    SET lock_token = p_lock_token,
        status = 'in_progress',
        started_at = now(),
        completed_at = NULL,
        error_code = NULL
    WHERE scope_key = p_scope_key;
    RETURN 'acquired';
  END IF;

  BEGIN
    INSERT INTO public.location_pin_coverage_generation (scope_key, lock_token, status)
    VALUES (p_scope_key, p_lock_token, 'in_progress');
    RETURN 'acquired';
  EXCEPTION WHEN unique_violation THEN
    RETURN 'wait';
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.location_pin_coverage_assert_generation_lock(
  p_scope_key text,
  p_lock_token uuid
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.location_pin_coverage_generation g
    WHERE g.scope_key = p_scope_key
      AND g.lock_token = p_lock_token
      AND g.status = 'in_progress'
  );
$$;

CREATE OR REPLACE FUNCTION public.location_pin_coverage_complete_generation(
  p_scope_key text,
  p_lock_token uuid,
  p_status text,
  p_error_code text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.location_pin_coverage_generation
  SET status = p_status,
      completed_at = now(),
      error_code = p_error_code
  WHERE scope_key = p_scope_key
    AND lock_token = p_lock_token
    AND status = 'in_progress';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.location_pin_coverage_upsert_suppliers(
  p_scope_key text,
  p_state text,
  p_city text,
  p_pincode text,
  p_category text,
  p_suppliers jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_count integer := 0;
BEGIN
  PERFORM public.location_pin_coverage_ensure_scope_row(p_scope_key, p_state, p_city, p_pincode, p_category);

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_suppliers, '[]'::jsonb))
  LOOP
    IF coalesce(v_item->>'placeId', v_item->>'place_id', '') = '' THEN
      CONTINUE;
    END IF;
    INSERT INTO public.location_pin_coverage_supplier (scope_key, place_id, supplier_json, last_seen_at)
    VALUES (
      p_scope_key,
      coalesce(v_item->>'placeId', v_item->>'place_id'),
      v_item,
      now()
    )
    ON CONFLICT (scope_key, place_id) DO UPDATE
      SET supplier_json = EXCLUDED.supplier_json,
          last_seen_at = now();
    v_count := v_count + 1;
  END LOOP;

  SELECT count(*)::integer INTO v_count
  FROM public.location_pin_coverage_supplier
  WHERE scope_key = p_scope_key;

  IF v_count > 0 THEN
    UPDATE public.location_pin_coverage_scope
    SET supplier_count = v_count,
        last_successful_discovery_at = now(),
        updated_at = now()
    WHERE scope_key = p_scope_key;
  END IF;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.location_pin_coverage_list_suppliers(p_scope_key text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(s.supplier_json ORDER BY s.last_seen_at DESC), '[]'::jsonb)
  FROM public.location_pin_coverage_supplier s
  WHERE s.scope_key = p_scope_key;
$$;

REVOKE ALL ON FUNCTION public.location_pin_coverage_build_scope_key(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.location_pin_coverage_ensure_scope_row(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.location_pin_coverage_assess(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.location_pin_coverage_reserve_google_calls(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.location_pin_coverage_assert_generation_lock(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.location_pin_coverage_try_acquire_generation(text, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.location_pin_coverage_complete_generation(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.location_pin_coverage_upsert_suppliers(text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.location_pin_coverage_list_suppliers(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.location_pin_coverage_build_scope_key(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.location_pin_coverage_ensure_scope_row(text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.location_pin_coverage_assess(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.location_pin_coverage_reserve_google_calls(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.location_pin_coverage_assert_generation_lock(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.location_pin_coverage_try_acquire_generation(text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.location_pin_coverage_complete_generation(text, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.location_pin_coverage_upsert_suppliers(text, text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.location_pin_coverage_list_suppliers(text) TO service_role;
