-- Demo suppliers, reachable by message.
--
-- Runs after seed_demo_environment.sql, because it needs the demo suppliers to
-- exist. This is data rather than schema, which is why it lives here and not in
-- a migration.
--
-- The numbers are in +91 90000 0xxxx, a range not allocated to real subscribers.
-- Deliberate: if a demo environment is ever pointed at a live provider by
-- mistake, the messages go nowhere rather than to a stranger who then has to
-- work out why they were asked to quote for a borewell motor.

WITH ordered AS (
  SELECT
    s.id,
    row_number() OVER (ORDER BY s.created_at, s.id) AS n
  FROM suppliers s
  WHERE s.is_demo
)
INSERT INTO supplier_messaging_channels (
  supplier_id, channel, phone_e164, status, verified_at, last_provider
)
SELECT
  o.id,
  -- Most on WhatsApp, every third on SMS. The demo should show both, including
  -- the one where the whole enquiry has to fit inside 160 characters.
  CASE WHEN o.n % 3 = 0 THEN 'SMS' ELSE 'WHATSAPP' END::messaging_channel,
  '+9190000' || lpad(o.n::text, 5, '0'),
  'VERIFIED',
  now(),
  'MOCK'
FROM ordered o
ON CONFLICT DO NOTHING;
