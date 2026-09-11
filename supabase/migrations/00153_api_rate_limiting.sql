-- =============================================================================
-- Migration 00153: PostgreSQL Sliding-Window API Rate Limiting Engine
-- Description:
--   Enforces database-level rate limiting on quoting, voting, and auth endpoints.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_key text NOT NULL, -- IP address or Profile UUID
  endpoint text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup 
  ON public.api_rate_limits(client_key, endpoint, window_start DESC);

-- Enable RLS on rate limits
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

-- Security Definer RPC: check_and_increment_rate_limit
CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  p_client_key       text,
  p_endpoint         text,
  p_max_requests     integer,
  p_window_seconds   integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_now           timestamptz := now();
  v_window_start  timestamptz;
  v_current_count integer;
  v_limit_record  api_rate_limits%ROWTYPE;
BEGIN
  -- Window start calculation
  v_window_start := v_now - (p_window_seconds || ' seconds')::interval;

  -- Sum recent requests within window
  SELECT COALESCE(SUM(request_count), 0)::integer INTO v_current_count
  FROM public.api_rate_limits
  WHERE client_key = p_client_key 
    AND endpoint = p_endpoint 
    AND window_start >= v_window_start;

  IF v_current_count >= p_max_requests THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'error', 'Too Many Requests',
      'current_count', v_current_count,
      'max_requests', p_max_requests,
      'retry_after_seconds', p_window_seconds
    );
  END IF;

  -- Record request
  INSERT INTO public.api_rate_limits (client_key, endpoint, window_start, request_count)
  VALUES (p_client_key, p_endpoint, v_now, 1);

  -- Background prune older than 24 hours
  DELETE FROM public.api_rate_limits WHERE window_start < (v_now - interval '1 day');

  RETURN jsonb_build_object(
    'allowed', true,
    'current_count', v_current_count + 1,
    'max_requests', p_max_requests,
    'remaining', p_max_requests - (v_current_count + 1)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_increment_rate_limit(text, text, integer, integer) TO anon, authenticated, service_role;

COMMIT;
