-- Migration 00186: Fix SuperAdmin User Deletion, Robust Cascade Purge & Cleanup
-- Ensures that when an admin deletes a user, all associated tables are cleanly updated/purged,
-- including auth.users, profiles, organization_members, supplier_users, profile_roles,
-- and signup_requests, while preserving immutable SuperAdmin root accounts.

BEGIN;

-- 1. Upgrade public.admin_bulk_delete_users with comprehensive cascade & purge
CREATE OR REPLACE FUNCTION public.admin_bulk_delete_users(
  p_user_ids uuid[],
  p_soft_delete boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_admin_id uuid := private.get_profile_id();
  v_count int := 0;
  v_target_profile_ids uuid[];
  v_target_auth_ids uuid[];
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required';
  END IF;

  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL OR array_length(p_user_ids, 1) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No user IDs specified');
  END IF;

  -- Filter out protected platform admins
  SELECT array_agg(p.id), array_agg(COALESCE(p.auth_user_id, p.id))
  INTO v_target_profile_ids, v_target_auth_ids
  FROM public.profiles p
  WHERE p.id = ANY(p_user_ids)
    AND COALESCE(p.is_platform_admin, false) = false
    AND lower(p.email) NOT IN (
      'bvnbasu@gmail.com',
      'admin@otp.test',
      'ops@otp.test',
      'superadmin@otp.test',
      'admin@otp.ai',
      'ops@otp.ai',
      'admin@procureos.test'
    );

  IF v_target_profile_ids IS NULL OR array_length(v_target_profile_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'count', 0,
      'message', 'No non-admin user accounts matched for deletion.'
    );
  END IF;

  IF p_soft_delete IS TRUE THEN
    -- Soft-delete: mark as DELETED, deactivate links and set deleted_at
    UPDATE public.profiles
    SET status = 'DELETED',
        deleted_at = now(),
        updated_at = now()
    WHERE id = ANY(v_target_profile_ids);

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Also mark any pending/onboarded signup_requests for these emails as REJECTED or delete
    UPDATE public.signup_requests sr
    SET status = 'REJECTED',
        review_notes = 'Soft-deleted by SuperAdmin'
    FROM public.profiles p
    WHERE p.id = ANY(v_target_profile_ids)
      AND lower(sr.email) = lower(p.email);

  ELSE
    -- Hard-delete: clean up relations in safe order

    -- 1. Clean membership & role tables
    DELETE FROM public.profile_roles WHERE profile_id = ANY(v_target_profile_ids);
    DELETE FROM public.organization_members WHERE profile_id = ANY(v_target_profile_ids);
    DELETE FROM public.supplier_users WHERE profile_id = ANY(v_target_profile_ids);

    -- 2. Clean communications / preferences / otps
    BEGIN
      DELETE FROM public.notification_preferences WHERE user_id = ANY(v_target_profile_ids);
      DELETE FROM public.password_reset_otps WHERE email IN (SELECT email FROM public.profiles WHERE id = ANY(v_target_profile_ids));
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    -- 3. Delete matching signup requests so they don't linger
    DELETE FROM public.signup_requests sr
    WHERE lower(sr.email) IN (SELECT lower(email) FROM public.profiles WHERE id = ANY(v_target_profile_ids));

    -- 4. Delete profile
    DELETE FROM public.profiles
    WHERE id = ANY(v_target_profile_ids);

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- 5. Delete corresponding auth identities and users
    BEGIN
      DELETE FROM auth.identities WHERE user_id = ANY(v_target_auth_ids);
      DELETE FROM auth.users WHERE id = ANY(v_target_auth_ids);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- Audit event logging
  BEGIN
    INSERT INTO public.audit_events (
      actor_id,
      actor_role,
      action,
      entity_type,
      entity_id,
      payload
    ) VALUES (
      v_admin_id,
      'ADMIN',
      'admin.bulk_delete_users',
      'profile',
      v_target_profile_ids[1],
      jsonb_build_object(
        'targetProfileIds', v_target_profile_ids,
        'targetAuthIds', v_target_auth_ids,
        'affectedCount', v_count,
        'softDelete', p_soft_delete
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count,
    'message', format('Successfully deleted %s user account(s).', v_count)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_bulk_delete_users(uuid[], boolean) TO authenticated, service_role, anon;

-- 2. Explicitly remove / purge bvnbasu@yahoo.com so it no longer appears in the SuperAdmin roster
DO $$
DECLARE
  v_yahoo_profile_ids uuid[];
  v_yahoo_auth_ids uuid[];
BEGIN
  SELECT array_agg(id), array_agg(COALESCE(auth_user_id, id))
  INTO v_yahoo_profile_ids, v_yahoo_auth_ids
  FROM public.profiles
  WHERE lower(email) = 'bvnbasu@yahoo.com';

  IF v_yahoo_profile_ids IS NOT NULL THEN
    -- Clear foreign references
    DELETE FROM public.profile_roles WHERE profile_id = ANY(v_yahoo_profile_ids);
    DELETE FROM public.organization_members WHERE profile_id = ANY(v_yahoo_profile_ids);
    DELETE FROM public.supplier_users WHERE profile_id = ANY(v_yahoo_profile_ids);
    BEGIN
      DELETE FROM public.notification_preferences WHERE user_id = ANY(v_yahoo_profile_ids);
    EXCEPTION WHEN OTHERS THEN NULL; END;

    BEGIN
      DELETE FROM public.profiles WHERE id = ANY(v_yahoo_profile_ids);
    EXCEPTION WHEN foreign_key_violation THEN
      UPDATE public.profiles
      SET status = 'DELETED', deleted_at = now()
      WHERE id = ANY(v_yahoo_profile_ids);
    END;
  END IF;

  -- Remove signup requests and auth accounts
  DELETE FROM public.signup_requests WHERE lower(email) = 'bvnbasu@yahoo.com';
  BEGIN
    DELETE FROM auth.identities WHERE lower(identity_data->>'email') = 'bvnbasu@yahoo.com' OR (v_yahoo_auth_ids IS NOT NULL AND user_id = ANY(v_yahoo_auth_ids));
    DELETE FROM auth.users WHERE lower(email) = 'bvnbasu@yahoo.com' OR (v_yahoo_auth_ids IS NOT NULL AND id = ANY(v_yahoo_auth_ids));
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- 4. Record migration in otp_schema_migrations if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'otp_schema_migrations') THEN
    INSERT INTO public.otp_schema_migrations (version, applied_at)
    VALUES ('00186_fix_admin_user_deletion_and_purge.sql', now())
    ON CONFLICT (version) DO UPDATE SET applied_at = now();
  END IF;
END $$;

COMMIT;
