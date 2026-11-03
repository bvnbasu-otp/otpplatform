-- OTP horizontal pilots 2–4 (MSME, Textile, Local business)
-- Pilot 1 (Community borewell) is in seed.sql (Greenview).
-- Reuses Greenview profiles (b0000000-*) for buyer/committee/manager access.

-- =============================================================================
-- PILOT 2 — MSME · Coimbatore · CNC spindle maintenance
-- =============================================================================

INSERT INTO organizations (id, name, org_type) VALUES
  (
    'd2000000-0000-4000-8000-000000000001',
    'Precision Tools Coimbatore',
    'MSME'
  );

INSERT INTO organization_members (id, organization_id, profile_id, role) VALUES
  ('e2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'MANAGER'),
  ('e2000000-0000-4000-8000-000000000002', 'd2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'COMMITTEE_MEMBER'),
  ('e2000000-0000-4000-8000-000000000003', 'd2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003', 'COMMITTEE_MEMBER'),
  ('e2000000-0000-4000-8000-000000000004', 'd2000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'BUYER');

INSERT INTO approval_policies (id, organization_id, policy_type, threshold, is_default) VALUES
  (
    'd2000022-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001',
    'COMMUNITY_SIMPLE_MAJORITY',
    '{"type": "simple_majority", "minVotes": 2}'::jsonb,
    true
  );

INSERT INTO suppliers (id, business_name, source, status, categories, capabilities, rating_avg, service_area, contact_phone, contact_email, address) VALUES
  ('d2000010-0000-4000-8000-000000000001', 'Lakshmi Machine Tools AMC', 'LOCAL_REGISTRY', 'ACTIVE', ARRAY['CNC','Spindle Repair','Machine Maintenance'], '{"services":["spindle_repair","calibration"]}'::jsonb, 4.6, '{"centerLat":11.0168,"centerLng":76.9558,"radiusKm":20}'::jsonb, '+914222000001', 'amc@lakshmi-mtools.in', '{"line1":"Peelamedu","city":"Coimbatore","state":"Tamil Nadu","postalCode":"641004","country":"IN"}'::jsonb),
  ('d2000011-0000-4000-8000-000000000002', 'SK Engineering Services', 'ASSOCIATION', 'ACTIVE', ARRAY['CNC','Spindle Repair'], '{"services":["spindle_repair"]}'::jsonb, 4.4, '{"centerLat":11.0286,"centerLng":76.9662,"radiusKm":15}'::jsonb, '+914222000002', 'service@sk-engg.in', '{"line1":"Ganapathy","city":"Coimbatore","state":"Tamil Nadu","postalCode":"641006","country":"IN"}'::jsonb),
  ('d2000012-0000-4000-8000-000000000003', 'Guru Precision Spindle Care', 'DIRECT', 'ACTIVE', ARRAY['Spindle Repair','Calibration'], '{"services":["spindle_repair","vibration_analysis"]}'::jsonb, 4.8, '{"centerLat":11.0050,"centerLng":76.9450,"radiusKm":25}'::jsonb, '+914222000003', 'care@guruspindle.in', '{"line1":"Singanallur","city":"Coimbatore","state":"Tamil Nadu","postalCode":"641005","country":"IN"}'::jsonb),
  ('d2000013-0000-4000-8000-000000000004', 'Coimbatore CNC Solutions', 'BNI', 'ACTIVE', ARRAY['CNC','Machine Maintenance'], '{"services":["maintenance"]}'::jsonb, 4.1, '{"centerLat":11.0200,"centerLng":76.9600,"radiusKm":18}'::jsonb, '+914222000004', 'ops@cnc-cbe.in', '{"line1":"Ramanathapuram","city":"Coimbatore","state":"Tamil Nadu","postalCode":"641045","country":"IN"}'::jsonb),
  ('d2000014-0000-4000-8000-000000000005', 'Velan Machine Rebuilders', 'REFERRAL', 'ACTIVE', ARRAY['Spindle Repair'], '{"services":["spindle_repair"]}'::jsonb, 4.0, '{"centerLat":11.0100,"centerLng":76.9500,"radiusKm":12}'::jsonb, '+914222000005', 'info@velan-rebuild.in', '{"line1":"Sitra","city":"Coimbatore","state":"Tamil Nadu","postalCode":"641014","country":"IN"}'::jsonb);

INSERT INTO requirements (id, organization_id, created_by, requirement_type, status, title, description, structured_specs, published_at) VALUES (
  'd2000020-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000004',
  'SERVICE',
  'EVALUATION',
  'CNC Lathe Spindle Repair & Calibration',
  '5 HP CNC lathe spindle showing vibration. Need repair, balancing, and calibration.',
  '{"requirementType":"SERVICE","title":"CNC Lathe Spindle Repair","attributes":{"hp":5,"machineType":"CNC lathe","issue":"vibration"},"quantity":1,"unit":"job","deliveryLocation":{"line1":"Precision Tools Coimbatore","city":"Coimbatore","state":"Tamil Nadu","postalCode":"641021","country":"IN"},"notes":"Production line down — 3-day turnaround required"}'::jsonb,
  now() - interval '2 days'
);

INSERT INTO rfqs (id, requirement_id, organization_id, status, reveal_status, title, quote_deadline, evaluation_deadline, buyer_anonymous_to_suppliers, min_quotes_required, created_by) VALUES (
  'd2000021-0000-4000-8000-000000000001',
  'd2000020-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  'EVALUATING',
  'BLIND',
  'RFQ: CNC Lathe Spindle Repair — Coimbatore',
  now() + interval '5 days',
  now() + interval '10 days',
  true,
  3,
  'b0000000-0000-4000-8000-000000000001'
);

INSERT INTO rfq_invitations (id, rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons, invited_at) VALUES
  ('d2000030-0000-4000-8000-000000000001', 'd2000021-0000-4000-8000-000000000001', 'd2000010-0000-4000-8000-000000000001', 'Supplier A', 'QUOTED', 91.0, ARRAY['spindle specialist','AMC provider'], now() - interval '2 days'),
  ('d2000031-0000-4000-8000-000000000002', 'd2000021-0000-4000-8000-000000000001', 'd2000011-0000-4000-8000-000000000002', 'Supplier B', 'QUOTED', 88.5, ARRAY['CNC repair','local'], now() - interval '2 days'),
  ('d2000032-0000-4000-8000-000000000003', 'd2000021-0000-4000-8000-000000000001', 'd2000012-0000-4000-8000-000000000003', 'Supplier C', 'QUOTED', 94.0, ARRAY['vibration analysis','highest rating'], now() - interval '2 days'),
  ('d2000033-0000-4000-8000-000000000004', 'd2000021-0000-4000-8000-000000000001', 'd2000013-0000-4000-8000-000000000004', 'Supplier D', 'VIEWED', 76.0, ARRAY['general CNC'], now() - interval '2 days'),
  ('d2000034-0000-4000-8000-000000000005', 'd2000021-0000-4000-8000-000000000001', 'd2000014-0000-4000-8000-000000000005', 'Supplier E', 'DECLINED', 72.0, ARRAY['capacity full'], now() - interval '2 days');

INSERT INTO committee_assignments (id, rfq_id, profile_id) VALUES
  ('ca200000-0000-4000-8000-000000000001', 'd2000021-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002'),
  ('ca200000-0000-4000-8000-000000000002', 'd2000021-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003');

INSERT INTO quotes (id, rfq_id, supplier_id, invitation_id, status, current_version, evaluation_score, submitted_at) VALUES
  ('d2000040-0000-4000-8000-000000000001', 'd2000021-0000-4000-8000-000000000001', 'd2000010-0000-4000-8000-000000000001', 'd2000030-0000-4000-8000-000000000001', 'FINAL', 1, 86.0, now() - interval '1 day'),
  ('d2000041-0000-4000-8000-000000000002', 'd2000021-0000-4000-8000-000000000001', 'd2000011-0000-4000-8000-000000000002', 'd2000031-0000-4000-8000-000000000002', 'FINAL', 1, 92.5, now() - interval '1 day'),
  ('d2000042-0000-4000-8000-000000000003', 'd2000021-0000-4000-8000-000000000001', 'd2000012-0000-4000-8000-000000000003', 'd2000032-0000-4000-8000-000000000003', 'FINAL', 1, 84.0, now() - interval '1 day');

INSERT INTO quote_versions (id, quote_id, version, snapshot, created_by) VALUES
  ('d2000060-0000-4000-8000-000000000001', 'd2000040-0000-4000-8000-000000000001', 1, '{"basePrice":18500,"gstAmount":3330,"transportCost":500,"totalCost":22330,"deliveryDays":3,"warrantyMonths":6,"currency":"INR"}'::jsonb, 'b0000000-0000-4000-8000-000000000001'),
  ('d2000061-0000-4000-8000-000000000002', 'd2000041-0000-4000-8000-000000000002', 1, '{"basePrice":16200,"gstAmount":2916,"transportCost":0,"totalCost":19116,"deliveryDays":3,"warrantyMonths":3,"currency":"INR"}'::jsonb, 'b0000000-0000-4000-8000-000000000001'),
  ('d2000062-0000-4000-8000-000000000003', 'd2000042-0000-4000-8000-000000000003', 1, '{"basePrice":19800,"gstAmount":3564,"transportCost":0,"totalCost":23364,"deliveryDays":2,"warrantyMonths":12,"currency":"INR"}'::jsonb, 'b0000000-0000-4000-8000-000000000001');

INSERT INTO quote_evaluations (id, quote_id, rfq_id, version_evaluated, evaluation_score, breakdown, status, computed_at) VALUES
  (gen_random_uuid(), 'd2000040-0000-4000-8000-000000000001', 'd2000021-0000-4000-8000-000000000001', 1, 86.0, '{"price":30,"delivery":28,"warranty":28}'::jsonb, 'COMPUTED', now() - interval '6 hours'),
  (gen_random_uuid(), 'd2000041-0000-4000-8000-000000000002', 'd2000021-0000-4000-8000-000000000001', 1, 92.5, '{"price":38,"delivery":28,"warranty":26.5}'::jsonb, 'COMPUTED', now() - interval '6 hours'),
  (gen_random_uuid(), 'd2000042-0000-4000-8000-000000000003', 'd2000021-0000-4000-8000-000000000001', 1, 84.0, '{"price":26,"delivery":32,"warranty":26}'::jsonb, 'COMPUTED', now() - interval '6 hours');

-- =============================================================================
-- PILOT 3 — Textile · Tiruppur · Yarn procurement
-- =============================================================================

INSERT INTO organizations (id, name, org_type) VALUES
  (
    'd3000000-0000-4000-8000-000000000001',
    'Sri Krishna Spinners',
    'MSME'
  );

INSERT INTO organization_members (id, organization_id, profile_id, role) VALUES
  ('e3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'MANAGER'),
  ('e3000000-0000-4000-8000-000000000002', 'd3000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'COMMITTEE_MEMBER'),
  ('e3000000-0000-4000-8000-000000000003', 'd3000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003', 'COMMITTEE_MEMBER'),
  ('e3000000-0000-4000-8000-000000000004', 'd3000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'BUYER');

INSERT INTO approval_policies (id, organization_id, policy_type, threshold, is_default) VALUES
  (
    'd3000022-0000-4000-8000-000000000001',
    'd3000000-0000-4000-8000-000000000001',
    'COMMUNITY_SIMPLE_MAJORITY',
    '{"type": "simple_majority", "minVotes": 2}'::jsonb,
    true
  );

INSERT INTO suppliers (id, business_name, source, status, categories, capabilities, rating_avg, service_area, contact_phone, contact_email, address) VALUES
  ('d3000010-0000-4000-8000-000000000001', 'Tiruppur Yarn Traders', 'ONDC', 'ACTIVE', ARRAY['Yarn','Cotton','40s'], '{"grades":["40s combed"]}'::jsonb, 4.5, '{"centerLat":11.1085,"centerLng":77.3411,"radiusKm":30}'::jsonb, '+914212000001', 'sales@tpy-yarn.in', '{"line1":"Kumar Nagar","city":"Tiruppur","state":"Tamil Nadu","postalCode":"641602","country":"IN"}'::jsonb),
  ('d3000011-0000-4000-8000-000000000002', 'Kongu Cotton Suppliers', 'ASSOCIATION', 'ACTIVE', ARRAY['Yarn','Cotton'], '{"grades":["40s","60s"]}'::jsonb, 4.7, '{"centerLat":11.1200,"centerLng":77.3500,"radiusKm":40}'::jsonb, '+914212000002', 'orders@kongu-cotton.in', '{"line1":"Avinashi Road","city":"Tiruppur","state":"Tamil Nadu","postalCode":"641603","country":"IN"}'::jsonb),
  ('d3000012-0000-4000-8000-000000000003', 'South India Spinning Mills', 'DIRECT', 'ACTIVE', ARRAY['Yarn','Textile Raw Material'], '{"grades":["40s combed"]}'::jsonb, 4.3, '{"centerLat":11.1000,"centerLng":77.3300,"radiusKm":50}'::jsonb, '+914212000003', 'mill@southspin.in', '{"line1":"SIDCO","city":"Tiruppur","state":"Tamil Nadu","postalCode":"641604","country":"IN"}'::jsonb),
  ('d3000013-0000-4000-8000-000000000004', 'Erode Cotton Exchange', 'BNI', 'ACTIVE', ARRAY['Cotton','Yarn'], '{"grades":["40s"]}'::jsonb, 4.2, '{"centerLat":11.3410,"centerLng":77.7172,"radiusKm":60}'::jsonb, '+914242000004', 'trade@erode-cotton.in', '{"line1":"Gandhi Road","city":"Erode","state":"Tamil Nadu","postalCode":"638001","country":"IN"}'::jsonb),
  ('d3000014-0000-4000-8000-000000000005', 'Bhavani Yarn Depot', 'LOCAL_REGISTRY', 'ACTIVE', ARRAY['Yarn'], '{"grades":["40s","30s"]}'::jsonb, 4.0, '{"centerLat":11.4500,"centerLng":77.6800,"radiusKm":35}'::jsonb, '+914242000005', 'depot@bhavani-yarn.in', '{"line1":"Bhavani","city":"Erode","state":"Tamil Nadu","postalCode":"638301","country":"IN"}'::jsonb);

INSERT INTO requirements (id, organization_id, created_by, requirement_type, status, title, description, structured_specs, published_at) VALUES (
  'd3000020-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000004',
  'PRODUCT',
  'EVALUATION',
  '40s Combed Cotton Yarn — 500 kg',
  'Ring-spun 40s combed cotton yarn for knitting unit. Mill quality certificate required.',
  '{"requirementType":"PRODUCT","title":"40s Combed Cotton Yarn","attributes":{"count":"40s","type":"combed cotton","ringSpun":true},"quantity":500,"unit":"kg","deliveryLocation":{"line1":"Sri Krishna Spinners","city":"Tiruppur","state":"Tamil Nadu","postalCode":"641602","country":"IN"},"notes":"5-day delivery to Tiruppur mill gate"}'::jsonb,
  now() - interval '2 days'
);

INSERT INTO rfqs (id, requirement_id, organization_id, status, reveal_status, title, quote_deadline, evaluation_deadline, buyer_anonymous_to_suppliers, min_quotes_required, created_by) VALUES (
  'd3000021-0000-4000-8000-000000000001',
  'd3000020-0000-4000-8000-000000000001',
  'd3000000-0000-4000-8000-000000000001',
  'EVALUATING',
  'BLIND',
  'RFQ: 40s Combed Cotton Yarn 500 kg — Tiruppur',
  now() + interval '5 days',
  now() + interval '10 days',
  true,
  3,
  'b0000000-0000-4000-8000-000000000001'
);

INSERT INTO rfq_invitations (id, rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons, invited_at) VALUES
  ('d3000030-0000-4000-8000-000000000001', 'd3000021-0000-4000-8000-000000000001', 'd3000010-0000-4000-8000-000000000001', 'Supplier A', 'QUOTED', 90.0, ARRAY['40s stock','local delivery'], now() - interval '2 days'),
  ('d3000031-0000-4000-8000-000000000002', 'd3000021-0000-4000-8000-000000000001', 'd3000011-0000-4000-8000-000000000002', 'Supplier B', 'QUOTED', 93.0, ARRAY['documents verified','best rating'], now() - interval '2 days'),
  ('d3000032-0000-4000-8000-000000000003', 'd3000021-0000-4000-8000-000000000001', 'd3000012-0000-4000-8000-000000000003', 'Supplier C', 'QUOTED', 87.0, ARRAY['mill direct'], now() - interval '2 days'),
  ('d3000033-0000-4000-8000-000000000004', 'd3000021-0000-4000-8000-000000000001', 'd3000013-0000-4000-8000-000000000004', 'Supplier D', 'VIEWED', 80.0, ARRAY['Erode exchange'], now() - interval '2 days'),
  ('d3000034-0000-4000-8000-000000000005', 'd3000021-0000-4000-8000-000000000001', 'd3000014-0000-4000-8000-000000000005', 'Supplier E', 'INVITED', 74.0, ARRAY['yarn depot'], now() - interval '2 days');

INSERT INTO committee_assignments (id, rfq_id, profile_id) VALUES
  ('ca300000-0000-4000-8000-000000000001', 'd3000021-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002'),
  ('ca300000-0000-4000-8000-000000000002', 'd3000021-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003');

INSERT INTO quotes (id, rfq_id, supplier_id, invitation_id, status, current_version, evaluation_score, submitted_at) VALUES
  ('d3000040-0000-4000-8000-000000000001', 'd3000021-0000-4000-8000-000000000001', 'd3000010-0000-4000-8000-000000000001', 'd3000030-0000-4000-8000-000000000001', 'FINAL', 1, 85.0, now() - interval '1 day'),
  ('d3000041-0000-4000-8000-000000000002', 'd3000021-0000-4000-8000-000000000001', 'd3000011-0000-4000-8000-000000000002', 'd3000031-0000-4000-8000-000000000002', 'FINAL', 1, 91.0, now() - interval '1 day'),
  ('d3000042-0000-4000-8000-000000000003', 'd3000021-0000-4000-8000-000000000001', 'd3000012-0000-4000-8000-000000000003', 'd3000032-0000-4000-8000-000000000003', 'FINAL', 1, 83.5, now() - interval '1 day');

INSERT INTO quote_versions (id, quote_id, version, snapshot, created_by) VALUES
  ('d3000060-0000-4000-8000-000000000001', 'd3000040-0000-4000-8000-000000000001', 1, '{"basePrice":245000,"gstAmount":44100,"transportCost":2500,"totalCost":291600,"deliveryDays":5,"warrantyMonths":0,"currency":"INR"}'::jsonb, 'b0000000-0000-4000-8000-000000000001'),
  ('d3000061-0000-4000-8000-000000000002', 'd3000041-0000-4000-8000-000000000002', 1, '{"basePrice":238500,"gstAmount":42930,"transportCost":0,"totalCost":281430,"deliveryDays":4,"warrantyMonths":0,"currency":"INR"}'::jsonb, 'b0000000-0000-4000-8000-000000000001'),
  ('d3000062-0000-4000-8000-000000000003', 'd3000042-0000-4000-8000-000000000003', 1, '{"basePrice":252000,"gstAmount":45360,"transportCost":0,"totalCost":297360,"deliveryDays":5,"warrantyMonths":0,"currency":"INR"}'::jsonb, 'b0000000-0000-4000-8000-000000000001');

INSERT INTO quote_evaluations (id, quote_id, rfq_id, version_evaluated, evaluation_score, breakdown, status, computed_at) VALUES
  (gen_random_uuid(), 'd3000040-0000-4000-8000-000000000001', 'd3000021-0000-4000-8000-000000000001', 1, 85.0, '{"price":32,"delivery":28,"quality":25}'::jsonb, 'COMPUTED', now() - interval '6 hours'),
  (gen_random_uuid(), 'd3000041-0000-4000-8000-000000000002', 'd3000021-0000-4000-8000-000000000001', 1, 91.0, '{"price":36,"delivery":30,"quality":25}'::jsonb, 'COMPUTED', now() - interval '6 hours'),
  (gen_random_uuid(), 'd3000042-0000-4000-8000-000000000003', 'd3000021-0000-4000-8000-000000000001', 1, 83.5, '{"price":28,"delivery":30,"quality":25.5}'::jsonb, 'COMPUTED', now() - interval '6 hours');

-- =============================================================================
-- PILOT 4 — Local business · Bengaluru · Electrical panel upgrade
-- =============================================================================

INSERT INTO organizations (id, name, org_type) VALUES
  (
    'd4000000-0000-4000-8000-000000000001',
    'Malleswaram Electronics & Services',
    'MSME'
  );

INSERT INTO organization_members (id, organization_id, profile_id, role) VALUES
  ('e4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'MANAGER'),
  ('e4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'COMMITTEE_MEMBER'),
  ('e4000000-0000-4000-8000-000000000003', 'd4000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003', 'COMMITTEE_MEMBER'),
  ('e4000000-0000-4000-8000-000000000004', 'd4000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'BUYER');

INSERT INTO approval_policies (id, organization_id, policy_type, threshold, is_default) VALUES
  (
    'd4000022-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000001',
    'COMMUNITY_SIMPLE_MAJORITY',
    '{"type": "simple_majority", "minVotes": 2}'::jsonb,
    true
  );

INSERT INTO suppliers (id, business_name, source, status, categories, capabilities, rating_avg, service_area, contact_phone, contact_email, address) VALUES
  ('d4000010-0000-4000-8000-000000000001', 'Bengaluru Electrical Contractors', 'LOCAL_REGISTRY', 'ACTIVE', ARRAY['Electrical','Panel Upgrade'], '{"services":["panel_install","wiring"]}'::jsonb, 4.5, '{"centerLat":12.9980,"centerLng":77.5700,"radiusKm":15}'::jsonb, '+918012000001', 'jobs@blr-electrical.in', '{"line1":"Malleswaram","city":"Bengaluru","state":"Karnataka","postalCode":"560003","country":"IN"}'::jsonb),
  ('d4000011-0000-4000-8000-000000000002', 'SafeWire Facility Services', 'DIRECT', 'ACTIVE', ARRAY['Electrical','AMC'], '{"services":["panel_upgrade","amc"]}'::jsonb, 4.7, '{"centerLat":13.0000,"centerLng":77.5800,"radiusKm":20}'::jsonb, '+918012000002', 'service@safewire.in', '{"line1":"Rajajinagar","city":"Bengaluru","state":"Karnataka","postalCode":"560010","country":"IN"}'::jsonb),
  ('d4000012-0000-4000-8000-000000000003', 'PowerGrid Shop Solutions', 'ASSOCIATION', 'ACTIVE', ARRAY['Electrical','3-Phase'], '{"services":["panel_install"]}'::jsonb, 4.3, '{"centerLat":12.9900,"centerLng":77.5600,"radiusKm":12}'::jsonb, '+918012000003', 'sales@powergrid-shop.in', '{"line1":"Seshadripuram","city":"Bengaluru","state":"Karnataka","postalCode":"560020","country":"IN"}'::jsonb),
  ('d4000013-0000-4000-8000-000000000004', 'Karnataka Licensed Electricians', 'BNI', 'ACTIVE', ARRAY['Electrical','Wiring'], '{"services":["wiring","panel"]}'::jsonb, 4.1, '{"centerLat":12.9800,"centerLng":77.5500,"radiusKm":18}'::jsonb, '+918012000004', 'contact@ka-electricians.in', '{"line1":"Vasanth Nagar","city":"Bengaluru","state":"Karnataka","postalCode":"560052","country":"IN"}'::jsonb),
  ('d4000014-0000-4000-8000-000000000005', 'North Bangalore Electricals', 'REFERRAL', 'ACTIVE', ARRAY['Electrical'], '{"services":["panel_upgrade"]}'::jsonb, 3.9, '{"centerLat":13.0200,"centerLng":77.5900,"radiusKm":25}'::jsonb, '+918012000005', 'info@nblr-electrical.in', '{"line1":"Hebbal","city":"Bengaluru","state":"Karnataka","postalCode":"560024","country":"IN"}'::jsonb);

INSERT INTO requirements (id, organization_id, created_by, requirement_type, status, title, description, structured_specs, published_at) VALUES (
  'd4000020-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000004',
  'SERVICE',
  'EVALUATION',
  '3-Phase Electrical Panel Upgrade — 63A',
  'Replace ageing shop electrical panel with new 3-phase 63A board, MCB protection, and earthing check.',
  '{"requirementType":"SERVICE","title":"Electrical Panel Upgrade","attributes":{"phase":"3-phase","rating":"63A","scope":"panel replacement"},"quantity":1,"unit":"job","deliveryLocation":{"line1":"Malleswaram Electronics","city":"Bengaluru","state":"Karnataka","postalCode":"560003","country":"IN"},"notes":"Work after shop hours — minimal business disruption"}'::jsonb,
  now() - interval '2 days'
);

INSERT INTO rfqs (id, requirement_id, organization_id, status, reveal_status, title, quote_deadline, evaluation_deadline, buyer_anonymous_to_suppliers, min_quotes_required, created_by) VALUES (
  'd4000021-0000-4000-8000-000000000001',
  'd4000020-0000-4000-8000-000000000001',
  'd4000000-0000-4000-8000-000000000001',
  'EVALUATING',
  'BLIND',
  'RFQ: 3-Phase Panel Upgrade 63A — Malleswaram',
  now() + interval '5 days',
  now() + interval '10 days',
  true,
  3,
  'b0000000-0000-4000-8000-000000000001'
);

INSERT INTO rfq_invitations (id, rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons, invited_at) VALUES
  ('d4000030-0000-4000-8000-000000000001', 'd4000021-0000-4000-8000-000000000001', 'd4000010-0000-4000-8000-000000000001', 'Supplier A', 'QUOTED', 89.0, ARRAY['licensed contractor','local'], now() - interval '2 days'),
  ('d4000031-0000-4000-8000-000000000002', 'd4000021-0000-4000-8000-000000000001', 'd4000011-0000-4000-8000-000000000002', 'Supplier B', 'QUOTED', 94.0, ARRAY['facility services','highest rating'], now() - interval '2 days'),
  ('d4000032-0000-4000-8000-000000000003', 'd4000021-0000-4000-8000-000000000001', 'd4000012-0000-4000-8000-000000000003', 'Supplier C', 'QUOTED', 86.0, ARRAY['3-phase specialist'], now() - interval '2 days'),
  -- Not "BNI member": how a supplier reached the platform is never a reason to
  -- prefer them, and putting it in the match reasons hands the buyer a channel
  -- to rank on (INV-062).
  ('d4000033-0000-4000-8000-000000000004', 'd4000021-0000-4000-8000-000000000001', 'd4000013-0000-4000-8000-000000000004', 'Supplier D', 'VIEWED', 78.0, ARRAY['3-phase capable'], now() - interval '2 days'),
  ('d4000034-0000-4000-8000-000000000005', 'd4000021-0000-4000-8000-000000000001', 'd4000014-0000-4000-8000-000000000005', 'Supplier E', 'DECLINED', 70.0, ARRAY['out of area'], now() - interval '2 days');

INSERT INTO committee_assignments (id, rfq_id, profile_id) VALUES
  ('ca400000-0000-4000-8000-000000000001', 'd4000021-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002'),
  ('ca400000-0000-4000-8000-000000000002', 'd4000021-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003');

INSERT INTO quotes (id, rfq_id, supplier_id, invitation_id, status, current_version, evaluation_score, submitted_at) VALUES
  ('d4000040-0000-4000-8000-000000000001', 'd4000021-0000-4000-8000-000000000001', 'd4000010-0000-4000-8000-000000000001', 'd4000030-0000-4000-8000-000000000001', 'FINAL', 1, 84.0, now() - interval '1 day'),
  ('d4000041-0000-4000-8000-000000000002', 'd4000021-0000-4000-8000-000000000001', 'd4000011-0000-4000-8000-000000000002', 'd4000031-0000-4000-8000-000000000002', 'FINAL', 1, 93.0, now() - interval '1 day'),
  ('d4000042-0000-4000-8000-000000000003', 'd4000021-0000-4000-8000-000000000001', 'd4000012-0000-4000-8000-000000000003', 'd4000032-0000-4000-8000-000000000003', 'FINAL', 1, 81.5, now() - interval '1 day');

INSERT INTO quote_versions (id, quote_id, version, snapshot, created_by) VALUES
  ('d4000060-0000-4000-8000-000000000001', 'd4000040-0000-4000-8000-000000000001', 1, '{"basePrice":42000,"gstAmount":7560,"transportCost":0,"totalCost":49560,"deliveryDays":2,"warrantyMonths":12,"currency":"INR"}'::jsonb, 'b0000000-0000-4000-8000-000000000001'),
  ('d4000061-0000-4000-8000-000000000002', 'd4000041-0000-4000-8000-000000000002', 1, '{"basePrice":38500,"gstAmount":6930,"transportCost":0,"totalCost":45430,"deliveryDays":3,"warrantyMonths":12,"currency":"INR"}'::jsonb, 'b0000000-0000-4000-8000-000000000001'),
  ('d4000062-0000-4000-8000-000000000003', 'd4000042-0000-4000-8000-000000000003', 1, '{"basePrice":45200,"gstAmount":8136,"transportCost":0,"totalCost":53336,"deliveryDays":2,"warrantyMonths":6,"currency":"INR"}'::jsonb, 'b0000000-0000-4000-8000-000000000001');

INSERT INTO quote_evaluations (id, quote_id, rfq_id, version_evaluated, evaluation_score, breakdown, status, computed_at) VALUES
  (gen_random_uuid(), 'd4000040-0000-4000-8000-000000000001', 'd4000021-0000-4000-8000-000000000001', 1, 84.0, '{"price":30,"delivery":28,"warranty":26}'::jsonb, 'COMPUTED', now() - interval '6 hours'),
  (gen_random_uuid(), 'd4000041-0000-4000-8000-000000000002', 'd4000021-0000-4000-8000-000000000001', 1, 93.0, '{"price":38,"delivery":26,"warranty":29}'::jsonb, 'COMPUTED', now() - interval '6 hours'),
  (gen_random_uuid(), 'd4000042-0000-4000-8000-000000000003', 'd4000021-0000-4000-8000-000000000001', 1, 81.5, '{"price":26,"delivery":30,"warranty":25.5}'::jsonb, 'COMPUTED', now() - interval '6 hours');
