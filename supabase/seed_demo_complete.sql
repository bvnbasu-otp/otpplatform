-- OTP Demo — full lifecycle COMPLETED with audit trail
\ir seed_demo_shared.sql

BEGIN;

-- ── Quotes (FINAL during evaluation, then SELECTED/NOT_SELECTED on award) ─────
INSERT INTO quotes (id, rfq_id, supplier_id, invitation_id, status, current_version, evaluation_score, submitted_at, created_at, updated_at) VALUES
  ('d1000040-0000-4000-8000-000000000001', 'd1000021-0000-4000-8000-000000000001', 'd1000010-0000-4000-8000-000000000001', 'd1000030-0000-4000-8000-000000000001', 'FINAL', 1, 88.4, now() - interval '10 days', now() - interval '10 days', now() - interval '8 days'),
  ('d1000041-0000-4000-8000-000000000001', 'd1000021-0000-4000-8000-000000000001', 'd1000011-0000-4000-8000-000000000001', 'd1000031-0000-4000-8000-000000000001', 'FINAL', 1, 91.2, now() - interval '10 days', now() - interval '10 days', now() - interval '8 days'),
  ('d1000042-0000-4000-8000-000000000001', 'd1000021-0000-4000-8000-000000000001', 'd1000012-0000-4000-8000-000000000001', 'd1000032-0000-4000-8000-000000000001', 'FINAL', 1, 85.1, now() - interval '9 days', now() - interval '9 days', now() - interval '8 days');

INSERT INTO quote_versions (id, quote_id, version, snapshot, notes, created_by, created_at) VALUES
  (gen_random_uuid(), 'd1000040-0000-4000-8000-000000000001', 1,
   '{"basePrice":6800,"gstAmount":1300,"transportCost":400,"totalCost":8500,"deliveryDays":2,"warrantyMonths":12,"currency":"INR"}'::jsonb,
   'Includes pickup and reinstall', 'd1000001-0000-4000-8000-000000000001', now() - interval '10 days'),
  (gen_random_uuid(), 'd1000041-0000-4000-8000-000000000001', 1,
   '{"basePrice":6271,"gstAmount":1229,"transportCost":300,"totalCost":7800,"deliveryDays":4,"warrantyMonths":6,"currency":"INR"}'::jsonb,
   'Copper winding, 6-month warranty', 'd1000001-0000-4000-8000-000000000001', now() - interval '10 days'),
  (gen_random_uuid(), 'd1000042-0000-4000-8000-000000000001', 1,
   '{"basePrice":7389,"gstAmount":1411,"transportCost":400,"totalCost":9200,"deliveryDays":2,"warrantyMonths":12,"currency":"INR"}'::jsonb,
   'Premium insulation', 'd1000001-0000-4000-8000-000000000001', now() - interval '9 days');

INSERT INTO quote_evaluations (id, quote_id, rfq_id, version_evaluated, evaluation_score, breakdown, status, computed_at) VALUES
  (gen_random_uuid(), 'd1000040-0000-4000-8000-000000000001', 'd1000021-0000-4000-8000-000000000001', 1, 88.4, '{"price":35,"delivery":30,"warranty":23.4}'::jsonb, 'COMPUTED', now() - interval '8 days'),
  (gen_random_uuid(), 'd1000041-0000-4000-8000-000000000001', 'd1000021-0000-4000-8000-000000000001', 1, 91.2, '{"price":40,"delivery":22,"warranty":29.2}'::jsonb, 'COMPUTED', now() - interval '8 days'),
  (gen_random_uuid(), 'd1000042-0000-4000-8000-000000000001', 'd1000021-0000-4000-8000-000000000001', 1, 85.1, '{"price":28,"delivery":30,"warranty":27.1}'::jsonb, 'COMPUTED', now() - interval '8 days');

-- ── Advance requirement + RFQ to COMPLETED ───────────────────────────────────
UPDATE requirements SET status = 'COMPLETED', closed_at = now() - interval '1 day', updated_at = now()
WHERE id = 'd1000020-0000-4000-8000-000000000001';

UPDATE rfqs SET status = 'AWARDED', reveal_status = 'REVEALED', updated_at = now()
WHERE id = 'd1000021-0000-4000-8000-000000000001';

-- ── COI + Committee votes (comm1→B, comm2→B, buyer→A dissent) ───────────────
INSERT INTO conflict_of_interest_declarations (id, rfq_id, profile_id, status, description, declared_at) VALUES
  (gen_random_uuid(), 'd1000021-0000-4000-8000-000000000001', 'd1000002-0000-4000-8000-000000000001', 'DECLARED_NONE', NULL, now() - interval '7 days'),
  (gen_random_uuid(), 'd1000021-0000-4000-8000-000000000001', 'd1000003-0000-4000-8000-000000000001', 'DECLARED_NONE', NULL, now() - interval '7 days'),
  (gen_random_uuid(), 'd1000021-0000-4000-8000-000000000001', 'd1000004-0000-4000-8000-000000000001', 'DECLARED_NONE', NULL, now() - interval '7 days');

INSERT INTO committee_votes (id, rfq_id, profile_id, recommended_quote_id, choice, comment, cast_at, locked_at) VALUES
  (gen_random_uuid(), 'd1000021-0000-4000-8000-000000000001', 'd1000002-0000-4000-8000-000000000001', 'd1000041-0000-4000-8000-000000000001', 'RECOMMEND', 'Best value — lowest price with acceptable delivery', now() - interval '7 days', now() - interval '6 days'),
  (gen_random_uuid(), 'd1000021-0000-4000-8000-000000000001', 'd1000003-0000-4000-8000-000000000001', 'd1000041-0000-4000-8000-000000000001', 'RECOMMEND', 'Price advantage justifies slightly longer delivery', now() - interval '7 days', now() - interval '6 days'),
  (gen_random_uuid(), 'd1000021-0000-4000-8000-000000000001', 'd1000004-0000-4000-8000-000000000001', 'd1000040-0000-4000-8000-000000000001', 'RECOMMEND', 'Prefer faster 2-day turnaround for water supply', now() - interval '7 days', now() - interval '6 days');

-- ── Award (Supplier B) ───────────────────────────────────────────────────────
INSERT INTO awards (id, rfq_id, quote_id, awarded_by, justification, status, awarded_at, revealed_at) VALUES (
  'd1000050-0000-4000-8000-000000000001',
  'd1000021-0000-4000-8000-000000000001',
  'd1000041-0000-4000-8000-000000000001',
  'd1000001-0000-4000-8000-000000000001',
  '{"text":"Awarded to Supplier B (₹7,800) despite 4-day delivery vs Supplier A/C at 2 days. Committee split 2:1 for B on price; manager override citing ₹700 savings vs A and acceptable 4-day window for non-emergency repair. Warranty tradeoff (6 vs 12 months) noted — community savings prioritized.","criteriaReferenced":["price","delivery","warranty","committee_vote"],"recordedBy":"d1000001-0000-4000-8000-000000000001","recordedAt":"2026-08-14T11:00:00Z"}'::jsonb,
  'REVEALED',
  now() - interval '6 days',
  now() - interval '6 days'
);

UPDATE quotes SET status = 'SELECTED', updated_at = now() - interval '5 days'
WHERE id = 'd1000041-0000-4000-8000-000000000001';

UPDATE quotes SET status = 'NOT_SELECTED', updated_at = now() - interval '5 days'
WHERE id IN ('d1000040-0000-4000-8000-000000000001', 'd1000042-0000-4000-8000-000000000001');

INSERT INTO approval_instances (id, rfq_id, policy_id, status, requested_at, resolved_at) VALUES (
  gen_random_uuid(), 'd1000021-0000-4000-8000-000000000001', 'd1000022-0000-4000-8000-000000000001', 'APPROVED', now() - interval '7 days', now() - interval '6 days'
);

-- ── PO → WO → Invoice → Payment ──────────────────────────────────────────────
INSERT INTO purchase_orders (id, award_id, rfq_id, organization_id, supplier_id, po_number, status, total_amount, currency, issued_at, acknowledged_at, created_at, updated_at) VALUES (
  'd1000051-0000-4000-8000-000000000001',
  'd1000050-0000-4000-8000-000000000001',
  'd1000021-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'd1000011-0000-4000-8000-000000000001',
  'DRG-RBW-PO-2026-001',
  'COMPLETED',
  7800.00,
  'INR',
  now() - interval '5 days',
  now() - interval '5 days',
  now() - interval '5 days',
  now() - interval '1 day'
);

INSERT INTO work_orders (id, purchase_order_id, supplier_id, status, title, scheduled_start, actual_start, completed_at, progress_percent, dispute_status, created_at, updated_at) VALUES (
  'd1000052-0000-4000-8000-000000000001',
  'd1000051-0000-4000-8000-000000000001',
  'd1000011-0000-4000-8000-000000000001',
  'COMPLETED',
  '10 HP Motor Winding — Block C Pump House',
  now() - interval '4 days',
  now() - interval '4 days',
  now() - interval '2 days',
  100,
  'NONE',
  now() - interval '5 days',
  now() - interval '2 days'
);

INSERT INTO invoices (id, work_order_id, supplier_id, invoice_number, amount, currency, status, submitted_at, approved_at, created_at) VALUES (
  'd1000053-0000-4000-8000-000000000001',
  'd1000052-0000-4000-8000-000000000001',
  'd1000011-0000-4000-8000-000000000001',
  'KPS-INV-2026-0847',
  7800.00,
  'INR',
  'PAID',
  now() - interval '2 days',
  now() - interval '2 days',
  now() - interval '2 days'
);

INSERT INTO payments (id, invoice_id, amount, currency, method, status, reference, recorded_by, recorded_at, verified_at) VALUES (
  'd1000054-0000-4000-8000-000000000001',
  'd1000053-0000-4000-8000-000000000001',
  7800.00,
  'INR',
  'UPI',
  'VERIFIED',
  'UPI/DRG7829341056',
  'd1000001-0000-4000-8000-000000000001',
  now() - interval '1 day',
  now() - interval '1 day'
);

INSERT INTO procurement_performance_records (id, supplier_id, rfq_id, organization_id, quoted_total, actual_total, quoted_delivery_days, actual_delivery_days, quality_rating, variance, recorded_at) VALUES (
  'd1000055-0000-4000-8000-000000000001',
  'd1000011-0000-4000-8000-000000000001',
  'd1000021-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  7800.00,
  7800.00,
  4, 3, 4.5,
  '{"costDelta":0,"deliveryDeltaDays":-1}'::jsonb,
  now() - interval '1 day'
);

-- ── Full audit trail ─────────────────────────────────────────────────────────
INSERT INTO audit_events (id, event_type, actor_id, organization_id, entity_type, entity_id, payload, occurred_at, correlation_id) VALUES
  (gen_random_uuid(), 'requirement.created', 'd1000004-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'requirement', 'd1000020-0000-4000-8000-000000000001', '{"type":"SERVICE"}'::jsonb, now() - interval '14 days', 'demo-full-001'),
  (gen_random_uuid(), 'requirement.submitted', 'd1000004-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'requirement', 'd1000020-0000-4000-8000-000000000001', '{}'::jsonb, now() - interval '13 days', 'demo-full-001'),
  (gen_random_uuid(), 'rfq.created', 'd1000001-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'rfq', 'd1000021-0000-4000-8000-000000000001', '{}'::jsonb, now() - interval '12 days', 'demo-full-001'),
  (gen_random_uuid(), 'rfq.opened', 'd1000001-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'rfq', 'd1000021-0000-4000-8000-000000000001', '{"invitations":5}'::jsonb, now() - interval '12 days', 'demo-full-001'),
  (gen_random_uuid(), 'quote.submitted', NULL, 'd1000000-0000-4000-8000-000000000001', 'quote', 'd1000040-0000-4000-8000-000000000001', '{"anonymousLabel":"Supplier A"}'::jsonb, now() - interval '10 days', 'demo-full-001'),
  (gen_random_uuid(), 'quote.submitted', NULL, 'd1000000-0000-4000-8000-000000000001', 'quote', 'd1000041-0000-4000-8000-000000000001', '{"anonymousLabel":"Supplier B"}'::jsonb, now() - interval '10 days', 'demo-full-001'),
  (gen_random_uuid(), 'quote.submitted', NULL, 'd1000000-0000-4000-8000-000000000001', 'quote', 'd1000042-0000-4000-8000-000000000001', '{"anonymousLabel":"Supplier C"}'::jsonb, now() - interval '9 days', 'demo-full-001'),
  (gen_random_uuid(), 'invitation.declined', NULL, 'd1000000-0000-4000-8000-000000000001', 'rfq_invitation', 'd1000034-0000-4000-8000-000000000001', '{}'::jsonb, now() - interval '9 days', 'demo-full-001'),
  (gen_random_uuid(), 'rfq.quoting_closed', 'd1000001-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'rfq', 'd1000021-0000-4000-8000-000000000001', '{}'::jsonb, now() - interval '8 days', 'demo-full-001'),
  (gen_random_uuid(), 'evaluation.computed', NULL, 'd1000000-0000-4000-8000-000000000001', 'rfq', 'd1000021-0000-4000-8000-000000000001', '{"quoteCount":3}'::jsonb, now() - interval '8 days', 'demo-full-001'),
  (gen_random_uuid(), 'vote.cast', 'd1000002-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'committee_vote', 'd1000041-0000-4000-8000-000000000001', '{"choice":"RECOMMEND"}'::jsonb, now() - interval '7 days', 'demo-full-001'),
  (gen_random_uuid(), 'vote.cast', 'd1000003-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'committee_vote', 'd1000041-0000-4000-8000-000000000001', '{"choice":"RECOMMEND"}'::jsonb, now() - interval '7 days', 'demo-full-001'),
  (gen_random_uuid(), 'award.recorded', 'd1000001-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'award', 'd1000050-0000-4000-8000-000000000001', '{"quoteId":"d1000041-0000-4000-8000-000000000001"}'::jsonb, now() - interval '6 days', 'demo-full-001'),
  (gen_random_uuid(), 'rfq.revealed', NULL, 'd1000000-0000-4000-8000-000000000001', 'rfq', 'd1000021-0000-4000-8000-000000000001', '{"supplier":"Krishna Pump Services"}'::jsonb, now() - interval '6 days', 'demo-full-001'),
  (gen_random_uuid(), 'po.issued', 'd1000001-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'purchase_order', 'd1000051-0000-4000-8000-000000000001', '{}'::jsonb, now() - interval '5 days', 'demo-full-001'),
  (gen_random_uuid(), 'work_order.completed', NULL, 'd1000000-0000-4000-8000-000000000001', 'work_order', 'd1000052-0000-4000-8000-000000000001', '{}'::jsonb, now() - interval '2 days', 'demo-full-001'),
  (gen_random_uuid(), 'invoice.approved', 'd1000001-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'invoice', 'd1000053-0000-4000-8000-000000000001', '{}'::jsonb, now() - interval '2 days', 'demo-full-001'),
  (gen_random_uuid(), 'payment.verified', 'd1000001-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'payment', 'd1000054-0000-4000-8000-000000000001', '{"reference":"UPI/DRG7829341056"}'::jsonb, now() - interval '1 day', 'demo-full-001'),
  (gen_random_uuid(), 'performance.recorded', NULL, 'd1000000-0000-4000-8000-000000000001', 'supplier_performance', 'd1000055-0000-4000-8000-000000000001', '{"qualityRating":4.5}'::jsonb, now() - interval '1 day', 'demo-full-001'),
  (gen_random_uuid(), 'requirement.completed', 'd1000001-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'requirement', 'd1000020-0000-4000-8000-000000000001', '{}'::jsonb, now() - interval '1 day', 'demo-full-001');

COMMIT;
