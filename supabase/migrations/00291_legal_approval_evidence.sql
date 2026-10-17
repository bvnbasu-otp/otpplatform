-- Approval evidence for Buyer and Supplier agreements.
--
-- This migration does not approve either agreement, does not insert document
-- text, does not grant a reviewer, does not set rollout_at, and does not enable
-- enforcement.
--
-- The actor is private.verified_legal_actor(): the profile resolved from the
-- verified JWT subject. A caller-supplied profile id is not the actor.
-- service_role is rejected even if that subject was set in the session,
-- because a service-role caller can also set request.jwt.claims.
-- The first grant has no reviewer to check. It requires the database owner
-- session (session_user postgres or supabase_admin) and refuses application
-- roles, including after SET ROLE. No reviewer is seeded. The
-- external_record_ref is the pointer to the counsel or board record.
--
-- Revocation appends a decision. It does not turn enforcement off. Switching
-- enforcement off after activation is a separate, unauthorized change.

BEGIN;

CREATE TABLE public.legal_review_grants (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
  can_register boolean NOT NULL DEFAULT false,
  can_decide boolean NOT NULL DEFAULT false,
  can_activate boolean NOT NULL DEFAULT false,
  can_authorize boolean NOT NULL DEFAULT false,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  external_record_ref text NOT NULL CHECK (btrim(external_record_ref) <> ''),
  CHECK (can_register OR can_decide OR can_activate OR can_authorize)
);

CREATE TABLE public.legal_document_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_type text NOT NULL CHECK (agreement_type IN ('CUSTOMER_EULA', 'SUPPLIER_EULA')),
  version text NOT NULL CHECK (btrim(version) <> ''),
  document_hash text NOT NULL CHECK (document_hash ~ '^sha256:[0-9a-f]{64}$'),
  body bytea NOT NULL CHECK (octet_length(body) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agreement_type, version),
  UNIQUE (document_hash)
);

CREATE TABLE public.legal_agreement_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES public.legal_document_snapshots(id) ON DELETE RESTRICT,
  agreement_type text NOT NULL CHECK (agreement_type IN ('CUSTOMER_EULA', 'SUPPLIER_EULA')),
  version text NOT NULL,
  document_hash text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED', 'REVOKED')),
  approver_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  external_record_ref text NOT NULL CHECK (btrim(external_record_ref) <> ''),
  notes text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  decision_seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE
);

CREATE INDEX legal_agreement_approvals_snapshot_idx
  ON public.legal_agreement_approvals (snapshot_id, decision_seq DESC);

CREATE TABLE public.legal_acceptance_archives (
  archive_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acceptance_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  agreement_type text NOT NULL,
  version text NOT NULL,
  document_hash text NOT NULL,
  accepted_at timestamptz NOT NULL,
  acceptance_source text NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.legal_document_versions
  ADD COLUMN IF NOT EXISTS snapshot_id uuid REFERENCES public.legal_document_snapshots(id) ON DELETE RESTRICT;

ALTER TABLE public.legal_enforcement_config
  ADD COLUMN IF NOT EXISTS grace_customer_snapshot_id uuid REFERENCES public.legal_document_snapshots(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS grace_supplier_snapshot_id uuid REFERENCES public.legal_document_snapshots(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION private.legal_snapshot_digest(p_body bytea)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT 'sha256:' || encode(extensions.digest(p_body, 'sha256'), 'hex');
$$;

REVOKE ALL ON FUNCTION private.legal_snapshot_digest(bytea) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.legal_snapshot_digest(bytea) TO service_role;

CREATE OR REPLACE FUNCTION private.guard_legal_review_grants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private
AS $$
BEGIN
  IF current_setting('otp.legal_grant_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Reviewer grants change only through the audited grant functions (LEGAL_GRANT_IMMUTABLE)';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Legal review grants are retained (LEGAL_GRANT_IMMUTABLE)';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.granted_at := clock_timestamp();
    RETURN NEW;
  END IF;
  IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
     AND NEW.profile_id = OLD.profile_id
     AND NEW.can_register = OLD.can_register
     AND NEW.can_decide = OLD.can_decide
     AND NEW.can_activate = OLD.can_activate
     AND NEW.can_authorize = OLD.can_authorize
     AND NEW.granted_at = OLD.granted_at
     AND NEW.external_record_ref = OLD.external_record_ref THEN
    NEW.revoked_at := clock_timestamp();
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Legal review grants cannot be rewritten (LEGAL_GRANT_IMMUTABLE)';
END;
$$;

DROP TRIGGER IF EXISTS legal_review_grants_guard ON public.legal_review_grants;
CREATE TRIGGER legal_review_grants_guard
  BEFORE UPDATE OR DELETE ON public.legal_review_grants
  FOR EACH ROW EXECUTE FUNCTION private.guard_legal_review_grants();

CREATE OR REPLACE FUNCTION private.guard_legal_document_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, extensions
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Frozen legal snapshots cannot be changed or deleted (LEGAL_SNAPSHOT_IMMUTABLE)';
  END IF;
  IF current_setting('otp.legal_snapshot_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Snapshots are stored only by register_legal_snapshot (LEGAL_SNAPSHOT_IMMUTABLE)';
  END IF;
  NEW.created_at := clock_timestamp();
  IF NEW.document_hash IS DISTINCT FROM private.legal_snapshot_digest(NEW.body) THEN
    RAISE EXCEPTION 'Snapshot hash does not match the stored bytes (LEGAL_SNAPSHOT_MISMATCH)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.legal_document_snapshots WHERE body = NEW.body) THEN
    RAISE EXCEPTION 'Identical agreement bytes were rejected (LEGAL_SNAPSHOT_BYTES_NOT_DISTINCT)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS legal_document_snapshots_guard ON public.legal_document_snapshots;
CREATE TRIGGER legal_document_snapshots_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.legal_document_snapshots
  FOR EACH ROW EXECUTE FUNCTION private.guard_legal_document_snapshots();

CREATE OR REPLACE FUNCTION private.guard_legal_agreement_approvals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private
AS $$
DECLARE
  v_snap public.legal_document_snapshots;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Approval history cannot be changed or deleted (LEGAL_APPROVAL_IMMUTABLE)';
  END IF;
  IF current_setting('otp.legal_approval_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Approval evidence is recorded only by record_legal_decision (LEGAL_APPROVAL_IMMUTABLE)';
  END IF;
  NEW.decided_at := clock_timestamp();
  SELECT * INTO v_snap FROM public.legal_document_snapshots WHERE id = NEW.snapshot_id;
  IF v_snap.id IS NULL
     OR v_snap.agreement_type IS DISTINCT FROM NEW.agreement_type
     OR v_snap.version IS DISTINCT FROM NEW.version
     OR v_snap.document_hash IS DISTINCT FROM NEW.document_hash THEN
    RAISE EXCEPTION 'Approval evidence does not match the frozen snapshot (LEGAL_SNAPSHOT_MISMATCH)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS legal_agreement_approvals_guard ON public.legal_agreement_approvals;
CREATE TRIGGER legal_agreement_approvals_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.legal_agreement_approvals
  FOR EACH ROW EXECUTE FUNCTION private.guard_legal_agreement_approvals();

CREATE OR REPLACE FUNCTION private.guard_legal_acceptance_archives()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Archived legal acceptances cannot be changed or deleted (LEGAL_ACCEPTANCE_IMMUTABLE)';
  END IF;
  IF current_setting('otp.legal_archive_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Acceptance archives are written only during an authorized profile deletion (LEGAL_ACCEPTANCE_IMMUTABLE)';
  END IF;
  NEW.archived_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS legal_acceptance_archives_guard ON public.legal_acceptance_archives;
CREATE TRIGGER legal_acceptance_archives_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.legal_acceptance_archives
  FOR EACH ROW EXECUTE FUNCTION private.guard_legal_acceptance_archives();

CREATE OR REPLACE FUNCTION private.guard_legal_document_versions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, extensions
AS $$
DECLARE
  v_snap public.legal_document_snapshots;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Legal document versions are retained for audit and cannot be deleted (LEGAL_VERSION_IMMUTABLE)';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF current_setting('otp.legal_catalogue_write', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Catalogue versions are published only through register_legal_snapshot (LEGAL_VERSION_IMMUTABLE)';
    END IF;
  ELSIF (
      NEW.retired_at IS DISTINCT FROM OLD.retired_at
      OR NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id
      OR NEW.content_ref IS DISTINCT FROM OLD.content_ref
    ) AND current_setting('otp.legal_catalogue_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Catalogue publication changes only through register_legal_snapshot (LEGAL_VERSION_IMMUTABLE)';
  END IF;
  IF TG_OP = 'UPDATE' AND (
       NEW.agreement_type IS DISTINCT FROM OLD.agreement_type
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.document_hash IS DISTINCT FROM OLD.document_hash
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
     ) THEN
    RAISE EXCEPTION 'Published legal document versions are immutable; publish a new version (LEGAL_VERSION_IMMUTABLE)';
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.legal_approval_status IS DISTINCT FROM OLD.legal_approval_status
     AND current_setting('otp.legal_status_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Legal approval status is derived from approval evidence (LEGAL_APPROVAL_IMMUTABLE)';
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.snapshot_id IS NOT NULL
     AND NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id THEN
    RAISE EXCEPTION 'A published snapshot cannot be swapped (LEGAL_SNAPSHOT_IMMUTABLE)';
  END IF;
  IF NEW.snapshot_id IS NOT NULL THEN
    SELECT * INTO v_snap FROM public.legal_document_snapshots WHERE id = NEW.snapshot_id;
    IF v_snap.id IS NULL
       OR v_snap.agreement_type IS DISTINCT FROM NEW.agreement_type
       OR v_snap.version IS DISTINCT FROM NEW.version
       OR v_snap.document_hash IS DISTINCT FROM NEW.document_hash
       OR v_snap.document_hash IS DISTINCT FROM private.legal_snapshot_digest(v_snap.body) THEN
      RAISE EXCEPTION 'Catalogue row does not match its frozen snapshot (LEGAL_SNAPSHOT_MISMATCH)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_legal_enforcement_config()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Legal enforcement configuration cannot be deleted (LEGAL_CONFIG_IMMUTABLE)';
  END IF;
  IF OLD.rollout_at IS NOT NULL AND (
       NEW.rollout_at IS DISTINCT FROM OLD.rollout_at
       OR NEW.grace_days IS DISTINCT FROM OLD.grace_days
       OR NEW.grace_customer_snapshot_id IS DISTINCT FROM OLD.grace_customer_snapshot_id
       OR NEW.grace_supplier_snapshot_id IS DISTINCT FROM OLD.grace_supplier_snapshot_id
     ) THEN
    RAISE EXCEPTION 'The legal rollout record cannot be moved (LEGAL_CONFIG_IMMUTABLE)';
  END IF;
  IF NEW.enforcement_enabled AND NEW.rollout_at IS NULL THEN
    RAISE EXCEPTION 'Enforcement cannot be enabled without a rollout timestamp (LEGAL_ENFORCEMENT_MISCONFIGURED)';
  END IF;
  -- Direct writes cannot turn enforcement on or record a rollout. Only
  -- activate_legal_enforcement sets otp.legal_activation_write, after the
  -- snapshot, hash, approval and allowlist checks. A later REVOKED decision
  -- does not clear enforcement_enabled.
  IF current_setting('otp.legal_activation_write', true) IS DISTINCT FROM 'on'
     AND (
       NEW.enforcement_enabled IS DISTINCT FROM OLD.enforcement_enabled
       OR NEW.rollout_at IS DISTINCT FROM OLD.rollout_at
       OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
       OR NEW.grace_customer_snapshot_id IS DISTINCT FROM OLD.grace_customer_snapshot_id
       OR NEW.grace_supplier_snapshot_id IS DISTINCT FROM OLD.grace_supplier_snapshot_id
     ) THEN
    RAISE EXCEPTION 'Legal enforcement is activated only through the approval-evidence check (LEGAL_CONFIG_IMMUTABLE)';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_legal_acceptances_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private
AS $$
BEGIN
  -- Direct deletes stay blocked. A nested delete (trigger depth >= 2) is the
  -- cascade path: copy the row, then allow it to be removed. Profile deletion
  -- does not reach this trigger today, because
  -- private_security.enforce_superadmin_immutability returns NEW from BEFORE
  -- DELETE and NEW is null, which cancels the profile delete.
  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'Legal acceptances are append-only (LEGAL_ACCEPTANCE_IMMUTABLE)';
  END IF;
  PERFORM set_config('otp.legal_archive_write', 'on', true);
  INSERT INTO public.legal_acceptance_archives (
    acceptance_id, profile_id, agreement_type, version, document_hash, accepted_at, acceptance_source
  ) VALUES (
    OLD.id, OLD.profile_id, OLD.agreement_type, OLD.version, OLD.document_hash, OLD.accepted_at, OLD.acceptance_source
  );
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION private.assert_legal_review_grant(p_actor uuid, p_kind text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.legal_review_grants g
    WHERE g.profile_id = p_actor
      AND g.revoked_at IS NULL
      AND CASE p_kind
            WHEN 'register' THEN g.can_register
            WHEN 'decide' THEN g.can_decide
            WHEN 'activate' THEN g.can_activate
            WHEN 'authorize' THEN g.can_authorize
            ELSE false
          END
  ) THEN
    RAISE EXCEPTION 'This profile is not authorized for legal review (LEGAL_REVIEW_UNAUTHORIZED)'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_legal_review_grant(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.verified_legal_actor()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_role text := COALESCE(current_setting('role', true), '');
  v_actor uuid;
BEGIN
  IF v_role IN ('service_role', 'anon', 'authenticator') THEN
    RAISE EXCEPTION 'This session cannot act as a legal reviewer (LEGAL_REVIEW_UNAUTHORIZED)'
      USING ERRCODE = '42501';
  END IF;
  v_actor := private.get_profile_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'This profile is not authorized for legal review (LEGAL_REVIEW_UNAUTHORIZED)'
      USING ERRCODE = '42501';
  END IF;
  RETURN v_actor;
END;
$$;

REVOKE ALL ON FUNCTION private.verified_legal_actor() FROM PUBLIC, anon, authenticated, service_role;
ALTER FUNCTION private.verified_legal_actor() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION private.verified_legal_actor() TO postgres;

CREATE OR REPLACE FUNCTION public.grant_legal_reviewer(
  p_actor uuid,
  p_grantee uuid,
  p_can_register boolean,
  p_can_decide boolean,
  p_can_activate boolean,
  p_can_authorize boolean,
  p_external_record_ref text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_actor uuid;
  v_role text := COALESCE(current_setting('role', true), '');
BEGIN
  -- p_actor is not authentication. The verified session is.
  IF p_grantee IS NULL OR btrim(COALESCE(p_external_record_ref, '')) = '' THEN
    RAISE EXCEPTION 'A reviewer and an external authorization record are required (LEGAL_REVIEW_UNAUTHORIZED)'
      USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE(p_can_register, false)
     AND NOT COALESCE(p_can_decide, false)
     AND NOT COALESCE(p_can_activate, false)
     AND NOT COALESCE(p_can_authorize, false) THEN
    RAISE EXCEPTION 'A reviewer grant needs at least one authority (LEGAL_REVIEW_UNAUTHORIZED)'
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.legal_review_grants WHERE revoked_at IS NULL) THEN
    IF session_user NOT IN ('postgres', 'supabase_admin')
       OR v_role IN ('service_role', 'anon', 'authenticated', 'authenticator') THEN
      RAISE EXCEPTION 'The first reviewer grant requires the database owner (LEGAL_REVIEW_UNAUTHORIZED)'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    v_actor := private.verified_legal_actor();
    PERFORM private.assert_legal_review_grant(v_actor, 'authorize');
  END IF;
  PERFORM set_config('otp.legal_grant_write', 'on', true);
  INSERT INTO public.legal_review_grants (
    profile_id, can_register, can_decide, can_activate, can_authorize, external_record_ref
  ) VALUES (
    p_grantee, COALESCE(p_can_register, false), COALESCE(p_can_decide, false),
    COALESCE(p_can_activate, false), COALESCE(p_can_authorize, false), btrim(p_external_record_ref)
  );
  INSERT INTO public.audit_events (event_type, actor_id, entity_type, entity_id, payload)
  VALUES (
    'legal.reviewer_granted',
    v_actor,
    'LEGAL_REVIEW_GRANT',
    p_grantee::text,
    jsonb_build_object(
      'external_record_ref', btrim(p_external_record_ref),
      'can_register', COALESCE(p_can_register, false),
      'can_decide', COALESCE(p_can_decide, false),
      'can_activate', COALESCE(p_can_activate, false),
      'can_authorize', COALESCE(p_can_authorize, false),
      'bootstrap', v_actor IS NULL
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_legal_reviewer(uuid, uuid, boolean, boolean, boolean, boolean, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.grant_legal_reviewer(uuid, uuid, boolean, boolean, boolean, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_legal_reviewer(
  p_actor uuid,
  p_grantee uuid,
  p_external_record_ref text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_actor uuid;
BEGIN
  -- p_actor is not authentication. The verified session is.
  v_actor := private.verified_legal_actor();
  PERFORM private.assert_legal_review_grant(v_actor, 'authorize');
  IF btrim(COALESCE(p_external_record_ref, '')) = '' THEN
    RAISE EXCEPTION 'An external authorization record is required (LEGAL_REVIEW_UNAUTHORIZED)'
      USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('otp.legal_grant_write', 'on', true);
  UPDATE public.legal_review_grants
  SET revoked_at = clock_timestamp()
  WHERE profile_id = p_grantee AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active reviewer grant exists (LEGAL_REVIEW_UNAUTHORIZED)'
      USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.audit_events (event_type, actor_id, entity_type, entity_id, payload)
  VALUES (
    'legal.reviewer_revoked',
    v_actor,
    'LEGAL_REVIEW_GRANT',
    p_grantee::text,
    jsonb_build_object('external_record_ref', btrim(p_external_record_ref))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_legal_reviewer(uuid, uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_legal_reviewer(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_legal_snapshot(
  p_actor uuid,
  p_agreement_type text,
  p_version text,
  p_body bytea
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_hash text;
  v_id uuid;
  v_title text;
  v_actor uuid;
BEGIN
  -- p_actor is not authentication. The verified session is.
  v_actor := private.verified_legal_actor();
  PERFORM private.assert_legal_review_grant(v_actor, 'register');
  IF p_agreement_type NOT IN ('CUSTOMER_EULA', 'SUPPLIER_EULA') OR btrim(COALESCE(p_version, '')) = '' THEN
    RAISE EXCEPTION 'Agreement type and version are required (LEGAL_SNAPSHOT_MISMATCH)';
  END IF;
  IF p_body IS NULL OR octet_length(p_body) = 0 THEN
    RAISE EXCEPTION 'A frozen agreement body is required (LEGAL_SNAPSHOT_MISMATCH)';
  END IF;
  PERFORM convert_from(p_body, 'UTF8');
  v_hash := private.legal_snapshot_digest(p_body);
  IF EXISTS (SELECT 1 FROM public.legal_document_snapshots WHERE body = p_body OR document_hash = v_hash) THEN
    RAISE EXCEPTION 'Identical agreement bytes were rejected (LEGAL_SNAPSHOT_BYTES_NOT_DISTINCT)';
  END IF;

  PERFORM set_config('otp.legal_snapshot_write', 'on', true);
  PERFORM set_config('otp.legal_catalogue_write', 'on', true);
  INSERT INTO public.legal_document_snapshots (agreement_type, version, document_hash, body)
  VALUES (p_agreement_type, p_version, v_hash, p_body)
  RETURNING id INTO v_id;

  UPDATE public.legal_document_versions
  SET retired_at = now()
  WHERE agreement_type = p_agreement_type
    AND retired_at IS NULL
    AND version IS DISTINCT FROM p_version;

  v_title := CASE p_agreement_type
    WHEN 'CUSTOMER_EULA' THEN 'OTP Customer Terms of Use and EULA'
    ELSE 'OTP Supplier Terms of Use and EULA'
  END;

  INSERT INTO public.legal_document_versions (agreement_type, version, document_hash, title, snapshot_id)
  VALUES (p_agreement_type, p_version, v_hash, v_title, v_id)
  ON CONFLICT (agreement_type, version) DO UPDATE
  SET snapshot_id = EXCLUDED.snapshot_id,
      retired_at = NULL
  WHERE public.legal_document_versions.document_hash = EXCLUDED.document_hash
    AND public.legal_document_versions.snapshot_id IS NULL;

  IF NOT EXISTS (
    SELECT 1 FROM public.legal_document_versions
    WHERE agreement_type = p_agreement_type AND version = p_version AND snapshot_id = v_id AND retired_at IS NULL
  ) THEN
    RAISE EXCEPTION 'The catalogue version does not match this snapshot (LEGAL_SNAPSHOT_MISMATCH)';
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_legal_snapshot(uuid, text, text, bytea) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.register_legal_snapshot(uuid, text, text, bytea) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_legal_decision(
  p_actor uuid,
  p_snapshot_id uuid,
  p_decision text,
  p_external_record_ref text,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_snap public.legal_document_snapshots;
  v_id uuid;
  v_status text;
  v_actor uuid;
BEGIN
  -- p_actor is not authentication. The verified session is.
  v_actor := private.verified_legal_actor();
  PERFORM private.assert_legal_review_grant(v_actor, 'decide');
  IF p_decision NOT IN ('APPROVED', 'REJECTED', 'REVOKED') OR btrim(COALESCE(p_external_record_ref, '')) = '' THEN
    RAISE EXCEPTION 'A decision and an external approval reference are required (LEGAL_APPROVAL_REQUIRED)'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_snap FROM public.legal_document_snapshots WHERE id = p_snapshot_id FOR UPDATE;
  IF v_snap.id IS NULL THEN
    RAISE EXCEPTION 'No frozen snapshot exists for this decision (LEGAL_APPROVAL_REQUIRED)'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('otp.legal_approval_write', 'on', true);
  INSERT INTO public.legal_agreement_approvals (
    snapshot_id, agreement_type, version, document_hash, decision,
    approver_profile_id, external_record_ref, notes
  ) VALUES (
    v_snap.id, v_snap.agreement_type, v_snap.version, v_snap.document_hash, p_decision,
    v_actor, btrim(p_external_record_ref), NULLIF(btrim(COALESCE(p_notes, '')), '')
  ) RETURNING id INTO v_id;

  v_status := CASE WHEN p_decision = 'APPROVED' THEN 'APPROVED' ELSE 'PENDING_LEGAL_APPROVAL' END;
  PERFORM set_config('otp.legal_status_write', 'on', true);
  UPDATE public.legal_document_versions
  SET legal_approval_status = v_status
  WHERE snapshot_id = v_snap.id AND retired_at IS NULL;
  PERFORM set_config('otp.legal_status_write', 'off', true);

  -- A later REVOKED row invalidates activation. It does not clear enforcement_enabled.
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_legal_decision(uuid, uuid, text, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_legal_decision(uuid, uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION private.latest_legal_decision(p_snapshot_id uuid)
RETURNS public.legal_agreement_approvals
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT a.* FROM public.legal_agreement_approvals a
  WHERE a.snapshot_id = p_snapshot_id
  ORDER BY a.decision_seq DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.latest_legal_decision(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.latest_legal_decision(uuid) TO service_role;

DROP FUNCTION IF EXISTS public.activate_legal_enforcement(timestamptz);

CREATE OR REPLACE FUNCTION public.activate_legal_enforcement(
  p_rollout_at timestamptz,
  p_actor_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_cfg public.legal_enforcement_config;
  v_buyer public.legal_document_versions;
  v_supplier public.legal_document_versions;
  v_buyer_snap public.legal_document_snapshots;
  v_supplier_snap public.legal_document_snapshots;
  v_buyer_decision public.legal_agreement_approvals;
  v_supplier_decision public.legal_agreement_approvals;
  v_buyer_count integer;
  v_supplier_count integer;
  v_actor uuid;
BEGIN
  IF p_rollout_at IS NULL THEN
    RAISE EXCEPTION 'A rollout timestamp is required (LEGAL_ENFORCEMENT_MISCONFIGURED)';
  END IF;

  SELECT * INTO v_cfg FROM public.legal_enforcement_config WHERE singleton FOR UPDATE;
  IF v_cfg.rollout_at IS NOT NULL THEN
    RAISE EXCEPTION 'Legal enforcement was already activated (LEGAL_CONFIG_IMMUTABLE)';
  END IF;

  SELECT count(*) INTO v_buyer_count
  FROM public.legal_document_versions
  WHERE agreement_type = 'CUSTOMER_EULA' AND retired_at IS NULL;
  SELECT count(*) INTO v_supplier_count
  FROM public.legal_document_versions
  WHERE agreement_type = 'SUPPLIER_EULA' AND retired_at IS NULL;
  IF v_buyer_count <> 1 OR v_supplier_count <> 1 THEN
    RAISE EXCEPTION 'Legal enforcement cannot start until the current Buyer and Supplier agreements are approved (LEGAL_APPROVAL_REQUIRED)'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_buyer FROM public.legal_document_versions
  WHERE agreement_type = 'CUSTOMER_EULA' AND retired_at IS NULL FOR UPDATE;
  SELECT * INTO v_supplier FROM public.legal_document_versions
  WHERE agreement_type = 'SUPPLIER_EULA' AND retired_at IS NULL FOR UPDATE;

  IF v_buyer.snapshot_id IS NULL OR v_supplier.snapshot_id IS NULL THEN
    RAISE EXCEPTION 'Legal enforcement cannot start until the current Buyer and Supplier agreements are approved (LEGAL_APPROVAL_REQUIRED)'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_buyer_snap FROM public.legal_document_snapshots WHERE id = v_buyer.snapshot_id FOR UPDATE;
  SELECT * INTO v_supplier_snap FROM public.legal_document_snapshots WHERE id = v_supplier.snapshot_id FOR UPDATE;

  IF v_buyer.snapshot_id IS NULL OR v_supplier.snapshot_id IS NULL
     OR v_buyer_snap.id IS NULL OR v_supplier_snap.id IS NULL
     OR v_buyer_snap.body = v_supplier_snap.body
     OR v_buyer_snap.document_hash = v_supplier_snap.document_hash
     OR v_buyer.document_hash IS DISTINCT FROM private.legal_snapshot_digest(v_buyer_snap.body)
     OR v_supplier.document_hash IS DISTINCT FROM private.legal_snapshot_digest(v_supplier_snap.body)
     OR v_buyer_snap.agreement_type IS DISTINCT FROM 'CUSTOMER_EULA'
     OR v_supplier_snap.agreement_type IS DISTINCT FROM 'SUPPLIER_EULA'
     OR v_buyer_snap.version IS DISTINCT FROM v_buyer.version
     OR v_supplier_snap.version IS DISTINCT FROM v_supplier.version THEN
    RAISE EXCEPTION 'Legal enforcement cannot start until the current Buyer and Supplier agreements are approved (LEGAL_APPROVAL_REQUIRED)'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_buyer_decision FROM private.latest_legal_decision(v_buyer_snap.id);
  SELECT * INTO v_supplier_decision FROM private.latest_legal_decision(v_supplier_snap.id);
  IF v_buyer_decision.id IS NULL OR v_supplier_decision.id IS NULL
     OR v_buyer_decision.decision IS DISTINCT FROM 'APPROVED'
     OR v_supplier_decision.decision IS DISTINCT FROM 'APPROVED'
     OR btrim(v_buyer_decision.external_record_ref) = ''
     OR btrim(v_supplier_decision.external_record_ref) = ''
     OR v_buyer_decision.approver_profile_id IS NULL
     OR v_supplier_decision.approver_profile_id IS NULL
     OR v_buyer_decision.document_hash IS DISTINCT FROM v_buyer.document_hash
     OR v_supplier_decision.document_hash IS DISTINCT FROM v_supplier.document_hash THEN
    RAISE EXCEPTION 'Legal enforcement cannot start until the current Buyer and Supplier agreements are approved (LEGAL_APPROVAL_REQUIRED)'
      USING ERRCODE = '42501';
  END IF;

  -- p_actor_profile_id is not authentication. The verified session is.
  v_actor := private.verified_legal_actor();
  PERFORM private.assert_legal_review_grant(v_actor, 'activate');

  PERFORM set_config('otp.legal_activation_write', 'on', true);
  UPDATE public.legal_enforcement_config
  SET rollout_at = p_rollout_at,
      enforcement_enabled = true,
      activated_at = now(),
      grace_customer_snapshot_id = v_buyer_snap.id,
      grace_supplier_snapshot_id = v_supplier_snap.id
  WHERE singleton;
  PERFORM set_config('otp.legal_activation_write', 'off', true);

  INSERT INTO public.audit_events (event_type, actor_id, entity_type, entity_id, payload)
  VALUES (
    'legal.enforcement_activated',
    v_actor,
    'LEGAL_ENFORCEMENT',
    'singleton',
    jsonb_build_object(
      'rollout_at', p_rollout_at,
      'activated_at', now(),
      'grace_days', v_cfg.grace_days,
      'customer_version', v_buyer.version,
      'customer_hash', v_buyer.document_hash,
      'customer_snapshot_id', v_buyer_snap.id,
      'customer_approval_id', v_buyer_decision.id,
      'supplier_version', v_supplier.version,
      'supplier_hash', v_supplier.document_hash,
      'supplier_snapshot_id', v_supplier_snap.id,
      'supplier_approval_id', v_supplier_decision.id
    )
  );

  RETURN jsonb_build_object(
    'rollout_at', p_rollout_at,
    'grace_days', v_cfg.grace_days,
    'grace_ends_at', p_rollout_at + make_interval(days => v_cfg.grace_days),
    'customer_snapshot_id', v_buyer_snap.id,
    'supplier_snapshot_id', v_supplier_snap.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_legal_enforcement(timestamptz, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.activate_legal_enforcement(timestamptz, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.legal_acceptance_status(
  p_profile_id uuid,
  p_type text,
  p_at timestamptz DEFAULT now()
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_cur public.legal_document_versions;
  v_cfg public.legal_enforcement_config;
  v_since timestamptz;
  v_grace uuid;
  v_body bytea;
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
  IF v_cfg.rollout_at IS NULL OR v_cur.id IS NULL OR v_cur.snapshot_id IS NULL THEN
    RETURN 'MISCONFIGURED';
  END IF;

  SELECT body INTO v_body FROM public.legal_document_snapshots WHERE id = v_cur.snapshot_id;
  IF v_body IS NULL OR v_cur.document_hash IS DISTINCT FROM private.legal_snapshot_digest(v_body) THEN
    RETURN 'MISCONFIGURED';
  END IF;

  v_grace := CASE p_type
    WHEN 'CUSTOMER_EULA' THEN v_cfg.grace_customer_snapshot_id
    WHEN 'SUPPLIER_EULA' THEN v_cfg.grace_supplier_snapshot_id
  END;
  v_since := private.legal_capability_since(p_profile_id, p_type);
  IF v_grace IS NOT NULL
     AND v_cur.snapshot_id = v_grace
     AND v_since IS NOT NULL
     AND v_since < v_cfg.rollout_at
     AND p_at < v_cfg.rollout_at + make_interval(days => v_cfg.grace_days) THEN
    RETURN 'GRACE';
  END IF;
  RETURN 'REQUIRED';
END;
$$;

REVOKE ALL ON FUNCTION private.legal_acceptance_status(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.legal_acceptance_status(uuid, text, timestamptz) TO service_role;

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
  IF COALESCE(current_setting('role', true), '') = 'service_role' THEN
    RAISE EXCEPTION 'Not authenticated (AUTH_REQUIRED)';
  END IF;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated (AUTH_REQUIRED)';
  END IF;

  SELECT * INTO v_cfg FROM public.legal_enforcement_config WHERE singleton;
  v_grace_end := CASE WHEN v_cfg.rollout_at IS NOT NULL
                      THEN v_cfg.rollout_at + make_interval(days => v_cfg.grace_days) END;

  FOREACH v_type IN ARRAY private.required_agreement_types(v_profile_id) LOOP
    v_cur := private.current_legal_agreement(v_type);
    IF v_cur.id IS NULL THEN
      v_items := v_items || jsonb_build_object(
        'agreementType', v_type,
        'audience', CASE v_type WHEN 'CUSTOMER_EULA' THEN 'BUYER' ELSE 'SUPPLIER' END,
        'title', NULL,
        'currentVersion', NULL,
        'documentHash', NULL,
        'legalApprovalStatus', NULL,
        'accepted', false,
        'acceptedAt', NULL,
        'status', 'MISCONFIGURED',
        'graceEndsAt', NULL
      );
      v_pending := true;
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

REVOKE ALL ON FUNCTION public.my_legal_acceptance_status() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.my_legal_acceptance_status() TO authenticated;

DROP FUNCTION IF EXISTS public.accept_legal_agreement(text, text, text);

CREATE OR REPLACE FUNCTION public.accept_legal_agreement(
  p_agreement_type text,
  p_version text,
  p_document_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_profile_id uuid := private.get_profile_id();
  v_cur public.legal_document_versions;
  v_digest text;
BEGIN
  IF COALESCE(current_setting('role', true), '') = 'service_role' THEN
    RAISE EXCEPTION 'Not authenticated (AUTH_REQUIRED)';
  END IF;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated (AUTH_REQUIRED)';
  END IF;
  IF NOT (p_agreement_type = ANY (private.required_agreement_types(v_profile_id))) THEN
    RAISE EXCEPTION 'This agreement does not apply to your account (EULA_NOT_APPLICABLE)';
  END IF;

  v_cur := private.current_legal_agreement(p_agreement_type);
  IF v_cur.id IS NULL OR v_cur.snapshot_id IS NULL THEN
    RAISE EXCEPTION 'The current agreement has no frozen text (EULA_SNAPSHOT_UNAVAILABLE)';
  END IF;
  SELECT private.legal_snapshot_digest(body) INTO v_digest
  FROM public.legal_document_snapshots WHERE id = v_cur.snapshot_id;
  IF p_document_hash IS NULL
     OR p_version IS DISTINCT FROM v_cur.version
     OR p_document_hash IS DISTINCT FROM v_cur.document_hash
     OR p_document_hash IS DISTINCT FROM v_digest THEN
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

REVOKE ALL ON FUNCTION public.accept_legal_agreement(text, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.accept_legal_agreement(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_signup_request(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_side         signup_side;
  v_buyer_type   org_type;
  v_channel      verification_channel;
  v_codes        text[];
  v_role         text;
  v_id           uuid;
  v_ref          text;
  v_business     text;
  v_existing     signup_requests%ROWTYPE;
  v_status       text := 'PENDING';
  v_defer_reason text;
  v_agreement    public.legal_document_versions;
  v_digest       text;
BEGIN
  v_side := upper(COALESCE(p_request->>'side', ''))::signup_side;
  v_channel := upper(COALESCE(NULLIF(p_request->>'verification_channel', ''), 'EMAIL'))
               ::verification_channel;

  IF v_side = 'BUYER' THEN
    IF upper(btrim(COALESCE(p_request->>'buyer_type', ''))) NOT IN ('INDIVIDUAL', 'COMMUNITY', 'MSME') THEN
      RAISE EXCEPTION 'Buyer type is not a customer type (SIGNUP_BUYER_TYPE_REJECTED)';
    END IF;
    v_buyer_type := upper(btrim(p_request->>'buyer_type'))::org_type;
  END IF;

  v_agreement := private.current_legal_agreement(
    CASE WHEN v_side = 'SUPPLIER' THEN 'SUPPLIER_EULA' ELSE 'CUSTOMER_EULA' END
  );
  IF v_agreement.id IS NULL THEN
    RAISE EXCEPTION 'No current legal agreement is published (EULA_CATALOGUE_UNAVAILABLE)';
  END IF;
  IF v_agreement.snapshot_id IS NULL THEN
    RAISE EXCEPTION 'The current agreement has no frozen text (EULA_SNAPSHOT_UNAVAILABLE)';
  END IF;
  IF COALESCE(p_request->'eula_accepted', 'null'::jsonb) IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'You must accept the current agreement to register (EULA_NOT_ACCEPTED)';
  END IF;
  SELECT private.legal_snapshot_digest(body) INTO v_digest
  FROM public.legal_document_snapshots WHERE id = v_agreement.snapshot_id;
  IF p_request->>'document_hash' IS NULL
     OR p_request->>'eula_version' IS DISTINCT FROM v_agreement.version
     OR p_request->>'document_hash' IS DISTINCT FROM v_agreement.document_hash
     OR p_request->>'document_hash' IS DISTINCT FROM v_digest THEN
    RAISE EXCEPTION 'The agreement has been updated; review and accept the current version (EULA_VERSION_STALE)';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT c.code), '{}') INTO v_codes
  FROM jsonb_array_elements_text(COALESCE(p_request->'category_codes', '[]'::jsonb)) AS raw(code)
  JOIN requirement_categories c ON c.code = raw.code AND c.is_active;

  v_role := private.resolve_signup_role(
    v_side,
    CASE WHEN v_side = 'BUYER' THEN v_buyer_type ELSE NULL END,
    p_request->>'role_code'
  );

  v_business := btrim(COALESCE(p_request->>'business_name', ''));
  IF v_side = 'BUYER' AND v_buyer_type = 'INDIVIDUAL' THEN
    IF v_business = '' OR lower(v_business) = 'self' THEN
      v_business := 'Self';
    END IF;
  END IF;

  SELECT * INTO v_existing
  FROM signup_requests
  WHERE lower(email) = lower(p_request->>'email')
    AND side = v_side
    AND status <> 'REJECTED';

  IF FOUND THEN
    v_status := CASE WHEN v_existing.status = 'ONBOARDED' THEN 'ONBOARDED' ELSE 'PENDING' END;
    RETURN jsonb_build_object(
      'reference', 'REG-' || upper(substr(replace(v_existing.id::text, '-', ''), 1, 8)),
      'requestId', v_existing.id,
      'status', v_status,
      'already_submitted', false,
      'auto_approved', v_status = 'ONBOARDED',
      'activation_required', v_status = 'ONBOARDED'
    );
  END IF;

  INSERT INTO signup_requests (
    side, business_name, contact_first_name, contact_last_name, designation,
    email, phone, verification_channel, buyer_type, referral_code,
    category_codes, tax_registration_id, coverage_city, coverage_pincode, role_code,
    eula_agreement_type, eula_version, eula_document_hash, eula_accepted_at,
    status
  ) VALUES (
    v_side,
    v_business,
    btrim(p_request->>'contact_first_name'),
    btrim(p_request->>'contact_last_name'),
    NULLIF(btrim(COALESCE(p_request->>'designation', '')), ''),
    lower(btrim(p_request->>'email')),
    btrim(p_request->>'phone'),
    v_channel,
    v_buyer_type,
    NULLIF(btrim(COALESCE(p_request->>'referral_code', '')), ''),
    v_codes,
    NULLIF(btrim(COALESCE(p_request->>'tax_registration_id', '')), ''),
    NULLIF(btrim(COALESCE(p_request->>'coverage_city', '')), ''),
    NULLIF(btrim(COALESCE(p_request->>'coverage_pincode', '')), ''),
    v_role,
    v_agreement.agreement_type,
    v_agreement.version,
    v_agreement.document_hash,
    now(),
    'PENDING'
  )
  RETURNING id INTO v_id;

  v_ref := 'REG-' || upper(substr(replace(v_id::text, '-', ''), 1, 8));

  INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
  VALUES ('signup.requested', 'signup_request', v_id::text,
          jsonb_build_object('side', v_side, 'reference', v_ref,
                             'verification_channel', v_channel,
                             'role', v_role,
                             'business_name', v_business,
                             'buyer_type', v_buyer_type,
                             'eula_version', v_agreement.version));

  BEGIN
    PERFORM private.provision_signup_request(v_id, NULL, NULL, true);
    v_status := 'ONBOARDED';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_defer_reason = MESSAGE_TEXT;
    INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
    VALUES ('signup.review_required', 'signup_request', v_id::text,
            jsonb_build_object('reference', v_ref, 'reason', v_defer_reason));
  END;

  RETURN jsonb_build_object(
    'reference', v_ref,
    'requestId', v_id,
    'status', v_status,
    'already_submitted', false,
    'auto_approved', v_status = 'ONBOARDED',
    'activation_required', v_status = 'ONBOARDED'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_signup_request(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_signup_request(jsonb) TO anon, authenticated, service_role;

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
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;
  IF private.is_platform_admin() THEN
    INSERT INTO public.audit_events (event_type, actor_id, entity_type, entity_id, payload)
    VALUES (
      'legal.admin_write_bypass',
      v_actor,
      'LEGAL_ENFORCEMENT',
      TG_TABLE_NAME,
      jsonb_build_object('table', TG_TABLE_NAME)
    );
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
      IF NEW.owner_profile_id = v_actor OR EXISTS (
           SELECT 1 FROM public.organization_members om
           WHERE om.profile_id = v_actor AND om.organization_id = NEW.organization_id) THEN
        v_type := 'CUSTOMER_EULA';
        v_acting := true;
      ELSIF EXISTS (SELECT 1 FROM public.supplier_users su
                    WHERE su.profile_id = v_actor AND su.supplier_id = NEW.supplier_id) THEN
        v_type := 'SUPPLIER_EULA';
        v_acting := true;
      END IF;
    WHEN 'work_orders' THEN
      v_type := 'SUPPLIER_EULA';
      v_acting := EXISTS (SELECT 1 FROM public.supplier_users su
                          WHERE su.profile_id = v_actor AND su.supplier_id = NEW.supplier_id);
    WHEN 'invoices' THEN
      v_type := 'SUPPLIER_EULA';
      v_acting := EXISTS (SELECT 1 FROM public.supplier_users su
                          WHERE su.profile_id = v_actor AND su.supplier_id = NEW.supplier_id);
    WHEN 'payments' THEN
      v_type := 'CUSTOMER_EULA';
      v_acting := NEW.recorded_by = v_actor;
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
    RAISE EXCEPTION 'Legal enforcement configuration is incomplete (LEGAL_ENFORCEMENT_MISCONFIGURED)'
      USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION 'You must accept the current % before this action (LEGAL_ACCEPTANCE_REQUIRED)', v_type
    USING ERRCODE = '42501',
          HINT = 'Open the agreement prompt and accept the current version.';
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_legal_acceptance() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.current_legal_snapshot_text(p_agreement_type text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_cur public.legal_document_versions;
  v_body bytea;
BEGIN
  IF p_agreement_type NOT IN ('CUSTOMER_EULA', 'SUPPLIER_EULA') THEN
    RAISE EXCEPTION 'This agreement does not apply (EULA_NOT_APPLICABLE)';
  END IF;
  v_cur := private.current_legal_agreement(p_agreement_type);
  IF v_cur.id IS NULL OR v_cur.snapshot_id IS NULL THEN
    RETURN jsonb_build_object(
      'published', false,
      'agreementType', p_agreement_type,
      'version', v_cur.version,
      'documentHash', v_cur.document_hash,
      'bodyText', NULL
    );
  END IF;
  SELECT body INTO v_body FROM public.legal_document_snapshots WHERE id = v_cur.snapshot_id;
  RETURN jsonb_build_object(
    'published', true,
    'agreementType', p_agreement_type,
    'version', v_cur.version,
    'documentHash', v_cur.document_hash,
    'bodyText', convert_from(v_body, 'UTF8')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.current_legal_snapshot_text(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_legal_snapshot_text(text) TO anon, authenticated, service_role;

ALTER TABLE public.legal_review_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_document_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_agreement_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_acceptance_archives ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.legal_review_grants FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.legal_document_snapshots FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.legal_agreement_approvals FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.legal_acceptance_archives FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.legal_review_grants, public.legal_document_snapshots,
  public.legal_agreement_approvals, public.legal_acceptance_archives TO service_role;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.legal_document_versions FROM service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.legal_enforcement_config FROM service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.legal_acceptances FROM service_role;

COMMIT;
