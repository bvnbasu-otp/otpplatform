-- Separate Buyer/Supplier agreements, existing-user grace and database-level enforcement.
--
-- Extends 00276 (no second acceptance system):
--   * legal_document_versions gains audience, legal_approval_status, reacceptance_policy
--     and content_ref. The seeded copy is still placeholder text that its own page says
--     needs counsel approval, so both rows are marked PENDING_LEGAL_APPROVAL; no wording
--     or hash is invented here. The shared hash is the value the old browser asserted
--     and is NOT evidence that the two documents are identical.
--   * legal_enforcement_config holds the rollout timestamp and grace days. Enforcement
--     is OFF by default and is activated later through activate_legal_enforcement
--     (service_role). rollout_at can be set once and never moved.
--   * private.legal_acceptance_status decides ACCEPTED / GRACE / REQUIRED / NOT_ENFORCED /
--     MISCONFIGURED per (profile, agreement type) from database time.
--     Existing capability = earliest role/membership predates rollout_at; such users are in
--     grace until rollout_at + grace_days (denied AT the deadline instant). New accounts and
--     newly enabled roles (capability_since >= rollout_at) need acceptance immediately.
--     A new agreement version never extends the grace window.
--   * Triggers on the protected write tables enforce the agreement for the acting role,
--     so direct REST writes and RPCs are covered. Buyer tables need CUSTOMER_EULA and
--     quote tables need SUPPLIER_EULA; each is evaluated independently.
--   * Platform admins and contexts with no profile (service_role, migrations, cron) are
--     exempt. A user JWT without a profile cannot pass RLS on these tables anyway.
--   * With enforcement enabled and no valid rollout_at, protected writes fail with
--     LEGAL_ENFORCEMENT_MISCONFIGURED instead of granting unlimited grace.

BEGIN;

ALTER TABLE public.legal_document_versions
  ADD COLUMN IF NOT EXISTS audience text GENERATED ALWAYS AS (
    CASE agreement_type WHEN 'CUSTOMER_EULA' THEN 'BUYER' ELSE 'SUPPLIER' END
  ) STORED,
  ADD COLUMN IF NOT EXISTS legal_approval_status text NOT NULL DEFAULT 'PENDING_LEGAL_APPROVAL'
    CHECK (legal_approval_status IN ('PENDING_LEGAL_APPROVAL', 'APPROVED')),
  ADD COLUMN IF NOT EXISTS reacceptance_policy text NOT NULL DEFAULT 'IMMEDIATE'
    CHECK (reacceptance_policy IN ('IMMEDIATE')),
  ADD COLUMN IF NOT EXISTS content_ref text;

UPDATE public.legal_document_versions
SET content_ref = '/legal/terms'
WHERE content_ref IS NULL;

CREATE TABLE IF NOT EXISTS public.legal_enforcement_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enforcement_enabled boolean NOT NULL DEFAULT false,
  rollout_at timestamptz,
  grace_days integer NOT NULL DEFAULT 30 CHECK (grace_days BETWEEN 1 AND 365),
  activated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.legal_enforcement_config (singleton) VALUES (true) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION private.guard_legal_enforcement_config()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Legal enforcement configuration cannot be deleted (LEGAL_CONFIG_IMMUTABLE)';
  END IF;
  IF OLD.rollout_at IS NOT NULL AND NEW.rollout_at IS DISTINCT FROM OLD.rollout_at THEN
    RAISE EXCEPTION 'The legal rollout timestamp is recorded once and cannot be moved (LEGAL_CONFIG_IMMUTABLE)';
  END IF;
  IF OLD.rollout_at IS NOT NULL AND NEW.grace_days IS DISTINCT FROM OLD.grace_days THEN
    RAISE EXCEPTION 'Grace days cannot change after rollout is recorded (LEGAL_CONFIG_IMMUTABLE)';
  END IF;
  IF NEW.enforcement_enabled AND NEW.rollout_at IS NULL THEN
    RAISE EXCEPTION 'Enforcement cannot be enabled without a rollout timestamp (LEGAL_ENFORCEMENT_MISCONFIGURED)';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS legal_enforcement_config_guard ON public.legal_enforcement_config;
CREATE TRIGGER legal_enforcement_config_guard
  BEFORE UPDATE OR DELETE ON public.legal_enforcement_config
  FOR EACH ROW EXECUTE FUNCTION private.guard_legal_enforcement_config();

ALTER TABLE public.legal_enforcement_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legal_enforcement_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.legal_enforcement_config TO service_role;

-- Acceptance history is append-only: no UPDATE (00276) and no direct DELETE.
-- Cascading deletes from profiles run one trigger level deeper and stay allowed.
CREATE OR REPLACE FUNCTION private.guard_legal_acceptances_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private
AS $$
BEGIN
  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'Legal acceptances are append-only (LEGAL_ACCEPTANCE_IMMUTABLE)';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS legal_acceptances_no_delete ON public.legal_acceptances;
CREATE TRIGGER legal_acceptances_no_delete
  BEFORE DELETE ON public.legal_acceptances
  FOR EACH ROW EXECUTE FUNCTION private.guard_legal_acceptances_delete();

-- Capability, not label: roles of the audience's side or an actual membership.
CREATE OR REPLACE FUNCTION private.required_agreement_types(p_profile_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT COALESCE(array_agg(t ORDER BY t), '{}')
  FROM (
    SELECT 'CUSTOMER_EULA' AS t
    WHERE EXISTS (
            SELECT 1 FROM public.profile_roles pr JOIN public.user_roles ur ON ur.code = pr.role_code
            WHERE pr.profile_id = p_profile_id AND ur.side::text = 'BUYER')
       OR EXISTS (SELECT 1 FROM public.organization_members om WHERE om.profile_id = p_profile_id)
    UNION
    SELECT 'SUPPLIER_EULA'
    WHERE EXISTS (
            SELECT 1 FROM public.profile_roles pr JOIN public.user_roles ur ON ur.code = pr.role_code
            WHERE pr.profile_id = p_profile_id AND ur.side::text = 'SUPPLIER')
       OR EXISTS (SELECT 1 FROM public.supplier_users su WHERE su.profile_id = p_profile_id)
  ) x;
$$;

REVOKE ALL ON FUNCTION private.required_agreement_types(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.required_agreement_types(uuid) TO service_role;

CREATE OR REPLACE FUNCTION private.legal_capability_since(p_profile_id uuid, p_type text)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT CASE p_type
    WHEN 'CUSTOMER_EULA' THEN least(
      (SELECT min(pr.assigned_at) FROM public.profile_roles pr JOIN public.user_roles ur ON ur.code = pr.role_code
        WHERE pr.profile_id = p_profile_id AND ur.side::text = 'BUYER'),
      (SELECT min(om.joined_at) FROM public.organization_members om WHERE om.profile_id = p_profile_id))
    WHEN 'SUPPLIER_EULA' THEN least(
      (SELECT min(pr.assigned_at) FROM public.profile_roles pr JOIN public.user_roles ur ON ur.code = pr.role_code
        WHERE pr.profile_id = p_profile_id AND ur.side::text = 'SUPPLIER'),
      (SELECT min(su.created_at) FROM public.supplier_users su WHERE su.profile_id = p_profile_id))
  END;
$$;

REVOKE ALL ON FUNCTION private.legal_capability_since(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.legal_capability_since(uuid, text) TO service_role;

-- p_at exists so the exact grace boundary can be tested; callers use the default.
CREATE OR REPLACE FUNCTION private.legal_acceptance_status(
  p_profile_id uuid,
  p_type text,
  p_at timestamptz DEFAULT now()
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_cur public.legal_document_versions;
  v_cfg public.legal_enforcement_config;
  v_since timestamptz;
BEGIN
  v_cur := private.current_legal_agreement(p_type);
  IF v_cur.id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.legal_acceptances a
    WHERE a.profile_id = p_profile_id AND a.agreement_type = p_type AND a.version = v_cur.version
  ) THEN
    RETURN 'ACCEPTED';
  END IF;

  SELECT * INTO v_cfg FROM public.legal_enforcement_config WHERE singleton;
  IF NOT FOUND OR NOT v_cfg.enforcement_enabled THEN
    RETURN 'NOT_ENFORCED';
  END IF;
  IF v_cfg.rollout_at IS NULL THEN
    RETURN 'MISCONFIGURED';
  END IF;

  v_since := private.legal_capability_since(p_profile_id, p_type);
  IF v_since IS NOT NULL
     AND v_since < v_cfg.rollout_at
     AND p_at < v_cfg.rollout_at + make_interval(days => v_cfg.grace_days) THEN
    RETURN 'GRACE';
  END IF;
  RETURN 'REQUIRED';
END;
$$;

REVOKE ALL ON FUNCTION private.legal_acceptance_status(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.legal_acceptance_status(uuid, text, timestamptz) TO service_role;

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

  -- Which agreement protects the table, and is this actor writing in that role?
  CASE TG_TABLE_NAME
    WHEN 'rfqs', 'requirements' THEN
      v_type := 'CUSTOMER_EULA';
      v_acting := NEW.created_by = v_actor OR EXISTS (
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
      v_acting := EXISTS (
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

DROP TRIGGER IF EXISTS legal_acceptance_gate ON public.requirements;
CREATE TRIGGER legal_acceptance_gate BEFORE INSERT OR UPDATE ON public.requirements
  FOR EACH ROW EXECUTE FUNCTION private.enforce_legal_acceptance();
DROP TRIGGER IF EXISTS legal_acceptance_gate ON public.rfqs;
CREATE TRIGGER legal_acceptance_gate BEFORE INSERT OR UPDATE ON public.rfqs
  FOR EACH ROW EXECUTE FUNCTION private.enforce_legal_acceptance();
DROP TRIGGER IF EXISTS legal_acceptance_gate ON public.awards;
CREATE TRIGGER legal_acceptance_gate BEFORE INSERT OR UPDATE ON public.awards
  FOR EACH ROW EXECUTE FUNCTION private.enforce_legal_acceptance();
DROP TRIGGER IF EXISTS legal_acceptance_gate ON public.purchase_orders;
CREATE TRIGGER legal_acceptance_gate BEFORE INSERT OR UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION private.enforce_legal_acceptance();
DROP TRIGGER IF EXISTS legal_acceptance_gate ON public.quotes;
CREATE TRIGGER legal_acceptance_gate BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION private.enforce_legal_acceptance();
DROP TRIGGER IF EXISTS legal_acceptance_gate ON public.quote_versions;
CREATE TRIGGER legal_acceptance_gate BEFORE INSERT OR UPDATE ON public.quote_versions
  FOR EACH ROW EXECUTE FUNCTION private.enforce_legal_acceptance();

-- One-time activation through the later, authorized release process (service_role only).
CREATE OR REPLACE FUNCTION public.activate_legal_enforcement(p_rollout_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_cfg public.legal_enforcement_config;
BEGIN
  IF p_rollout_at IS NULL THEN
    RAISE EXCEPTION 'A rollout timestamp is required (LEGAL_ENFORCEMENT_MISCONFIGURED)';
  END IF;
  SELECT * INTO v_cfg FROM public.legal_enforcement_config WHERE singleton FOR UPDATE;
  IF v_cfg.rollout_at IS NOT NULL THEN
    RAISE EXCEPTION 'Legal enforcement was already activated (LEGAL_CONFIG_IMMUTABLE)';
  END IF;
  UPDATE public.legal_enforcement_config
  SET rollout_at = p_rollout_at, enforcement_enabled = true, activated_at = now()
  WHERE singleton;
  INSERT INTO public.audit_events (event_type, entity_type, entity_id, payload)
  VALUES ('legal.enforcement_activated', 'LEGAL_ENFORCEMENT', 'singleton',
          jsonb_build_object('rollout_at', p_rollout_at, 'grace_days', v_cfg.grace_days));
  RETURN jsonb_build_object('rollout_at', p_rollout_at, 'grace_days', v_cfg.grace_days,
                            'grace_ends_at', p_rollout_at + make_interval(days => v_cfg.grace_days));
END;
$$;

REVOKE ALL ON FUNCTION public.activate_legal_enforcement(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_legal_enforcement(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.my_legal_acceptance_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_profile_id uuid := private.get_profile_id();
  v_type text;
  v_cur public.legal_document_versions;
  v_acc public.legal_acceptances;
  v_cfg public.legal_enforcement_config;
  v_status text;
  v_items jsonb := '[]'::jsonb;
  v_pending boolean := false;
  v_grace_end timestamptz;
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated (AUTH_REQUIRED)';
  END IF;

  SELECT * INTO v_cfg FROM public.legal_enforcement_config WHERE singleton;
  v_grace_end := CASE WHEN v_cfg.rollout_at IS NOT NULL
                      THEN v_cfg.rollout_at + make_interval(days => v_cfg.grace_days) END;

  FOREACH v_type IN ARRAY private.required_agreement_types(v_profile_id) LOOP
    v_cur := private.current_legal_agreement(v_type);
    IF v_cur.id IS NULL THEN
      CONTINUE;
    END IF;
    SELECT * INTO v_acc FROM public.legal_acceptances
    WHERE profile_id = v_profile_id AND agreement_type = v_type AND version = v_cur.version;
    v_status := private.legal_acceptance_status(v_profile_id, v_type, now());

    v_items := v_items || jsonb_build_object(
      'agreementType', v_type,
      'audience', v_cur.audience,
      'title', v_cur.title,
      'currentVersion', v_cur.version,
      'documentHash', v_cur.document_hash,
      'legalApprovalStatus', v_cur.legal_approval_status,
      'accepted', v_acc.id IS NOT NULL,
      'acceptedAt', v_acc.accepted_at,
      'status', v_status,
      'graceEndsAt', CASE WHEN v_status = 'GRACE' THEN v_grace_end END
    );
    IF v_acc.id IS NULL THEN
      v_pending := true;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'requiresAcceptance', v_pending,
    'enforcementActive', COALESCE(v_cfg.enforcement_enabled, false),
    'agreements', v_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_legal_agreement(
  p_agreement_type text,
  p_version text,
  p_document_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_profile_id uuid := private.get_profile_id();
  v_cur public.legal_document_versions;
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated (AUTH_REQUIRED)';
  END IF;
  IF NOT (p_agreement_type = ANY (private.required_agreement_types(v_profile_id))) THEN
    RAISE EXCEPTION 'This agreement does not apply to your account (EULA_NOT_APPLICABLE)';
  END IF;

  v_cur := private.current_legal_agreement(p_agreement_type);
  IF v_cur.id IS NULL THEN
    RAISE EXCEPTION 'No current legal agreement is published (EULA_CATALOGUE_UNAVAILABLE)';
  END IF;
  IF p_version IS DISTINCT FROM v_cur.version
     OR (p_document_hash IS NOT NULL AND p_document_hash IS DISTINCT FROM v_cur.document_hash) THEN
    RAISE EXCEPTION 'The agreement has been updated; review and accept the current version (EULA_VERSION_STALE)';
  END IF;

  INSERT INTO public.legal_acceptances (
    profile_id, agreement_type, version, document_hash, acceptance_source
  ) VALUES (
    v_profile_id, v_cur.agreement_type, v_cur.version, v_cur.document_hash, 'POST_LOGIN'
  )
  ON CONFLICT (profile_id, agreement_type, version) DO NOTHING;

  RETURN public.my_legal_acceptance_status();
END;
$$;

REVOKE ALL ON FUNCTION public.my_legal_acceptance_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_legal_acceptance_status() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_legal_agreement(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_legal_agreement(text, text, text) TO authenticated, service_role;

COMMIT;
