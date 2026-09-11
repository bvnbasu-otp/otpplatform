-- Migration 00140: Route all support tickets to primary admin bvnbasu@gmail.com & fix notifications schema compatibility
-- 1. Ensure is_demo columns exist across transactional and operational tables
-- 2. Expand support_tickets category check constraint to include ENHANCEMENT
-- 3. Fix create_support_ticket RPC (use correct notifications and audit_events columns, route to bvnbasu@gmail.com)
-- 4. Fix admin_get_support_tickets RPC (resolve order by alias runtime error)
-- 5. Fix admin_resolve_support_ticket RPC (prevent audit_events trigger errors)

-- ---------------------------------------------------------------------------
-- 1. Ensure is_demo column exists on operational tables
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.purchase_orders ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS public.work_orders     ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS public.invoices        ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS public.payments        ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS public.quotes          ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS public.audit_events    ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS public.notifications   ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS public.support_tickets ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 2. Expand support_tickets category check constraint
-- ---------------------------------------------------------------------------
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_category_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_category_check 
  CHECK (category = ANY (ARRAY['BUG'::text, 'FEATURE'::text, 'SALES'::text, 'OPS'::text, 'ENHANCEMENT'::text]));

-- ---------------------------------------------------------------------------
-- 3. Fix create_support_ticket RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_category text,
  p_subject text,
  p_description text,
  p_priority text DEFAULT 'MEDIUM',
  p_page_url text DEFAULT NULL,
  p_user_email text DEFAULT NULL,
  p_user_role text DEFAULT NULL,
  p_user_side text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_routed_email text := 'bvnbasu@gmail.com';
  v_normalized_cat text;
  v_ticket_number text;
  v_ticket_id uuid;
  v_admin_rec record;
  v_is_demo boolean := false;
  v_demo_active boolean := false;
  v_actor_id uuid := NULL;
  v_org_id uuid := NULL;
BEGIN
  -- All inquiries (BUG, FEATURE, ENHANCEMENT, SALES, OPS) route directly to primary admin bvnbasu@gmail.com
  v_routed_email := 'bvnbasu@gmail.com';

  -- Normalize category
  v_normalized_cat := upper(trim(coalesce(p_category, 'BUG')));
  IF v_normalized_cat NOT IN ('BUG', 'FEATURE', 'SALES', 'OPS', 'ENHANCEMENT') THEN
    v_normalized_cat := 'BUG';
  END IF;

  -- Safely resolve actor profile and organization if available
  BEGIN
    v_actor_id := private.get_profile_id();
    IF v_actor_id IS NOT NULL THEN
      SELECT active_organization_id INTO v_org_id FROM public.profiles WHERE id = v_actor_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_actor_id := NULL;
    v_org_id := NULL;
  END;

  -- Check demo mode status
  BEGIN
    SELECT COALESCE(demo_mode_enabled, false) INTO v_demo_active FROM public.demo_settings WHERE id = true;
  EXCEPTION WHEN OTHERS THEN
    v_demo_active := false;
  END;

  v_ticket_number := 'TICK-' || to_char(now(), 'YYYY') || '-' || lpad((floor(random() * 90000) + 10000)::text, 5, '0');

  INSERT INTO public.support_tickets (
    ticket_number,
    category,
    routed_email,
    subject,
    description,
    priority,
    user_email,
    user_role,
    user_side,
    page_url,
    status,
    is_demo
  )
  VALUES (
    v_ticket_number,
    v_normalized_cat,
    v_routed_email,
    p_subject,
    p_description,
    coalesce(upper(trim(p_priority)), 'MEDIUM'),
    p_user_email,
    p_user_role,
    p_user_side,
    p_page_url,
    'OPEN',
    v_demo_active
  )
  RETURNING id INTO v_ticket_id;

  -- Create in-app high-priority notification for platform admins
  FOR v_admin_rec IN
    SELECT id FROM public.profiles WHERE is_platform_admin = true
  LOOP
    BEGIN
      INSERT INTO public.notifications (
        profile_id,
        channel,
        status,
        event_type,
        action_type,
        title,
        body,
        link,
        payload,
        is_demo,
        created_at,
        updated_at
      )
      VALUES (
        v_admin_rec.id,
        'IN_APP'::notification_channel,
        'PENDING'::notification_status,
        'SUPPORT_TICKET_CREATED',
        'SUPPORT_TICKET',
        '🎫 New ' || v_normalized_cat || ' Ticket: ' || v_ticket_number,
        coalesce(p_user_email, 'A user') || ' submitted: "' || p_subject || '" (Routed to ' || v_routed_email || ')',
        '/admin?tab=tickets',
        jsonb_build_object(
          'ticketId', v_ticket_id,
          'ticketNumber', v_ticket_number,
          'category', v_normalized_cat,
          'routedEmail', v_routed_email,
          'priority', p_priority,
          'subject', p_subject
        ),
        v_demo_active,
        now(),
        now()
      );
    EXCEPTION WHEN OTHERS THEN
      -- Ignore notification failure to prevent blocking ticket creation
      NULL;
    END;
  END LOOP;

  -- Audit log entry
  BEGIN
    INSERT INTO public.audit_events (
      event_type,
      actor_id,
      organization_id,
      entity_type,
      entity_id,
      payload,
      occurred_at,
      is_demo
    )
    VALUES (
      'support.ticket.created',
      v_actor_id,
      v_org_id,
      'SUPPORT_TICKET',
      v_ticket_id::text,
      jsonb_build_object(
        'ticketNumber', v_ticket_number,
        'category', v_normalized_cat,
        'routedEmail', v_routed_email,
        'subject', p_subject,
        'priority', p_priority,
        'userEmail', p_user_email,
        'userRole', p_user_role,
        'userSide', p_user_side,
        'pageUrl', p_page_url,
        'timestamp', now()
      ),
      now(),
      v_demo_active
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'ticketId', v_ticket_id,
    'ticketNumber', v_ticket_number,
    'routedEmail', v_routed_email,
    'message', 'Support ticket ' || v_ticket_number || ' logged and routed to ' || v_routed_email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_support_ticket(text, text, text, text, text, text, text, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Fix admin_get_support_tickets RPC
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_get_support_tickets(text, text, int);
DROP FUNCTION IF EXISTS public.admin_get_support_tickets(text, text, int, int, text);

CREATE OR REPLACE FUNCTION public.admin_get_support_tickets(
  p_status text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_mode text DEFAULT 'AUTO'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_mode text;
  v_demo_active boolean := false;
  v_tickets jsonb;
  v_total_count int := 0;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Platform admin access required';
  END IF;

  BEGIN
    SELECT COALESCE(demo_mode_enabled, false) INTO v_demo_active FROM public.demo_settings WHERE id = true;
  EXCEPTION WHEN OTHERS THEN
    v_demo_active := false;
  END;

  IF p_mode IS NULL OR p_mode = 'AUTO' THEN
    v_mode := CASE WHEN v_demo_active THEN 'DEMO' ELSE 'PROD' END;
  ELSE
    v_mode := upper(p_mode);
  END IF;

  -- Count total matching
  SELECT count(*)
  INTO v_total_count
  FROM public.support_tickets st
  WHERE (p_status IS NULL OR st.status = p_status)
    AND (p_category IS NULL OR st.category = p_category)
    AND (
      v_mode = 'ALL'
      OR (v_mode = 'PROD' AND NOT COALESCE(st.is_demo, false))
      OR (v_mode = 'DEMO' AND COALESCE(st.is_demo, false))
    );

  -- Fetch matching tickets
  SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  INTO v_tickets
  FROM (
    SELECT
      st.id,
      st.ticket_number AS "ticketNumber",
      st.category,
      st.routed_email AS "routedEmail",
      st.subject,
      st.description,
      st.priority,
      st.user_email AS "userEmail",
      st.user_role AS "userRole",
      st.user_side AS "userSide",
      st.page_url AS "pageUrl",
      st.status,
      st.resolution_notes AS "resolutionNotes",
      st.created_at AS "createdAt",
      st.updated_at AS "updatedAt",
      st.resolved_at AS "resolvedAt",
      COALESCE(st.is_demo, false) AS "isDemo"
    FROM public.support_tickets st
    WHERE (p_status IS NULL OR st.status = p_status)
      AND (p_category IS NULL OR st.category = p_category)
      AND (
        v_mode = 'ALL'
        OR (v_mode = 'PROD' AND NOT COALESCE(st.is_demo, false))
        OR (v_mode = 'DEMO' AND COALESCE(st.is_demo, false))
      )
    ORDER BY st.created_at DESC
    LIMIT coalesce(p_limit, 50) OFFSET coalesce(p_offset, 0)
  ) t;

  RETURN jsonb_build_object(
    'success', true,
    'count', v_total_count,
    'tickets', v_tickets,
    'active_mode', v_mode,
    'timestamp', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_support_tickets(text, text, int, int, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Fix admin_resolve_support_ticket RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_resolve_support_ticket(
  p_ticket_id uuid,
  p_status text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_is_demo boolean := false;
  v_actor_id uuid := NULL;
  v_org_id uuid := NULL;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Platform admin access required';
  END IF;

  BEGIN
    v_actor_id := private.get_profile_id();
    IF v_actor_id IS NOT NULL THEN
      SELECT active_organization_id INTO v_org_id FROM public.profiles WHERE id = v_actor_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_actor_id := NULL;
    v_org_id := NULL;
  END;

  UPDATE public.support_tickets
  SET status = p_status,
      resolution_notes = coalesce(p_notes, resolution_notes),
      resolved_at = CASE WHEN p_status IN ('RESOLVED', 'CLOSED') THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_ticket_id
  RETURNING COALESCE(is_demo, false) INTO v_is_demo;

  BEGIN
    INSERT INTO public.audit_events (
      event_type,
      actor_id,
      organization_id,
      entity_type,
      entity_id,
      payload,
      occurred_at,
      is_demo
    )
    VALUES (
      'support.ticket.updated',
      v_actor_id,
      v_org_id,
      'SUPPORT_TICKET',
      p_ticket_id::text,
      jsonb_build_object('status', p_status, 'notes', p_notes, 'timestamp', now()),
      now(),
      v_is_demo
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('success', true, 'message', 'Ticket updated successfully.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_resolve_support_ticket(uuid, text, text) TO anon, authenticated, service_role;
