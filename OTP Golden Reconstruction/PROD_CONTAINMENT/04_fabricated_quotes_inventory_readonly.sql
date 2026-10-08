-- =============================================================================
-- 04_fabricated_quotes_inventory_readonly.sql  —  READ-ONLY.  No deletes/updates.
-- =============================================================================
-- Eight independent queries (Q1..Q8). The Supabase SQL editor shows only the
-- last statement's result, so highlight ONE query at a time and Run, then
-- Download CSV. Order does not matter; none depends on 01 having been run.
--
-- How fabricated quotes are recognised (verified against the function bodies):
--   seed_simulated_quotes_for_rfq (00188)  quote_versions.snapshot->>'simulated' = 'true'
--                                          AND snapshot ? 'tierName'  (e.g. 'Premium Quality Tier')
--   auto_submit_pilot_quotes (00084/00188) snapshot->>'simulated' = 'false'  (!!) — only
--                                          recognisable by its fixed note texts (listed below),
--                                          stored in both quote_versions.notes and snapshot->>'quoteNotes'
--   demo_generate_quotes (00025)           snapshot->>'simulated' = 'true', demo RFQs only
--   quotes.source = 'DEMO_GENERATED'       demo generator marker
-- Simulator invitations: match_reasons = {category_match,verified_active}
--   seed_simulated_quotes_for_rfq     match_score = LEAST(98, 78 + rating_avg*4)
--   discover_and_invite fallback      match_score = COALESCE(rating_avg,4)*20
-- =============================================================================


-- Q1. Summary: fabricated quotes by generator and by real-vs-demo RFQ -----------
WITH fab AS (
  SELECT q.id, q.rfq_id,
         CASE
           WHEN bool_or(qv.snapshot->>'simulated' = 'true' AND qv.snapshot ? 'tierName') THEN 'seed_simulated_quotes_for_rfq'
           WHEN bool_or(COALESCE(qv.snapshot->>'quoteNotes', qv.notes) IN (
                  'Standard verified tier: Complete delivery, professional setup, and dedicated on-site support included.',
                  'Premium grade tier: Grade-A seasoned materials, expedited 48-hour delivery, zero transit damage guarantee.',
                  'Cost-optimized commercial tier: High volume economy pricing, standard clearing and return logistics.',
                  'Regional fast-track tier: Local warehouse stock ready for immediate dispatch with same-day setup assistance.',
                  'Enterprise specialist tier: ISO certified manufacturing, dedicated technical account manager.'))
                THEN 'auto_submit_pilot_quotes (snapshot says simulated=false)'
           WHEN bool_or(qv.snapshot->>'simulated' = 'true') THEN 'simulated=true (demo_generate_quotes / other)'
           WHEN q.source::text = 'DEMO_GENERATED' THEN 'source=DEMO_GENERATED'
         END AS generator
  FROM public.quotes q
  JOIN public.quote_versions qv ON qv.quote_id = q.id
  GROUP BY q.id, q.rfq_id, q.source
)
SELECT f.generator,
       CASE WHEN r.is_demo THEN 'demo RFQ' ELSE 'REAL RFQ' END AS rfq_kind,
       count(*)                AS quotes,
       count(DISTINCT f.rfq_id) AS rfqs,
       min(q.created_at)       AS first_seen,
       max(q.created_at)       AS last_seen
FROM fab f
JOIN public.quotes q ON q.id = f.id
JOIN public.rfqs r   ON r.id = f.rfq_id
WHERE f.generator IS NOT NULL
GROUP BY 1, 2
ORDER BY 2 DESC, 1;


-- Q2. Per RFQ: every RFQ carrying fabricated quotes -----------------------------
WITH fab AS (
  SELECT q.id, q.rfq_id, q.supplier_id, q.status, q.created_at,
         CASE
           WHEN bool_or(qv.snapshot->>'simulated' = 'true' AND qv.snapshot ? 'tierName') THEN 'seed_simulated'
           WHEN bool_or(COALESCE(qv.snapshot->>'quoteNotes', qv.notes) IN (
                  'Standard verified tier: Complete delivery, professional setup, and dedicated on-site support included.',
                  'Premium grade tier: Grade-A seasoned materials, expedited 48-hour delivery, zero transit damage guarantee.',
                  'Cost-optimized commercial tier: High volume economy pricing, standard clearing and return logistics.',
                  'Regional fast-track tier: Local warehouse stock ready for immediate dispatch with same-day setup assistance.',
                  'Enterprise specialist tier: ISO certified manufacturing, dedicated technical account manager.'))
                THEN 'auto_submit_pilot'
           WHEN bool_or(qv.snapshot->>'simulated' = 'true') THEN 'simulated_other'
           WHEN q.source::text = 'DEMO_GENERATED' THEN 'demo_generated'
         END AS generator,
         max((qv.snapshot->>'totalCost')::numeric) FILTER (WHERE qv.snapshot ? 'totalCost') AS total_cost
  FROM public.quotes q
  JOIN public.quote_versions qv ON qv.quote_id = q.id
  GROUP BY q.id, q.rfq_id, q.supplier_id, q.status, q.created_at, q.source
)
SELECT r.id                          AS rfq_id,
       r.public_ref                  AS rfq_number,
       r.title                       AS rfq_title,
       o.name                        AS owner_org,
       o.is_demo                     AS owner_org_is_demo,
       r.is_demo                     AS rfq_is_demo,
       r.status                      AS rfq_status,
       r.created_at                  AS rfq_created_at,
       count(f.id)                   AS fabricated_quotes,
       string_agg(DISTINCT f.generator, ', ')                      AS generators,
       min(f.created_at)             AS first_fabricated_at,
       string_agg(DISTINCT s.business_name, ' | ')                 AS supplier_names,
       min(f.total_cost)             AS min_total_inr,
       max(f.total_cost)             AS max_total_inr,
       bool_or(f.status::text = 'SELECTED')                         AS any_selected,
       bool_or(EXISTS (SELECT 1 FROM public.awards a WHERE a.quote_id = f.id))                     AS any_awarded,
       bool_or(EXISTS (SELECT 1 FROM public.awards a JOIN public.purchase_orders po ON po.award_id = a.id
                       WHERE a.quote_id = f.id))                                                  AS any_po,
       bool_or(EXISTS (SELECT 1 FROM public.committee_votes cv WHERE cv.recommended_quote_id = f.id)) AS any_committee_vote,
       (SELECT count(*) FROM public.quotes q2 WHERE q2.rfq_id = r.id)                             AS all_quotes_on_rfq
FROM fab f
JOIN public.rfqs r            ON r.id = f.rfq_id
LEFT JOIN public.organizations o ON o.id = r.organization_id
LEFT JOIN public.suppliers s     ON s.id = f.supplier_id
WHERE f.generator IS NOT NULL
GROUP BY r.id, r.public_ref, r.title, o.name, o.is_demo, r.is_demo, r.status, r.created_at
ORDER BY r.is_demo, first_fabricated_at;


-- Q3. Per quote detail (every fabricated quote) ---------------------------------
WITH fab AS (
  SELECT q.id,
         CASE
           WHEN bool_or(qv.snapshot->>'simulated' = 'true' AND qv.snapshot ? 'tierName') THEN 'seed_simulated'
           WHEN bool_or(COALESCE(qv.snapshot->>'quoteNotes', qv.notes) IN (
                  'Standard verified tier: Complete delivery, professional setup, and dedicated on-site support included.',
                  'Premium grade tier: Grade-A seasoned materials, expedited 48-hour delivery, zero transit damage guarantee.',
                  'Cost-optimized commercial tier: High volume economy pricing, standard clearing and return logistics.',
                  'Regional fast-track tier: Local warehouse stock ready for immediate dispatch with same-day setup assistance.',
                  'Enterprise specialist tier: ISO certified manufacturing, dedicated technical account manager.'))
                THEN 'auto_submit_pilot'
           WHEN bool_or(qv.snapshot->>'simulated' = 'true') THEN 'simulated_other'
           WHEN q.source::text = 'DEMO_GENERATED' THEN 'demo_generated'
         END AS generator
  FROM public.quotes q
  JOIN public.quote_versions qv ON qv.quote_id = q.id
  GROUP BY q.id, q.source
)
SELECT r.public_ref AS rfq_number, r.id AS rfq_id, r.is_demo AS rfq_is_demo,
       q.id AS quote_id, f.generator, q.status AS quote_status, q.source, q.is_demo AS quote_is_demo,
       q.created_at, q.submitted_at,
       s.business_name AS supplier, s.id AS supplier_id, s.is_demo AS supplier_is_demo,
       s.contact_email AS supplier_email,
       qv.snapshot->>'tierName'      AS tier_name,
       (qv.snapshot->>'basePrice')::numeric AS base_price,
       (qv.snapshot->>'gstAmount')::numeric AS gst,
       (qv.snapshot->>'totalCost')::numeric AS total_cost,
       qv.snapshot->>'simulated'     AS snapshot_simulated_flag,
       a.id AS award_id, a.status AS award_status,
       po.id AS po_id, po.po_number, po.status AS po_status,
       EXISTS (SELECT 1 FROM public.committee_votes cv WHERE cv.recommended_quote_id = q.id) AS committee_recommended
FROM fab f
JOIN public.quotes q ON q.id = f.id
JOIN public.rfqs r   ON r.id = q.rfq_id
LEFT JOIN public.suppliers s ON s.id = q.supplier_id
LEFT JOIN public.quote_versions qv ON qv.quote_id = q.id AND qv.version = q.current_version
LEFT JOIN public.awards a ON a.quote_id = q.id
LEFT JOIN public.purchase_orders po ON po.award_id = a.id
WHERE f.generator IS NOT NULL
ORDER BY r.is_demo, r.created_at, q.created_at;


-- Q4. Invitations that look simulator-created -----------------------------------
SELECT r.public_ref AS rfq_number, r.id AS rfq_id, r.is_demo AS rfq_is_demo,
       i.id AS invitation_id, i.status AS invitation_status, i.invited_at, i.anonymous_label,
       s.business_name AS supplier, s.id AS supplier_id, s.is_demo AS supplier_is_demo, s.contact_email,
       i.match_score, s.rating_avg,
       CASE
         WHEN i.match_score = LEAST(98.0, 78.0 + COALESCE(s.rating_avg, 4.0) * 4.0) THEN 'seed_simulated_quotes_for_rfq'
         WHEN i.match_score = COALESCE(s.rating_avg, 4.0) * 20                     THEN 'discover_and_invite fallback'
         ELSE 'unknown (same match_reasons)'
       END AS likely_source,
       (SELECT q.id FROM public.quotes q WHERE q.invitation_id = i.id LIMIT 1) AS quote_id
FROM public.rfq_invitations i
JOIN public.rfqs r      ON r.id = i.rfq_id
JOIN public.suppliers s ON s.id = i.supplier_id
WHERE i.match_reasons = ARRAY['category_match', 'verified_active']::text[]
ORDER BY r.is_demo, r.created_at, i.invited_at;


-- Q5. Known audit RFQ 1d84a7c2-11e2-4a47-bf9a-6dce86d1e6cb ----------------------
SELECT 'rfq' AS kind, r.id::text AS id, r.public_ref AS ref, r.status::text AS status,
       r.is_demo::text AS is_demo, r.created_at AS at,
       jsonb_build_object('title', r.title, 'owner_org', o.name, 'owner_org_is_demo', o.is_demo) AS detail
FROM public.rfqs r LEFT JOIN public.organizations o ON o.id = r.organization_id
WHERE r.id = '1d84a7c2-11e2-4a47-bf9a-6dce86d1e6cb'
UNION ALL
SELECT 'invitation', i.id::text, i.anonymous_label, i.status::text, s.is_demo::text, i.invited_at,
       jsonb_build_object('supplier', s.business_name, 'match_score', i.match_score, 'match_reasons', i.match_reasons)
FROM public.rfq_invitations i JOIN public.suppliers s ON s.id = i.supplier_id
WHERE i.rfq_id = '1d84a7c2-11e2-4a47-bf9a-6dce86d1e6cb'
UNION ALL
SELECT 'quote', q.id::text, s.business_name, q.status::text, q.is_demo::text, q.created_at,
       jsonb_build_object('source', q.source, 'simulated', qv.snapshot->>'simulated', 'tierName', qv.snapshot->>'tierName',
                          'notes', qv.notes, 'totalCost', qv.snapshot->>'totalCost')
FROM public.quotes q
LEFT JOIN public.suppliers s ON s.id = q.supplier_id
LEFT JOIN public.quote_versions qv ON qv.quote_id = q.id AND qv.version = q.current_version
WHERE q.rfq_id = '1d84a7c2-11e2-4a47-bf9a-6dce86d1e6cb'
UNION ALL
SELECT 'award', a.id::text, a.quote_id::text, a.status::text, NULL, a.awarded_at, NULL
FROM public.awards a WHERE a.rfq_id = '1d84a7c2-11e2-4a47-bf9a-6dce86d1e6cb'
UNION ALL
SELECT 'purchase_order', po.id::text, po.po_number, po.status::text, po.is_demo::text, po.created_at,
       jsonb_build_object('total_amount', po.total_amount)
FROM public.purchase_orders po WHERE po.rfq_id = '1d84a7c2-11e2-4a47-bf9a-6dce86d1e6cb'
UNION ALL
SELECT 'audit_event', e.id::text, e.event_type, NULL, e.is_demo::text, e.occurred_at, e.payload
FROM public.audit_events e
WHERE e.entity_id = '1d84a7c2-11e2-4a47-bf9a-6dce86d1e6cb'
ORDER BY 1, 6;


-- Q6. Seeded / demo supplier orgs ------------------------------------------------
-- Stable markers from the seed migrations (00058..00111, 00138, 00184):
--   suppliers.id in the 0d500000-0000-4000-8000-* block, contact_email on a
--   *.test domain (otpdemo.test, *-*.test), or is_demo = true.
-- "invited_on_real_rfqs" / "quotes_on_real_rfqs" show how far each one leaked.
SELECT s.id, s.business_name, s.contact_email, s.is_demo, s.status, s.verification_status,
       s.rating_avg, s.source, s.created_at,
       concat_ws(',',
         CASE WHEN s.id::text LIKE '0d500000-0000-4000-8000-%' THEN 'seed_id_block' END,
         CASE WHEN s.contact_email ILIKE '%.test' THEN 'test_email_domain' END,
         CASE WHEN s.is_demo THEN 'is_demo' END) AS markers,
       (SELECT count(*) FROM public.rfq_invitations i JOIN public.rfqs r ON r.id = i.rfq_id
         WHERE i.supplier_id = s.id AND NOT r.is_demo)                                  AS invited_on_real_rfqs,
       (SELECT count(*) FROM public.quotes q JOIN public.rfqs r ON r.id = q.rfq_id
         WHERE q.supplier_id = s.id AND NOT r.is_demo)                                  AS quotes_on_real_rfqs,
       (SELECT count(*) FROM public.supplier_users su WHERE su.supplier_id = s.id)      AS login_users
FROM public.suppliers s
WHERE s.id::text LIKE '0d500000-0000-4000-8000-%'
   OR s.contact_email ILIKE '%.test'
   OR s.is_demo
ORDER BY s.is_demo, s.rating_avg DESC NULLS LAST;


-- Q7. Seeded logins in auth.users (email, created_at, last_sign_in_at only) ------
SELECT u.email, u.created_at, u.last_sign_in_at
FROM auth.users u
WHERE u.email ILIKE '%.test'
   OR u.email ILIKE '%@otpdemo.%'
   OR lower(u.email) IN ('admin@otp.test', 'bvnbasu@gmail.com', 'ops@otp.test', 'superadmin@otp.test',
                         'admin@otp.ai', 'ops@otp.ai', 'admin@procureos.test')
   OR u.id::text LIKE '0dc_0000-0000-4000-8000-%'
ORDER BY u.last_sign_in_at DESC NULLS LAST, u.email;


-- Q8. Accounts still on a shared, publicly-known password (counts only) ---------
-- 'Welcome@OTP2026!' is admin_review_signup_request's default p_initial_password
-- (00161); 'password' is the seed/demo password. Read-only crypt() comparison.
SELECT CASE WHEN u.email ILIKE '%.test' OR u.email ILIKE '%@otpdemo.%' THEN 'seeded/test login' ELSE 'other login' END AS bucket,
       count(*) FILTER (WHERE u.encrypted_password = extensions.crypt('Welcome@OTP2026!', u.encrypted_password)) AS on_welcome_default,
       count(*) FILTER (WHERE u.encrypted_password = extensions.crypt('password', u.encrypted_password))         AS on_password_password,
       count(*) AS total
FROM auth.users u
WHERE u.encrypted_password LIKE '$2%'
GROUP BY 1
ORDER BY 1;
