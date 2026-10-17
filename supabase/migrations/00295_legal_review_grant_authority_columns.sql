-- A database that already recorded 00291 kept the older legal_review_grants
-- table: can_register, can_decide, and can_activate only. Re-applying the
-- corrected 00291 file does not add can_authorize or external_record_ref.
-- public.grant_legal_reviewer (from 00293) inserts both columns and already
-- rejects a blank external reference.
--
-- Legacy grants are rows that existed before this migration. They have no
-- external evidence. external_record_ref is added nullable, with no default
-- and no backfill: NULL means "no external record", and a blank value is
-- still rejected. can_authorize is added NOT NULL DEFAULT false, so those
-- rows do not gain the new capability. A fresh database whose 00291 column
-- is already NOT NULL is left unchanged by ADD COLUMN IF NOT EXISTS.
--
-- A missing reference must not confer authorization. The authority check
-- accepts can_authorize, and legal_review_grants_authorize_needs_evidence
-- refuses can_authorize unless the reference is non-blank.
-- private.assert_legal_review_grant requires both the flag and a non-blank
-- reference for 'authorize'. register, decide, and activate keep using the
-- original flags, including for a legacy row whose reference is NULL.
--
-- The immutability trigger stays in place and is not disabled. NULL = NULL
-- is not true, so the previous equality test would treat an untouched NULL
-- reference as a rewrite and block one-way revocation. The predicate now
-- uses IS NOT DISTINCT FROM for that column only. Identity, authority
-- flags, granted_at, and the reference still cannot change, DELETE stays
-- forbidden, and the audited-write session flag is still required.
-- revoke_legal_reviewer remains the path that appends the revocation audit
-- row. This does not seed a grant, a snapshot, an approval, or a rollout,
-- and it does not set enforcement_enabled.

BEGIN;

ALTER TABLE public.legal_review_grants
  ADD COLUMN IF NOT EXISTS can_authorize boolean NOT NULL DEFAULT false;

ALTER TABLE public.legal_review_grants
  ADD COLUMN IF NOT EXISTS external_record_ref text
  CHECK (external_record_ref IS NULL OR btrim(external_record_ref) <> '');

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.legal_review_grants'::regclass
    AND conname = 'legal_review_grants_check';
  IF v_def IS NOT NULL AND position('can_authorize' in v_def) = 0 THEN
    ALTER TABLE public.legal_review_grants DROP CONSTRAINT legal_review_grants_check;
    ALTER TABLE public.legal_review_grants
      ADD CONSTRAINT legal_review_grants_check
      CHECK (can_register OR can_decide OR can_activate OR can_authorize);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.legal_review_grants'::regclass
      AND conname = 'legal_review_grants_authorize_needs_evidence'
  ) THEN
    ALTER TABLE public.legal_review_grants
      ADD CONSTRAINT legal_review_grants_authorize_needs_evidence
      CHECK (
        NOT can_authorize
        OR (external_record_ref IS NOT NULL AND btrim(external_record_ref) <> '')
      );
  END IF;
END $$;

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
            -- A legacy NULL reference is not evidence and cannot authorize.
            WHEN 'authorize' THEN g.can_authorize
              AND NULLIF(btrim(g.external_record_ref), '') IS NOT NULL
            ELSE false
          END
  ) THEN
    RAISE EXCEPTION 'This profile is not authorized for legal review (LEGAL_REVIEW_UNAUTHORIZED)'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_legal_review_grant(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

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
     AND NEW.external_record_ref IS NOT DISTINCT FROM OLD.external_record_ref THEN
    NEW.revoked_at := clock_timestamp();
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Legal review grants cannot be rewritten (LEGAL_GRANT_IMMUTABLE)';
END;
$$;

COMMIT;
