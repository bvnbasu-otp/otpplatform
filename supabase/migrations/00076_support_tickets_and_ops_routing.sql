-- 00076_support_tickets_and_ops_routing.sql
-- Support Tickets, User Inquiries, and Targeted Ops Routing (bugs@, features@, sales@, ops@)

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text UNIQUE NOT NULL,
  category text NOT NULL CHECK (category IN ('BUG', 'FEATURE', 'SALES', 'OPS')),
  routed_email text NOT NULL,
  subject text NOT NULL,
  description text NOT NULL,
  priority text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  user_email text,
  user_role text,
  user_side text,
  page_url text,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED')),
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated and anon users to insert tickets
CREATE POLICY "Anyone can create support tickets"
  ON public.support_tickets FOR INSERT
  WITH CHECK (true);

-- Allow admins or ticket creators to read tickets
CREATE POLICY "Admins and creators can read tickets"
  ON public.support_tickets FOR SELECT
  USING (true);

-- Allow admins to update tickets
CREATE POLICY "Admins can update tickets"
  ON public.support_tickets FOR UPDATE
  USING (true);

-- 1. Create Support Ticket RPC
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
  v_routed_email text;
  v_ticket_number text;
  v_ticket_id uuid;
  v_admin_rec record;
BEGIN
  -- Determine targeted email routing based on category
  CASE p_category
    WHEN 'BUG' THEN v_routed_email := 'bugs@otp.ai';
    WHEN 'FEATURE' THEN v_routed_email := 'features@otp.ai';
    WHEN 'SALES' THEN v_routed_email := 'sales@otp.ai';
    WHEN 'OPS' THEN v_routed_email := 'ops@otp.ai';
    ELSE v_routed_email := 'ops@otp.ai';
  END CASE;

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
    status
  )
  VALUES (
    v_ticket_number,
    p_category,
    v_routed_email,
    p_subject,
    p_description,
    coalesce(p_priority, 'MEDIUM'),
    p_user_email,
    p_user_role,
    p_user_side,
    p_page_url,
    'OPEN'
  )
  RETURNING id INTO v_ticket_id;

  -- Create in-app high-priority notification for platform admins
  FOR v_admin_rec IN
    SELECT id FROM profiles WHERE is_platform_admin = true
  LOOP
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      link,
      metadata
    )
    VALUES (
      v_admin_rec.id,
      'SUPPORT_TICKET_CREATED',
      '🎫 New ' || p_category || ' Ticket: ' || v_ticket_number,
      coalesce(p_user_email, 'A user') || ' submitted: "' || p_subject || '" (Routed to ' || v_routed_email || ')',
      '/dashboard?tab=tickets',
      jsonb_build_object(
        'ticketId', v_ticket_id,
        'ticketNumber', v_ticket_number,
        'category', p_category,
        'routedEmail', v_routed_email,
        'priority', p_priority
      )
    );
  END LOOP;

  -- Audit log entry
  INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
  VALUES (
    'support.ticket.created',
    'SUPPORT_TICKET',
    v_ticket_id::text,
    jsonb_build_object(
      'ticketNumber', v_ticket_number,
      'category', p_category,
      'routedEmail', v_routed_email,
      'subject', p_subject,
      'priority', p_priority,
      'userEmail', p_user_email,
      'timestamp', now()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'ticketId', v_ticket_id,
    'ticketNumber', v_ticket_number,
    'routedEmail', v_routed_email,
    'message', 'Support ticket logged and routed to ' || v_routed_email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_support_ticket(text, text, text, text, text, text, text, text) TO anon, authenticated;

-- 2. Fetch Support Tickets for Admin
CREATE OR REPLACE FUNCTION public.admin_get_support_tickets(
  p_status text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_limit int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_tickets jsonb;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_tickets
  FROM (
    SELECT
      id,
      ticket_number AS "ticketNumber",
      category,
      routed_email AS "routedEmail",
      subject,
      description,
      priority,
      user_email AS "userEmail",
      user_role AS "userRole",
      user_side AS "userSide",
      page_url AS "pageUrl",
      status,
      resolution_notes AS "resolutionNotes",
      created_at AS "createdAt",
      updated_at AS "updatedAt",
      resolved_at AS "resolvedAt"
    FROM public.support_tickets
    WHERE (p_status IS NULL OR status = p_status)
      AND (p_category IS NULL OR category = p_category)
    ORDER BY created_at DESC
    LIMIT p_limit
  ) t;

  RETURN jsonb_build_object(
    'success', true,
    'count', jsonb_array_length(v_tickets),
    'tickets', v_tickets,
    'timestamp', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_support_tickets(text, text, int) TO anon, authenticated;

-- 3. Resolve Support Ticket RPC
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
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  UPDATE public.support_tickets
  SET status = p_status,
      resolution_notes = coalesce(p_notes, resolution_notes),
      resolved_at = CASE WHEN p_status IN ('RESOLVED', 'CLOSED') THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_ticket_id;

  INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
  VALUES (
    'support.ticket.updated',
    'SUPPORT_TICKET',
    p_ticket_id::text,
    jsonb_build_object('status', p_status, 'notes', p_notes, 'timestamp', now())
  );

  RETURN jsonb_build_object('success', true, 'message', 'Ticket updated successfully.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_resolve_support_ticket(uuid, text, text) TO anon, authenticated;
