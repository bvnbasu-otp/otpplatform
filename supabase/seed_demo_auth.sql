-- Durga Rainbow demo auth users (see docs/OTP-DEMO.md)
-- Applied by pnpm demo:seed after shared data is loaded.

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('00000000-0000-0000-0000-000000000000', 'e1000001-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'demo@durga-rainbow.manager', crypt('DemoManager2026!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e1000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'committee1@durga-rainbow.community', crypt('DemoCommittee2026!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e1000003-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'committee2@durga-rainbow.community', crypt('DemoCommittee2026!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e1000004-0000-4000-8000-000000000004', 'authenticated', 'authenticated',
   'buyer@durga-rainbow.community', crypt('DemoBuyer2026!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e1000005-0000-4000-8000-000000000005', 'authenticated', 'authenticated',
   'admin@otp.demo', crypt('DemoAdmin2026!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at) VALUES
  (gen_random_uuid(), 'e1000001-0000-4000-8000-000000000001', '{"sub":"e1000001-0000-4000-8000-000000000001","email":"demo@durga-rainbow.manager"}'::jsonb, 'email', 'e1000001-0000-4000-8000-000000000001', now(), now(), now()),
  (gen_random_uuid(), 'e1000002-0000-4000-8000-000000000002', '{"sub":"e1000002-0000-4000-8000-000000000002","email":"committee1@durga-rainbow.community"}'::jsonb, 'email', 'e1000002-0000-4000-8000-000000000002', now(), now(), now()),
  (gen_random_uuid(), 'e1000003-0000-4000-8000-000000000003', '{"sub":"e1000003-0000-4000-8000-000000000003","email":"committee2@durga-rainbow.community"}'::jsonb, 'email', 'e1000003-0000-4000-8000-000000000003', now(), now(), now()),
  (gen_random_uuid(), 'e1000004-0000-4000-8000-000000000004', '{"sub":"e1000004-0000-4000-8000-000000000004","email":"buyer@durga-rainbow.community"}'::jsonb, 'email', 'e1000004-0000-4000-8000-000000000004', now(), now(), now()),
  (gen_random_uuid(), 'e1000005-0000-4000-8000-000000000005', '{"sub":"e1000005-0000-4000-8000-000000000005","email":"admin@otp.demo"}'::jsonb, 'email', 'e1000005-0000-4000-8000-000000000005', now(), now(), now())
ON CONFLICT DO NOTHING;
