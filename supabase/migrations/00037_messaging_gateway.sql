-- WhatsApp/SMS supplier access layer — the gateway.
--
-- This file is the trust boundary. The edge function that receives a webhook
-- verifies the provider signature and turns a text message into structured
-- fields, and that is all it is trusted to do. Every question that matters —
-- is this a real supplier, were they invited, is the enquiry still open, is
-- this a duplicate delivery, what is the new version number — is answered
-- here, against the tables, inside one transaction.
--
-- Stated plainly: an attacker who could forge a webhook body still cannot
-- place a bid, because nothing in the body is believed. The phone number is
-- looked up, the RFQ reference is looked up, the invitation is looked up, and
-- the amount is bounds-checked.

-- ---------------------------------------------------------------------------
-- An indicative price is not a bid the buyer should be comparing
--
-- quotes_blind previously showed every quote row regardless of status, which
-- was harmless only because the web path never leaves a quote in DRAFT. The
-- messaging channel does exactly that, so the view now says what it always
-- meant: quotes the supplier has actually put forward.
-- ---------------------------------------------------------------------------

-- Column list carried over verbatim from 00022; only the WHERE clause changes.
CREATE OR REPLACE VIEW quotes_blind
WITH (security_barrier = true) AS
SELECT
  q.id AS quote_id,
  ri.anonymous_label,
  q.rfq_id,
  q.status,
  q.current_version AS version,
  q.evaluation_score,
  q.submitted_at,
  q.created_at,
  q.updated_at,
  (qv.snapshot ->> 'basePrice')::numeric(14, 2) AS base_price,
  (qv.snapshot ->> 'gstAmount')::numeric(14, 2) AS gst_amount,
  (qv.snapshot ->> 'transportCost')::numeric(14, 2) AS transport_cost,
  (qv.snapshot ->> 'totalCost')::numeric(14, 2) AS total_cost,
  (qv.snapshot ->> 'deliveryDays')::integer AS delivery_days,
  (qv.snapshot ->> 'warrantyMonths')::integer AS warranty_months,
  (qv.snapshot ->> 'paymentTermsDays')::integer AS payment_terms_days,
  ((round(s.rating_avg * 2) / 2))::numeric(3, 1) AS rating_band,
  ((round(s.on_time_percent / 5) * 5))::integer AS on_time_band,
  CASE
    WHEN s.completed_jobs >= 50 THEN '50+'
    WHEN s.completed_jobs >= 20 THEN '20-49'
    WHEN s.completed_jobs >= 5  THEN '5-19'
    WHEN s.completed_jobs >= 1  THEN '1-4'
    ELSE 'New'
  END AS experience_band,
  s.verification_status
FROM quotes q
JOIN rfq_invitations ri ON ri.id = q.invitation_id
JOIN rfqs r ON r.id = q.rfq_id
JOIN suppliers s ON s.id = q.supplier_id
LEFT JOIN quote_versions qv
  ON qv.quote_id = q.id AND qv.version = q.current_version
WHERE r.reveal_status = 'BLIND'
  -- A price texted in but not yet submitted is the supplier's working note, not
  -- an offer. Showing it would also let the buyer compare against a number the
  -- supplier never stood behind.
  AND q.status NOT IN ('DRAFT', 'DRAFT_FROM_MESSAGING', 'WITHDRAWN')
  AND (
    private.can_access_rfq_as_buyer(q.rfq_id)
    OR private.can_access_rfq_as_committee(q.rfq_id)
  );

-- ---------------------------------------------------------------------------
-- What the buyer may know about delivery
--
-- A buyer legitimately needs to know whether their enquiry actually reached
-- anyone — an RFQ with no bids because nine messages failed is a different
-- problem from one with no bids because nobody wanted the job. But they must
-- learn it without learning who, so this reports per-invitation state under the
-- RFQ alias and carries no phone number, name or provider message id.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW rfq_notification_status
WITH (security_barrier = true) AS
SELECT
  n.rfq_id,
  ri.anonymous_label,
  n.channel,
  n.status,
  n.sent_at,
  n.delivered_at,
  n.read_at,
  -- Whether it failed, never why in provider terms: a failure reason can name
  -- a carrier or a number.
  (n.status = 'FAILED') AS failed
FROM supplier_notifications n
JOIN rfq_invitations ri
  ON ri.rfq_id = n.rfq_id AND ri.supplier_id = n.supplier_id
WHERE private.can_access_rfq_as_buyer(n.rfq_id)
   OR private.can_access_rfq_as_committee(n.rfq_id);

COMMENT ON VIEW rfq_notification_status IS
  'Alias-only delivery state for the buying side. Never exposes phone, name or provider ids.';

GRANT SELECT ON rfq_notification_status TO authenticated;

-- ---------------------------------------------------------------------------
-- Rate limiting
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.messaging_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window interval DEFAULT interval '1 minute'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_hits         integer;
BEGIN
  -- Fixed windows rather than a sliding log: cheap, and the failure mode
  -- (allowing up to 2x the limit across a window boundary) is acceptable for
  -- abuse control on a messaging endpoint.
  v_window_start := date_trunc('minute', now())
    - (extract(epoch FROM date_trunc('minute', now()))::bigint
       % GREATEST(extract(epoch FROM p_window)::bigint, 1)) * interval '1 second';

  INSERT INTO messaging_rate_limits (bucket, window_start, hits)
  VALUES (p_bucket, v_window_start, 1)
  ON CONFLICT (bucket, window_start)
  DO UPDATE SET hits = messaging_rate_limits.hits + 1
  RETURNING hits INTO v_hits;

  RETURN v_hits <= p_limit;
END;
$$;

COMMENT ON FUNCTION private.messaging_rate_limit(text, integer, interval) IS
  'Counts a hit and returns false once the bucket is over its limit for the window.';

-- ---------------------------------------------------------------------------
-- What a supplier may be told about an enquiry
--
-- The notification policy, server-side, as an allow-list. A field reaches a
-- supplier because it is named here, never because it happened to be on the
-- row that was passed to a template — which is how buyer names end up in
-- outbound messages.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.supplier_rfq_message_payload(
  p_rfq_id uuid,
  p_supplier_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'publicRef',        r.public_ref,
    'alias',            ri.anonymous_label,
    'title',            r.title,
    'category',         c.name,
    'subcategory',      sc.name,
    'quantity',         req.quantity,
    'unit',             req.unit,
    'location',         req.delivery_city,
    'requiredByDays',   req.required_by_days,
    'requiredByDate',   req.required_by_date,
    'quoteDeadline',    r.quote_deadline,
    'minQuotes',        r.min_quotes_required,
    'buyerDisplay',     CASE WHEN r.buyer_anonymous_to_suppliers
                             THEN 'IDENTITY PROTECTED'
                             ELSE o.name END,
    'isDemo',           r.is_demo
  ))
  INTO v_payload
  FROM rfqs r
  JOIN rfq_invitations ri ON ri.rfq_id = r.id AND ri.supplier_id = p_supplier_id
  JOIN requirements req ON req.id = r.requirement_id
  LEFT JOIN organizations o ON o.id = r.organization_id
  LEFT JOIN requirement_categories c ON c.id = req.category_id
  LEFT JOIN requirement_subcategories sc ON sc.id = req.subcategory_id
  WHERE r.id = p_rfq_id;

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'No invitation for this supplier on this RFQ';
  END IF;

  RETURN v_payload;
END;
$$;

COMMENT ON FUNCTION public.supplier_rfq_message_payload(uuid, uuid) IS
  'Allow-listed RFQ facts that may be sent to a supplier. Buyer identity, committee, budget and evaluation weights are structurally absent.';

GRANT EXECUTE ON FUNCTION public.supplier_rfq_message_payload(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Outbound logging
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_supplier_notification(p_notification jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq_id      uuid := (p_notification ->> 'rfqId')::uuid;
  v_supplier_id uuid := (p_notification ->> 'supplierId')::uuid;
  v_id          uuid;
  v_is_demo     boolean;
BEGIN
  SELECT r.is_demo INTO v_is_demo FROM rfqs r WHERE r.id = v_rfq_id;

  INSERT INTO supplier_notifications (
    rfq_id, supplier_id, invitation_id, channel, provider, template_id,
    external_message_id, status, body, sent_at, failure_reason, is_demo
  )
  SELECT
    v_rfq_id,
    v_supplier_id,
    ri.id,
    (p_notification ->> 'channel')::messaging_channel,
    (p_notification ->> 'provider')::messaging_provider,
    NULLIF(p_notification ->> 'templateId', ''),
    NULLIF(p_notification ->> 'externalMessageId', ''),
    COALESCE(NULLIF(p_notification ->> 'status', ''), 'QUEUED')::notification_delivery_status,
    NULLIF(p_notification ->> 'body', ''),
    CASE WHEN (p_notification ->> 'status') IN ('SENT', 'DELIVERED', 'READ')
         THEN now() END,
    NULLIF(p_notification ->> 'failureReason', ''),
    COALESCE(v_is_demo, false)
  FROM rfq_invitations ri
  WHERE ri.rfq_id = v_rfq_id AND ri.supplier_id = v_supplier_id
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Cannot notify a supplier that was not invited to this RFQ';
  END IF;

  INSERT INTO audit_events (event_type, entity_type, entity_id, organization_id, payload)
  SELECT
    CASE WHEN (p_notification ->> 'status') = 'FAILED'
         THEN 'rfq.notification_failed'
         ELSE 'rfq.notification_sent' END,
    'supplier_notification',
    v_id::text,
    r.organization_id,
    -- Alias, never the supplier. The audit trail is read by the buying side.
    jsonb_build_object(
      'rfqId', v_rfq_id,
      'alias', (SELECT anonymous_label FROM rfq_invitations
                WHERE rfq_id = v_rfq_id AND supplier_id = v_supplier_id),
      'channel', p_notification ->> 'channel',
      'provider', p_notification ->> 'provider',
      'status', COALESCE(NULLIF(p_notification ->> 'status', ''), 'QUEUED')
    )
  FROM rfqs r WHERE r.id = v_rfq_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_supplier_notification(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.record_notification_delivery(
  p_provider messaging_provider,
  p_external_message_id text,
  p_status notification_delivery_status,
  p_failure_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE supplier_notifications
  SET status = p_status,
      delivered_at = CASE WHEN p_status IN ('DELIVERED', 'READ')
                          THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
      read_at = CASE WHEN p_status = 'READ' THEN COALESCE(read_at, now()) ELSE read_at END,
      failure_reason = COALESCE(p_failure_reason, failure_reason)
  WHERE provider = p_provider AND external_message_id = p_external_message_id
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
  VALUES (
    CASE WHEN p_status = 'FAILED' THEN 'rfq.notification_failed'
         ELSE 'rfq.notification_delivered' END,
    'supplier_notification', v_id::text,
    jsonb_build_object('status', p_status, 'provider', p_provider)
  );

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_notification_delivery(
  messaging_provider, text, notification_delivery_status, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Magic links
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.issue_supplier_magic_link(
  p_supplier_id uuid,
  p_rfq_id uuid,
  p_channel messaging_channel DEFAULT NULL,
  p_ttl interval DEFAULT interval '48 hours'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_id    uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM rfq_invitations
    WHERE rfq_id = p_rfq_id AND supplier_id = p_supplier_id
  ) THEN
    RAISE EXCEPTION 'Cannot issue a link for an RFQ this supplier was not invited to';
  END IF;

  -- 32 random bytes, url-safe. The token carries no supplier or RFQ
  -- information: the binding lives in the row, so a token cannot be inspected
  -- to learn who it belongs to, or edited to belong to someone else.
  -- pgcrypto is schema-qualified throughout this file: search_path is pinned to
  -- public, where it is not visible.
  v_token := rtrim(
    replace(replace(encode(extensions.gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'),
    '=');

  INSERT INTO supplier_magic_links (
    supplier_id, rfq_id, token_hash, expires_at, channel, is_demo
  )
  SELECT
    p_supplier_id, p_rfq_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    now() + LEAST(p_ttl, interval '7 days'),
    p_channel,
    r.is_demo
  FROM rfqs r WHERE r.id = p_rfq_id
  RETURNING id INTO v_id;

  INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
  VALUES ('supplier.magic_link_created', 'supplier_magic_link', v_id::text,
          jsonb_build_object('rfqId', p_rfq_id, 'channel', p_channel,
                             'expiresIn', p_ttl::text));

  RETURN v_token;
END;
$$;

COMMENT ON FUNCTION public.issue_supplier_magic_link(uuid, uuid, messaging_channel, interval) IS
  'Returns a single-use token once. Only its SHA-256 is stored.';

GRANT EXECUTE ON FUNCTION public.issue_supplier_magic_link(
  uuid, uuid, messaging_channel, interval) TO service_role;

CREATE OR REPLACE FUNCTION public.redeem_supplier_magic_link(
  p_token text,
  p_from text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link         supplier_magic_links%ROWTYPE;
  v_rfq          rfqs%ROWTYPE;
  v_hash         text;
  v_session      text;
  v_session_id   uuid;
BEGIN
  v_hash := encode(extensions.digest(COALESCE(p_token, ''), 'sha256'), 'hex');

  -- Bucketed by the token, not by the caller.
  --
  -- The caller is a browser that arrived from an SMS, and anything it tells us
  -- about itself — including its address — is asserted rather than observed. A
  -- bucket keyed on that could be set to one value by one attacker and starve
  -- every real supplier out of the endpoint. Keyed on the token, hammering one
  -- link can only lock out that link, and the second bucket bounds the total.
  IF NOT private.messaging_rate_limit('magic_link_token:' || left(v_hash, 16), 8)
     OR NOT private.messaging_rate_limit('magic_link_all', 600) THEN
    RETURN jsonb_build_object('outcome', 'RATE_LIMITED');
  END IF;

  SELECT * INTO v_link FROM supplier_magic_links WHERE token_hash = v_hash;

  IF NOT FOUND THEN
    -- Deliberately indistinguishable from expired or used: a caller probing
    -- tokens learns nothing about which guesses were once valid.
    RETURN jsonb_build_object('outcome', 'INVALID');
  END IF;

  IF v_link.used_at IS NOT NULL THEN
    INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
    VALUES ('supplier.magic_link_rejected', 'supplier_magic_link', v_link.id::text,
            jsonb_build_object('reason', 'ALREADY_USED'));
    RETURN jsonb_build_object('outcome', 'INVALID');
  END IF;

  IF v_link.expires_at <= now() THEN
    INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
    VALUES ('supplier.magic_link_rejected', 'supplier_magic_link', v_link.id::text,
            jsonb_build_object('reason', 'EXPIRED'));
    RETURN jsonb_build_object('outcome', 'INVALID');
  END IF;

  SELECT * INTO v_rfq FROM rfqs WHERE id = v_link.rfq_id;

  -- A link is only as alive as the enquiry it belongs to.
  IF v_rfq.status NOT IN ('OPEN', 'CLARIFICATION') THEN
    INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
    VALUES ('supplier.magic_link_rejected', 'supplier_magic_link', v_link.id::text,
            jsonb_build_object('reason', 'RFQ_CLOSED', 'rfqStatus', v_rfq.status));
    RETURN jsonb_build_object('outcome', 'RFQ_CLOSED');
  END IF;

  UPDATE supplier_magic_links
  SET used_at = now(), used_from = p_from
  WHERE id = v_link.id;

  v_session := rtrim(
    replace(replace(encode(extensions.gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'),
    '=');

  INSERT INTO supplier_quote_sessions (
    supplier_id, rfq_id, magic_link_id, token_hash, expires_at, is_demo
  )
  VALUES (
    v_link.supplier_id, v_link.rfq_id, v_link.id,
    encode(extensions.digest(v_session, 'sha256'), 'hex'),
    now() + interval '2 hours',
    v_link.is_demo
  )
  RETURNING id INTO v_session_id;

  INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
  VALUES ('supplier.magic_link_used', 'supplier_magic_link', v_link.id::text,
          jsonb_build_object('rfqId', v_link.rfq_id, 'sessionId', v_session_id));

  RETURN jsonb_build_object(
    'outcome', 'OK',
    'sessionToken', v_session,
    'publicRef', v_rfq.public_ref,
    'expiresAt', now() + interval '2 hours'
  );
END;
$$;

COMMENT ON FUNCTION public.redeem_supplier_magic_link(text, text) IS
  'Single-use redemption. Returns a quoting session scoped to one supplier and one RFQ.';

-- Callable by anon, because the person opening the link has no account — that is
-- the entire point of the link. What makes that safe is that the token is the
-- only credential and it is 256 bits of randomness, stored as a hash, valid
-- once, bound to one supplier and one enquiry, and expiring within days. An
-- anonymous caller can present a token; they cannot forge one, reuse one, or
-- learn anything from a failed attempt.
--
-- p_from is left to the caller and used only for the audit trail. A browser's
-- claim about its own address is not a control and is not treated as one.
GRANT EXECUTE ON FUNCTION public.redeem_supplier_magic_link(text, text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Resolving a quoting session
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.quote_session(p_token text)
RETURNS supplier_quote_sessions
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session supplier_quote_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session
  FROM supplier_quote_sessions
  WHERE token_hash = encode(extensions.digest(COALESCE(p_token, ''), 'sha256'), 'hex')
    AND revoked_at IS NULL
    AND expires_at > now();

  RETURN v_session;
END;
$$;

-- ---------------------------------------------------------------------------
-- Writing a messaging quote
--
-- One function owns creating and revising quotes that arrive by message, so
-- the versioning rule lives in exactly one place: never overwrite, always add
-- a version.
--
-- It also carries the previous snapshot forward. A supplier who texts a new
-- price is changing their price, not withdrawing their warranty and delivery
-- terms — silently blanking the rest would turn a price revision into a worse
-- offer.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.apply_messaging_quote(
  p_rfq_id uuid,
  p_supplier_id uuid,
  p_source quote_source,
  p_base_price numeric,
  p_currency text,
  p_unit text,
  p_actor uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation rfq_invitations%ROWTYPE;
  v_quote      quotes%ROWTYPE;
  v_previous   jsonb := '{}'::jsonb;
  v_snapshot   jsonb;
  v_version    integer;
  v_status     quote_status;
  v_created    boolean := false;
BEGIN
  SELECT * INTO v_invitation
  FROM rfq_invitations
  WHERE rfq_id = p_rfq_id AND supplier_id = p_supplier_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier was not invited to this RFQ';
  END IF;

  SELECT * INTO v_quote FROM quotes
  WHERE rfq_id = p_rfq_id AND supplier_id = p_supplier_id;

  IF FOUND THEN
    SELECT snapshot INTO v_previous
    FROM quote_versions
    WHERE quote_id = v_quote.id AND version = v_quote.current_version;
    v_previous := COALESCE(v_previous, '{}'::jsonb);
    v_version := v_quote.current_version + 1;
    -- A quote already put forward stays put forward; only its numbers move.
    v_status := CASE
      WHEN v_quote.status IN ('SUBMITTED', 'REVISED', 'FINAL') THEN 'REVISED'
      ELSE 'DRAFT_FROM_MESSAGING'
    END::quote_status;
  ELSE
    v_version := 1;
    v_status := 'DRAFT_FROM_MESSAGING';
    v_created := true;
  END IF;

  v_snapshot := v_previous || jsonb_build_object(
    'basePrice', p_base_price,
    'currency', COALESCE(p_currency, v_previous ->> 'currency', 'INR'),
    'gstAmount', COALESCE(NULLIF(v_previous ->> 'gstAmount', '')::numeric, 0),
    'transportCost', COALESCE(NULLIF(v_previous ->> 'transportCost', '')::numeric, 0),
    'quotedVia', p_source
  );

  IF p_unit IS NOT NULL THEN
    v_snapshot := v_snapshot || jsonb_build_object('priceUnit', p_unit);
  END IF;

  -- Recomputed rather than carried over, or the total would still describe the
  -- old price.
  v_snapshot := v_snapshot || jsonb_build_object(
    'totalCost',
      p_base_price
      + COALESCE(NULLIF(v_snapshot ->> 'gstAmount', '')::numeric, 0)
      + COALESCE(NULLIF(v_snapshot ->> 'transportCost', '')::numeric, 0)
  );

  IF v_created THEN
    INSERT INTO quotes (
      rfq_id, supplier_id, invitation_id, status, current_version,
      source, received_at
    )
    VALUES (
      p_rfq_id, p_supplier_id, v_invitation.id, v_status, v_version,
      p_source, now()
    )
    RETURNING * INTO v_quote;
  ELSE
    UPDATE quotes
    SET status = v_status,
        current_version = v_version,
        source = p_source,
        received_at = now(),
        -- The score described the old price.
        evaluation_score = NULL
    WHERE id = v_quote.id
    RETURNING * INTO v_quote;
  END IF;

  INSERT INTO quote_versions (quote_id, version, snapshot, notes, created_by)
  VALUES (v_quote.id, v_version, v_snapshot,
          format('Indicative price received by %s', p_source), p_actor);

  UPDATE rfq_invitations SET status = 'VIEWED'
  WHERE id = v_invitation.id AND status = 'INVITED';

  RETURN jsonb_build_object(
    'quoteId', v_quote.id,
    'version', v_version,
    'status', v_status,
    'created', v_created,
    'alias', v_invitation.anonymous_label,
    'totalCost', v_snapshot ->> 'totalCost'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Inbound message ingestion
--
-- The single entry point for anything a supplier sends us. Returns a machine
-- outcome; the words we reply with are composed by the messaging templates, so
-- the copy lives in one place and this function stays about decisions.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ingest_supplier_message(p_message jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider    messaging_provider := (p_message ->> 'provider')::messaging_provider;
  v_channel     messaging_channel := (p_message ->> 'channel')::messaging_channel;
  v_external_id text := NULLIF(p_message ->> 'externalMessageId', '');
  v_phone       text := NULLIF(p_message ->> 'phone', '');
  v_body        text := p_message ->> 'body';
  v_parsed      jsonb := p_message -> 'parsed';
  v_event_id    uuid;
  v_supplier    suppliers%ROWTYPE;
  v_channel_row supplier_messaging_channels%ROWTYPE;
  v_rfq         rfqs%ROWTYPE;
  v_command     text;
  v_amount      numeric;
  v_ref         text;
  v_applied     jsonb;
  v_token       text;
BEGIN
  IF v_phone IS NULL OR v_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RETURN jsonb_build_object('outcome', 'BAD_REQUEST');
  END IF;

  -- Per-number limit. A flood from one handset cannot exhaust the gateway for
  -- every other supplier.
  IF NOT private.messaging_rate_limit('inbound:' || v_phone, 12) THEN
    RETURN jsonb_build_object('outcome', 'RATE_LIMITED');
  END IF;

  -- Idempotency first, before anything is decided. A retried delivery loses the
  -- race here and produces no second quote.
  INSERT INTO messaging_events (
    provider, channel, direction, external_message_id, phone_e164,
    raw_payload, normalized_message, processing_status
  )
  VALUES (
    v_provider, v_channel, 'INBOUND', v_external_id, v_phone,
    COALESCE(p_message -> 'raw', '{}'::jsonb), v_body, 'RECEIVED'
  )
  ON CONFLICT (provider, external_message_id) WHERE external_message_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'DUPLICATE');
  END IF;

  INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
  VALUES ('messaging.received', 'messaging_event', v_event_id::text,
          jsonb_build_object('channel', v_channel, 'provider', v_provider));

  -- Who is this? The row is found regardless of status, because STOP has to
  -- work for a suspended number too, but only a VERIFIED channel may bid: an
  -- unverified number is a claim, not an identity.
  SELECT smc.* INTO v_channel_row
  FROM supplier_messaging_channels smc
  WHERE smc.phone_e164 = v_phone
    AND smc.channel = v_channel
    AND smc.status <> 'RETIRED';

  IF NOT FOUND THEN
    UPDATE messaging_events
    SET processing_status = 'REJECTED', error_code = 'UNKNOWN_SENDER',
        processed_at = now()
    WHERE id = v_event_id;
    RETURN jsonb_build_object('outcome', 'UNKNOWN_SENDER', 'eventId', v_event_id);
  END IF;

  SELECT * INTO v_supplier FROM suppliers WHERE id = v_channel_row.supplier_id;

  UPDATE messaging_events SET supplier_id = v_supplier.id WHERE id = v_event_id;

  v_command := COALESCE(NULLIF(v_parsed ->> 'command', ''), 'UNKNOWN');

  -- Opt-out is honoured before anything else is considered, including whether
  -- the supplier is suspended or the message also contained a price. Consent to
  -- be messaged is not conditional on the rest of the message making sense.
  IF v_command = 'STOP' THEN
    UPDATE supplier_messaging_channels
    SET status = 'SUSPENDED'
    WHERE id = v_channel_row.id;

    UPDATE messaging_events
    SET processing_status = 'ACCEPTED', processed_at = now()
    WHERE id = v_event_id;

    INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
    VALUES ('supplier.messaging_opted_out', 'supplier_messaging_channel',
            v_channel_row.id::text,
            jsonb_build_object('channel', v_channel));

    RETURN jsonb_build_object('outcome', 'OPTED_OUT', 'eventId', v_event_id);
  END IF;

  IF v_command = 'START' THEN
    -- Restored only if they were verified before. START is consent to be
    -- messaged again, not proof of holding the number.
    UPDATE supplier_messaging_channels
    SET status = CASE WHEN verified_at IS NOT NULL THEN 'VERIFIED' ELSE status END
    WHERE id = v_channel_row.id;

    UPDATE messaging_events
    SET processing_status = 'ACCEPTED', processed_at = now()
    WHERE id = v_event_id;

    INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
    VALUES ('supplier.messaging_opted_in', 'supplier_messaging_channel',
            v_channel_row.id::text,
            jsonb_build_object('channel', v_channel));

    RETURN jsonb_build_object('outcome', 'OPTED_IN', 'eventId', v_event_id);
  END IF;

  IF v_command = 'HELP' THEN
    UPDATE messaging_events
    SET processing_status = 'ACCEPTED', processed_at = now()
    WHERE id = v_event_id;
    RETURN jsonb_build_object('outcome', 'HELP', 'eventId', v_event_id);
  END IF;

  -- From here on the message is trying to act on an enquiry, which requires a
  -- proven number and an account in good standing.
  IF v_channel_row.status <> 'VERIFIED' THEN
    UPDATE messaging_events
    SET processing_status = 'REJECTED', error_code = 'CHANNEL_NOT_VERIFIED',
        processed_at = now()
    WHERE id = v_event_id;
    RETURN jsonb_build_object('outcome', 'UNKNOWN_SENDER', 'eventId', v_event_id);
  END IF;

  IF v_supplier.status = 'SUSPENDED' THEN
    UPDATE messaging_events
    SET processing_status = 'REJECTED', error_code = 'SUPPLIER_SUSPENDED',
        processed_at = now()
    WHERE id = v_event_id;
    RETURN jsonb_build_object('outcome', 'SUPPLIER_SUSPENDED', 'eventId', v_event_id);
  END IF;

  IF v_command NOT IN ('QUOTE', 'DECLINE') THEN
    UPDATE messaging_events
    SET processing_status = 'UNPARSEABLE', error_code = 'NO_PARSE',
        processed_at = now()
    WHERE id = v_event_id;
    RETURN jsonb_build_object('outcome', 'UNPARSEABLE', 'eventId', v_event_id);
  END IF;

  v_ref := upper(btrim(COALESCE(v_parsed ->> 'rfqReference', '')));
  v_amount := NULLIF(v_parsed ->> 'amount', '')::numeric;

  IF v_ref = '' THEN
    UPDATE messaging_events
    SET processing_status = 'UNPARSEABLE', error_code = 'NO_REFERENCE',
        processed_at = now()
    WHERE id = v_event_id;
    RETURN jsonb_build_object('outcome', 'UNPARSEABLE', 'eventId', v_event_id);
  END IF;

  -- The amount is re-checked here even though the parser already looked at it.
  -- The parser is on the untrusted side of this boundary.
  IF v_command = 'QUOTE'
     AND (v_amount IS NULL OR v_amount <= 0 OR v_amount > 1e11) THEN
    UPDATE messaging_events
    SET processing_status = 'REJECTED', error_code = 'INVALID_AMOUNT',
        processed_at = now()
    WHERE id = v_event_id;
    INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
    VALUES ('messaging.quote_rejected', 'messaging_event', v_event_id::text,
            jsonb_build_object('reason', 'INVALID_AMOUNT'));
    RETURN jsonb_build_object('outcome', 'INVALID_AMOUNT', 'eventId', v_event_id);
  END IF;

  SELECT * INTO v_rfq FROM rfqs WHERE upper(public_ref) = v_ref;

  IF NOT FOUND THEN
    UPDATE messaging_events
    SET processing_status = 'REJECTED', error_code = 'RFQ_NOT_FOUND',
        processed_at = now()
    WHERE id = v_event_id;
    RETURN jsonb_build_object('outcome', 'RFQ_NOT_FOUND', 'eventId', v_event_id,
                              'reference', v_ref);
  END IF;

  UPDATE messaging_events SET rfq_id = v_rfq.id, is_demo = v_rfq.is_demo
  WHERE id = v_event_id;

  -- Invitation before state, so a supplier probing references cannot learn
  -- whether an enquiry they were never part of is open.
  IF NOT EXISTS (
    SELECT 1 FROM rfq_invitations
    WHERE rfq_id = v_rfq.id AND supplier_id = v_supplier.id
  ) THEN
    UPDATE messaging_events
    SET processing_status = 'REJECTED', error_code = 'NOT_INVITED',
        processed_at = now()
    WHERE id = v_event_id;
    INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
    VALUES ('messaging.quote_rejected', 'messaging_event', v_event_id::text,
            jsonb_build_object('reason', 'NOT_INVITED', 'rfqId', v_rfq.id));
    RETURN jsonb_build_object('outcome', 'NOT_INVITED', 'eventId', v_event_id);
  END IF;

  IF v_rfq.status NOT IN ('OPEN', 'CLARIFICATION') THEN
    UPDATE messaging_events
    SET processing_status = 'REJECTED', error_code = 'RFQ_CLOSED',
        processed_at = now()
    WHERE id = v_event_id;
    RETURN jsonb_build_object('outcome', 'RFQ_CLOSED', 'eventId', v_event_id,
                              'rfqId', v_rfq.id, 'reference', v_rfq.public_ref);
  END IF;

  -- A supplier passing on an enquiry is useful information: it tells the buyer
  -- the enquiry reached someone who chose not to bid, which is different from
  -- silence, and it stops us chasing them.
  IF v_command = 'DECLINE' THEN
    UPDATE rfq_invitations
    SET status = 'DECLINED',
        declined_at = now(),
        decline_reason = format('Declined by %s message', v_channel)
    WHERE rfq_id = v_rfq.id
      AND supplier_id = v_supplier.id
      AND status <> 'QUOTED';

    UPDATE messaging_events
    SET processing_status = 'ACCEPTED', processed_at = now()
    WHERE id = v_event_id;

    INSERT INTO audit_events (event_type, entity_type, entity_id, organization_id, payload)
    SELECT 'invitation.declined', 'rfq_invitation', ri.id::text, v_rfq.organization_id,
           jsonb_build_object('rfqId', v_rfq.id, 'alias', ri.anonymous_label,
                              'channel', v_channel)
    FROM rfq_invitations ri
    WHERE ri.rfq_id = v_rfq.id AND ri.supplier_id = v_supplier.id;

    RETURN jsonb_build_object('outcome', 'DECLINED', 'eventId', v_event_id,
                              'rfqId', v_rfq.id, 'reference', v_rfq.public_ref);
  END IF;

  IF v_rfq.quote_deadline IS NOT NULL AND v_rfq.quote_deadline <= now() THEN
    UPDATE messaging_events
    SET processing_status = 'REJECTED', error_code = 'DEADLINE_PASSED',
        processed_at = now()
    WHERE id = v_event_id;
    RETURN jsonb_build_object('outcome', 'DEADLINE_PASSED', 'eventId', v_event_id,
                              'rfqId', v_rfq.id, 'reference', v_rfq.public_ref);
  END IF;

  v_applied := private.apply_messaging_quote(
    v_rfq.id, v_supplier.id,
    CASE v_channel WHEN 'WHATSAPP' THEN 'WHATSAPP' ELSE 'SMS' END::quote_source,
    v_amount,
    NULLIF(v_parsed ->> 'currency', ''),
    NULLIF(v_parsed ->> 'unit', ''),
    -- Their own account if they have one, so the version stays attributed.
    -- Suppliers who only ever text have no profile, and NULL is the truthful
    -- answer there rather than a stand-in.
    (SELECT su.profile_id FROM supplier_users su
     WHERE su.supplier_id = v_supplier.id
     ORDER BY su.role, su.profile_id LIMIT 1)
  );

  UPDATE messaging_events
  SET processing_status = 'ACCEPTED',
      quote_id = (v_applied ->> 'quoteId')::uuid,
      processed_at = now()
  WHERE id = v_event_id;

  INSERT INTO audit_events (event_type, entity_type, entity_id, organization_id, payload)
  VALUES (
    CASE WHEN (v_applied ->> 'created')::boolean
         THEN 'quote.draft_created_from_messaging'
         ELSE 'quote.revised_from_messaging' END,
    'quote', v_applied ->> 'quoteId',
    v_rfq.organization_id,
    -- Alias only: this row is readable by the buying side.
    jsonb_build_object(
      'rfqId', v_rfq.id,
      'alias', v_applied ->> 'alias',
      'version', v_applied -> 'version',
      'channel', v_channel
    )
  );

  v_token := public.issue_supplier_magic_link(v_supplier.id, v_rfq.id, v_channel);

  RETURN jsonb_build_object(
    'outcome', 'ACCEPTED',
    'eventId', v_event_id,
    'rfqId', v_rfq.id,
    'quoteId', v_applied ->> 'quoteId',
    'version', v_applied -> 'version',
    'amount', v_amount,
    'currency', COALESCE(NULLIF(v_parsed ->> 'currency', ''), 'INR'),
    'reference', v_rfq.public_ref,
    'magicLinkToken', v_token,
    'isDemo', v_rfq.is_demo
  );
END;
$$;

COMMENT ON FUNCTION public.ingest_supplier_message(jsonb) IS
  'The messaging trust boundary. Re-validates sender, reference, invitation, state and amount; nothing in the payload is believed.';

GRANT EXECUTE ON FUNCTION public.ingest_supplier_message(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- Finishing the quote on the web
--
-- These two are callable by anon, because a supplier who arrived from an SMS
-- has no account. Authority comes entirely from the session token, and the
-- token authorises one thing: quoting on one enquiry as one supplier. Note what
-- the context function does not return — no buyer name, no other enquiries, no
-- competitor prices, not even the supplier's own record beyond their alias.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.messaging_quote_context(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session supplier_quote_sessions%ROWTYPE;
  v_rfq     rfqs%ROWTYPE;
  v_quote   quotes%ROWTYPE;
  v_snapshot jsonb := '{}'::jsonb;
BEGIN
  v_session := private.quote_session(p_session_token);

  IF v_session.id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'INVALID_SESSION');
  END IF;

  SELECT * INTO v_rfq FROM rfqs WHERE id = v_session.rfq_id;

  IF v_rfq.status NOT IN ('OPEN', 'CLARIFICATION') THEN
    RETURN jsonb_build_object('outcome', 'RFQ_CLOSED');
  END IF;

  UPDATE supplier_quote_sessions SET last_seen_at = now() WHERE id = v_session.id;

  SELECT * INTO v_quote FROM quotes
  WHERE rfq_id = v_session.rfq_id AND supplier_id = v_session.supplier_id;

  IF FOUND THEN
    SELECT snapshot INTO v_snapshot FROM quote_versions
    WHERE quote_id = v_quote.id AND version = v_quote.current_version;
  END IF;

  RETURN jsonb_build_object(
    'outcome', 'OK',
    'rfq', public.supplier_rfq_message_payload(v_session.rfq_id, v_session.supplier_id),
    'expiresAt', v_session.expires_at,
    'quote', CASE WHEN v_quote.id IS NULL THEN NULL ELSE jsonb_build_object(
      'status', v_quote.status,
      'version', v_quote.current_version,
      'submitted', v_quote.status IN ('SUBMITTED', 'REVISED', 'FINAL'),
      -- Prefilled from what they texted, so the price is not retyped.
      'snapshot', COALESCE(v_snapshot, '{}'::jsonb)
    ) END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.messaging_quote_context(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_messaging_quote(
  p_session_token text,
  p_quote jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session    supplier_quote_sessions%ROWTYPE;
  v_rfq        rfqs%ROWTYPE;
  v_invitation rfq_invitations%ROWTYPE;
  v_quote      quotes%ROWTYPE;
  v_version    integer;
  v_snapshot   jsonb;
  v_base       numeric := NULLIF(p_quote ->> 'basePrice', '')::numeric;
  v_gst        numeric := COALESCE(NULLIF(p_quote ->> 'gstAmount', '')::numeric, 0);
  v_transport  numeric := COALESCE(NULLIF(p_quote ->> 'transportCost', '')::numeric, 0);
BEGIN
  v_session := private.quote_session(p_session_token);

  IF v_session.id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'INVALID_SESSION');
  END IF;

  IF NOT private.messaging_rate_limit('quote_submit:' || v_session.id::text, 20) THEN
    RETURN jsonb_build_object('outcome', 'RATE_LIMITED');
  END IF;

  -- Everything is checked again at submit time. The session proved who they
  -- are; it says nothing about whether the enquiry is still taking bids.
  SELECT * INTO v_rfq FROM rfqs WHERE id = v_session.rfq_id;

  IF v_rfq.status NOT IN ('OPEN', 'CLARIFICATION') THEN
    RETURN jsonb_build_object('outcome', 'RFQ_CLOSED');
  END IF;

  IF v_rfq.quote_deadline IS NOT NULL AND v_rfq.quote_deadline <= now() THEN
    RETURN jsonb_build_object('outcome', 'DEADLINE_PASSED');
  END IF;

  SELECT * INTO v_invitation FROM rfq_invitations
  WHERE rfq_id = v_session.rfq_id AND supplier_id = v_session.supplier_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'NOT_INVITED');
  END IF;

  IF v_base IS NULL OR v_base <= 0 OR v_base > 1e11
     OR v_gst < 0 OR v_transport < 0 THEN
    RETURN jsonb_build_object('outcome', 'INVALID_AMOUNT');
  END IF;

  v_snapshot := jsonb_build_object(
    'basePrice', v_base,
    'gstAmount', v_gst,
    'transportCost', v_transport,
    'totalCost', v_base + v_gst + v_transport,
    'deliveryDays', NULLIF(p_quote ->> 'deliveryDays', '')::integer,
    'warrantyMonths', NULLIF(p_quote ->> 'warrantyMonths', '')::integer,
    'currency', COALESCE(NULLIF(p_quote ->> 'currency', ''), 'INR'),
    'quotedVia', 'MAGIC_LINK'
  );

  SELECT * INTO v_quote FROM quotes
  WHERE rfq_id = v_session.rfq_id AND supplier_id = v_session.supplier_id;

  IF FOUND THEN
    v_version := v_quote.current_version + 1;
    UPDATE quotes
    SET status = CASE WHEN v_quote.status IN ('SUBMITTED', 'REVISED', 'FINAL')
                      THEN 'REVISED' ELSE 'SUBMITTED' END::quote_status,
        current_version = v_version,
        submitted_at = now(),
        evaluation_score = NULL
    WHERE id = v_quote.id
    RETURNING * INTO v_quote;
  ELSE
    v_version := 1;
    INSERT INTO quotes (
      rfq_id, supplier_id, invitation_id, status, current_version,
      source, submitted_at, received_at
    )
    VALUES (
      v_session.rfq_id, v_session.supplier_id, v_invitation.id,
      'SUBMITTED', 1, 'WEB', now(), now()
    )
    RETURNING * INTO v_quote;
  END IF;

  INSERT INTO quote_versions (quote_id, version, snapshot, notes, created_by)
  VALUES (v_quote.id, v_version, v_snapshot,
          NULLIF(p_quote ->> 'notes', ''),
          (SELECT su.profile_id FROM supplier_users su
           WHERE su.supplier_id = v_session.supplier_id
           ORDER BY su.role, su.profile_id LIMIT 1));

  UPDATE rfq_invitations SET status = 'QUOTED' WHERE id = v_invitation.id;

  INSERT INTO audit_events (event_type, entity_type, entity_id, organization_id, payload)
  VALUES (
    CASE WHEN v_version = 1 THEN 'quote.submitted' ELSE 'quote.revised' END,
    'quote', v_quote.id::text, v_rfq.organization_id,
    jsonb_build_object(
      'rfqId', v_rfq.id,
      'alias', v_invitation.anonymous_label,
      'version', v_version,
      'via', 'MAGIC_LINK'
    )
  );

  RETURN jsonb_build_object(
    'outcome', 'OK',
    'quoteId', v_quote.id,
    'version', v_version,
    'status', v_quote.status,
    'reference', v_rfq.public_ref,
    'alias', v_invitation.anonymous_label
  );
END;
$$;

COMMENT ON FUNCTION public.submit_messaging_quote(text, jsonb) IS
  'Submits the structured quote behind a magic-link session, revalidating RFQ state, deadline and invitation.';

GRANT EXECUTE ON FUNCTION public.submit_messaging_quote(text, jsonb) TO anon, authenticated, service_role;
