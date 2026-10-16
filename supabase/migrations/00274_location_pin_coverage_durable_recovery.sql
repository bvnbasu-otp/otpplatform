-- Durable, bounded recovery for authoritative PIN/category coverage generations.

BEGIN;

ALTER TABLE public.location_pin_coverage_generation
  DROP CONSTRAINT IF EXISTS location_pin_coverage_generation_status_check;

ALTER TABLE public.location_pin_coverage_generation
  ADD CONSTRAINT location_pin_coverage_generation_status_check
  CHECK (status IN ('in_progress', 'completed', 'failed', 'queued', 'partial', 'exhausted')),
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  ADD COLUMN IF NOT EXISTS max_retries integer NOT NULL DEFAULT 5 CHECK (max_retries BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS manual_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovered_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_location_pin_coverage_generation_due
  ON public.location_pin_coverage_generation (next_attempt_at, started_at)
  WHERE status IN ('queued', 'in_progress', 'exhausted', 'partial');

UPDATE public.location_pin_coverage_generation
SET status = 'completed',
    completed_at = COALESCE(completed_at, now()),
    next_attempt_at = NULL
WHERE status = 'failed'
  AND error_code = 'ZERO_RESULTS';

UPDATE public.location_pin_coverage_generation
SET status = CASE WHEN retry_count >= max_retries THEN 'exhausted' ELSE 'queued' END,
    next_attempt_at = CASE WHEN retry_count >= max_retries THEN NULL ELSE now() END,
    last_error = COALESCE(last_error, error_code, 'LEGACY_GENERATION_FAILURE')
WHERE status = 'failed'
  AND error_code IS DISTINCT FROM 'ZERO_RESULTS';

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
  SELECT * INTO v_existing
  FROM public.location_pin_coverage_generation
  WHERE scope_key = p_scope_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.status = 'in_progress'
       AND v_existing.started_at > now() - make_interval(mins => p_stale_minutes) THEN
      RETURN 'wait';
    END IF;
    IF v_existing.status = 'queued'
       AND v_existing.next_attempt_at IS NOT NULL
       AND v_existing.next_attempt_at > now() THEN
      RETURN 'wait';
    END IF;
    IF v_existing.status = 'exhausted' THEN
      RETURN 'wait';
    END IF;

    UPDATE public.location_pin_coverage_generation
    SET lock_token = p_lock_token,
        status = 'in_progress',
        started_at = now(),
        completed_at = NULL,
        next_attempt_at = NULL,
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
  v_generation public.location_pin_coverage_generation%ROWTYPE;
  v_retry_count integer;
  v_next_attempt timestamptz;
  v_status text;
BEGIN
  SELECT * INTO v_generation
  FROM public.location_pin_coverage_generation
  WHERE scope_key = p_scope_key
    AND lock_token = p_lock_token
    AND status = 'in_progress'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_status = 'completed' THEN
    UPDATE public.location_pin_coverage_generation
    SET status = 'completed',
        completed_at = now(),
        error_code = p_error_code,
        last_error = NULL,
        next_attempt_at = NULL,
        recovered_at = CASE WHEN retry_count > 0 THEN now() ELSE recovered_at END
    WHERE scope_key = p_scope_key;

    IF p_error_code IS NULL THEN
      UPDATE public.location_pin_coverage_scope
      SET last_successful_discovery_at = now(),
          updated_at = now()
      WHERE scope_key = p_scope_key
        AND supplier_count > 0;
    END IF;
    RETURN true;
  END IF;

  IF p_status NOT IN ('failed', 'partial') THEN
    RAISE EXCEPTION 'Unsupported coverage generation completion status: %', p_status;
  END IF;

  v_retry_count := v_generation.retry_count + 1;
  IF v_retry_count >= v_generation.max_retries THEN
    v_status := 'exhausted';
    v_next_attempt := NULL;
  ELSE
    v_status := 'queued';
    v_next_attempt := CASE
      WHEN p_error_code = 'QUOTA_EXHAUSTED' THEN date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc' + interval '1 day'
      ELSE now() + make_interval(secs => LEAST(30 * (2 ^ (v_retry_count - 1)), 1800))
    END;
  END IF;

  UPDATE public.location_pin_coverage_generation
  SET status = v_status,
      retry_count = v_retry_count,
      completed_at = now(),
      error_code = p_error_code,
      last_error = p_error_code,
      next_attempt_at = v_next_attempt
  WHERE scope_key = p_scope_key;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.location_pin_coverage_list_recovery_jobs(
  p_limit integer DEFAULT 50
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(j) ORDER BY j.next_attempt_at NULLS LAST, j.started_at DESC), '[]'::jsonb)
  FROM (
    SELECT g.scope_key, s.state, s.city, s.pincode, s.category,
           g.status, g.retry_count, g.max_retries, g.next_attempt_at,
           g.error_code, g.last_error, g.started_at, g.completed_at,
           g.recovered_at, s.supplier_count
    FROM public.location_pin_coverage_generation g
    JOIN public.location_pin_coverage_scope s USING (scope_key)
    WHERE g.status IN ('queued', 'in_progress', 'exhausted', 'partial')
       OR (g.status = 'completed' AND g.retry_count > 0)
    ORDER BY g.next_attempt_at NULLS LAST, g.started_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
  ) j;
$$;

CREATE OR REPLACE FUNCTION public.location_pin_coverage_list_due_retries(
  p_limit integer DEFAULT 5
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(j) ORDER BY j.next_attempt_at, j.scope_key), '[]'::jsonb)
  FROM (
    SELECT g.scope_key, s.state, s.city, s.pincode, s.category,
           g.status, g.retry_count, g.next_attempt_at
    FROM public.location_pin_coverage_generation g
    JOIN public.location_pin_coverage_scope s USING (scope_key)
    WHERE (g.status = 'queued' AND COALESCE(g.next_attempt_at, now()) <= now())
       OR (g.status = 'in_progress' AND g.started_at <= now() - interval '15 minutes')
    ORDER BY g.next_attempt_at NULLS FIRST, g.started_at
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5), 10))
  ) j;
$$;

CREATE OR REPLACE FUNCTION public.location_pin_coverage_retry_generation(
  p_scope_key text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.location_pin_coverage_generation
  SET status = 'queued',
      retry_count = 0,
      next_attempt_at = now(),
      manual_retry_at = now(),
      completed_at = NULL,
      error_code = 'MANUAL_RETRY'
  WHERE scope_key = p_scope_key
    AND status IN ('exhausted', 'failed', 'partial')
    AND (manual_retry_at IS NULL OR manual_retry_at <= now() - interval '1 minute');
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.location_pin_coverage_list_recovery_jobs(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.location_pin_coverage_list_due_retries(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.location_pin_coverage_retry_generation(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.location_pin_coverage_list_recovery_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.location_pin_coverage_list_due_retries(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.location_pin_coverage_retry_generation(text) TO service_role;

DO $$
DECLARE
  v_url text;
  v_service_key text;
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    CREATE EXTENSION IF NOT EXISTS pg_net;
    v_url := COALESCE(
      NULLIF(current_setting('app.settings.supabase_url', true), ''),
      (SELECT value FROM private.platform_secrets WHERE key = 'supabase_url')
    );
    v_service_key := COALESCE(
      NULLIF(current_setting('app.settings.service_role_key', true), ''),
      (SELECT value FROM private.platform_secrets WHERE key = 'service_role_key')
    );
    IF COALESCE(v_url, '') = '' OR COALESCE(v_service_key, '') = '' THEN
      RAISE NOTICE 'PIN coverage retries remain queued: Supabase URL or service-role secret is not configured for pg_cron';
      RETURN;
    END IF;

    PERFORM cron.unschedule('otp-location-pin-coverage-retries')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'otp-location-pin-coverage-retries');
    PERFORM cron.schedule(
      'otp-location-pin-coverage-retries',
      '* * * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb)',
        rtrim(v_url, '/') || '/functions/v1/location-pin-coverage',
        jsonb_build_object('Authorization', 'Bearer ' || v_service_key, 'Content-Type', 'application/json')::text,
        jsonb_build_object('mode', 'run_due_retries', 'limit', 5)::text
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PIN coverage retry scheduler unavailable (%); jobs remain visible for operator recovery', SQLERRM;
  END;
END;
$$;

COMMIT;