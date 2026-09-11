BEGIN;
DELETE FROM rfq_invitations WHERE rfq_id = '4074a557-ea0d-429c-bce5-3639cdd8ea76';

INSERT INTO rfq_invitations (rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons)
VALUES
  ('4074a557-ea0d-429c-bce5-3639cdd8ea76', '0d500000-0000-4000-8000-000000000321', 'Supplier A', 'INVITED', 98.0, ARRAY['teak_wood_tables_rental', 'event_seating_200']),
  ('4074a557-ea0d-429c-bce5-3639cdd8ea76', '0d500000-0000-4000-8000-000000000322', 'Supplier B', 'INVITED', 96.0, ARRAY['premium_wood_chairs', '3_days_rental']),
  ('4074a557-ea0d-429c-bce5-3639cdd8ea76', '0d500000-0000-4000-8000-000000000323', 'Supplier C', 'INVITED', 95.0, ARRAY['solid_teak_wood_conference_tables', 'direct_delivery']),
  ('4074a557-ea0d-429c-bce5-3639cdd8ea76', '0d500000-0000-4000-8000-000000000324', 'Supplier D', 'INVITED', 93.0, ARRAY['commercial_banquet_rental', 'setup_and_clearing']);

UPDATE rfqs SET status = 'OPEN' WHERE id = '4074a557-ea0d-429c-bce5-3639cdd8ea76';
COMMIT;
