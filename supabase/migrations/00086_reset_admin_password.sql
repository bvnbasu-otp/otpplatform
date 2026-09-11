-- 00086_reset_admin_password.sql
-- Reset admin user password to "@dm!n123"

DO $$
DECLARE
  v_encrypted_password text := extensions.crypt('@dm!n123', extensions.gen_salt('bf'));
  v_auth_user_id uuid;
BEGIN
  -- 1. Update any existing admin user password
  UPDATE auth.users
  SET encrypted_password = v_encrypted_password,
      updated_at = now()
  WHERE email IN ('admin@otp.test', 'admin@otp.ai', 'ops@otp.test', 'superadmin@otp.test', 'admin@otp.demo');

  SELECT id INTO v_auth_user_id FROM auth.users WHERE email = 'admin@otp.test';

  IF v_auth_user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET is_platform_admin = true,
        full_name = 'OTP Platform Super Admin'
    WHERE auth_user_id = v_auth_user_id OR email = 'admin@otp.test';
  END IF;

  UPDATE public.profiles
  SET is_platform_admin = true
  WHERE email IN ('admin@otp.test', 'admin@otp.ai', 'ops@otp.test', 'superadmin@otp.test');

END $$;
