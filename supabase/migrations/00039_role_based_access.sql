-- Job roles, and what they are allowed to do.
--
-- The platform already had authorization before this migration, and it is worth
-- being precise about what that was, because this file must not quietly replace
-- it. Access today comes from three places: organization_members.role
-- (OWNER/MANAGER/BUYER/APPROVER/COMMITTEE_MEMBER), a per-RFQ row in
-- committee_assignments, and membership in supplier_users. Those are structural
-- facts about a person's relationship to an organization or a supplier, and RLS
-- reads them directly.
--
-- What was missing is the thing a person would actually say when asked what they
-- do: "I am the treasurer", "I am the auditor", "I run sales". That is what this
-- adds, and it is genuinely useful for two reasons. It lets the interface show
-- someone the four things they came to do instead of forty. And it lets an
-- organization express a restriction the database previously had no way to hold:
-- an auditor who may read everything and change nothing.
--
-- The rule that keeps this safe is that a role only ever narrows. A role is
-- intersected with the existing checks, never substituted for them:
--
--   * A title cannot grant a vote. Voting still requires a committee assignment
--     on that specific RFQ. Someone titled "Managing Committee Member" who was
--     never assigned to an RFQ cannot vote on it, and the interface must not
--     imply otherwise.
--   * A title cannot grant a write. An auditor titled "Procurement Lead" by
--     mistake still cannot publish, because their org role is still checked.
--   * A title CAN take a permission away, and that is the point.
--
-- Enforcement lives in triggers rather than in each RPC. Several privileged
-- actions run through SECURITY DEFINER functions that deliberately bypass RLS,
-- so a policy-only implementation would be enforced on the direct table path and
-- silently skipped on the RPC path. A trigger fires on both. It also means there
-- is one list of enforcement points to review, at the bottom of this file,
-- instead of a condition scattered through a dozen functions.

-- ---------------------------------------------------------------------------
-- Permissions
--
-- Six verbs, taken from the product specification. They are deliberately coarse:
-- the fine-grained question ("may this person act on THIS rfq?") is already
-- answered by org membership and committee assignment, and duplicating that here
-- would create two answers that can disagree.
-- ---------------------------------------------------------------------------

CREATE TYPE role_permission AS ENUM (
  'READ',     -- see the workspace they belong to
  'WRITE',    -- create and edit requirements, drafts, uploads
  'PROPOSE',  -- put something forward for decision: publish an RFQ, submit a bid
  'VOTE',     -- record a committee recommendation
  'APPROVE',  -- sign off money: issue a PO, release a payment
  'AWARD'     -- lock an award
);

-- ---------------------------------------------------------------------------
-- The catalogue of roles
--
-- A table rather than an enum. Organizations will want titles this list does not
-- have, and an enum makes every addition a migration. A row also carries the
-- label and description the interface shows, so the dropdown is server-defined
-- and cannot drift from what the server enforces.
-- ---------------------------------------------------------------------------

CREATE TABLE user_roles (
  code        text PRIMARY KEY,
  -- Which portal the role belongs to. A buying organization has no use for
  -- "Sales Manager", and offering it would produce accounts whose stated job
  -- has nothing to do with what they can reach.
  side        signup_side NOT NULL,
  label       text NOT NULL,
  description text NOT NULL,
  permissions role_permission[] NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- Every role can read. A role that cannot read is an account that cannot be
  -- used, which is a deactivation, not a job title.
  CONSTRAINT user_roles_can_read
    CHECK ('READ'::role_permission = ANY (permissions)),
  CONSTRAINT user_roles_label_present CHECK (btrim(label) <> '')
);

COMMENT ON TABLE user_roles IS
  'The job roles a person can hold, and the permissions each one implies. Permissions here are a ceiling, intersected with org role and committee assignment at enforcement time.';

-- Buyer side. Note where AWARD and APPROVE sit: with the people who run the
-- process, because in this product locking an award and issuing a PO are
-- operational acts. The governance check on those acts is the committee vote and
-- the approval policy, both of which are separate mechanisms that this does not
-- weaken.
INSERT INTO user_roles (code, side, label, description, permissions, sort_order) VALUES
  ('FACILITY_MANAGER', 'BUYER', 'Facility Manager',
   'Runs the sourcing process end to end: raises requirements, sets deadlines and criteria, handles supplier questions.',
   ARRAY['READ','WRITE','PROPOSE','APPROVE','AWARD']::role_permission[], 10),

  ('PROCUREMENT_LEAD', 'BUYER', 'Procurement Lead',
   'Full operational access to sourcing: creates and edits enquiries, sets weightage, manages Q&A, recommends a shortlist.',
   ARRAY['READ','WRITE','PROPOSE','APPROVE','AWARD']::role_permission[], 20),

  ('COMMITTEE_MEMBER', 'BUYER', 'Managing Committee Member / Director',
   'Decision and governance: compares bids side by side, votes on the shortlist, signs off purchase orders. Does not raise enquiries.',
   ARRAY['READ','VOTE','APPROVE']::role_permission[], 30),

  ('OPERATIONS_MANAGER', 'BUYER', 'Operations Manager',
   'Day-to-day execution: raises requirements and tracks delivery. Does not authorise awards or payments.',
   ARRAY['READ','WRITE','PROPOSE']::role_permission[], 40),

  ('FINANCE_APPROVER', 'BUYER', 'Finance / Accounts Approver',
   'Financial view: budget allocations, itemised bid breakdowns, payment schedules, approved orders. Approves money, does not source.',
   ARRAY['READ','APPROVE']::role_permission[], 50),

  ('PROPERTY_OWNER', 'BUYER', 'Property Owner',
   'Read-only governance: follows progress, votes are visible, nothing can be changed.',
   ARRAY['READ']::role_permission[], 60),

  ('GENERAL_AUDITOR', 'BUYER', 'General Auditor',
   'Read-only oversight: the audit trail, committee votes and execution milestones. Cannot act anywhere.',
   ARRAY['READ']::role_permission[], 70);

-- Supplier side. The distinction that matters commercially is who may commit the
-- business to a price: a technical lead can attach a certificate and close out a
-- milestone, but cannot put a number in front of a buyer.
INSERT INTO user_roles (code, side, label, description, permissions, sort_order) VALUES
  ('SUPPLIER_FOUNDER', 'SUPPLIER', 'Founder / Owner',
   'Commercial authority: authorises bids, negotiates, accepts awarded orders, sees the buyer once identities are revealed.',
   ARRAY['READ','WRITE','PROPOSE','APPROVE']::role_permission[], 10),

  ('SUPPLIER_BD_HEAD', 'SUPPLIER', 'Business Development Head',
   'Commercial authority alongside the owner: authorises bids, negotiates, accepts awarded orders.',
   ARRAY['READ','WRITE','PROPOSE','APPROVE']::role_permission[], 20),

  ('SUPPLIER_SALES_MANAGER', 'SUPPLIER', 'Sales Manager',
   'Lead management: drafts and submits quotes, answers buyer questions, revises pricing. Cannot accept an awarded order.',
   ARRAY['READ','WRITE','PROPOSE']::role_permission[], 30),

  ('SUPPLIER_TECHNICAL_LEAD', 'SUPPLIER', 'Technical Lead / Project Manager',
   'Execution: uploads compliance and technical documents, submits milestone completions and proof. No commercial authority.',
   ARRAY['READ','WRITE']::role_permission[], 40),

  ('SUPPLIER_FINANCE', 'SUPPLIER', 'Billing & Finance Manager',
   'Billing: raises invoices against completed work and tracks payment. Does not price bids.',
   ARRAY['READ','WRITE','APPROVE']::role_permission[], 50);

-- ---------------------------------------------------------------------------
-- Who holds which role
--
-- A table rather than a column, because the specification asks for accounts that
-- hold more than one role and can switch between them. One person, several
-- roles, one active at a time.
-- ---------------------------------------------------------------------------

CREATE TABLE profile_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  role_code   text NOT NULL REFERENCES user_roles (code),
  -- NULL when the person chose it themselves at onboarding; set when an admin
  -- granted it. Worth keeping: "who decided this person may approve payments"
  -- is a question an auditor will ask.
  assigned_by uuid REFERENCES profiles (id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  is_demo     boolean NOT NULL DEFAULT false,
  UNIQUE (profile_id, role_code)
);

CREATE INDEX idx_profile_roles_profile ON profile_roles (profile_id);

COMMENT ON TABLE profile_roles IS
  'Roles held by a person. Several are allowed; profiles.active_role_code decides which one is in force.';

-- The role currently in force. Permissions come from this one alone, not from
-- the union of everything held — otherwise switching to the auditor view would
-- leave the write permissions quietly attached, and the switch would be a change
-- of menu rather than a change of authority.
ALTER TABLE profiles ADD COLUMN active_role_code text REFERENCES user_roles (code);

COMMENT ON COLUMN profiles.active_role_code IS
  'The role in force for this person right now. Permissions derive from this alone, so switching view genuinely changes what they can do.';

CREATE OR REPLACE FUNCTION private.assert_active_role_held()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.active_role_code IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM profile_roles pr
       WHERE pr.profile_id = NEW.id AND pr.role_code = NEW.active_role_code
     ) THEN
    RAISE EXCEPTION 'A person cannot act in a role they have not been given (%)',
      NEW.active_role_code;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_active_role_held
  BEFORE INSERT OR UPDATE OF active_role_code ON profiles
  FOR EACH ROW EXECUTE FUNCTION private.assert_active_role_held();

-- ---------------------------------------------------------------------------
-- Which side of the market a person is on
--
-- Derived, never asserted by the client. Mirrors the precedence the web app
-- already uses: a supplier linkage wins, because an account linked to a supplier
-- is a supplier account regardless of anything else.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.profile_side(p_profile_id uuid DEFAULT NULL)
RETURNS signup_side
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM supplier_users su
      WHERE su.profile_id = COALESCE(p_profile_id, private.get_profile_id())
    ) THEN 'SUPPLIER'::signup_side
    WHEN EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.profile_id = COALESCE(p_profile_id, private.get_profile_id())
    ) THEN 'BUYER'::signup_side
    ELSE NULL
  END;
$$;

-- ---------------------------------------------------------------------------
-- The permission question
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.active_role_permissions()
RETURNS role_permission[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.permissions
  FROM profiles p
  JOIN user_roles ur ON ur.code = COALESCE(
    p.active_role_code,
    -- Someone holding exactly one role has not needed to choose an active one.
    (SELECT pr.role_code FROM profile_roles pr
     WHERE pr.profile_id = p.id
     LIMIT 1)
  )
  WHERE p.id = private.get_profile_id();
$$;

/**
 * Whether the caller's current role allows a verb.
 *
 * Three exemptions, each deliberate:
 *
 * Service-role callers have no profile, so get_profile_id() is NULL. Those are
 * seeds, edge functions and the messaging gateway — trusted infrastructure that
 * has already done its own authorization, and that has no job title to check.
 *
 * Platform admins are exempt for the same reason they are exempt everywhere else
 * in this schema: the flag exists to be able to fix things.
 *
 * A person with no role assigned at all is not restricted. This is the one
 * decision here that trades strictness for safety, and it is deliberate: the
 * alternative locks every existing account out of the product the moment this
 * migration runs. The onboarding gate in the application is what makes that
 * state temporary, and it is why the gate is mandatory rather than a prompt.
 */
CREATE OR REPLACE FUNCTION private.has_role_permission(p_permission role_permission)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile     uuid := private.get_profile_id();
  v_permissions role_permission[];
BEGIN
  IF v_profile IS NULL THEN RETURN true; END IF;
  IF private.is_platform_admin() THEN RETURN true; END IF;

  v_permissions := private.active_role_permissions();

  IF v_permissions IS NULL THEN RETURN true; END IF;

  RETURN p_permission = ANY (v_permissions);
END;
$$;

-- Demo staging and demo reset both replay a whole procurement lifecycle in one
-- transaction, acting for many people at once. Checking the caller's own role in
-- the middle of that would ask the wrong question of the wrong person.
CREATE OR REPLACE FUNCTION private.in_demo_write_window()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT private.in_demo_reset()
     OR COALESCE(current_setting('otp.demo_staging', true), 'off') = 'on';
$$;

CREATE OR REPLACE FUNCTION private.enforce_role_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_required role_permission := TG_ARGV[0]::role_permission;
BEGIN
  IF private.in_demo_write_window() THEN
    RETURN NEW;
  END IF;

  IF NOT private.has_role_permission(v_required) THEN
    RAISE EXCEPTION
      'Your role does not allow this action (% required on %)',
      v_required, TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Switch to a role with this permission, or ask an administrator to grant it.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.enforce_role_permission() IS
  'Narrows an already-authorized write by the caller''s current job role. Fires on both the direct table path and the SECURITY DEFINER RPC path, which RLS alone would not cover.';

-- ---------------------------------------------------------------------------
-- Reading a person's own role context
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.role_catalog(p_side signup_side DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'code', ur.code,
    'side', ur.side,
    'label', ur.label,
    'description', ur.description,
    'permissions', to_jsonb(ur.permissions)
  ) ORDER BY ur.sort_order), '[]'::jsonb)
  FROM user_roles ur
  WHERE ur.is_active
    AND (p_side IS NULL OR ur.side = p_side);
$$;

GRANT EXECUTE ON FUNCTION public.role_catalog(signup_side) TO anon, authenticated, service_role;

/**
 * Everything the interface needs to decide what to show this person.
 *
 * One call rather than several, because a header that renders the badge from one
 * query and the menu from another will disagree with itself for a moment after
 * a switch.
 *
 * needsOnboarding is the mandatory gate. It is true only when we know which side
 * of the market the person is on and they hold no role: someone with no
 * organization and no supplier link has nothing to be a role in yet, and
 * stopping them at a dropdown they cannot answer would be a dead end.
 */
CREATE OR REPLACE FUNCTION public.my_role_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid := private.get_profile_id();
  v_side    signup_side;
  v_active  text;
  v_roles   jsonb;
  v_admin   boolean;
  v_org     record;
BEGIN
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('signedIn', false);
  END IF;

  v_side := private.profile_side(v_profile);
  v_admin := private.is_platform_admin();

  SELECT p.active_role_code INTO v_active FROM profiles p WHERE p.id = v_profile;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'code', ur.code,
    'label', ur.label,
    'side', ur.side,
    'description', ur.description,
    'permissions', to_jsonb(ur.permissions),
    'assignedByAdmin', pr.assigned_by IS NOT NULL
  ) ORDER BY ur.sort_order), '[]'::jsonb)
  INTO v_roles
  FROM profile_roles pr
  JOIN user_roles ur ON ur.code = pr.role_code
  WHERE pr.profile_id = v_profile;

  -- A person holding one role has that role in force whether or not they ever
  -- chose it, so the badge is never blank for someone who has finished
  -- onboarding.
  IF v_active IS NULL AND jsonb_array_length(v_roles) = 1 THEN
    v_active := v_roles -> 0 ->> 'code';
  END IF;

  SELECT om.role::text AS org_role, o.id AS org_id, o.name AS org_name,
         o.org_type::text AS org_type
  INTO v_org
  FROM organization_members om
  JOIN organizations o ON o.id = om.organization_id
  WHERE om.profile_id = v_profile
  LIMIT 1;

  RETURN jsonb_build_object(
    'signedIn', true,
    'profileId', v_profile,
    'side', v_side,
    'isPlatformAdmin', v_admin,
    'needsOnboarding', (jsonb_array_length(v_roles) = 0 AND v_side IS NOT NULL AND NOT v_admin),
    'activeRole', (
      SELECT jsonb_build_object(
        'code', ur.code, 'label', ur.label, 'description', ur.description,
        'permissions', to_jsonb(ur.permissions))
      FROM user_roles ur WHERE ur.code = v_active
    ),
    'roles', v_roles,
    -- The structural facts, sent alongside the role so the interface can be
    -- honest about the difference. A committee title with no assignment on this
    -- enquiry means no vote, and the screen should say why.
    'orgRole', v_org.org_role,
    'organizationId', v_org.org_id,
    'organizationName', v_org.org_name,
    'buyerType', v_org.org_type,
    'committeeRfqCount', (
      SELECT count(*) FROM committee_assignments ca WHERE ca.profile_id = v_profile
    ),
    'supplierId', (
      SELECT su.supplier_id FROM supplier_users su
      WHERE su.profile_id = v_profile LIMIT 1
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_role_context() TO authenticated;

-- ---------------------------------------------------------------------------
-- Choosing a role, and switching between them
-- ---------------------------------------------------------------------------

/**
 * Onboarding. Self-service, and constrained to the side the person is actually
 * on, so a supplier account cannot title itself Procurement Lead.
 *
 * Only available while they hold nothing. Changing a role afterwards is an
 * administrative act, because a person who can re-title themselves at will has
 * no role at all — they have a menu of permissions.
 */
CREATE OR REPLACE FUNCTION public.assign_my_role(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid := private.get_profile_id();
  v_side    signup_side;
  v_role    user_roles%ROWTYPE;
BEGIN
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT * INTO v_role FROM user_roles WHERE code = p_code AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such role: %', p_code;
  END IF;

  v_side := private.profile_side(v_profile);
  IF v_side IS NULL THEN
    RAISE EXCEPTION 'This account is not linked to an organization or a supplier yet';
  END IF;

  IF v_role.side <> v_side THEN
    RAISE EXCEPTION 'That role belongs to the % portal', lower(v_role.side::text);
  END IF;

  IF EXISTS (SELECT 1 FROM profile_roles WHERE profile_id = v_profile) THEN
    RAISE EXCEPTION 'This account already has a role. Ask an administrator to change it.';
  END IF;

  INSERT INTO profile_roles (profile_id, role_code, is_demo)
  SELECT v_profile, p_code, p.is_demo FROM profiles p WHERE p.id = v_profile;

  UPDATE profiles SET active_role_code = p_code, updated_at = now()
  WHERE id = v_profile;

  INSERT INTO audit_events (event_type, actor_id, entity_type, entity_id, payload)
  VALUES ('profile.role_assigned', v_profile, 'profile', v_profile::text,
          jsonb_build_object('role', p_code, 'self', true));

  RETURN public.my_role_context();
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_my_role(text) TO authenticated;

/**
 * The view switcher, for accounts an administrator gave more than one role.
 *
 * This is not cosmetic: permissions come from the active role, so switching from
 * Procurement to Auditor really does drop the ability to publish until they
 * switch back. That is the honest reading of "switch active view", and it makes
 * the switcher useful for the case it exists for — reviewing your own
 * organization's work with your own writing hands tied.
 */
CREATE OR REPLACE FUNCTION public.switch_active_role(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid := private.get_profile_id();
BEGIN
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profile_roles
    WHERE profile_id = v_profile AND role_code = p_code
  ) THEN
    RAISE EXCEPTION 'You do not hold the role %', p_code;
  END IF;

  UPDATE profiles SET active_role_code = p_code, updated_at = now()
  WHERE id = v_profile;

  INSERT INTO audit_events (event_type, actor_id, entity_type, entity_id, payload)
  VALUES ('profile.role_switched', v_profile, 'profile', v_profile::text,
          jsonb_build_object('role', p_code));

  RETURN public.my_role_context();
END;
$$;

GRANT EXECUTE ON FUNCTION public.switch_active_role(text) TO authenticated;

/** Granting a second role, or correcting a wrong one. Administrators only. */
CREATE OR REPLACE FUNCTION public.admin_assign_profile_role(
  p_profile_id uuid,
  p_code       text,
  p_make_active boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := private.get_profile_id();
  v_role  user_roles%ROWTYPE;
  v_side  signup_side;
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a platform administrator can assign roles';
  END IF;

  SELECT * INTO v_role FROM user_roles WHERE code = p_code AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such role: %', p_code;
  END IF;

  v_side := private.profile_side(p_profile_id);
  IF v_side IS NOT NULL AND v_role.side <> v_side THEN
    RAISE EXCEPTION 'That account is on the % side of the market', lower(v_side::text);
  END IF;

  INSERT INTO profile_roles (profile_id, role_code, assigned_by, is_demo)
  SELECT p_profile_id, p_code, v_actor, p.is_demo FROM profiles p WHERE p.id = p_profile_id
  ON CONFLICT (profile_id, role_code) DO NOTHING;

  IF p_make_active OR NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_profile_id AND active_role_code IS NOT NULL
  ) THEN
    UPDATE profiles SET active_role_code = p_code, updated_at = now()
    WHERE id = p_profile_id;
  END IF;

  INSERT INTO audit_events (event_type, actor_id, entity_type, entity_id, payload)
  VALUES ('profile.role_assigned', v_actor, 'profile', p_profile_id::text,
          jsonb_build_object('role', p_code, 'self', false));

  RETURN jsonb_build_object('profileId', p_profile_id, 'role', p_code);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_assign_profile_role(uuid, text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_roles ENABLE ROW LEVEL SECURITY;

-- The catalogue is not secret; it is a list of job titles.
CREATE POLICY user_roles_select ON user_roles
  FOR SELECT TO authenticated
  USING (is_active OR private.is_platform_admin());

-- A person sees their own roles. Nobody else's, because who approves payments in
-- another organization is not their business.
CREATE POLICY profile_roles_select ON profile_roles
  FOR SELECT TO authenticated
  USING (profile_id = private.get_profile_id() OR private.is_platform_admin());

-- No INSERT/UPDATE/DELETE policies: every write goes through the RPCs above, so
-- the side check and the "you cannot re-title yourself" rule cannot be skipped.

GRANT SELECT ON user_roles TO authenticated;
GRANT SELECT ON profile_roles TO authenticated;
GRANT ALL ON user_roles TO service_role;
GRANT ALL ON profile_roles TO service_role;

-- ---------------------------------------------------------------------------
-- The enforcement points
--
-- The complete list, in one place. Each is a write that was already authorized
-- by org role, committee assignment or supplier membership; the trigger only
-- narrows it by the caller's current job role.
--
-- Deliberately absent: reads, which RLS already scopes; invoices, where the
-- supplier's own submission and the buyer's approval share one UPDATE policy and
-- a single permission cannot describe both; and clarification messages, which are
-- part of reading an enquiry rather than acting on it.
-- ---------------------------------------------------------------------------

CREATE TRIGGER requirements_role_permission
  BEFORE INSERT OR UPDATE ON requirements
  FOR EACH ROW EXECUTE FUNCTION private.enforce_role_permission('WRITE');

CREATE TRIGGER rfqs_role_permission
  BEFORE INSERT ON rfqs
  FOR EACH ROW EXECUTE FUNCTION private.enforce_role_permission('PROPOSE');

-- A bid is a commitment to a price, which is why it is PROPOSE and not WRITE:
-- a technical lead can attach a specification but cannot commit the business.
CREATE TRIGGER quotes_role_permission
  BEFORE INSERT ON quotes
  FOR EACH ROW EXECUTE FUNCTION private.enforce_role_permission('PROPOSE');

CREATE TRIGGER committee_votes_role_permission
  BEFORE INSERT ON committee_votes
  FOR EACH ROW EXECUTE FUNCTION private.enforce_role_permission('VOTE');

CREATE TRIGGER awards_role_permission
  BEFORE INSERT ON awards
  FOR EACH ROW EXECUTE FUNCTION private.enforce_role_permission('AWARD');

CREATE TRIGGER purchase_orders_role_permission
  BEFORE INSERT ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION private.enforce_role_permission('APPROVE');

CREATE TRIGGER payments_role_permission
  BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION private.enforce_role_permission('APPROVE');
