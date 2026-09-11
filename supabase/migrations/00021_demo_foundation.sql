-- Demo foundation: demo tagging, buyer-type voting power and the demo account
-- registry.
--
-- Two principles drive the shape of this:
--   1. Demo data is TAGGED, never hard-coded. Nothing in the UI knows a
--      Greenview id; the demo dashboard and quick-login read these tables.
--   2. Voting power is a server-side fact. It is stamped onto each vote from
--      the voter's organization type at the moment the vote is cast, so an
--      audit years later shows the power that actually applied, and a crafted
--      request cannot inflate it.

-- ---------------------------------------------------------------------------
-- Demo tagging
-- ---------------------------------------------------------------------------

ALTER TABLE organizations ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE profiles      ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE suppliers     ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE requirements  ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE rfqs          ADD COLUMN is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX idx_organizations_demo ON organizations (is_demo) WHERE is_demo;
CREATE INDEX idx_suppliers_demo ON suppliers (is_demo) WHERE is_demo;
CREATE INDEX idx_requirements_demo ON requirements (is_demo) WHERE is_demo;
CREATE INDEX idx_rfqs_demo ON rfqs (is_demo) WHERE is_demo;

-- Audit is append-only, so demo resets cannot delete history. Tagging each
-- event with the run that produced it lets the demo present a clean slate
-- while the trail stays intact.
ALTER TABLE audit_events ADD COLUMN demo_run_id uuid;
CREATE INDEX idx_audit_events_demo_run ON audit_events (demo_run_id) WHERE demo_run_id IS NOT NULL;

COMMENT ON COLUMN audit_events.demo_run_id IS
  'Demo run that produced this event. Demo reset starts a new run rather than deleting audit rows, which would break the append-only invariant.';

-- ---------------------------------------------------------------------------
-- Demo settings — one row
-- ---------------------------------------------------------------------------

CREATE TABLE demo_settings (
  id                  boolean PRIMARY KEY DEFAULT true,
  demo_mode_enabled   boolean NOT NULL DEFAULT true,
  -- Seed for reproducible simulated quotes. Same seed, same numbers.
  demo_seed           text NOT NULL DEFAULT 'otp-demo-2026',
  current_run_id      uuid NOT NULL DEFAULT gen_random_uuid(),
  last_reset_at       timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demo_settings_single_row CHECK (id)
);

INSERT INTO demo_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TRIGGER demo_settings_updated_at
  BEFORE UPDATE ON demo_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION private.demo_run_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT current_run_id FROM demo_settings WHERE id;
$$;

CREATE OR REPLACE FUNCTION private.demo_mode_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT demo_mode_enabled FROM demo_settings WHERE id), false);
$$;

-- Stamp demo audit events with the current run.
CREATE OR REPLACE FUNCTION private.audit_stamp_demo_run()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.demo_run_id IS NULL AND NEW.organization_id IS NOT NULL THEN
    SELECT CASE WHEN o.is_demo THEN private.demo_run_id() END
    INTO NEW.demo_run_id
    FROM organizations o
    WHERE o.id = NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_events_stamp_demo_run
  BEFORE INSERT ON audit_events
  FOR EACH ROW EXECUTE FUNCTION private.audit_stamp_demo_run();

-- ---------------------------------------------------------------------------
-- Buyer type configuration and voting power
--
-- Voting power reflects who carries the consequences of the decision: an
-- individual buys for themselves, a residents' association decides for many
-- households, an enterprise committee for the whole business.
-- ---------------------------------------------------------------------------

CREATE TABLE buyer_type_config (
  org_type      org_type PRIMARY KEY,
  label         text NOT NULL,
  description   text,
  voting_power  integer NOT NULL CHECK (voting_power > 0),
  default_committee_size integer NOT NULL DEFAULT 1 CHECK (default_committee_size > 0),
  sort_order    integer NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO buyer_type_config
  (org_type, label, description, voting_power, default_committee_size, sort_order) VALUES
  ('INDIVIDUAL', 'Individual',
   'A person buying for themselves. Decides alone.', 1, 1, 1),
  ('MSME', 'MSME / small business',
   'Owner-run business. Owner decides, sometimes with a partner.', 2, 2, 2),
  ('COMMUNITY', 'Community / RWA',
   'Residents association or society deciding on behalf of many households.', 3, 5, 3),
  ('INSTITUTION', 'Institution',
   'School, hospital or trust with a purchase committee.', 3, 5, 4),
  ('ENTERPRISE', 'Enterprise',
   'Formal procurement committee with delegated authority.', 4, 5, 5);

CREATE TRIGGER buyer_type_config_updated_at
  BEFORE UPDATE ON buyer_type_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Voting power on committee votes
-- ---------------------------------------------------------------------------

ALTER TABLE committee_votes
  ADD COLUMN voting_power integer,
  ADD COLUMN buyer_type org_type;

COMMENT ON COLUMN committee_votes.voting_power IS
  'Stamped server-side from the voter organization buyer type at cast time. Client-supplied values are ignored.';

CREATE OR REPLACE FUNCTION private.stamp_vote_power()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_type org_type;
  v_power    integer;
BEGIN
  SELECT o.org_type INTO v_org_type
  FROM rfqs r
  JOIN organizations o ON o.id = r.organization_id
  WHERE r.id = NEW.rfq_id;

  IF v_org_type IS NULL THEN
    RAISE EXCEPTION 'Cannot resolve buyer type for RFQ %', NEW.rfq_id;
  END IF;

  SELECT voting_power INTO v_power
  FROM buyer_type_config
  WHERE org_type = v_org_type;

  -- Whatever the client sent is discarded.
  NEW.buyer_type := v_org_type;
  NEW.voting_power := COALESCE(v_power, 1);

  RETURN NEW;
END;
$$;

CREATE TRIGGER committee_votes_stamp_power
  BEFORE INSERT ON committee_votes
  FOR EACH ROW EXECUTE FUNCTION private.stamp_vote_power();

-- Backfill votes cast before this column existed.
--
-- committee_votes is immutable by trigger (INV-095), which is exactly what we
-- want at runtime. A schema migration adding a column is the one case where
-- the guard has to stand aside: the alternative is leaving legacy votes with a
-- NULL power that the tally would silently read as 1, understating a community
-- vote. The guard is re-armed immediately.
ALTER TABLE committee_votes DISABLE TRIGGER USER;

UPDATE committee_votes cv
SET buyer_type = o.org_type,
    voting_power = COALESCE(b.voting_power, 1)
FROM rfqs r
JOIN organizations o ON o.id = r.organization_id
LEFT JOIN buyer_type_config b ON b.org_type = o.org_type
WHERE r.id = cv.rfq_id
  AND cv.voting_power IS NULL;

ALTER TABLE committee_votes ENABLE TRIGGER USER;

-- ---------------------------------------------------------------------------
-- Demo account registry
--
-- The quick-login screen reads this instead of a hard-coded map in the client.
-- Passwords are never stored here: the shared demo password comes from the
-- environment.
-- ---------------------------------------------------------------------------

CREATE TABLE demo_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL UNIQUE,
  label           text NOT NULL,
  persona         text NOT NULL,
  description     text,
  organization_id uuid REFERENCES organizations (id) ON DELETE CASCADE,
  supplier_id     uuid REFERENCES suppliers (id) ON DELETE CASCADE,
  profile_id      uuid REFERENCES profiles (id) ON DELETE CASCADE,
  scenario_code   text,
  sort_order      integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demo_accounts_persona_valid CHECK (
    persona IN ('BUYER_OWNER', 'BUYER_MANAGER', 'BUYER_MEMBER', 'COMMITTEE', 'SUPPLIER', 'ADMIN')
  ),
  CONSTRAINT demo_accounts_side CHECK (
    (supplier_id IS NOT NULL AND organization_id IS NULL)
    OR (supplier_id IS NULL AND organization_id IS NOT NULL)
  )
);

CREATE INDEX idx_demo_accounts_active ON demo_accounts (is_active, sort_order);

-- Demo scenarios, so the dashboard can describe what each one demonstrates.
CREATE TABLE demo_scenarios (
  code            text PRIMARY KEY,
  title           text NOT NULL,
  narrative       text NOT NULL,
  buyer_type      org_type NOT NULL,
  organization_id uuid REFERENCES organizations (id) ON DELETE CASCADE,
  requirement_id  uuid REFERENCES requirements (id) ON DELETE SET NULL,
  rfq_id          uuid REFERENCES rfqs (id) ON DELETE SET NULL,
  stage_label     text NOT NULL,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Public demo status and account list
--
-- The login screen is unauthenticated, so the account list must be readable
-- by anon — but only while demo mode is on, and only labels and emails. No
-- credential material lives here.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.demo_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'enabled', COALESCE((SELECT demo_mode_enabled FROM demo_settings WHERE id), false),
    'run_id', (SELECT current_run_id FROM demo_settings WHERE id),
    'last_reset_at', (SELECT last_reset_at FROM demo_settings WHERE id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.demo_status() TO anon, authenticated;

CREATE OR REPLACE VIEW demo_login_options
WITH (security_barrier = true) AS
SELECT
  d.email,
  d.label,
  d.persona,
  d.description,
  d.scenario_code,
  d.sort_order,
  COALESCE(o.name, s.business_name) AS party_name,
  o.org_type AS buyer_type,
  b.label AS buyer_type_label,
  b.voting_power
FROM demo_accounts d
LEFT JOIN organizations o ON o.id = d.organization_id
LEFT JOIN suppliers s ON s.id = d.supplier_id
LEFT JOIN buyer_type_config b ON b.org_type = o.org_type
WHERE d.is_active
  AND private.demo_mode_enabled();

GRANT SELECT ON demo_login_options TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE demo_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyer_type_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY demo_settings_select ON demo_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY demo_settings_write ON demo_settings
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

CREATE POLICY demo_accounts_select ON demo_accounts
  FOR SELECT TO authenticated USING (private.demo_mode_enabled());
CREATE POLICY demo_accounts_write ON demo_accounts
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

CREATE POLICY demo_scenarios_select ON demo_scenarios
  FOR SELECT TO authenticated USING (private.demo_mode_enabled());
CREATE POLICY demo_scenarios_write ON demo_scenarios
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

CREATE POLICY buyer_type_config_select ON buyer_type_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY buyer_type_config_write ON buyer_type_config
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

GRANT SELECT ON demo_settings, demo_accounts, demo_scenarios, buyer_type_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON demo_settings, demo_accounts, demo_scenarios,
  buyer_type_config TO service_role;
