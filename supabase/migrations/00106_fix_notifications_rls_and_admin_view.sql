-- Migration 00106: Fix notifications RLS and provide admin_get_all_notifications RPC
-- Ensures platform admins can view all notification history across the system

-- 1. Update notifications RLS policies to allow platform admins to select and update
DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications
  FOR SELECT TO authenticated
  USING (
    profile_id = private.get_profile_id()
    OR private.is_platform_admin()
  );

DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    profile_id = private.get_profile_id()
    OR private.is_platform_admin()
  )
  WITH CHECK (
    profile_id = private.get_profile_id()
    OR private.is_platform_admin()
  );

-- 2. Create high-performance RPC for admin to inspect platform-wide notification history
CREATE OR REPLACE FUNCTION public.admin_get_all_notifications(
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0,
  p_filter text DEFAULT 'ALL'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_is_admin boolean;
  v_results jsonb;
  v_total_count int;
BEGIN
  -- Verify platform admin privileges
  v_is_admin := private.is_platform_admin();
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Access denied: platform admin privileges required';
  END IF;

  SELECT count(*) INTO v_total_count FROM public.notifications;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_results
  FROM (
    SELECT
      n.id,
      n.profile_id,
      p.email AS recipient_email,
      p.full_name AS recipient_name,
      p.is_platform_admin AS recipient_is_admin,
      n.channel,
      n.status,
      n.event_type,
      n.action_type,
      n.title,
      n.body,
      n.link,
      n.payload,
      n.sent_at,
      n.read_at,
      n.created_at,
      n.updated_at
    FROM public.notifications n
    LEFT JOIN public.profiles p ON n.profile_id = p.id
    WHERE
      CASE
        WHEN p_filter = 'UNREAD' THEN n.status != 'READ'
        WHEN p_filter = 'RFQS' THEN (n.action_type IN ('RFQ_INVITED', 'QUOTE_RECEIVED', 'RFQ_NOT_AWARDED') OR n.event_type LIKE 'rfq.%')
        WHEN p_filter = 'VOTES' THEN (n.action_type IN ('VOTE_REQUESTED', 'VOTE_CAST') OR n.event_type LIKE 'governance.%')
        WHEN p_filter = 'ORDERS' THEN (n.action_type IN ('PO_ISSUED', 'PO_ACCEPTED', 'WORK_PROGRESS_UPDATED', 'INVOICE_SUBMITTED', 'PAYMENT_RECORDED') OR n.event_type LIKE 'po.%' OR n.event_type LIKE 'work_order.%' OR n.event_type LIKE 'invoice.%' OR n.event_type LIKE 'payment.%')
        WHEN p_filter = 'ALERTS' THEN (n.action_type = 'PROACTIVE_MAINTENANCE' OR n.event_type LIKE 'admin.%')
        ELSE true
      END
    ORDER BY n.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) t;

  RETURN jsonb_build_object(
    'ok', true,
    'total_count', v_total_count,
    'count', jsonb_array_length(v_results),
    'notifications', v_results
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_all_notifications(int, int, text) TO authenticated;
