-- 00308: notification preferences are owned by profiles.id, not auth.uid().
--
-- 00182 compared auth.uid() with p_user_id and with notification_preferences.user_id.
-- Those columns reference profiles.id. A caller whose auth UUID differs from their
-- profile UUID was rejected, and row security hid the row after a privileged write.
--
-- Ordinary authenticated callers must match private.get_profile_id(). A missing
-- profile fails closed. service_role and platform-admin sessions keep the
-- privileged path. The RPC signature, upsert, and response shape are unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_notification_preferences_atomic(
  p_user_id             uuid,
  p_organization_id     uuid DEFAULT NULL,
  p_channel_preferences jsonb DEFAULT '{"WHATSAPP": true, "SMS": true, "EMAIL": true, "IN_APP": true}'::jsonb,
  p_category_opt_outs   text[] DEFAULT '{}',
  p_phone_number        text DEFAULT NULL,
  p_email               text DEFAULT NULL,
  p_quiet_hours_start   text DEFAULT NULL,
  p_quiet_hours_end     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_pref_id uuid;
  v_caller_profile_id uuid := private.get_profile_id();
BEGIN
  -- No JWT subject is not an ordinary user. service_role and platform-admin
  -- sessions remain the privileged callers. Everyone else fails closed.
  IF auth.uid() IS NULL THEN
    IF COALESCE(auth.role(), '') IS DISTINCT FROM 'service_role'
       AND NOT private.is_platform_admin() THEN
      RAISE EXCEPTION 'Access denied: Cannot modify notification preferences for other users (AUTH-01: FORBIDDEN)';
    END IF;
  ELSIF v_caller_profile_id IS DISTINCT FROM p_user_id
        AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: Cannot modify notification preferences for other users (AUTH-01: FORBIDDEN)';
  END IF;

  INSERT INTO public.notification_preferences (
    user_id,
    organization_id,
    channel_preferences,
    category_opt_outs,
    phone_number,
    email,
    quiet_hours_start,
    quiet_hours_end
  ) VALUES (
    p_user_id,
    p_organization_id,
    p_channel_preferences,
    p_category_opt_outs,
    p_phone_number,
    p_email,
    p_quiet_hours_start,
    p_quiet_hours_end
  )
  ON CONFLICT (user_id, organization_id) DO UPDATE
  SET channel_preferences = EXCLUDED.channel_preferences,
      category_opt_outs   = EXCLUDED.category_opt_outs,
      phone_number        = COALESCE(EXCLUDED.phone_number, notification_preferences.phone_number),
      email               = COALESCE(EXCLUDED.email, notification_preferences.email),
      quiet_hours_start   = EXCLUDED.quiet_hours_start,
      quiet_hours_end     = EXCLUDED.quiet_hours_end,
      updated_at          = now()
  RETURNING id INTO v_pref_id;

  RETURN jsonb_build_object(
    'success', true,
    'preference_id', v_pref_id,
    'user_id', p_user_id,
    'organization_id', p_organization_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_notification_preferences_atomic(
  uuid, uuid, jsonb, text[], text, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_notification_preferences_atomic(
  uuid, uuid, jsonb, text[], text, text, text, text
) TO authenticated, service_role;

DROP POLICY IF EXISTS notification_preferences_select ON public.notification_preferences;
CREATE POLICY notification_preferences_select ON public.notification_preferences
  FOR SELECT TO authenticated
  USING (
    user_id = private.get_profile_id()
    OR (organization_id IS NOT NULL AND organization_id IN (SELECT private.get_user_org_ids()))
    OR private.is_platform_admin()
  );

DROP POLICY IF EXISTS notification_preferences_mutate ON public.notification_preferences;
CREATE POLICY notification_preferences_mutate ON public.notification_preferences
  FOR ALL TO authenticated
  USING (
    user_id = private.get_profile_id()
    OR private.is_platform_admin()
  )
  WITH CHECK (
    user_id = private.get_profile_id()
    OR private.is_platform_admin()
  );

COMMIT;
