DO $$
BEGIN
  UPDATE auth.users
  SET encrypted_password = crypt('@dm!n123', gen_salt('bf')),
      email_confirmed_at = now(),
      is_super_admin = true
  WHERE email IN ('admin@otp.test', 'admin@otp.demo', 'ops@otp.test');

  UPDATE public.profiles
  SET is_platform_admin = true
  WHERE email IN ('admin@otp.test', 'admin@otp.demo', 'ops@otp.test');
END $$;
