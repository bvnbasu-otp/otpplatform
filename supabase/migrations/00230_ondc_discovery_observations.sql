-- Discovery-only ONDC observations.
-- supplier_provider_identities requires an existing OTP supplier row, and its
-- guarded insert records live success. This table does neither.
-- No location-coverage key column. service_role only.
-- Buyers cannot read participant callback URI, phone, email, or payloads.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ondc_discovery_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_supplier_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ondc_discovery_identities_provider_check
    CHECK (provider = 'ONDC'),
  CONSTRAINT ondc_discovery_identities_supplier_key_nonempty
    CHECK (length(btrim(provider_supplier_id)) > 0),
  CONSTRAINT ondc_discovery_identities_provider_supplier_unique
    UNIQUE (provider, provider_supplier_id)
);

CREATE TABLE IF NOT EXISTS public.ondc_discovery_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES public.ondc_discovery_identities (id) ON DELETE CASCADE,
  correlation_id text NOT NULL,
  message_id text,
  requested_pin text,
  requested_category text,
  discovered_at timestamptz NOT NULL,
  provider_participant_id text NOT NULL,
  bpp_uri text,
  source text NOT NULL,
  environment text NOT NULL,
  display_name text NOT NULL,
  seller_pin text,
  seller_locality text,
  seller_city text,
  seller_state text,
  seller_country text,
  reported_phone text,
  reported_email text,
  catalogue_id text,
  location_id text,
  domain text,
  city_code text,
  retained_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ondc_discovery_observations_identity_unique UNIQUE (identity_id),
  CONSTRAINT ondc_discovery_observations_correlation_nonempty
    CHECK (length(btrim(correlation_id)) > 0),
  CONSTRAINT ondc_discovery_observations_participant_nonempty
    CHECK (length(btrim(provider_participant_id)) > 0),
  CONSTRAINT ondc_discovery_observations_display_name_nonempty
    CHECK (length(btrim(display_name)) > 0),
  CONSTRAINT ondc_discovery_observations_source_check
    CHECK (source IN ('LOCAL_FIXTURE', 'MOCK', 'REAL_NETWORK')),
  CONSTRAINT ondc_discovery_observations_environment_check
    CHECK (environment IN ('LOCAL', 'CI', 'PRE_PROD', 'PRODUCTION')),
  CONSTRAINT ondc_discovery_observations_provenance_check
    CHECK (
      (source IN ('LOCAL_FIXTURE', 'MOCK') AND environment IN ('LOCAL', 'CI'))
      OR (source = 'REAL_NETWORK' AND environment IN ('PRE_PROD', 'PRODUCTION'))
    )
);

CREATE OR REPLACE FUNCTION private.guard_ondc_discovery_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.provider IS DISTINCT FROM OLD.provider THEN
    RAISE EXCEPTION 'provider_immutable';
  END IF;
  IF NEW.provider_supplier_id IS DISTINCT FROM OLD.provider_supplier_id THEN
    RAISE EXCEPTION 'provider_supplier_id_immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ondc_discovery_identities_provider_immutable ON public.ondc_discovery_identities;
CREATE TRIGGER ondc_discovery_identities_provider_immutable
  BEFORE UPDATE ON public.ondc_discovery_identities
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_ondc_discovery_identity_mutation();

CREATE OR REPLACE FUNCTION private.guard_ondc_discovery_buyer_pin()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.requested_pin IS NOT NULL
     AND NEW.requested_pin IS DISTINCT FROM OLD.requested_pin THEN
    RAISE EXCEPTION 'buyer_pin_immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ondc_discovery_observations_buyer_pin ON public.ondc_discovery_observations;
CREATE TRIGGER ondc_discovery_observations_buyer_pin
  BEFORE UPDATE ON public.ondc_discovery_observations
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_ondc_discovery_buyer_pin();

CREATE OR REPLACE FUNCTION private.upsert_ondc_discovery_observation(
  p_provider_supplier_id text,
  p_provider_participant_id text,
  p_correlation_id text,
  p_message_id text,
  p_requested_pin text,
  p_requested_category text,
  p_discovered_at timestamptz,
  p_bpp_uri text,
  p_source text,
  p_environment text,
  p_display_name text,
  p_seller_pin text,
  p_seller_locality text,
  p_seller_city text,
  p_seller_state text,
  p_seller_country text,
  p_reported_phone text,
  p_reported_email text,
  p_catalogue_id text,
  p_location_id text,
  p_domain text,
  p_city_code text,
  p_production_activated boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_provider_supplier_id text := nullif(btrim(p_provider_supplier_id), '');
  v_participant text := nullif(btrim(p_provider_participant_id), '');
  v_correlation text := nullif(btrim(p_correlation_id), '');
  v_display text := nullif(btrim(p_display_name), '');
  v_source text := nullif(btrim(p_source), '');
  v_environment text := nullif(btrim(p_environment), '');
  v_identity_id uuid;
  v_obs_id uuid;
  v_existing_discovered timestamptz;
  v_existing_correlation text;
  v_existing_requested_pin text;
  v_requested_pin text;
BEGIN
  IF v_provider_supplier_id IS NULL OR v_participant IS NULL OR v_correlation IS NULL OR v_display IS NULL THEN
    RAISE EXCEPTION 'rejected_identity';
  END IF;
  IF p_discovered_at IS NULL THEN
    RAISE EXCEPTION 'missing_discovery_timestamp';
  END IF;
  IF lower(v_participant) IN ('unknown-bpp', 'unknown', 'fake', 'synthetic', 'placeholder') THEN
    RAISE EXCEPTION 'rejected_identity';
  END IF;
  IF lower(v_display) = 'ondc verified supplier' THEN
    RAISE EXCEPTION 'fabricated_display_name';
  END IF;
  IF v_source IS NULL OR v_source NOT IN ('LOCAL_FIXTURE', 'MOCK', 'REAL_NETWORK') THEN
    RAISE EXCEPTION 'rejected_provenance';
  END IF;
  IF v_environment IS NULL OR v_environment NOT IN ('LOCAL', 'CI', 'PRE_PROD', 'PRODUCTION') THEN
    RAISE EXCEPTION 'rejected_environment';
  END IF;
  IF v_source IN ('LOCAL_FIXTURE', 'MOCK') AND v_environment NOT IN ('LOCAL', 'CI') THEN
    RAISE EXCEPTION 'rejected_provenance';
  END IF;
  IF v_source = 'REAL_NETWORK' AND v_environment NOT IN ('PRE_PROD', 'PRODUCTION') THEN
    RAISE EXCEPTION 'rejected_provenance';
  END IF;
  IF v_environment = 'PRODUCTION' AND NOT COALESCE(p_production_activated, false) THEN
    RAISE EXCEPTION 'ondc_production_disabled';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ondc-discovery'), hashtext(v_provider_supplier_id));

  INSERT INTO ondc_discovery_identities (provider, provider_supplier_id)
  VALUES ('ONDC', v_provider_supplier_id)
  ON CONFLICT ON CONSTRAINT ondc_discovery_identities_provider_supplier_unique DO NOTHING
  RETURNING id INTO v_identity_id;

  IF v_identity_id IS NULL THEN
    SELECT id INTO v_identity_id
    FROM ondc_discovery_identities
    WHERE provider = 'ONDC'
      AND provider_supplier_id = v_provider_supplier_id;
  END IF;

  IF v_identity_id IS NULL THEN
    RAISE EXCEPTION 'rejected_identity';
  END IF;

  SELECT id, discovered_at, correlation_id, requested_pin
    INTO v_obs_id, v_existing_discovered, v_existing_correlation, v_existing_requested_pin
  FROM ondc_discovery_observations
  WHERE identity_id = v_identity_id
  FOR UPDATE;

  v_requested_pin := COALESCE(v_existing_requested_pin, nullif(btrim(p_requested_pin), ''));

  IF v_obs_id IS NULL THEN
    INSERT INTO ondc_discovery_observations (
      identity_id,
      correlation_id,
      message_id,
      requested_pin,
      requested_category,
      discovered_at,
      provider_participant_id,
      bpp_uri,
      source,
      environment,
      display_name,
      seller_pin,
      seller_locality,
      seller_city,
      seller_state,
      seller_country,
      reported_phone,
      reported_email,
      catalogue_id,
      location_id,
      domain,
      city_code
    ) VALUES (
      v_identity_id,
      v_correlation,
      nullif(btrim(p_message_id), ''),
      v_requested_pin,
      nullif(btrim(p_requested_category), ''),
      p_discovered_at,
      v_participant,
      nullif(btrim(p_bpp_uri), ''),
      v_source,
      v_environment,
      v_display,
      nullif(btrim(p_seller_pin), ''),
      nullif(btrim(p_seller_locality), ''),
      nullif(btrim(p_seller_city), ''),
      nullif(btrim(p_seller_state), ''),
      nullif(btrim(p_seller_country), ''),
      nullif(btrim(p_reported_phone), ''),
      nullif(btrim(p_reported_email), ''),
      nullif(btrim(p_catalogue_id), ''),
      nullif(btrim(p_location_id), ''),
      nullif(btrim(p_domain), ''),
      nullif(btrim(p_city_code), '')
    );
    RETURN v_identity_id;
  END IF;

  IF p_discovered_at < v_existing_discovered THEN
    RETURN v_identity_id;
  END IF;
  IF p_discovered_at = v_existing_discovered AND v_existing_correlation IS DISTINCT FROM v_correlation THEN
    RETURN v_identity_id;
  END IF;

  UPDATE ondc_discovery_observations
  SET
    correlation_id = v_correlation,
    message_id = COALESCE(nullif(btrim(p_message_id), ''), message_id),
    requested_pin = COALESCE(requested_pin, nullif(btrim(p_requested_pin), '')),
    requested_category = COALESCE(nullif(btrim(p_requested_category), ''), requested_category),
    discovered_at = p_discovered_at,
    provider_participant_id = v_participant,
    bpp_uri = COALESCE(nullif(btrim(p_bpp_uri), ''), bpp_uri),
    source = v_source,
    environment = v_environment,
    display_name = v_display,
    seller_pin = COALESCE(nullif(btrim(p_seller_pin), ''), seller_pin),
    seller_locality = COALESCE(nullif(btrim(p_seller_locality), ''), seller_locality),
    seller_city = COALESCE(nullif(btrim(p_seller_city), ''), seller_city),
    seller_state = COALESCE(nullif(btrim(p_seller_state), ''), seller_state),
    seller_country = COALESCE(nullif(btrim(p_seller_country), ''), seller_country),
    reported_phone = COALESCE(nullif(btrim(p_reported_phone), ''), reported_phone),
    reported_email = COALESCE(nullif(btrim(p_reported_email), ''), reported_email),
    catalogue_id = COALESCE(nullif(btrim(p_catalogue_id), ''), catalogue_id),
    location_id = COALESCE(nullif(btrim(p_location_id), ''), location_id),
    domain = COALESCE(nullif(btrim(p_domain), ''), domain),
    city_code = COALESCE(nullif(btrim(p_city_code), ''), city_code),
    retained_at = now()
  WHERE id = v_obs_id;

  RETURN v_identity_id;
END;
$$;

ALTER TABLE public.ondc_discovery_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ondc_discovery_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ondc_discovery_identities_no_buyer ON public.ondc_discovery_identities;
CREATE POLICY ondc_discovery_identities_no_buyer
  ON public.ondc_discovery_identities
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS ondc_discovery_observations_no_buyer ON public.ondc_discovery_observations;
CREATE POLICY ondc_discovery_observations_no_buyer
  ON public.ondc_discovery_observations
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.ondc_discovery_identities FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ondc_discovery_observations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ondc_discovery_identities TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ondc_discovery_observations TO service_role;

REVOKE ALL ON FUNCTION private.guard_ondc_discovery_identity_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.guard_ondc_discovery_buyer_pin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.upsert_ondc_discovery_observation(
  text, text, text, text, text, text, timestamptz, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.upsert_ondc_discovery_observation(
  text, text, text, text, text, text, timestamptz, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean
) TO service_role;

COMMENT ON TABLE public.ondc_discovery_identities IS
  'ONDC discovery identity keyed by provider and provider_supplier_id. Not suppliers.id. Provider cannot change.';

COMMENT ON TABLE public.ondc_discovery_observations IS
  'Latest valid ONDC discovery observation for one identity. Buyer PIN is independent of seller PIN. service_role only.';

COMMIT;
