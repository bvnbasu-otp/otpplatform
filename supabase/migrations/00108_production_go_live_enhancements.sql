-- Migration 00108: Production Go-Live Enhancements
-- Adds admin controls to toggle Demo vs Production mode, manage transactional email activation, and system configuration.

CREATE OR REPLACE FUNCTION public.admin_toggle_demo_mode(
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: platform admin privileges required';
  END IF;

  v_admin_id := private.get_profile_id();

  UPDATE public.demo_settings
  SET demo_mode_enabled = p_enabled,
      updated_at = now()
  WHERE id = true;

  INSERT INTO public.audit_events (event_type, entity_type, entity_id, actor_id, payload)
  VALUES (
    'system.demo_mode_toggled',
    'demo_settings',
    'global',
    v_admin_id,
    jsonb_build_object('demo_mode_enabled', p_enabled)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'demo_mode_enabled', p_enabled,
    'message', CASE WHEN p_enabled THEN 'Staging & Demo Mode enabled' ELSE 'Live Production Mode active' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_demo_mode(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_system_mode()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_row demo_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.demo_settings WHERE id = true;
  
  RETURN jsonb_build_object(
    'ok', true,
    'demo_mode_enabled', COALESCE(v_row.demo_mode_enabled, false),
    'maintenance_mode_enabled', COALESCE(v_row.maintenance_mode_enabled, false),
    'maintenance_message', v_row.maintenance_message,
    'current_run_id', v_row.current_run_id,
    'last_reset_at', v_row.last_reset_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_system_mode() TO anon, authenticated;
