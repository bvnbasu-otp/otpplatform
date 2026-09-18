-- OTP Demo — shared base data (Durga Rainbow Community borewell scenario)
-- Fixed UUIDs: see scripts/demo/constants.ts and docs/OTP-DEMO.md
-- Requires migrations 00002–00005 applied.

BEGIN;

-- ── Cleanup demo UUIDs (idempotent re-seed) ───────────────────────────────
DELETE FROM audit_events WHERE organization_id = 'd1000000-0000-4000-8000-000000000001';
DELETE FROM notifications WHERE profile_id IN (
  'd1000001-0000-4000-8000-000000000001',
  'd1000002-0000-4000-8000-000000000001',
  'd1000003-0000-4000-8000-000000000001',
  'd1000004-0000-4000-8000-000000000001'
);
DELETE FROM procurement_performance_records WHERE organization_id = 'd1000000-0000-4000-8000-000000000001';
DELETE FROM payments WHERE id = 'd1000054-0000-4000-8000-000000000001';
DELETE FROM invoices WHERE id = 'd1000053-0000-4000-8000-000000000001';
DELETE FROM work_orders WHERE id = 'd1000052-0000-4000-8000-000000000001';
DELETE FROM purchase_orders WHERE id = 'd1000051-0000-4000-8000-000000000001';
DELETE FROM awards WHERE id = 'd1000050-0000-4000-8000-000000000001';
DELETE FROM committee_votes WHERE rfq_id = 'd1000021-0000-4000-8000-000000000001';
DELETE FROM conflict_of_interest_declarations WHERE rfq_id = 'd1000021-0000-4000-8000-000000000001';
DELETE FROM committee_assignments WHERE rfq_id = 'd1000021-0000-4000-8000-000000000001';
DELETE FROM approval_instances WHERE rfq_id = 'd1000021-0000-4000-8000-000000000001';
DELETE FROM quote_evaluations WHERE rfq_id = 'd1000021-0000-4000-8000-000000000001';
DELETE FROM quote_versions WHERE quote_id IN (
  'd1000040-0000-4000-8000-000000000001',
  'd1000041-0000-4000-8000-000000000001',
  'd1000042-0000-4000-8000-000000000001'
);
DELETE FROM quotes WHERE rfq_id = 'd1000021-0000-4000-8000-000000000001';
DELETE FROM rfq_invitations WHERE rfq_id = 'd1000021-0000-4000-8000-000000000001';
DELETE FROM rfqs WHERE id = 'd1000021-0000-4000-8000-000000000001';
DELETE FROM requirements WHERE id = 'd1000020-0000-4000-8000-000000000001';
DELETE FROM supplier_users WHERE supplier_id IN (
  'd1000010-0000-4000-8000-000000000001',
  'd1000011-0000-4000-8000-000000000001',
  'd1000012-0000-4000-8000-000000000001',
  'd1000013-0000-4000-8000-000000000001',
  'd1000014-0000-4000-8000-000000000001'
);
DELETE FROM suppliers WHERE id IN (
  'd1000010-0000-4000-8000-000000000001',
  'd1000011-0000-4000-8000-000000000001',
  'd1000012-0000-4000-8000-000000000001',
  'd1000013-0000-4000-8000-000000000001',
  'd1000014-0000-4000-8000-000000000001'
);
DELETE FROM organization_members WHERE organization_id = 'd1000000-0000-4000-8000-000000000001';
DELETE FROM approval_policies WHERE organization_id = 'd1000000-0000-4000-8000-000000000001';
DELETE FROM organizations WHERE id = 'd1000000-0000-4000-8000-000000000001';
DELETE FROM profiles WHERE id IN (
  'd1000001-0000-4000-8000-000000000001',
  'd1000002-0000-4000-8000-000000000001',
  'd1000003-0000-4000-8000-000000000001',
  'd1000004-0000-4000-8000-000000000001',
  'd1000005-0000-4000-8000-000000000001'
);

-- ── Organization ───────────────────────────────────────────────────────────
INSERT INTO organizations (id, name, org_type, address, created_at, updated_at)
VALUES (
  'd1000000-0000-4000-8000-000000000001',
  'Durga Rainbow Community',
  'COMMUNITY',
  '{"line1":"Plot 42, Durga Rainbow Layout","line2":"Near Kundalahalli Gate","city":"Bengaluru","state":"Karnataka","postalCode":"560037","country":"IN"}'::jsonb,
  now(), now()
);

-- ── Profiles (auth users from seed_demo_auth.sql) ────────────────────────────
INSERT INTO profiles (id, auth_user_id, email, full_name, is_platform_admin, created_at, updated_at) VALUES
  ('d1000001-0000-4000-8000-000000000001', 'e1000001-0000-4000-8000-000000000001', 'demo@durga-rainbow.manager', 'Priya Sharma', false, now(), now()),
  ('d1000002-0000-4000-8000-000000000001', 'e1000002-0000-4000-8000-000000000002', 'committee1@durga-rainbow.community', 'Ramesh Iyer', false, now(), now()),
  ('d1000003-0000-4000-8000-000000000001', 'e1000003-0000-4000-8000-000000000003', 'committee2@durga-rainbow.community', 'Anita Deshmukh', false, now(), now()),
  ('d1000004-0000-4000-8000-000000000001', 'e1000004-0000-4000-8000-000000000004', 'buyer@durga-rainbow.community', 'Vikram Patel', false, now(), now()),
  ('d1000005-0000-4000-8000-000000000001', 'e1000005-0000-4000-8000-000000000005', 'admin@otp.demo', 'OTP Platform Admin', true, now(), now());

INSERT INTO organization_members (id, organization_id, profile_id, role, joined_at) VALUES
  (gen_random_uuid(), 'd1000000-0000-4000-8000-000000000001', 'd1000001-0000-4000-8000-000000000001', 'MANAGER', now()),
  (gen_random_uuid(), 'd1000000-0000-4000-8000-000000000001', 'd1000002-0000-4000-8000-000000000001', 'COMMITTEE_MEMBER', now()),
  (gen_random_uuid(), 'd1000000-0000-4000-8000-000000000001', 'd1000003-0000-4000-8000-000000000001', 'COMMITTEE_MEMBER', now()),
  (gen_random_uuid(), 'd1000000-0000-4000-8000-000000000001', 'd1000004-0000-4000-8000-000000000001', 'BUYER', now());

INSERT INTO approval_policies (id, organization_id, policy_type, threshold, is_default, created_at)
VALUES (
  'd1000022-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'COMMUNITY_SIMPLE_MAJORITY',
  '{"minApprovals": 2}'::jsonb,
  true,
  now()
);

-- ── Suppliers (realistic Indian names; anonymous labels on RFQ only) ─────────
INSERT INTO suppliers (id, business_name, source, status, service_area, rating_avg, categories, address, contact_phone, contact_email, created_at, updated_at) VALUES
  ('d1000010-0000-4000-8000-000000000001', 'Shree Sai Electricals', 'LOCAL_REGISTRY', 'ACTIVE',
   '{"centerLat":12.9698,"centerLng":77.7500,"radiusKm":15,"pinCodes":["560037","560066"]}'::jsonb, 4.6,
   ARRAY['Borewell','Motor Winding','10 HP'],
   '{"line1":"12, Industrial Layout, Whitefield","city":"Bengaluru","state":"Karnataka","postalCode":"560066","country":"IN"}'::jsonb,
   '+91-98765-43210', 'contact@shreesai-electricals.in', now(), now()),
  ('d1000011-0000-4000-8000-000000000001', 'Krishna Pump Services', 'REFERRAL', 'ACTIVE',
   '{"centerLat":12.9580,"centerLng":77.7010,"radiusKm":20,"pinCodes":["560037","560103"]}'::jsonb, 4.8,
   ARRAY['Borewell','Motor Winding','10 HP','Pump Repair'],
   '{"line1":"45, Marathahalli Main Road","city":"Bengaluru","state":"Karnataka","postalCode":"560037","country":"IN"}'::jsonb,
   '+91-98765-43211', 'ops@krishnapump.in', now(), now()),
  ('d1000012-0000-4000-8000-000000000001', 'AquaTech Borewell Solutions', 'DIRECT', 'ACTIVE',
   '{"centerLat":12.9800,"centerLng":77.7350,"radiusKm":18,"pinCodes":["560037"]}'::jsonb, 4.4,
   ARRAY['Borewell','Motor Winding','10 HP'],
   '{"line1":"8, Brookefield","city":"Bengaluru","state":"Karnataka","postalCode":"560037","country":"IN"}'::jsonb,
   '+91-98765-43212', 'sales@aquatech-borewell.com', now(), now()),
  ('d1000013-0000-4000-8000-000000000001', 'Vinayaka Motor Rewinding', 'ASSOCIATION', 'ACTIVE',
   '{"centerLat":12.9500,"centerLng":77.7200,"radiusKm":12,"pinCodes":["560103"]}'::jsonb, 4.2,
   ARRAY['Motor Winding','10 HP'],
   '{"line1":"23, Hoodi Circle","city":"Bengaluru","state":"Karnataka","postalCode":"560048","country":"IN"}'::jsonb,
   '+91-98765-43213', 'info@vinayaka-motors.in', now(), now()),
  ('d1000014-0000-4000-8000-000000000001', 'Lakshmi Engineering Works', 'BNI', 'ACTIVE',
   '{"centerLat":12.9650,"centerLng":77.7100,"radiusKm":25,"pinCodes":["560037","560066"]}'::jsonb, 4.0,
   ARRAY['Borewell','Motor Winding'],
   '{"line1":"67, Kundalahalli","city":"Bengaluru","state":"Karnataka","postalCode":"560037","country":"IN"}'::jsonb,
   '+91-98765-43214', 'hello@lakshmi-engg.co.in', now(), now());

-- ── Requirement ──────────────────────────────────────────────────────────────
INSERT INTO requirements (
  id, organization_id, created_by, requirement_type, status, title, description,
  category_id, subcategory_id, requirement_mode,
  structured_specs, published_at, created_at, updated_at
) VALUES (
  'd1000020-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'd1000004-0000-4000-8000-000000000001',
  'SERVICE',
  'QUOTING',
  '10 HP Borewell Motor Winding',
  'Community borewell motor failed. Need rewinding for 10 HP submersible pump at Block C pump house.',
  (SELECT category_id FROM requirement_subcategories WHERE code = 'motor_rewinding'),
  (SELECT id FROM requirement_subcategories WHERE code = 'motor_rewinding'),
  'REPAIR_MAINTENANCE',
  '{
    "requirementType": "SERVICE",
    "title": "10 HP Borewell Motor Winding",
    "attributes": {"motorHp": 10, "serviceType": "motor_winding", "location": "Block C pump house"},
    "quantity": 1,
    "unit": "job",
    "deliveryLocation": {"line1":"Durga Rainbow Community, Block C","city":"Bengaluru","state":"Karnataka","postalCode":"560037","country":"IN"},
    "notes": "Urgent — water supply affected for 120 flats"
  }'::jsonb,
  now() - interval '2 days',
  now() - interval '3 days',
  now()
);

-- ── RFQ ─────────────────────────────────────────────────────────────────────
INSERT INTO rfqs (
  id, requirement_id, organization_id, status, reveal_status, title,
  quote_deadline, evaluation_deadline, buyer_anonymous_to_suppliers,
  min_quotes_required, created_by, created_at, updated_at
) VALUES (
  'd1000021-0000-4000-8000-000000000001',
  'd1000020-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'OPEN',
  'BLIND',
  'RFQ: 10 HP Borewell Motor Winding — Durga Rainbow',
  now() + interval '3 days',
  now() + interval '7 days',
  true,
  3,
  'd1000001-0000-4000-8000-000000000001',
  now() - interval '2 days',
  now()
);

-- ── Invitations (5 suppliers, labels A–E) ────────────────────────────────────
INSERT INTO rfq_invitations (id, rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons, invited_at, viewed_at) VALUES
  ('d1000030-0000-4000-8000-000000000001', 'd1000021-0000-4000-8000-000000000001', 'd1000010-0000-4000-8000-000000000001', 'Supplier A', 'QUOTED', 92.5, '{"10 HP capability","Borewell category","within 8km"}', now() - interval '2 days', now() - interval '2 days'),
  ('d1000031-0000-4000-8000-000000000001', 'd1000021-0000-4000-8000-000000000001', 'd1000011-0000-4000-8000-000000000001', 'Supplier B', 'QUOTED', 95.0, '{"10 HP capability","highest rating","referral"}', now() - interval '2 days', now() - interval '2 days'),
  ('d1000032-0000-4000-8000-000000000001', 'd1000021-0000-4000-8000-000000000001', 'd1000012-0000-4000-8000-000000000001', 'Supplier C', 'QUOTED', 88.0, '{"10 HP capability","fastest delivery history"}', now() - interval '2 days', now() - interval '1 day'),
  ('d1000033-0000-4000-8000-000000000001', 'd1000021-0000-4000-8000-000000000001', 'd1000013-0000-4000-8000-000000000001', 'Supplier D', 'VIEWED', 75.0, '{"Motor winding only","capacity uncertain"}', now() - interval '2 days', now() - interval '1 day'),
  ('d1000034-0000-4000-8000-000000000001', 'd1000021-0000-4000-8000-000000000001', 'd1000014-0000-4000-8000-000000000001', 'Supplier E', 'DECLINED', 70.0, '{"No 10 HP specialist on staff"}', now() - interval '2 days', now() - interval '1 day');

UPDATE rfq_invitations SET declined_at = now() - interval '1 day', decline_reason = 'No 10 HP specialist available this week'
WHERE id = 'd1000034-0000-4000-8000-000000000001';

-- ── Committee panel ──────────────────────────────────────────────────────────
INSERT INTO committee_assignments (id, rfq_id, profile_id, assigned_at) VALUES
  (gen_random_uuid(), 'd1000021-0000-4000-8000-000000000001', 'd1000002-0000-4000-8000-000000000001', now() - interval '2 days'),
  (gen_random_uuid(), 'd1000021-0000-4000-8000-000000000001', 'd1000003-0000-4000-8000-000000000001', now() - interval '2 days'),
  (gen_random_uuid(), 'd1000021-0000-4000-8000-000000000001', 'd1000004-0000-4000-8000-000000000001', now() - interval '2 days');

COMMIT;
