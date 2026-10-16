-- Server-authoritative legal acceptance (audit finding EULA-1).
--
-- Before this migration the EULA version, document hash and acceptance time were
-- sent by the browser inside submit_signup_request and then dropped: nothing was
-- persisted, nothing was validated and no later gate existed. This migration adds:
--   * legal_document_versions - versioned catalogue (the only source of truth for
--     the current version and hash; historical versions are retained).
--   * legal_acceptances       - append-only acceptances bound to a profile, with a
--     server-generated timestamp and the catalogue hash (never client values).
--   * signup validation       - submit_signup_request requires an explicit
--     `eula_accepted: true` plus the current catalogue version, stores the
--     server-side evidence on signup_requests, and ignores client timestamps.
--   * post-login gate RPCs    - my_legal_acceptance_status / accept_legal_agreement.
--
-- Existing accounts are NOT backfilled: no historical consent is invented. They
-- are asked to accept the current version at next sign-in.
--
-- Open policy question: only one agreement document exists today. CUSTOMER_EULA
-- and SUPPLIER_EULA are seeded with the same version/hash so legal can version
-- them independently later.

BEGIN;

CREATE TABLE IF NOT EXISTS public.legal_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_type text NOT NULL CHECK (agreement_type IN ('CUSTOMER_EULA', 'SUPPLIER_EULA')),
  version text NOT NULL CHECK (btrim(version) <> ''),
  document_hash text NOT NULL CHECK (document_hash ~ '^sha256:[0-9a-f]{64}$'),
  title text NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agreement_type, version)
);

-- At most one current (not retired) version per agreement type.
CREATE UNIQUE INDEX IF NOT EXISTS legal_document_versions_one_current
  ON public.legal_document_versions (agreement_type)
  WHERE retired_at IS NULL;

CREATE OR REPLACE FUNCTION private.guard_legal_document_versions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Legal document versions are retained for audit and cannot be deleted (LEGAL_VERSION_IMMUTABLE)';
  END IF;
  IF NEW.agreement_type IS DISTINCT FROM OLD.agreement_type
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.document_hash IS DISTINCT FROM OLD.document_hash
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.effective_from IS DISTINCT FROM OLD.effective_from THEN
    RAISE EXCEPTION 'Published legal document versions are immutable; publish a new version (LEGAL_VERSION_IMMUTABLE)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS legal_document_versions_guard ON public.legal_document_versions;
CREATE TRIGGER legal_document_versions_guard
  BEFORE UPDATE OR DELETE ON public.legal_document_versions
  FOR EACH ROW EXECUTE FUNCTION private.guard_legal_document_versions();

CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agreement_type text NOT NULL,
  version text NOT NULL,
  document_hash text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  acceptance_source text NOT NULL CHECK (acceptance_source IN ('SIGNUP', 'POST_LOGIN')),
  signup_request_id uuid REFERENCES public.signup_requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (agreement_type, version)
    REFERENCES public.legal_document_versions (agreement_type, version),
  UNIQUE (profile_id, agreement_type, version)
);

CREATE INDEX IF NOT EXISTS idx_legal_acceptances_profile
  ON public.legal_acceptances (profile_id, agreement_type);

-- Acceptances are evidence: the hash must be the catalogue hash and rows cannot be edited.
CREATE OR REPLACE FUNCTION private.guard_legal_acceptances()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private
AS $$
DECLARE
  v_hash text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Legal acceptances are append-only (LEGAL_ACCEPTANCE_IMMUTABLE)';
  END IF;
  SELECT document_hash INTO v_hash
  FROM public.legal_document_versions
  WHERE agreement_type = NEW.agreement_type AND version = NEW.version;
  NEW.document_hash := v_hash;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS legal_acceptances_guard ON public.legal_acceptances;
CREATE TRIGGER legal_acceptances_guard
  BEFORE INSERT OR UPDATE ON public.legal_acceptances
  FOR EACH ROW EXECUTE FUNCTION private.guard_legal_acceptances();

ALTER TABLE public.legal_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS legal_document_versions_read ON public.legal_document_versions;
CREATE POLICY legal_document_versions_read ON public.legal_document_versions
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS legal_acceptances_read_own ON public.legal_acceptances;
CREATE POLICY legal_acceptances_read_own ON public.legal_acceptances
  FOR SELECT TO authenticated
  USING (profile_id = private.get_profile_id() OR private.is_platform_admin());

REVOKE ALL ON public.legal_document_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.legal_acceptances FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.legal_document_versions TO anon, authenticated;
GRANT SELECT ON public.legal_acceptances TO authenticated;
GRANT ALL ON public.legal_document_versions, public.legal_acceptances TO service_role;

-- Seed the version already shown to applicants. The hash is the value the browser
-- previously asserted; legal must confirm it matches the published document.
INSERT INTO public.legal_document_versions (agreement_type, version, document_hash, title)
VALUES
  ('CUSTOMER_EULA', 'v1.0-20261014',
   'sha256:7c8b0303d8a9e7019cf39e2df95000be05e527d91d8e13711311ffb43c683b5d',
   'OTP Customer Terms of Use and EULA'),
  ('SUPPLIER_EULA', 'v1.0-20261014',
   'sha256:7c8b0303d8a9e7019cf39e2df95000be05e527d91d8e13711311ffb43c683b5d',
   'OTP Supplier Terms of Use and EULA')
ON CONFLICT (agreement_type, version) DO NOTHING;

ALTER TABLE public.signup_requests
  ADD COLUMN IF NOT EXISTS eula_agreement_type text,
  ADD COLUMN IF NOT EXISTS eula_version text,
  ADD COLUMN IF NOT EXISTS eula_document_hash text,
  ADD COLUMN IF NOT EXISTS eula_accepted_at timestamptz;

CREATE OR REPLACE FUNCTION private.current_legal_agreement(p_agreement_type text)
RETURNS public.legal_document_versions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT v.* FROM public.legal_document_versions v
  WHERE v.agreement_type = p_agreement_type AND v.retired_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.current_legal_agreement(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.current_legal_agreement(text) TO service_role;

CREATE OR REPLACE FUNCTION private.required_agreement_types(p_profile_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT COALESCE(array_agg(DISTINCT CASE ur.side::text
                                       WHEN 'BUYER' THEN 'CUSTOMER_EULA'
                                       WHEN 'SUPPLIER' THEN 'SUPPLIER_EULA'
                                     END), '{}')
  FROM public.profile_roles pr
  JOIN public.user_roles ur ON ur.code = pr.role_code
  WHERE pr.profile_id = p_profile_id
    AND ur.side::text IN ('BUYER', 'SUPPLIER');
$$;

REVOKE ALL ON FUNCTION private.required_agreement_types(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.required_agreement_types(uuid) TO service_role;

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

  -- Legal gate: the applicant must explicitly accept the CURRENT catalogue version.
  -- Client-supplied timestamps are ignored; a client hash is only an assertion of
  -- what was shown and must match the catalogue.
  v_agreement := private.current_legal_agreement(
    CASE WHEN v_side = 'SUPPLIER' THEN 'SUPPLIER_EULA' ELSE 'CUSTOMER_EULA' END
  );
  IF v_agreement.id IS NULL THEN
    RAISE EXCEPTION 'No current legal agreement is published (EULA_CATALOGUE_UNAVAILABLE)';
  END IF;
  IF COALESCE(p_request->'eula_accepted', 'null'::jsonb) IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'You must accept the current agreement to register (EULA_NOT_ACCEPTED)';
  END IF;
  IF p_request->>'eula_version' IS DISTINCT FROM v_agreement.version
     OR (p_request->>'document_hash' IS NOT NULL
         AND p_request->>'document_hash' IS DISTINCT FROM v_agreement.document_hash) THEN
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

-- Persist the acceptance against the provisioned profile, whether provisioning
-- ran at signup (self-service) or later through admin approval. Requests that
-- carry no EULA evidence (legacy rows) never produce an acceptance.
CREATE OR REPLACE FUNCTION private.record_signup_legal_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  IF NEW.status::text = 'ONBOARDED'
     AND OLD.status::text IS DISTINCT FROM 'ONBOARDED'
     AND NEW.eula_version IS NOT NULL
     AND NEW.eula_agreement_type IS NOT NULL THEN
    SELECT id INTO v_profile_id
    FROM public.profiles
    WHERE lower(email) = lower(NEW.email)
    ORDER BY created_at
    LIMIT 1;

    IF v_profile_id IS NOT NULL THEN
      INSERT INTO public.legal_acceptances (
        profile_id, agreement_type, version, document_hash,
        accepted_at, acceptance_source, signup_request_id
      ) VALUES (
        v_profile_id, NEW.eula_agreement_type, NEW.eula_version, NEW.eula_document_hash,
        COALESCE(NEW.eula_accepted_at, now()), 'SIGNUP', NEW.id
      )
      ON CONFLICT (profile_id, agreement_type, version) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.record_signup_legal_acceptance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS signup_requests_record_legal_acceptance ON public.signup_requests;
CREATE TRIGGER signup_requests_record_legal_acceptance
  AFTER UPDATE OF status ON public.signup_requests
  FOR EACH ROW EXECUTE FUNCTION private.record_signup_legal_acceptance();

CREATE OR REPLACE FUNCTION public.my_legal_acceptance_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_profile_id uuid := private.get_profile_id();
  v_types text[];
  v_type text;
  v_cur public.legal_document_versions;
  v_acc public.legal_acceptances;
  v_items jsonb := '[]'::jsonb;
  v_pending boolean := false;
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated (AUTH_REQUIRED)';
  END IF;

  v_types := private.required_agreement_types(v_profile_id);

  FOREACH v_type IN ARRAY v_types LOOP
    v_cur := private.current_legal_agreement(v_type);
    IF v_cur.id IS NULL THEN
      CONTINUE;
    END IF;
    SELECT * INTO v_acc
    FROM public.legal_acceptances
    WHERE profile_id = v_profile_id AND agreement_type = v_type AND version = v_cur.version;

    v_items := v_items || jsonb_build_object(
      'agreementType', v_type,
      'title', v_cur.title,
      'currentVersion', v_cur.version,
      'documentHash', v_cur.document_hash,
      'accepted', v_acc.id IS NOT NULL,
      'acceptedAt', v_acc.accepted_at
    );
    IF v_acc.id IS NULL THEN
      v_pending := true;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('requiresAcceptance', v_pending, 'agreements', v_items);
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
