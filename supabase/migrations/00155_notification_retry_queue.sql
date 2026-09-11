-- =============================================================================
-- Migration 00155: Outbound Notification Exponential Backoff Retry Queue
-- Description:
--   Adds automated retry tracking and exponential backoff scheduling to outbound
--   WhatsApp, SMS, and webhook delivery failures.
-- =============================================================================

BEGIN;

ALTER TABLE public.messaging_events
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_messaging_events_retry
  ON public.messaging_events(processing_status, next_retry_at)
  WHERE processing_status = 'FAILED' AND retry_count < max_retries;

-- Stored Procedure: record_notification_failure_with_backoff
CREATE OR REPLACE FUNCTION public.record_notification_failure_with_backoff(
  p_event_id     uuid,
  p_error_msg    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_event messaging_events%ROWTYPE;
  v_next_retry timestamptz;
  v_backoff_seconds integer;
  v_new_retry_count integer;
  v_new_status messaging_processing_status;
BEGIN
  SELECT * INTO v_event FROM public.messaging_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Event not found');
  END IF;

  v_new_retry_count := v_event.retry_count + 1;

  IF v_new_retry_count >= v_event.max_retries THEN
    v_new_status := 'FAILED'::messaging_processing_status;
    v_next_retry := NULL;
  ELSE
    v_new_status := 'FAILED'::messaging_processing_status;
    -- Exponential backoff: 30s * 2^(retry_count)
    v_backoff_seconds := 30 * (2 ^ (v_new_retry_count - 1));
    v_next_retry := now() + (v_backoff_seconds || ' seconds')::interval;
  END IF;

  UPDATE public.messaging_events
  SET 
    processing_status = v_new_status,
    retry_count = v_new_retry_count,
    next_retry_at = v_next_retry,
    last_error = p_error_msg,
    updated_at = now()
  WHERE id = p_event_id;

  RETURN jsonb_build_object(
    'ok', true,
    'event_id', p_event_id,
    'status', v_new_status::text,
    'retry_count', v_new_retry_count,
    'next_retry_at', v_next_retry
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_notification_failure_with_backoff(uuid, text) TO service_role, authenticated;

COMMIT;
