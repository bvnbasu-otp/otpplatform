-- Closes reviewer impersonation and repairs a database that already recorded
-- an older 00291.
--
-- Re-running 00291 does not upgrade that database: its version is already
-- recorded, and executing the corrected file by hand fails because the tables
-- exist. This migration does not recreate tables, does not edit
-- schema_migrations, and does not seed a grant, snapshot, approval, or
-- rollout. Enforcement stays off.
--
-- The actor is private.verified_legal_actor(). A caller-supplied profile id
-- is not the actor. service_role cannot execute the reviewer RPCs. The first
-- grant still requires the database owner session.
--
-- 00292's acceptance-delete guard is left in place.

BEGIN;
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
