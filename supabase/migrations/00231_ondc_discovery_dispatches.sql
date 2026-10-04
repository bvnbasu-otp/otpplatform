-- Outbound ONDC /search lifecycle. Not an observation and not a supplier.
-- A seller-less search is stored here and is not inserted into 00230.
-- 00230 is written only by private.accept_ondc_discovery_on_search after a
-- correlated callback supplies a real provider_supplier_id.
-- No signing key, registry secret, callback URI, display name, or
-- provider_supplier_id is stored on the dispatch row.
--
-- Uniqueness basis (this OTP issuer, not a guess about other ONDC networks):
-- the dispatcher sets context.transaction_id to the OTP transaction id and
-- keeps one dispatch per transaction_id (ledger byTransactionId). message_id
-- is allocated once for that dispatch and is not reused. A retry of the same
-- search recovers transaction_id, message_id, and correlation_id through
-- idempotency_key (otp transaction id + search + buyer pin + domain). A
-- second pin or domain under the same OTP transaction id is a different
-- idempotency key and is rejected by the unique transaction_id instead of
-- inventing another ONDC transaction. Unique (transaction_id, message_id)
-- is the callback correlation key.
--
-- Lifecycle stored here: CREATED, DISPATCHING, CALLBACK_PENDING,
-- CALLBACK_VERIFIED, OBSERVED, FAILED, TIMED_OUT.
-- SENT and ACKNOWLEDGED are not stored. Gateway HTTP 200/202 is
-- CALLBACK_PENDING, with real_network_verified false, and is not OBSERVED.
-- LOCAL/CI rows are MOCK. PRE_PROD rows are REAL_NETWORK. PRODUCTION is
-- rejected. The body digest is the server-calculated BLAKE-512 string
-- (blake2b512, base64, prefix BLAKE-512=) used for ONDC signing. The raw
-- callback body is not stored.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ondc_discovery_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'ONDC',
  environment text NOT NULL,
  observation_source text NOT NULL,
  transaction_id text NOT NULL,
  message_id text NOT NULL,
  correlation_id text NOT NULL,
  idempotency_key text NOT NULL,
  otp_transaction_id text NOT NULL,
  buyer_requested_pin text NOT NULL,
  domain text NOT NULL,
  city text NOT NULL,
  operation text NOT NULL DEFAULT 'SEARCH',
  expected_bap_id text NOT NULL,
  category_label text,
  subcategory_code text,
  requirement_mode text,
  status text NOT NULL DEFAULT 'CREATED',
  real_network_verified boolean NOT NULL DEFAULT false,
  bound_participant_id text,
  callback_digest text,
  canonical_observed_at timestamptz,
  failure_reason text,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ondc_discovery_dispatches_provider_check
    CHECK (provider = 'ONDC'),
  CONSTRAINT ondc_discovery_dispatches_operation_check
    CHECK (operation = 'SEARCH'),
  CONSTRAINT ondc_discovery_dispatches_environment_check
    CHECK (environment IN ('LOCAL', 'CI', 'PRE_PROD')),
  CONSTRAINT ondc_discovery_dispatches_source_check
    CHECK (observation_source IN ('MOCK', 'REAL_NETWORK')),
  CONSTRAINT ondc_discovery_dispatches_provenance_check
    CHECK (
      (observation_source = 'MOCK' AND environment IN ('LOCAL', 'CI'))
      OR (observation_source = 'REAL_NETWORK' AND environment = 'PRE_PROD')
    ),
  CONSTRAINT ondc_discovery_dispatches_domain_check
    CHECK (domain IN ('ONDC:RET12', 'ONDC:RET14')),
  CONSTRAINT ondc_discovery_dispatches_city_check
    CHECK (city ~ '^std:[0-9]+$'),
  CONSTRAINT ondc_discovery_dispatches_pin_check
    CHECK (buyer_requested_pin ~ '^[1-9][0-9]{5}$'),
  CONSTRAINT ondc_discovery_dispatches_status_check
    CHECK (status IN (
      'CREATED',
      'DISPATCHING',
      'CALLBACK_PENDING',
      'CALLBACK_VERIFIED',
      'OBSERVED',
      'FAILED',
      'TIMED_OUT'
    )),
  CONSTRAINT ondc_discovery_dispatches_verified_check
    CHECK (
      real_network_verified = false
      OR (
        real_network_verified = true
        AND observation_source = 'REAL_NETWORK'
        AND environment = 'PRE_PROD'
        AND status IN ('CALLBACK_VERIFIED', 'OBSERVED')
      )
    ),
  CONSTRAINT ondc_discovery_dispatches_transaction_nonempty
    CHECK (length(btrim(transaction_id)) > 0),
  CONSTRAINT ondc_discovery_dispatches_message_nonempty
    CHECK (length(btrim(message_id)) > 0),
  CONSTRAINT ondc_discovery_dispatches_correlation_nonempty
    CHECK (length(btrim(correlation_id)) > 0),
  CONSTRAINT ondc_discovery_dispatches_idempotency_nonempty
    CHECK (length(btrim(idempotency_key)) > 0),
  CONSTRAINT ondc_discovery_dispatches_otp_transaction_nonempty
    CHECK (length(btrim(otp_transaction_id)) > 0),
  CONSTRAINT ondc_discovery_dispatches_bap_nonempty
    CHECK (length(btrim(expected_bap_id)) > 0),
  CONSTRAINT ondc_discovery_dispatches_transaction_unique
    UNIQUE (transaction_id),
  CONSTRAINT ondc_discovery_dispatches_transaction_message_unique
    UNIQUE (transaction_id, message_id),
  CONSTRAINT ondc_discovery_dispatches_idempotency_key_unique
    UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS ondc_discovery_dispatches_correlation_idx
  ON public.ondc_discovery_dispatches (correlation_id);

CREATE TABLE IF NOT EXISTS public.ondc_discovery_callback_replays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id text NOT NULL,
  message_id text NOT NULL,
  callback_subscriber text NOT NULL,
  body_digest text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ondc_discovery_callback_replays_dispatch_fk
    FOREIGN KEY (transaction_id)
    REFERENCES public.ondc_discovery_dispatches (transaction_id),
  CONSTRAINT ondc_discovery_callback_replays_unique
    UNIQUE (transaction_id, message_id, callback_subscriber, body_digest),
  CONSTRAINT ondc_discovery_callback_replays_subscriber_nonempty
    CHECK (length(btrim(callback_subscriber)) > 0),
  CONSTRAINT ondc_discovery_callback_replays_digest_check
    CHECK (body_digest ~ '^BLAKE-512=[A-Za-z0-9+/]+=*$')
);

CREATE OR REPLACE FUNCTION private.guard_ondc_discovery_dispatch_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_writer text := current_setting('ondc.dispatch_writer', true);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF v_writer IS DISTINCT FROM 'dispatch_insert' THEN
      RAISE EXCEPTION 'untrusted_dispatch_insert';
    END IF;
    IF NEW.real_network_verified IS TRUE THEN
      RAISE EXCEPTION 'real_network_unverified_insert';
    END IF;
    IF NEW.provider IS DISTINCT FROM 'ONDC' THEN
      RAISE EXCEPTION 'rejected_provider';
    END IF;
    IF NEW.operation IS DISTINCT FROM 'SEARCH' THEN
      RAISE EXCEPTION 'rejected_operation';
    END IF;
    NEW.real_network_verified := false;
    NEW.status := 'CREATED';
    NEW.bound_participant_id := NULL;
    NEW.callback_digest := NULL;
    NEW.canonical_observed_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.transaction_id IS DISTINCT FROM OLD.transaction_id THEN
    RAISE EXCEPTION 'transaction_id_immutable';
  END IF;
  IF NEW.message_id IS DISTINCT FROM OLD.message_id THEN
    RAISE EXCEPTION 'message_id_immutable';
  END IF;
  IF NEW.provider IS DISTINCT FROM OLD.provider THEN
    RAISE EXCEPTION 'provider_immutable';
  END IF;
  IF NEW.environment IS DISTINCT FROM OLD.environment THEN
    RAISE EXCEPTION 'environment_immutable';
  END IF;
  IF NEW.buyer_requested_pin IS DISTINCT FROM OLD.buyer_requested_pin THEN
    RAISE EXCEPTION 'buyer_pin_immutable';
  END IF;
  IF NEW.domain IS DISTINCT FROM OLD.domain THEN
    RAISE EXCEPTION 'domain_immutable';
  END IF;
  IF NEW.operation IS DISTINCT FROM OLD.operation THEN
    RAISE EXCEPTION 'operation_immutable';
  END IF;
  IF NEW.expected_bap_id IS DISTINCT FROM OLD.expected_bap_id THEN
    RAISE EXCEPTION 'expected_bap_immutable';
  END IF;
  IF NEW.observation_source IS DISTINCT FROM OLD.observation_source THEN
    RAISE EXCEPTION 'observation_source_immutable';
  END IF;
  IF NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
    RAISE EXCEPTION 'idempotency_key_immutable';
  END IF;
  IF NEW.correlation_id IS DISTINCT FROM OLD.correlation_id THEN
    RAISE EXCEPTION 'correlation_id_immutable';
  END IF;
  IF NEW.otp_transaction_id IS DISTINCT FROM OLD.otp_transaction_id THEN
    RAISE EXCEPTION 'otp_transaction_immutable';
  END IF;
  IF NEW.city IS DISTINCT FROM OLD.city THEN
    RAISE EXCEPTION 'city_immutable';
  END IF;
  IF NEW.category_label IS DISTINCT FROM OLD.category_label THEN
    RAISE EXCEPTION 'category_immutable';
  END IF;
  IF NEW.subcategory_code IS DISTINCT FROM OLD.subcategory_code THEN
    RAISE EXCEPTION 'subcategory_immutable';
  END IF;
  IF NEW.requirement_mode IS DISTINCT FROM OLD.requirement_mode THEN
    RAISE EXCEPTION 'requirement_mode_immutable';
  END IF;
  IF NEW.initiated_at IS DISTINCT FROM OLD.initiated_at THEN
    RAISE EXCEPTION 'initiated_at_immutable';
  END IF;

  IF v_writer IS DISTINCT FROM 'dispatch_lifecycle' AND v_writer IS DISTINCT FROM 'dispatch_callback' THEN
    RAISE EXCEPTION 'untrusted_dispatch_update';
  END IF;

  IF v_writer = 'dispatch_lifecycle' THEN
    IF NEW.real_network_verified IS TRUE THEN
      RAISE EXCEPTION 'real_network_unverified_update';
    END IF;
    IF NEW.callback_digest IS DISTINCT FROM OLD.callback_digest
       OR NEW.canonical_observed_at IS DISTINCT FROM OLD.canonical_observed_at
       OR NEW.bound_participant_id IS DISTINCT FROM OLD.bound_participant_id THEN
      RAISE EXCEPTION 'untrusted_dispatch_update';
    END IF;
    IF NEW.status NOT IN ('DISPATCHING', 'CALLBACK_PENDING', 'FAILED', 'TIMED_OUT') THEN
      RAISE EXCEPTION 'invalid_lifecycle_status';
    END IF;
  END IF;

  IF v_writer = 'dispatch_callback' THEN
    IF OLD.callback_digest IS NOT NULL AND NEW.callback_digest IS DISTINCT FROM OLD.callback_digest THEN
      RAISE EXCEPTION 'callback_digest_immutable';
    END IF;
    IF OLD.canonical_observed_at IS NOT NULL
       AND NEW.canonical_observed_at IS NOT NULL
       AND NEW.canonical_observed_at < OLD.canonical_observed_at THEN
      RAISE EXCEPTION 'canonical_observed_at_regression';
    END IF;
    IF OLD.bound_participant_id IS NOT NULL
       AND NEW.bound_participant_id IS DISTINCT FROM OLD.bound_participant_id THEN
      RAISE EXCEPTION 'bound_participant_immutable';
    END IF;
    IF NEW.real_network_verified IS TRUE AND OLD.real_network_verified IS NOT TRUE THEN
      IF NEW.observation_source IS DISTINCT FROM 'REAL_NETWORK'
         OR NEW.status NOT IN ('CALLBACK_VERIFIED', 'OBSERVED') THEN
        RAISE EXCEPTION 'real_network_unverified_update';
      END IF;
    END IF;
    IF OLD.real_network_verified IS TRUE AND NEW.real_network_verified IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'real_network_verified_immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ondc_discovery_dispatches_guard ON public.ondc_discovery_dispatches;
CREATE TRIGGER ondc_discovery_dispatches_guard
  BEFORE INSERT OR UPDATE ON public.ondc_discovery_dispatches
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_ondc_discovery_dispatch_write();

CREATE OR REPLACE FUNCTION private.guard_ondc_discovery_callback_replay()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'replay_immutable';
  END IF;
  IF current_setting('ondc.dispatch_writer', true) IS DISTINCT FROM 'dispatch_callback' THEN
    RAISE EXCEPTION 'untrusted_replay_insert';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ondc_discovery_callback_replays_guard ON public.ondc_discovery_callback_replays;
CREATE TRIGGER ondc_discovery_callback_replays_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.ondc_discovery_callback_replays
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_ondc_discovery_callback_replay();

CREATE OR REPLACE FUNCTION private.ondc_discovery_dispatch_json(p_row public.ondc_discovery_dispatches)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'provider', p_row.provider,
    'environment', p_row.environment,
    'observation_source', p_row.observation_source,
    'transaction_id', p_row.transaction_id,
    'message_id', p_row.message_id,
    'correlation_id', p_row.correlation_id,
    'idempotency_key', p_row.idempotency_key,
    'otp_transaction_id', p_row.otp_transaction_id,
    'buyer_requested_pin', p_row.buyer_requested_pin,
    'domain', p_row.domain,
    'city', p_row.city,
    'operation', p_row.operation,
    'expected_bap_id', p_row.expected_bap_id,
    'category_label', p_row.category_label,
    'subcategory_code', p_row.subcategory_code,
    'requirement_mode', p_row.requirement_mode,
    'status', p_row.status,
    'real_network_verified', p_row.real_network_verified,
    'bound_participant_id', p_row.bound_participant_id,
    'callback_digest', p_row.callback_digest,
    'canonical_observed_at', p_row.canonical_observed_at,
    'failure_reason', p_row.failure_reason,
    'initiated_at', p_row.initiated_at
  );
$$;

CREATE OR REPLACE FUNCTION private.insert_ondc_discovery_dispatch(
  p_idempotency_key text,
  p_transaction_id text,
  p_message_id text,
  p_correlation_id text,
  p_otp_transaction_id text,
  p_buyer_requested_pin text,
  p_domain text,
  p_city text,
  p_environment text,
  p_observation_source text,
  p_expected_bap_id text,
  p_category_label text,
  p_subcategory_code text,
  p_requirement_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_key text := nullif(btrim(p_idempotency_key), '');
  v_transaction_id text := nullif(btrim(p_transaction_id), '');
  v_message_id text := nullif(btrim(p_message_id), '');
  v_correlation_id text := nullif(btrim(p_correlation_id), '');
  v_otp_transaction_id text := nullif(btrim(p_otp_transaction_id), '');
  v_pin text := nullif(btrim(p_buyer_requested_pin), '');
  v_domain text := nullif(btrim(p_domain), '');
  v_city text := nullif(btrim(p_city), '');
  v_environment text := nullif(btrim(p_environment), '');
  v_source text := nullif(btrim(p_observation_source), '');
  v_bap text := nullif(btrim(p_expected_bap_id), '');
  v_row public.ondc_discovery_dispatches;
  v_recovered boolean := false;
BEGIN
  IF v_key IS NULL OR v_transaction_id IS NULL OR v_message_id IS NULL
     OR v_correlation_id IS NULL OR v_otp_transaction_id IS NULL
     OR v_pin IS NULL OR v_domain IS NULL OR v_city IS NULL
     OR v_environment IS NULL OR v_source IS NULL OR v_bap IS NULL THEN
    RAISE EXCEPTION 'rejected_identity';
  END IF;
  IF v_environment = 'PRODUCTION' THEN
    RAISE EXCEPTION 'ondc_production_disabled';
  END IF;
  IF v_environment NOT IN ('LOCAL', 'CI', 'PRE_PROD') THEN
    RAISE EXCEPTION 'rejected_environment';
  END IF;
  IF v_source NOT IN ('MOCK', 'REAL_NETWORK') THEN
    RAISE EXCEPTION 'rejected_provenance';
  END IF;
  IF v_source = 'MOCK' AND v_environment NOT IN ('LOCAL', 'CI') THEN
    RAISE EXCEPTION 'rejected_provenance';
  END IF;
  IF v_source = 'REAL_NETWORK' AND v_environment IS DISTINCT FROM 'PRE_PROD' THEN
    RAISE EXCEPTION 'rejected_provenance';
  END IF;
  IF v_domain NOT IN ('ONDC:RET12', 'ONDC:RET14') THEN
    RAISE EXCEPTION 'unsupported_domain';
  END IF;
  IF v_city !~ '^std:[0-9]+$' THEN
    RAISE EXCEPTION 'invalid_city';
  END IF;
  IF v_pin !~ '^[1-9][0-9]{5}$' THEN
    RAISE EXCEPTION 'invalid_buyer_pin';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ondc-discovery-dispatch'), hashtext(v_key));

  PERFORM set_config('ondc.dispatch_writer', 'dispatch_insert', true);
  INSERT INTO public.ondc_discovery_dispatches (
    provider,
    environment,
    observation_source,
    transaction_id,
    message_id,
    correlation_id,
    idempotency_key,
    otp_transaction_id,
    buyer_requested_pin,
    domain,
    city,
    operation,
    expected_bap_id,
    category_label,
    subcategory_code,
    requirement_mode,
    status,
    real_network_verified
  ) VALUES (
    'ONDC',
    v_environment,
    v_source,
    v_transaction_id,
    v_message_id,
    v_correlation_id,
    v_key,
    v_otp_transaction_id,
    v_pin,
    v_domain,
    v_city,
    'SEARCH',
    v_bap,
    nullif(btrim(p_category_label), ''),
    nullif(btrim(p_subcategory_code), ''),
    nullif(btrim(p_requirement_mode), ''),
    'CREATED',
    false
  )
  ON CONFLICT ON CONSTRAINT ondc_discovery_dispatches_idempotency_key_unique DO NOTHING
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    v_recovered := true;
    SELECT * INTO v_row
    FROM public.ondc_discovery_dispatches
    WHERE idempotency_key = v_key;
    IF v_row.id IS NULL THEN
      PERFORM set_config('ondc.dispatch_writer', '', true);
      RAISE EXCEPTION 'dispatch_not_durable';
    END IF;
    IF v_row.environment IS DISTINCT FROM v_environment
       OR v_row.observation_source IS DISTINCT FROM v_source
       OR v_row.buyer_requested_pin IS DISTINCT FROM v_pin
       OR v_row.domain IS DISTINCT FROM v_domain
       OR v_row.expected_bap_id IS DISTINCT FROM v_bap
       OR v_row.city IS DISTINCT FROM v_city THEN
      PERFORM set_config('ondc.dispatch_writer', '', true);
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
  END IF;

  PERFORM set_config('ondc.dispatch_writer', '', true);
  RETURN private.ondc_discovery_dispatch_json(v_row) || jsonb_build_object('recovered', v_recovered);
EXCEPTION
  WHEN unique_violation THEN
    PERFORM set_config('ondc.dispatch_writer', '', true);
    RAISE EXCEPTION 'transaction_id_reused';
END;
$$;

CREATE OR REPLACE FUNCTION private.advance_ondc_discovery_dispatch(
  p_transaction_id text,
  p_message_id text,
  p_status text,
  p_failure_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_transaction_id text := nullif(btrim(p_transaction_id), '');
  v_message_id text := nullif(btrim(p_message_id), '');
  v_status text := nullif(btrim(p_status), '');
  v_row public.ondc_discovery_dispatches;
BEGIN
  IF v_transaction_id IS NULL OR v_message_id IS NULL OR v_status IS NULL THEN
    RAISE EXCEPTION 'rejected_identity';
  END IF;
  IF v_status NOT IN ('DISPATCHING', 'CALLBACK_PENDING', 'FAILED', 'TIMED_OUT') THEN
    RAISE EXCEPTION 'invalid_lifecycle_status';
  END IF;

  SELECT * INTO v_row
  FROM public.ondc_discovery_dispatches
  WHERE transaction_id = v_transaction_id
  FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'unknown_transaction';
  END IF;
  IF v_row.message_id IS DISTINCT FROM v_message_id THEN
    RAISE EXCEPTION 'unknown_message';
  END IF;
  IF v_status = 'DISPATCHING' AND v_row.status NOT IN ('CREATED', 'DISPATCHING') THEN
    RAISE EXCEPTION 'invalid_lifecycle_status';
  END IF;
  IF v_status = 'CALLBACK_PENDING' AND v_row.status NOT IN ('CREATED', 'DISPATCHING') THEN
    RAISE EXCEPTION 'invalid_lifecycle_status';
  END IF;
  IF v_status = 'FAILED' AND v_row.status NOT IN ('CREATED', 'DISPATCHING') THEN
    RAISE EXCEPTION 'invalid_lifecycle_status';
  END IF;
  IF v_status = 'TIMED_OUT' AND v_row.status IS DISTINCT FROM 'CALLBACK_PENDING' THEN
    RAISE EXCEPTION 'invalid_lifecycle_status';
  END IF;

  PERFORM set_config('ondc.dispatch_writer', 'dispatch_lifecycle', true);
  UPDATE public.ondc_discovery_dispatches
  SET
    status = v_status,
    failure_reason = CASE
      WHEN v_status IN ('FAILED', 'TIMED_OUT') THEN nullif(btrim(p_failure_reason), '')
      ELSE NULL
    END,
    real_network_verified = false,
    updated_at = now()
  WHERE id = v_row.id
  RETURNING * INTO v_row;
  PERFORM set_config('ondc.dispatch_writer', '', true);
  RETURN private.ondc_discovery_dispatch_json(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION private.find_ondc_discovery_dispatch(
  p_idempotency_key text DEFAULT NULL,
  p_transaction_id text DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_row public.ondc_discovery_dispatches;
BEGIN
  IF nullif(btrim(p_transaction_id), '') IS NOT NULL THEN
    SELECT * INTO v_row
    FROM public.ondc_discovery_dispatches
    WHERE transaction_id = btrim(p_transaction_id);
  ELSIF nullif(btrim(p_idempotency_key), '') IS NOT NULL THEN
    SELECT * INTO v_row
    FROM public.ondc_discovery_dispatches
    WHERE idempotency_key = btrim(p_idempotency_key);
  ELSIF nullif(btrim(p_correlation_id), '') IS NOT NULL THEN
    SELECT * INTO v_row
    FROM public.ondc_discovery_dispatches
    WHERE correlation_id = btrim(p_correlation_id);
  ELSE
    RETURN NULL;
  END IF;
  IF v_row.id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN private.ondc_discovery_dispatch_json(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION private.accept_ondc_discovery_on_search(
  p_transaction_id text,
  p_message_id text,
  p_callback_subscriber text,
  p_body_digest text,
  p_observed_at timestamptz,
  p_domain text,
  p_bap_id text,
  p_environment text,
  p_observation_source text,
  p_candidates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_transaction_id text := nullif(btrim(p_transaction_id), '');
  v_message_id text := nullif(btrim(p_message_id), '');
  v_subscriber text := nullif(btrim(p_callback_subscriber), '');
  v_digest text := nullif(btrim(p_body_digest), '');
  v_row public.ondc_discovery_dispatches;
  v_candidate jsonb;
  v_supplier text;
  v_participant text;
  v_display text;
  v_count integer := 0;
  v_existing_digest text;
BEGIN
  IF v_transaction_id IS NULL THEN
    RAISE EXCEPTION 'unknown_transaction';
  END IF;
  SELECT * INTO v_row
  FROM public.ondc_discovery_dispatches
  WHERE transaction_id = v_transaction_id
  FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'unknown_transaction';
  END IF;
  IF v_message_id IS NULL OR v_row.message_id IS DISTINCT FROM v_message_id THEN
    RAISE EXCEPTION 'unknown_message';
  END IF;
  IF v_row.status NOT IN ('CALLBACK_PENDING', 'TIMED_OUT', 'CALLBACK_VERIFIED', 'OBSERVED') THEN
    RAISE EXCEPTION 'callback_not_pending';
  END IF;
  IF p_environment IS DISTINCT FROM v_row.environment THEN
    RAISE EXCEPTION 'environment_mismatch';
  END IF;
  IF p_observation_source IS DISTINCT FROM v_row.observation_source THEN
    RAISE EXCEPTION 'mock_not_real';
  END IF;
  IF p_domain IS NOT NULL AND btrim(p_domain) IS DISTINCT FROM v_row.domain THEN
    RAISE EXCEPTION 'wrong_context';
  END IF;
  IF nullif(btrim(p_bap_id), '') IS DISTINCT FROM v_row.expected_bap_id THEN
    RAISE EXCEPTION 'wrong_context';
  END IF;
  IF v_subscriber IS NULL THEN
    RAISE EXCEPTION 'wrong_provider';
  END IF;
  IF v_row.bound_participant_id IS NOT NULL AND v_row.bound_participant_id IS DISTINCT FROM v_subscriber THEN
    RAISE EXCEPTION 'wrong_provider';
  END IF;
  IF v_digest IS NULL OR v_digest !~ '^BLAKE-512=[A-Za-z0-9+/]+=*$' THEN
    RAISE EXCEPTION 'malformed_callback';
  END IF;
  IF p_observed_at IS NULL THEN
    RAISE EXCEPTION 'malformed_callback';
  END IF;

  SELECT body_digest INTO v_existing_digest
  FROM public.ondc_discovery_callback_replays
  WHERE transaction_id = v_row.transaction_id
    AND message_id = v_row.message_id
    AND callback_subscriber = v_subscriber
  LIMIT 1;

  IF v_row.callback_digest IS NOT NULL AND v_row.callback_digest = v_digest THEN
    RETURN jsonb_build_object(
      'ok', true,
      'replay', true,
      'stale', false,
      'reason', 'replay',
      'persistence', CASE WHEN v_row.status = 'OBSERVED' AND v_row.observation_source = 'REAL_NETWORK' THEN 'STORED_REAL' WHEN v_row.status = 'OBSERVED' THEN 'STORED_MOCK' ELSE 'NOT_STORED' END,
      'real_network_verified', false,
      'identity_count', 0
    );
  END IF;
  IF v_existing_digest IS NOT NULL AND v_existing_digest = v_digest THEN
    RETURN jsonb_build_object(
      'ok', true,
      'replay', true,
      'stale', false,
      'reason', 'replay',
      'persistence', CASE WHEN v_row.status = 'OBSERVED' AND v_row.observation_source = 'REAL_NETWORK' THEN 'STORED_REAL' WHEN v_row.status = 'OBSERVED' THEN 'STORED_MOCK' ELSE 'NOT_STORED' END,
      'real_network_verified', false,
      'identity_count', 0
    );
  END IF;
  IF v_row.callback_digest IS NOT NULL OR v_existing_digest IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate_message';
  END IF;
  IF v_row.canonical_observed_at IS NOT NULL AND p_observed_at < v_row.canonical_observed_at THEN
    RAISE EXCEPTION 'canonical_observed_at_regression';
  END IF;

  IF p_candidates IS NULL OR jsonb_typeof(p_candidates) <> 'array' OR jsonb_array_length(p_candidates) = 0 THEN
    RAISE EXCEPTION 'observation_not_retained';
  END IF;
  IF jsonb_array_length(p_candidates) > 100 THEN
    RAISE EXCEPTION 'malformed_callback';
  END IF;

  FOR v_candidate IN SELECT value FROM jsonb_array_elements(p_candidates)
  LOOP
    v_supplier := nullif(btrim(v_candidate->>'provider_supplier_id'), '');
    IF v_supplier IS NULL THEN
      CONTINUE;
    END IF;
    v_participant := nullif(btrim(v_candidate->>'provider_participant_id'), '');
    v_display := nullif(btrim(v_candidate->>'display_name'), '');
    IF v_participant IS NULL OR v_participant IS DISTINCT FROM v_subscriber OR v_display IS NULL THEN
      RAISE EXCEPTION 'wrong_provider';
    END IF;
    PERFORM private.upsert_ondc_discovery_observation(
      v_supplier,
      v_participant,
      COALESCE(nullif(btrim(v_candidate->>'correlation_id'), ''), v_row.transaction_id),
      v_row.message_id,
      v_row.buyer_requested_pin,
      COALESCE(nullif(btrim(v_candidate->>'requested_category'), ''), v_row.category_label),
      p_observed_at,
      nullif(btrim(v_candidate->>'bpp_uri'), ''),
      v_row.observation_source,
      v_row.environment,
      v_display,
      nullif(btrim(v_candidate->>'seller_pin'), ''),
      nullif(btrim(v_candidate->>'seller_locality'), ''),
      nullif(btrim(v_candidate->>'seller_city'), ''),
      nullif(btrim(v_candidate->>'seller_state'), ''),
      nullif(btrim(v_candidate->>'seller_country'), ''),
      nullif(btrim(v_candidate->>'reported_phone'), ''),
      nullif(btrim(v_candidate->>'reported_email'), ''),
      nullif(btrim(v_candidate->>'catalogue_id'), ''),
      nullif(btrim(v_candidate->>'location_id'), ''),
      v_row.domain,
      COALESCE(nullif(btrim(v_candidate->>'city_code'), ''), v_row.city),
      false
    );
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'observation_not_retained';
  END IF;

  PERFORM set_config('ondc.dispatch_writer', 'dispatch_callback', true);
  INSERT INTO public.ondc_discovery_callback_replays (
    transaction_id,
    message_id,
    callback_subscriber,
    body_digest
  ) VALUES (
    v_row.transaction_id,
    v_row.message_id,
    v_subscriber,
    v_digest
  );
  UPDATE public.ondc_discovery_dispatches
  SET
    status = 'OBSERVED',
    callback_digest = v_digest,
    canonical_observed_at = p_observed_at,
    bound_participant_id = COALESCE(bound_participant_id, v_subscriber),
    real_network_verified = (observation_source = 'REAL_NETWORK'),
    failure_reason = NULL,
    updated_at = now()
  WHERE id = v_row.id;
  PERFORM set_config('ondc.dispatch_writer', '', true);

  RETURN jsonb_build_object(
    'ok', true,
    'replay', false,
    'stale', false,
    'reason', NULL,
    'persistence', CASE WHEN v_row.observation_source = 'REAL_NETWORK' THEN 'STORED_REAL' ELSE 'STORED_MOCK' END,
    'real_network_verified', v_row.observation_source = 'REAL_NETWORK',
    'identity_count', v_count
  );
EXCEPTION
  WHEN unique_violation THEN
    PERFORM set_config('ondc.dispatch_writer', '', true);
    IF SQLERRM ILIKE '%ondc_discovery_callback_replays%' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'replay', true,
        'stale', false,
        'reason', 'replay',
        'persistence', 'NOT_STORED',
        'real_network_verified', false,
        'identity_count', 0
      );
    END IF;
    RAISE;
  WHEN OTHERS THEN
    PERFORM set_config('ondc.dispatch_writer', '', true);
    IF SQLERRM IN (
      'unknown_transaction',
      'unknown_message',
      'duplicate_message',
      'wrong_provider',
      'wrong_context',
      'environment_mismatch',
      'mock_not_real',
      'observation_not_retained',
      'rejected_identity',
      'rejected_provenance',
      'rejected_environment',
      'ondc_production_disabled',
      'fabricated_display_name',
      'malformed_callback',
      'callback_not_pending',
      'canonical_observed_at_regression',
      'buyer_pin_immutable',
      'missing_discovery_timestamp'
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'replay', false,
        'stale', SQLERRM = 'canonical_observed_at_regression',
        'reason', SQLERRM,
        'persistence', 'REJECTED',
        'real_network_verified', false,
        'identity_count', 0
      );
    END IF;
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_ondc_discovery_dispatch(
  p_idempotency_key text,
  p_transaction_id text,
  p_message_id text,
  p_correlation_id text,
  p_otp_transaction_id text,
  p_buyer_requested_pin text,
  p_domain text,
  p_city text,
  p_environment text,
  p_observation_source text,
  p_expected_bap_id text,
  p_category_label text,
  p_subcategory_code text,
  p_requirement_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  RETURN private.insert_ondc_discovery_dispatch(
    p_idempotency_key,
    p_transaction_id,
    p_message_id,
    p_correlation_id,
    p_otp_transaction_id,
    p_buyer_requested_pin,
    p_domain,
    p_city,
    p_environment,
    p_observation_source,
    p_expected_bap_id,
    p_category_label,
    p_subcategory_code,
    p_requirement_mode
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_ondc_discovery_dispatch(
  p_transaction_id text,
  p_message_id text,
  p_status text,
  p_failure_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  RETURN private.advance_ondc_discovery_dispatch(
    p_transaction_id,
    p_message_id,
    p_status,
    p_failure_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.find_ondc_discovery_dispatch(
  p_idempotency_key text DEFAULT NULL,
  p_transaction_id text DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  RETURN private.find_ondc_discovery_dispatch(
    p_idempotency_key,
    p_transaction_id,
    p_correlation_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_ondc_discovery_on_search(
  p_transaction_id text,
  p_message_id text,
  p_callback_subscriber text,
  p_body_digest text,
  p_observed_at timestamptz,
  p_domain text,
  p_bap_id text,
  p_environment text,
  p_observation_source text,
  p_candidates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  RETURN private.accept_ondc_discovery_on_search(
    p_transaction_id,
    p_message_id,
    p_callback_subscriber,
    p_body_digest,
    p_observed_at,
    p_domain,
    p_bap_id,
    p_environment,
    p_observation_source,
    p_candidates
  );
END;
$$;

ALTER TABLE public.ondc_discovery_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ondc_discovery_callback_replays ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ondc_discovery_dispatches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ondc_discovery_callback_replays FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ondc_discovery_dispatches TO service_role;
GRANT SELECT, INSERT ON TABLE public.ondc_discovery_callback_replays TO service_role;

REVOKE ALL ON FUNCTION private.guard_ondc_discovery_dispatch_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.guard_ondc_discovery_callback_replay() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.ondc_discovery_dispatch_json(public.ondc_discovery_dispatches) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.insert_ondc_discovery_dispatch(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.advance_ondc_discovery_dispatch(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.find_ondc_discovery_dispatch(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.accept_ondc_discovery_on_search(
  text, text, text, text, timestamptz, text, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.insert_ondc_discovery_dispatch(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advance_ondc_discovery_dispatch(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.find_ondc_discovery_dispatch(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_ondc_discovery_on_search(
  text, text, text, text, timestamptz, text, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.insert_ondc_discovery_dispatch(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_ondc_discovery_dispatch(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.find_ondc_discovery_dispatch(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.accept_ondc_discovery_on_search(
  text, text, text, text, timestamptz, text, text, text, text, jsonb
) TO service_role;

COMMENT ON TABLE public.ondc_discovery_dispatches IS
  'Outbound ONDC /search lifecycle for one OTP transaction_id. service_role executes the guarded functions. Browser roles have no policies and no grants. real_network_verified stays false until a correlated callback.';

COMMENT ON TABLE public.ondc_discovery_callback_replays IS
  'One processed /on_search body digest per transaction, message, and callback subscriber. Digest is server-side BLAKE-512. Raw body, keys, and callback URLs are not stored.';

COMMIT;
