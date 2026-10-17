-- A database that already recorded 00291 kept the older legal_review_grants
-- table. That table has can_register, can_decide, and can_activate. It does
-- not have can_authorize or external_record_ref. Re-applying the corrected
-- 00291 file does not add them: the version is already recorded and the
-- table already exists. public.grant_legal_reviewer inserts both columns.
--
-- The recorded private.assert_legal_review_grant also has no 'authorize'
-- branch, so it ignores can_authorize and refuses revocation. This replaces
-- that function with the corrected 00291 body. The older table check accepts
-- only the three original flags; the corrected check also accepts
-- can_authorize. Rows that already satisfy the older check still satisfy it.
--
-- This does not seed a grant, a snapshot, an approval, or a rollout. It does
-- not set enforcement_enabled. It does not drop or rewrite legal evidence.
-- ADD COLUMN IF NOT EXISTS leaves a database that already has the columns
-- unchanged, and the function replace is the same body the corrected table
-- already uses.

BEGIN;

ALTER TABLE public.legal_review_grants
  ADD COLUMN IF NOT EXISTS can_authorize boolean NOT NULL DEFAULT false;

ALTER TABLE public.legal_review_grants
  ADD COLUMN IF NOT EXISTS external_record_ref text NOT NULL
  CHECK (btrim(external_record_ref) <> '');

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

COMMIT;
