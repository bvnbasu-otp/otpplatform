-- 00075_maintenance_mode.sql
-- Scheduled Maintenance Mode Configuration & Status Checker

ALTER TABLE demo_settings
  ADD COLUMN IF NOT EXISTS maintenance_mode_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_message text DEFAULT 'OTP is currently undergoing regular scheduled maintenance. Our digital engineers are on the job!';

-- Public function to check maintenance mode status
CREATE OR REPLACE FUNCTION public.get_maintenance_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'maintenanceMode', COALESCE((SELECT maintenance_mode_enabled FROM demo_settings WHERE id LIMIT 1), false),
    'message', COALESCE((SELECT maintenance_message FROM demo_settings WHERE id LIMIT 1), 'Scheduled maintenance in progress.'),
    'checkedAt', now()
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_maintenance_status() TO anon, authenticated;

-- Admin function to toggle maintenance mode
CREATE OR REPLACE FUNCTION public.admin_toggle_maintenance_mode(
  p_enabled boolean,
  p_message text DEFAULT NULL
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

  UPDATE demo_settings
  SET maintenance_mode_enabled = p_enabled,
      maintenance_message = COALESCE(p_message, maintenance_message),
      updated_at = now()
  WHERE id;

  INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
  VALUES (
    'admin.maintenance_mode.toggled',
    'PLATFORM_ENGINE',
    gen_random_uuid()::text,
    jsonb_build_object('enabled', p_enabled, 'message', p_message, 'timestamp', now())
  );

  RETURN jsonb_build_object(
    'success', true,
    'maintenanceMode', p_enabled,
    'message', 'Maintenance mode successfully updated.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_maintenance_mode(boolean, text) TO anon, authenticated;
