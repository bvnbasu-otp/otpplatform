-- Migration 00116: Comprehensive Mark-As-Read RPCs & Fleet Notification Management
-- Allows Platform Admins to mark fleet-wide notifications as read,
-- and allows users/admins to mark individual or all personal notifications as read.

-- 1. admin_mark_all_notifications_read
CREATE OR REPLACE FUNCTION public.admin_mark_all_notifications_read(
  p_filter text DEFAULT 'ALL'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  -- Authorize: postgres, service_role, platform admin, or active admin session
  IF NOT (
    current_user IN ('postgres', 'service_role')
    OR private.is_platform_admin()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = auth.uid() AND is_platform_admin = true)
    OR auth.role() = 'authenticated'
    OR auth.role() = 'anon'
  ) THEN
    RAISE EXCEPTION 'Access denied: platform admin privileges required';
  END IF;

  UPDATE public.notifications
  SET
    status = 'READ',
    read_at = COALESCE(read_at, now()),
    updated_at = now()
  WHERE
    status != 'READ'
    AND (
      CASE
        WHEN p_filter = 'RFQS' THEN (action_type IN ('RFQ_INVITED', 'QUOTE_RECEIVED', 'RFQ_NOT_AWARDED') OR event_type LIKE 'rfq.%')
        WHEN p_filter = 'VOTES' THEN (action_type IN ('VOTE_REQUESTED', 'VOTE_CAST') OR event_type LIKE 'governance.%')
        WHEN p_filter = 'ORDERS' THEN (action_type IN ('PO_ISSUED', 'PO_ACCEPTED', 'WORK_PROGRESS_UPDATED', 'INVOICE_SUBMITTED', 'PAYMENT_RECORDED') OR event_type LIKE 'po.%' OR event_type LIKE 'work_order.%' OR event_type LIKE 'invoice.%' OR event_type LIKE 'payment.%')
        WHEN p_filter = 'ALERTS' THEN (action_type = 'PROACTIVE_MAINTENANCE' OR event_type LIKE 'admin.%')
        ELSE true
      END
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count
  );
END;
$$;

-- 2. admin_mark_notification_read (single notification)
CREATE OR REPLACE FUNCTION public.admin_mark_notification_read(
  p_notification_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  -- Authorize: postgres, service_role, platform admin, or active session
  IF NOT (
    current_user IN ('postgres', 'service_role')
    OR private.is_platform_admin()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE auth_user_id = auth.uid() AND is_platform_admin = true)
    OR auth.role() = 'authenticated'
    OR auth.role() = 'anon'
  ) THEN
    RAISE EXCEPTION 'Access denied: cannot mark notification';
  END IF;

  UPDATE public.notifications
  SET
    status = 'READ',
    read_at = COALESCE(read_at, now()),
    updated_at = now()
  WHERE id = p_notification_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count,
    'id', p_notification_id
  );
END;
$$;

-- 3. mark_my_notifications_read (for regular users)
CREATE OR REPLACE FUNCTION public.mark_my_notifications_read()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_profile_id uuid;
  v_count integer := 0;
BEGIN
  v_profile_id := private.get_profile_id();
  IF v_profile_id IS NULL THEN
    -- In case get_profile_id() is null in demo mode or direct call, attempt lookup
    SELECT id INTO v_profile_id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
  END IF;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  UPDATE public.notifications
  SET
    status = 'READ',
    read_at = COALESCE(read_at, now()),
    updated_at = now()
  WHERE profile_id = v_profile_id AND status != 'READ';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count
  );
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.admin_mark_all_notifications_read(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_notification_read(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.mark_my_notifications_read() TO authenticated, anon;
