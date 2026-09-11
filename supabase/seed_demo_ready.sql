-- OTP Demo — walkthrough-ready state (QUOTING, 3 quotes submitted)
\ir seed_demo_shared.sql

BEGIN;

-- ── Quotes A, B, C (D and E did not quote) ───────────────────────────────────
INSERT INTO quotes (id, rfq_id, supplier_id, invitation_id, status, current_version, evaluation_score, submitted_at, created_at, updated_at) VALUES
  ('d1000040-0000-4000-8000-000000000001', 'd1000021-0000-4000-8000-000000000001', 'd1000010-0000-4000-8000-000000000001', 'd1000030-0000-4000-8000-000000000001', 'SUBMITTED', 1, 88.4, now() - interval '1 day', now() - interval '1 day', now()),
  ('d1000041-0000-4000-8000-000000000001', 'd1000021-0000-4000-8000-000000000001', 'd1000011-0000-4000-8000-000000000001', 'd1000031-0000-4000-8000-000000000001', 'SUBMITTED', 1, 91.2, now() - interval '20 hours', now() - interval '20 hours', now()),
  ('d1000042-0000-4000-8000-000000000001', 'd1000021-0000-4000-8000-000000000001', 'd1000012-0000-4000-8000-000000000001', 'd1000032-0000-4000-8000-000000000001', 'SUBMITTED', 1, 85.1, now() - interval '18 hours', now() - interval '18 hours', now());

INSERT INTO quote_versions (id, quote_id, version, snapshot, notes, created_by, created_at) VALUES
  (gen_random_uuid(), 'd1000040-0000-4000-8000-000000000001', 1,
   '{"basePrice":6800,"gstAmount":1300,"transportCost":400,"totalCost":8500,"deliveryDays":2,"warrantyMonths":12,"currency":"INR"}'::jsonb,
   'Includes pickup and reinstall', 'd1000010-0000-4000-8000-000000000001', now() - interval '1 day'),
  (gen_random_uuid(), 'd1000041-0000-4000-8000-000000000001', 1,
   '{"basePrice":6271,"gstAmount":1229,"transportCost":300,"totalCost":7800,"deliveryDays":4,"warrantyMonths":6,"currency":"INR"}'::jsonb,
   'Copper winding, 6-month warranty', 'd1000011-0000-4000-8000-000000000001', now() - interval '20 hours'),
  (gen_random_uuid(), 'd1000042-0000-4000-8000-000000000001', 1,
   '{"basePrice":7389,"gstAmount":1411,"transportCost":400,"totalCost":9200,"deliveryDays":2,"warrantyMonths":12,"currency":"INR"}'::jsonb,
   'Premium insulation, 12-month warranty', 'd1000012-0000-4000-8000-000000000001', now() - interval '18 hours');

INSERT INTO quote_evaluations (id, quote_id, rfq_id, version_evaluated, evaluation_score, breakdown, status, computed_at) VALUES
  (gen_random_uuid(), 'd1000040-0000-4000-8000-000000000001', 'd1000021-0000-4000-8000-000000000001', 1, 88.4, '{"price":35,"delivery":30,"warranty":23.4}'::jsonb, 'COMPUTED', now() - interval '12 hours'),
  (gen_random_uuid(), 'd1000041-0000-4000-8000-000000000001', 'd1000021-0000-4000-8000-000000000001', 1, 91.2, '{"price":40,"delivery":22,"warranty":29.2}'::jsonb, 'COMPUTED', now() - interval '12 hours'),
  (gen_random_uuid(), 'd1000042-0000-4000-8000-000000000001', 'd1000021-0000-4000-8000-000000000001', 1, 85.1, '{"price":28,"delivery":30,"warranty":27.1}'::jsonb, 'COMPUTED', now() - interval '12 hours');

INSERT INTO audit_events (id, event_type, actor_id, organization_id, entity_type, entity_id, payload, occurred_at) VALUES
  (gen_random_uuid(), 'requirement.created', 'd1000004-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'requirement', 'd1000020-0000-4000-8000-000000000001', '{"type":"SERVICE"}'::jsonb, now() - interval '3 days'),
  (gen_random_uuid(), 'rfq.opened', 'd1000001-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'rfq', 'd1000021-0000-4000-8000-000000000001', '{"invitations":5}'::jsonb, now() - interval '2 days'),
  (gen_random_uuid(), 'quote.submitted', NULL, 'd1000000-0000-4000-8000-000000000001', 'quote', 'd1000040-0000-4000-8000-000000000001', '{"anonymousLabel":"Supplier A"}'::jsonb, now() - interval '1 day'),
  (gen_random_uuid(), 'quote.submitted', NULL, 'd1000000-0000-4000-8000-000000000001', 'quote', 'd1000041-0000-4000-8000-000000000001', '{"anonymousLabel":"Supplier B"}'::jsonb, now() - interval '20 hours'),
  (gen_random_uuid(), 'quote.submitted', NULL, 'd1000000-0000-4000-8000-000000000001', 'quote', 'd1000042-0000-4000-8000-000000000001', '{"anonymousLabel":"Supplier C"}'::jsonb, now() - interval '18 hours'),
  (gen_random_uuid(), 'invitation.declined', NULL, 'd1000000-0000-4000-8000-000000000001', 'rfq_invitation', 'd1000034-0000-4000-8000-000000000001', '{"reason":"No 10 HP specialist"}'::jsonb, now() - interval '1 day'),
  (gen_random_uuid(), 'evaluation.computed', NULL, 'd1000000-0000-4000-8000-000000000001', 'rfq', 'd1000021-0000-4000-8000-000000000001', '{"quoteCount":3}'::jsonb, now() - interval '12 hours');

COMMIT;
