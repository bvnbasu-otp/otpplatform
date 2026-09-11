-- Job roles for the demo cast.
--
-- Runs after seed_demo_environment.sql, and matters more than it looks. Without
-- roles every demo account falls through the grandfather clause in
-- private.has_role_permission and the role layer is invisible — the demo would
-- show a badge and prove nothing.
--
-- Each title is chosen to match what that persona actually does in the seeded
-- scenarios, because a title that contradicts a persona's own script is worse
-- than no title: the demo would break on the first click.
--
-- Two arrangements here are for the sake of the demonstration:
--
--   * Two accounts hold two roles, so the view switcher has something real to
--     switch. The Sunrise secretary can drop into a read-only auditor view of
--     their own society's tender; the Sri Lakshmi finance member sits on the
--     committee and also carries the finance approver hat.
--   * member2@sunrise.test is deliberately left with no role, so the mandatory
--     onboarding screen can be shown by signing in as her. She can still vote,
--     because an account with no role yet is not restricted — that grandfathering
--     is exactly what the onboarding gate exists to end.
--
-- Accounts are addressed by email rather than by id. The seed holds both an auth
-- id and a profile id for each person, they differ by one character, and picking
-- the wrong one fails a foreign key at the far end of a long reset.

INSERT INTO profile_roles (profile_id, role_code, is_demo)
SELECT p.id, r.role_code, true
FROM profiles p
JOIN (VALUES
  -- Sunrise Residency (community). The secretary runs sourcing; the committee
  -- votes and signs off. The auditor role is her second hat, for the switcher.
  ('secretary@sunrise.test',        'FACILITY_MANAGER'),
  ('secretary@sunrise.test',        'GENERAL_AUDITOR'),
  ('treasurer@sunrise.test',        'COMMITTEE_MEMBER'),
  ('member1@sunrise.test',          'COMMITTEE_MEMBER'),
  -- member2@sunrise.test intentionally has no role. See the note above.

  -- Kovai Precision (MSME). Owner-operator plus one partner.
  ('owner@kovaiprecision.test',     'PROCUREMENT_LEAD'),
  ('partner@kovaiprecision.test',   'COMMITTEE_MEMBER'),

  -- Sri Lakshmi Mills (enterprise). A procurement function, a quality voice and
  -- a finance voice who also approves the money.
  ('procurement@srilakshmi.test',   'PROCUREMENT_LEAD'),
  ('quality@srilakshmi.test',       'COMMITTEE_MEMBER'),
  ('finance@srilakshmi.test',       'COMMITTEE_MEMBER'),
  ('finance@srilakshmi.test',       'FINANCE_APPROVER'),

  -- Bharathi Agro (individual). One person doing every buying job themselves,
  -- which is why the operational title rather than Property Owner: the read-only
  -- role would leave this account unable to raise the enquiry it is seeded to own.
  ('bharathi@agrotrade.test',       'PROCUREMENT_LEAD')
) AS r(email, role_code) ON r.email = p.email
ON CONFLICT (profile_id, role_code) DO NOTHING;

-- Every demo supplier account is the person who owns the business and prices the
-- work, which is the common case in this market: a proprietor with a phone.
INSERT INTO profile_roles (profile_id, role_code, is_demo)
SELECT su.profile_id, 'SUPPLIER_FOUNDER', true
FROM supplier_users su
JOIN profiles p ON p.id = su.profile_id
WHERE p.is_demo
ON CONFLICT (profile_id, role_code) DO NOTHING;

-- One supplier also carries a technical lead hat, so the supplier-side switcher
-- can show commercial authority being set down: as technical lead the same person
-- can attach a certificate but cannot put a price in front of a buyer.
INSERT INTO profile_roles (profile_id, role_code, is_demo)
SELECT su.profile_id, 'SUPPLIER_TECHNICAL_LEAD', true
FROM supplier_users su
JOIN profiles p ON p.id = su.profile_id
WHERE p.email = 'supplier01@otpdemo.test'
ON CONFLICT (profile_id, role_code) DO NOTHING;

-- The role in force. Where an account holds two, the operational one leads and
-- the second is reached through the switcher.
UPDATE profiles p SET active_role_code = v.role_code
FROM (VALUES
  ('secretary@sunrise.test',        'FACILITY_MANAGER'),
  ('treasurer@sunrise.test',        'COMMITTEE_MEMBER'),
  ('member1@sunrise.test',          'COMMITTEE_MEMBER'),
  ('owner@kovaiprecision.test',     'PROCUREMENT_LEAD'),
  ('partner@kovaiprecision.test',   'COMMITTEE_MEMBER'),
  ('procurement@srilakshmi.test',   'PROCUREMENT_LEAD'),
  ('quality@srilakshmi.test',       'COMMITTEE_MEMBER'),
  ('finance@srilakshmi.test',       'COMMITTEE_MEMBER'),
  ('bharathi@agrotrade.test',       'PROCUREMENT_LEAD')
) AS v(email, role_code)
WHERE p.email = v.email;

UPDATE profiles p SET active_role_code = 'SUPPLIER_FOUNDER'
WHERE p.is_demo
  AND p.active_role_code IS NULL
  AND EXISTS (SELECT 1 FROM supplier_users su WHERE su.profile_id = p.id);
