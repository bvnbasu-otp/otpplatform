-- 00327: Notification dispatch isolation and mandatory idempotency.
--
-- Events are enqueued only by trusted server paths. Recipients can read only
-- their own queue rows; tenant membership does not expose another recipient's
-- address or provider state. Existing incompatible rows are reported rather
-- than rewritten.

DO $preconditions$
DECLARE
  v_null_keys integer;
BEGIN
  SELECT count(*)::integer
  INTO v_null_keys
  FROM public.notification_dispatch_queue
  WHERE idempotency_key IS NULL OR btrim(idempotency_key) = '';

  IF v_null_keys > 0 THEN
    RAISE EXCEPTION
      'NOTIFICATION_IDEMPOTENCY_INCOMPATIBLE: % queue rows have no idempotency key',
      v_null_keys
      USING ERRCODE = '23514';
  END IF;
END
$preconditions$;

ALTER TABLE public.notification_dispatch_queue
  ALTER COLUMN idempotency_key SET NOT NULL;

ALTER TABLE public.notification_dispatch_queue
  ADD CONSTRAINT notification_dispatch_recipient_address_nonempty
  CHECK (length(btrim(recipient_address)) BETWEEN 3 AND 320);

DROP POLICY IF EXISTS notification_queue_select ON public.notification_dispatch_queue;
CREATE POLICY notification_queue_select ON public.notification_dispatch_queue
  FOR SELECT TO authenticated
  USING (
    recipient_user_id = private.get_profile_id()
    OR private.is_platform_admin()
  );

REVOKE INSERT, UPDATE, DELETE ON public.notification_dispatch_queue FROM authenticated;

REVOKE ALL ON FUNCTION public.dispatch_notification_event_atomic(
  uuid, text, text, text, text, jsonb, uuid, text, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_notification_event_atomic(
  uuid, text, text, text, text, jsonb, uuid, text, boolean
) TO service_role;
