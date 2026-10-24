-- STATUS: UNAPPLIED
-- Review proposal only. This file is intentionally outside supabase/migrations.
-- It has not been applied to a local or hosted database.
--
-- Stores public Contact Us enquiries submitted through the `contact-enquiry`
-- edge function. Until this is applied, that function cannot record an
-- enquiry and tells the visitor so; it never reports a success it cannot show.
--
-- Boundaries:
--   * Separate from procurement, supplier, buyer, support-ticket and legal
--     records. No foreign keys into any of them.
--   * anon and authenticated have no table privileges except SELECT, and RLS
--     limits SELECT to platform admins. Nobody else can read or enumerate rows.
--   * Rows are written only by submit_contact_enquiry, executable by
--     service_role alone (the edge function). The browser never holds that key.
--   * submission_id is unique, so a retried submission returns the first row
--     instead of creating a second enquiry or a second notification. The RPC
--     stores a SHA-256 fingerprint of the normalized payload (fixed field
--     order) and compares it on conflict: the same payload is a DUPLICATE, a
--     different payload under a used submission_id is SUBMISSION_CONFLICT.
--     Neither creates a row, and the edge function sends no notice for either.
--   * The edge function ignores forwarded network identity headers. It accepts
--     only a server-issued HMAC-signed client credential, derives an opaque
--     per-client bucket with a server secret, and mints a new identity for a
--     missing/invalid credential. A separate fixed endpoint emergency ceiling
--     is substantially above the per-client quota.
--   * The CHECK constraints mirror the edge function's validation, including
--     the single-line rule that keeps header values free of CR/LF.
--
-- OPEN PRODUCTION DECISION (unresolved): contact enquiry retention. Rows hold
-- visitor names, emails, phone numbers and free-text messages, and nothing in
-- this proposal deletes or anonymises them; they are kept indefinitely until a
-- retention period and purge mechanism are decided and added separately. No
-- duration is assumed here. Rate-limit events are pruned opportunistically:
-- every admitted check_contact_enquiry_rate_limit call deletes events older
-- than 24 hours.
--
-- OPEN DECISION (unresolved): client-token lifetime. The signed client token
-- carries no expiry and is never rotated by the server while its signature
-- verifies; it changes only if CONTACT_RATE_LIMIT_SECRET changes or the
-- browser discards it (a fresh identity is then issued, so per-client limits
-- reset for that browser and only the endpoint ceiling still applies).

BEGIN;

DO $preconditions$
BEGIN
  IF to_regprocedure('private.is_platform_admin()') IS NULL THEN
    RAISE EXCEPTION 'CONTACT_ENQUIRY_PRECONDITION_FAILED: private.is_platform_admin() is required';
  END IF;
  IF to_regprocedure('public.set_updated_at()') IS NULL THEN
    RAISE EXCEPTION 'CONTACT_ENQUIRY_PRECONDITION_FAILED: public.set_updated_at() is required';
  END IF;
  IF to_regclass('public.contact_enquiries') IS NOT NULL THEN
    RAISE EXCEPTION 'CONTACT_ENQUIRY_PRECONDITION_FAILED: public.contact_enquiries already exists';
  END IF;
  IF to_regclass('public.contact_enquiry_rate_limits') IS NOT NULL THEN
    RAISE EXCEPTION 'CONTACT_ENQUIRY_PRECONDITION_FAILED: public.contact_enquiry_rate_limits already exists';
  END IF;
END
$preconditions$;

CREATE TABLE public.contact_enquiry_rate_limits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope        text NOT NULL CHECK (scope IN ('CLIENT', 'ENDPOINT')),
  bucket_key   text NOT NULL CHECK (bucket_key ~ '^[0-9a-f]{64}$'),
  occurred_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_contact_enquiry_rate_limits_lookup
  ON public.contact_enquiry_rate_limits (scope, bucket_key, occurred_at DESC);

ALTER TABLE public.contact_enquiry_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contact_enquiry_rate_limits FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.contact_enquiries (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference                  text NOT NULL UNIQUE,
  submission_id              uuid NOT NULL UNIQUE,
  payload_fingerprint        text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  category                   text NOT NULL CHECK (category IN (
                               'BUYER', 'SUPPLIER_ONBOARDING', 'BUSINESS_PARTNERSHIP', 'TECHNICAL_SUPPORT', 'OTHER'
                             )),
  name                       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120 AND name !~ '[\r\n]'),
  email                      text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254 AND email !~ '[\s<>]'
                               AND email ~ '^[^@]+@[^@]+\.[^@]{2,}$'),
  phone                      text CHECK (phone IS NULL OR phone ~ '^\+?[0-9]{10,15}$'),
  organisation               text CHECK (organisation IS NULL OR (char_length(organisation) BETWEEN 1 AND 160
                               AND organisation !~ '[\r\n]')),
  subject                    text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 160 AND subject !~ '[\r\n]'),
  message                    text NOT NULL CHECK (char_length(message) BETWEEN 10 AND 4000),
  notification_status        text NOT NULL DEFAULT 'PENDING'
                               CHECK (notification_status IN ('PENDING', 'SENT', 'FAILED', 'NOT_CONFIGURED')),
  notification_attempted_at  timestamptz,
  status                     text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'IN_REVIEW', 'CLOSED')),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contact_enquiries_created ON public.contact_enquiries (created_at DESC);
CREATE INDEX idx_contact_enquiries_status ON public.contact_enquiries (status, created_at DESC);

CREATE TRIGGER trg_contact_enquiries_updated_at
  BEFORE UPDATE ON public.contact_enquiries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.contact_enquiries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.contact_enquiries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.contact_enquiries TO authenticated;

CREATE POLICY contact_enquiries_platform_admin_read
  ON public.contact_enquiries
  FOR SELECT
  TO authenticated
  USING (private.is_platform_admin());

-- 1. Atomically consume both the isolated client allowance and the endpoint
-- emergency allowance. The caller can provide only the server-derived opaque
-- client hash; limits, endpoint scope and the emergency bucket are fixed here.
CREATE FUNCTION public.check_contact_enquiry_rate_limit(p_client_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_now             timestamptz := clock_timestamp();
  v_window_start    timestamptz := v_now - interval '1 hour';
  v_endpoint_key    constant text := encode(sha256(convert_to('contact-enquiry:endpoint:v1', 'UTF8')), 'hex');
  v_client_count    integer;
  v_endpoint_count  integer;
BEGIN
  IF p_client_key IS NULL OR p_client_key !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'CONTACT_ENQUIRY_RATE_LIMIT_UNAVAILABLE' USING ERRCODE = '22023';
  END IF;

  -- Global-before-client lock ordering is consistent for every invocation.
  -- The transaction locks serialize count + insert, preventing concurrent
  -- requests for one identity from exceeding either fixed allowance.
  PERFORM pg_advisory_xact_lock(hashtextextended('contact-enquiry:endpoint:v1', 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('contact-enquiry:client:' || p_client_key, 0));

  SELECT count(*)::integer INTO v_endpoint_count
  FROM public.contact_enquiry_rate_limits
  WHERE scope = 'ENDPOINT'
    AND bucket_key = v_endpoint_key
    AND occurred_at >= v_window_start;

  SELECT count(*)::integer INTO v_client_count
  FROM public.contact_enquiry_rate_limits
  WHERE scope = 'CLIENT'
    AND bucket_key = p_client_key
    AND occurred_at >= v_window_start;

  IF v_endpoint_count >= 200 THEN
    RETURN jsonb_build_object('allowed', false, 'scope', 'ENDPOINT');
  END IF;
  IF v_client_count >= 5 THEN
    RETURN jsonb_build_object('allowed', false, 'scope', 'CLIENT');
  END IF;

  INSERT INTO public.contact_enquiry_rate_limits (scope, bucket_key, occurred_at)
  VALUES
    ('ENDPOINT', v_endpoint_key, v_now),
    ('CLIENT', p_client_key, v_now);

  DELETE FROM public.contact_enquiry_rate_limits
  WHERE occurred_at < v_now - interval '24 hours';

  RETURN jsonb_build_object('allowed', true);
END;
$fn$;

-- 2. Record an enquiry (edge function only). Idempotent on submission_id:
-- result CREATED inserts a row; DUPLICATE (same submission_id, same payload
-- fingerprint) returns the first row; SUBMISSION_CONFLICT (same submission_id,
-- different payload) returns no row details and changes nothing.
CREATE FUNCTION public.submit_contact_enquiry(
  p_submission_id uuid,
  p_category      text,
  p_name          text,
  p_email         text,
  p_phone         text,
  p_organisation  text,
  p_subject       text,
  p_message       text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_id           uuid := gen_random_uuid();
  v_email        text := lower(p_email);
  v_phone        text := NULLIF(p_phone, '');
  v_organisation text := NULLIF(p_organisation, '');
  v_fingerprint  text;
  v_row          public.contact_enquiries%ROWTYPE;
  v_count        integer := 0;
BEGIN
  IF p_submission_id IS NULL THEN
    RAISE EXCEPTION 'CONTACT_ENQUIRY_INVALID: submission id is required' USING ERRCODE = '22023';
  END IF;

  -- Canonical order is fixed by the array position of each stored value, and
  -- JSON keeps NULL distinct from an empty string. Changing the order or the
  -- set of fields requires a new version tag.
  v_fingerprint := encode(sha256(convert_to(jsonb_build_array(
    'contact-enquiry:payload:v1',
    p_category,
    p_name,
    v_email,
    v_phone,
    v_organisation,
    p_subject,
    p_message
  )::text, 'UTF8')), 'hex');

  INSERT INTO public.contact_enquiries (
    id, reference, submission_id, payload_fingerprint, category, name, email, phone, organisation, subject, message
  )
  VALUES (
    v_id,
    'ENQ-' || upper(substr(replace(v_id::text, '-', ''), 1, 10)),
    p_submission_id,
    v_fingerprint,
    p_category,
    p_name,
    v_email,
    v_phone,
    v_organisation,
    p_subject,
    p_message
  )
  ON CONFLICT (submission_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  SELECT * INTO v_row FROM public.contact_enquiries WHERE submission_id = p_submission_id;

  IF v_count = 0 AND v_row.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
    RETURN jsonb_build_object('result', 'SUBMISSION_CONFLICT', 'created', false);
  END IF;

  RETURN jsonb_build_object(
    'result', CASE WHEN v_count = 1 THEN 'CREATED' ELSE 'DUPLICATE' END,
    'id', v_row.id,
    'reference', v_row.reference,
    'created', v_count = 1,
    'notification_status', v_row.notification_status
  );
END;
$fn$;

-- 3. Store the outcome of the single notification attempt (edge function only).
CREATE FUNCTION public.mark_contact_enquiry_notification(p_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF p_status NOT IN ('SENT', 'FAILED', 'NOT_CONFIGURED') THEN
    RAISE EXCEPTION 'CONTACT_ENQUIRY_INVALID: unknown notification status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.contact_enquiries
  SET notification_status = p_status,
      notification_attempted_at = now()
  WHERE id = p_id
    AND notification_status = 'PENDING';
END;
$fn$;

-- 4. Admin listing. Platform admins only; everyone else is refused.
CREATE FUNCTION public.admin_list_contact_enquiries(p_status text DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS SETOF public.contact_enquiries
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'CONTACT_ENQUIRY_FORBIDDEN: platform admin access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.contact_enquiries
  WHERE p_status IS NULL OR status = p_status
  ORDER BY created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
END;
$fn$;

-- 5. Admin triage status. Platform admins only.
CREATE FUNCTION public.admin_set_contact_enquiry_status(p_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'CONTACT_ENQUIRY_FORBIDDEN: platform admin access required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('NEW', 'IN_REVIEW', 'CLOSED') THEN
    RAISE EXCEPTION 'CONTACT_ENQUIRY_INVALID: unknown status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.contact_enquiries SET status = p_status WHERE id = p_id;
END;
$fn$;

ALTER FUNCTION public.check_contact_enquiry_rate_limit(text) OWNER TO postgres;
ALTER FUNCTION public.submit_contact_enquiry(uuid, text, text, text, text, text, text, text) OWNER TO postgres;
ALTER FUNCTION public.mark_contact_enquiry_notification(uuid, text) OWNER TO postgres;
ALTER FUNCTION public.admin_list_contact_enquiries(text, integer) OWNER TO postgres;
ALTER FUNCTION public.admin_set_contact_enquiry_status(uuid, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.check_contact_enquiry_rate_limit(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_contact_enquiry(uuid, text, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_contact_enquiry_notification(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_contact_enquiries(text, integer)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_contact_enquiry_status(uuid, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.check_contact_enquiry_rate_limit(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_contact_enquiry(uuid, text, text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_contact_enquiry_notification(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_contact_enquiries(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_contact_enquiry_status(uuid, text) TO authenticated;

COMMENT ON TABLE public.contact_enquiries IS
  'Public Contact Us enquiries. Written only via submit_contact_enquiry (service_role); readable only by platform admins.';
COMMENT ON TABLE public.contact_enquiry_rate_limits IS
  'Private Contact Us per-client and endpoint emergency rate-limit events; no direct client access.';

COMMIT;
