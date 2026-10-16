-- Personal ownership for Individual buyers (foundation; organization_id = NULL).
--
-- Approved product rule: an Individual's procurement records carry organization_id = NULL
-- and an explicit personal owner instead of a synthetic "Self" organization. This migration
-- adds the ownership model and its enforcement to the core buyer tables:
--   * owner_profile_id on requirements, rfqs and purchase_orders;
--   * organization_id becomes nullable and a CHECK requires exactly one owner
--     (organization XOR personal), so ambiguous or ownerless rows are rejected;
--   * additive RLS policies for personal rows (owner or platform admin only);
--   * the legal gate recognises personal ownership of purchase orders;
--   * an admin report classifies legacy "Self" organizations. Nothing is reassigned.
--
-- NOT done here (see remediation report): signup provisioning still creates the legacy
-- Individual organization, and the downstream lifecycle functions (entitlements, award,
-- invoices, subscription state) still read organizations. Switching provisioning before
-- those are personal-ownership aware would break working Individual journeys.

BEGIN;

ALTER TABLE public.requirements ADD COLUMN IF NOT EXISTS owner_profile_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.rfqs ADD COLUMN IF NOT EXISTS owner_profile_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS owner_profile_id uuid REFERENCES public.profiles(id);

ALTER TABLE public.requirements ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.rfqs ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.purchase_orders ALTER COLUMN organization_id DROP NOT NULL;

-- rfqs is readable column-wise only (00199/00203); expose just the ownership column.
GRANT SELECT (owner_profile_id) ON public.rfqs TO authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['requirements', 'rfqs', 'purchase_orders'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_single_owner') THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (num_nonnulls(organization_id, owner_profile_id) = 1)',
        t, t || '_single_owner');
    END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (owner_profile_id) WHERE owner_profile_id IS NOT NULL',
                   'idx_' || t || '_owner_profile', t);
  END LOOP;
END $$;

-- Personal rows: visible and writable only to the owning profile (and platform admins for reads).
DROP POLICY IF EXISTS requirements_personal_select ON public.requirements;
CREATE POLICY requirements_personal_select ON public.requirements FOR SELECT TO authenticated
  USING (owner_profile_id IS NOT NULL
         AND (owner_profile_id = private.get_profile_id() OR private.is_platform_admin()));
DROP POLICY IF EXISTS requirements_personal_insert ON public.requirements;
CREATE POLICY requirements_personal_insert ON public.requirements FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NULL AND owner_profile_id = private.get_profile_id()
              AND created_by = private.get_profile_id());
DROP POLICY IF EXISTS requirements_personal_update ON public.requirements;
CREATE POLICY requirements_personal_update ON public.requirements FOR UPDATE TO authenticated
  USING (owner_profile_id IS NOT NULL AND owner_profile_id = private.get_profile_id())
  WITH CHECK (organization_id IS NULL AND owner_profile_id = private.get_profile_id());

DROP POLICY IF EXISTS rfqs_personal_select ON public.rfqs;
CREATE POLICY rfqs_personal_select ON public.rfqs FOR SELECT TO authenticated
  USING (owner_profile_id IS NOT NULL
         AND (owner_profile_id = private.get_profile_id() OR private.is_platform_admin()));
DROP POLICY IF EXISTS rfqs_personal_insert ON public.rfqs;
CREATE POLICY rfqs_personal_insert ON public.rfqs FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NULL AND owner_profile_id = private.get_profile_id()
              AND created_by = private.get_profile_id());
DROP POLICY IF EXISTS rfqs_personal_update ON public.rfqs;
CREATE POLICY rfqs_personal_update ON public.rfqs FOR UPDATE TO authenticated
  USING (owner_profile_id IS NOT NULL AND owner_profile_id = private.get_profile_id())
  WITH CHECK (organization_id IS NULL AND owner_profile_id = private.get_profile_id());

DROP POLICY IF EXISTS purchase_orders_personal_select ON public.purchase_orders;
CREATE POLICY purchase_orders_personal_select ON public.purchase_orders FOR SELECT TO authenticated
  USING (owner_profile_id IS NOT NULL
         AND (owner_profile_id = private.get_profile_id() OR private.is_platform_admin()));
DROP POLICY IF EXISTS purchase_orders_personal_update ON public.purchase_orders;
CREATE POLICY purchase_orders_personal_update ON public.purchase_orders FOR UPDATE TO authenticated
  USING (owner_profile_id IS NOT NULL AND owner_profile_id = private.get_profile_id())
  WITH CHECK (organization_id IS NULL AND owner_profile_id = private.get_profile_id());

-- Ownership scope is fixed at creation: a user cannot move a record between personal and
-- organization ownership (or between organizations). Platform admins and service contexts
-- (no profile) may correct ownership deliberately.
CREATE OR REPLACE FUNCTION private.guard_ownership_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
BEGIN
  IF (OLD.organization_id IS DISTINCT FROM NEW.organization_id
      OR OLD.owner_profile_id IS DISTINCT FROM NEW.owner_profile_id)
     AND private.get_profile_id() IS NOT NULL
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Record ownership cannot be changed (OWNERSHIP_IMMUTABLE)' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_ownership_scope() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ownership_scope_guard ON public.requirements;
CREATE TRIGGER ownership_scope_guard BEFORE UPDATE ON public.requirements
  FOR EACH ROW EXECUTE FUNCTION private.guard_ownership_scope();
DROP TRIGGER IF EXISTS ownership_scope_guard ON public.rfqs;
CREATE TRIGGER ownership_scope_guard BEFORE UPDATE ON public.rfqs
  FOR EACH ROW EXECUTE FUNCTION private.guard_ownership_scope();
DROP TRIGGER IF EXISTS ownership_scope_guard ON public.purchase_orders;
CREATE TRIGGER ownership_scope_guard BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION private.guard_ownership_scope();

-- Legal gate: personal ownership of a purchase order counts as acting as the buyer.
CREATE OR REPLACE FUNCTION private.enforce_legal_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_actor uuid := private.get_profile_id();
  v_type text;
  v_acting boolean := false;
  v_status text;
  v_org uuid;
BEGIN
  IF v_actor IS NULL OR private.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'rfqs', 'requirements' THEN
      v_type := 'CUSTOMER_EULA';
      v_acting := NEW.created_by = v_actor OR NEW.owner_profile_id = v_actor OR EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.profile_id = v_actor AND om.organization_id = NEW.organization_id);
    WHEN 'awards' THEN
      v_type := 'CUSTOMER_EULA';
      SELECT r.organization_id INTO v_org FROM public.rfqs r WHERE r.id = NEW.rfq_id;
      v_acting := NEW.awarded_by = v_actor OR EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.profile_id = v_actor AND om.organization_id = v_org);
    WHEN 'purchase_orders' THEN
      v_type := 'CUSTOMER_EULA';
      v_acting := NEW.owner_profile_id = v_actor OR EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.profile_id = v_actor AND om.organization_id = NEW.organization_id);
    WHEN 'quotes' THEN
      v_type := 'SUPPLIER_EULA';
      v_acting := EXISTS (
        SELECT 1 FROM public.supplier_users su
        WHERE su.profile_id = v_actor AND su.supplier_id = NEW.supplier_id);
    WHEN 'quote_versions' THEN
      v_type := 'SUPPLIER_EULA';
      v_acting := NEW.created_by = v_actor;
    ELSE
      RAISE EXCEPTION 'enforce_legal_acceptance is not configured for table %', TG_TABLE_NAME;
  END CASE;

  IF NOT COALESCE(v_acting, false) THEN
    RETURN NEW;
  END IF;

  v_status := private.legal_acceptance_status(v_actor, v_type, now());
  IF v_status IN ('ACCEPTED', 'GRACE', 'NOT_ENFORCED') THEN
    RETURN NEW;
  END IF;
  IF v_status = 'MISCONFIGURED' THEN
    RAISE EXCEPTION 'Legal enforcement is enabled without a valid rollout timestamp (LEGAL_ENFORCEMENT_MISCONFIGURED)'
      USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION 'You must accept the current % before this action (LEGAL_ACCEPTANCE_REQUIRED)', v_type
    USING ERRCODE = '42501',
          HINT = 'Open the agreement prompt and accept the current version.';
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_legal_acceptance() FROM PUBLIC, anon, authenticated;

-- Legacy Individual organizations, classified but never reassigned automatically.
CREATE OR REPLACE FUNCTION public.individual_ownership_migration_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NOT (private.is_platform_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Platform administrator required (ADMIN-ONLY)' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'unambiguous', COALESCE(jsonb_agg(jsonb_build_object(
          'organizationId', c.id, 'ownerProfileId', c.owner_id,
          'requirements', c.requirements, 'rfqs', c.rfqs, 'purchaseOrders', c.pos)
          ORDER BY c.id) FILTER (WHERE c.classification = 'UNAMBIGUOUS'), '[]'::jsonb),
      'ambiguous', COALESCE(jsonb_agg(jsonb_build_object(
          'organizationId', c.id, 'members', c.members, 'reason', c.reason)
          ORDER BY c.id) FILTER (WHERE c.classification = 'AMBIGUOUS'), '[]'::jsonb)
    )
    FROM (
      SELECT o.id,
             (SELECT count(*) FROM public.organization_members m WHERE m.organization_id = o.id) AS members,
             (SELECT m.profile_id FROM public.organization_members m
               WHERE m.organization_id = o.id AND m.role = 'OWNER' ORDER BY m.joined_at LIMIT 1) AS owner_id,
             (SELECT count(*) FROM public.requirements r WHERE r.organization_id = o.id) AS requirements,
             (SELECT count(*) FROM public.rfqs r WHERE r.organization_id = o.id) AS rfqs,
             (SELECT count(*) FROM public.purchase_orders p WHERE p.organization_id = o.id) AS pos,
             CASE WHEN (SELECT count(*) FROM public.organization_members m WHERE m.organization_id = o.id) = 1
                       AND (SELECT count(*) FROM public.organization_members m
                             WHERE m.organization_id = o.id AND m.role = 'OWNER') = 1
                  THEN 'UNAMBIGUOUS' ELSE 'AMBIGUOUS' END AS classification,
             CASE WHEN (SELECT count(*) FROM public.organization_members m WHERE m.organization_id = o.id) <> 1
                  THEN 'Individual organization does not have exactly one member'
                  ELSE 'Single member is not an OWNER' END AS reason
      FROM public.organizations o
      WHERE o.org_type::text = 'INDIVIDUAL'
    ) c
  );
END;
$$;

REVOKE ALL ON FUNCTION public.individual_ownership_migration_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.individual_ownership_migration_report() TO authenticated, service_role;

COMMIT;
