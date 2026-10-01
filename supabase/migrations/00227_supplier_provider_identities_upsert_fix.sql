-- Repair 00226 upsert (partial unique index incompatible with ON CONFLICT) + service_role execute for guarded RPC tests.

BEGIN;

CREATE OR REPLACE FUNCTION private.upsert_supplier_provider_identity(
  p_supplier_id uuid,
  p_provider text,
  p_provider_supplier_id text,
  p_provider_participant_id text DEFAULT NULL,
  p_provider_catalogue_id text DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_id uuid;
  v_provider text := upper(btrim(p_provider));
  v_provider_supplier_id text := nullif(btrim(p_provider_supplier_id), '');
BEGIN
  IF p_supplier_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_provider NOT IN ('GOOGLE_PLACES', 'ONDC') THEN
    RAISE EXCEPTION 'unsupported provider %', p_provider;
  END IF;
  IF v_provider_supplier_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT spi.id INTO v_id
  FROM supplier_provider_identities spi
  WHERE spi.provider = v_provider
    AND spi.provider_supplier_id = v_provider_supplier_id
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE supplier_provider_identities
    SET
      supplier_id = p_supplier_id,
      provider_participant_id = COALESCE(nullif(btrim(p_provider_participant_id), ''), provider_participant_id),
      provider_catalogue_id = COALESCE(nullif(btrim(p_provider_catalogue_id), ''), provider_catalogue_id),
      correlation_id = COALESCE(nullif(btrim(p_correlation_id), ''), correlation_id),
      last_refresh_at = now()
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO supplier_provider_identities (
    supplier_id,
    provider,
    provider_supplier_id,
    provider_participant_id,
    provider_catalogue_id,
    correlation_id,
    discovered_at,
    last_refresh_at
  ) VALUES (
    p_supplier_id,
    v_provider,
    v_provider_supplier_id,
    nullif(btrim(p_provider_participant_id), ''),
    nullif(btrim(p_provider_catalogue_id), ''),
    nullif(btrim(p_correlation_id), ''),
    now(),
    now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION private.upsert_supplier_provider_identity(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.upsert_supplier_provider_identity(uuid, text, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION private.insert_ondc_provider_identity_guarded(uuid, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.insert_ondc_provider_identity_guarded(uuid, text, text, text, text, boolean) TO service_role;

COMMIT;
