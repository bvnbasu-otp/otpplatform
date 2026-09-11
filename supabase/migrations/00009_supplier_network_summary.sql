-- Supplier network reach summary (Procurement OS pillar A)
-- Buyers/committee have no SELECT on rfq_invitations or suppliers during the
-- blind phase, so network reach must come from an aggregate view.
--
-- Blind-safe by construction: rows are grouped counts per network with no
-- per-supplier column at all, so a network cannot be correlated to a bidder.
-- supplier_source is collapsed to the network enum inside the view so the raw
-- supplier attribute never reaches the client. This CASE must mirror
-- supplierSourceToNetwork() in packages/domain (asserted by rls-security tests).

CREATE OR REPLACE VIEW rfq_supplier_networks
WITH (security_barrier = true) AS
SELECT
  ri.rfq_id,
  CASE s.source
    WHEN 'ONDC' THEN 'ONDC'
    WHEN 'BNI' THEN 'BNI'
    WHEN 'ASSOCIATION' THEN 'ASSOCIATION'
    WHEN 'LOCAL_REGISTRY' THEN 'LOCAL_REGISTRY'
    ELSE 'DIRECT'
  END AS network,
  count(*)::integer AS invited_count,
  (count(*) FILTER (WHERE ri.status = 'QUOTED'))::integer AS quoted_count
FROM rfq_invitations ri
JOIN suppliers s ON s.id = ri.supplier_id
WHERE private.can_access_rfq_as_buyer(ri.rfq_id)
   OR private.can_access_rfq_as_committee(ri.rfq_id)
GROUP BY 1, 2;

GRANT SELECT ON rfq_supplier_networks TO authenticated;
