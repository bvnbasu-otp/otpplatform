-- Phase 8 fulfillment seed — separate RFQ (does not alter borewell OPEN/BLIND scenario).
-- Awarded Supplier B · PO ISSUED · Work order NOT_STARTED

INSERT INTO requirements (
  id, organization_id, created_by, requirement_type, status, title, description, created_at, updated_at
) VALUES (
  'a2000001-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'SERVICE',
  'AWARDED',
  '10 HP Borewell Motor Winding (Fulfillment)',
  'Post-award fulfillment track for PO / work order demo',
  now() - interval '1 day',
  now()
);

INSERT INTO rfqs (
  id, requirement_id, organization_id, status, reveal_status, title,
  quote_deadline, evaluation_deadline, buyer_anonymous_to_suppliers,
  min_quotes_required, created_by
) VALUES (
  'f2000000-0000-4000-8000-000000000001',
  'a2000001-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000001',
  'AWARDED',
  'REVEALED',
  'RFQ: Borewell Motor Winding (Awarded)',
  now() - interval '2 days',
  now() - interval '1 day',
  true,
  1,
  'b0000000-0000-4000-8000-000000000001'
);

INSERT INTO rfq_invitations (
  id, rfq_id, supplier_id, anonymous_label, status, invited_at
) VALUES (
  'a4000001-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  'Supplier B',
  'QUOTED',
  now() - interval '3 days'
);

INSERT INTO quotes (
  id, rfq_id, supplier_id, invitation_id, status, current_version, submitted_at
) VALUES (
  'a5000001-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  'a4000001-0000-4000-8000-000000000001',
  'SELECTED',
  1,
  now() - interval '2 days'
);

INSERT INTO quote_versions (id, quote_id, version, snapshot, created_by) VALUES (
  'a6000001-0000-4000-8000-000000000001',
  'a5000001-0000-4000-8000-000000000001',
  1,
  '{"basePrice": 7800, "gstAmount": 1404, "transportCost": 0, "totalCost": 9204, "deliveryDays": 4, "warrantyMonths": 6, "currency": "INR"}'::jsonb,
  'b0000000-0000-4000-8000-000000000006'
);

INSERT INTO awards (
  id, rfq_id, quote_id, awarded_by, justification, status, awarded_at, revealed_at
) VALUES (
  'b7000001-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'a5000001-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  '{"text":"Best value at ₹7,800 base with acceptable 4-day delivery for community borewell repair."}'::jsonb,
  'REVEALED',
  now() - interval '1 day',
  now() - interval '1 day'
);

INSERT INTO purchase_orders (
  id, award_id, rfq_id, organization_id, supplier_id, po_number, status,
  total_amount, currency, issued_at, created_at, updated_at
) VALUES (
  'c8000001-0000-4000-8000-000000000001',
  'b7000001-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  'PO-GV-2026-0001',
  'ISSUED',
  9204.00,
  'INR',
  now() - interval '12 hours',
  now() - interval '1 day',
  now()
);

INSERT INTO work_orders (
  id, purchase_order_id, supplier_id, status, title, progress_percent, created_at, updated_at
) VALUES (
  'd9000001-0000-4000-8000-000000000001',
  'c8000001-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  'NOT_STARTED',
  '10 HP Borewell Motor Winding — Site Work',
  0,
  now(),
  now()
);
