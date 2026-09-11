-- WhatsApp/SMS supplier access layer — outbound logging and the demo.
--
-- Two jobs here.
--
-- First, a complete conversation log. Replies we send are recorded next to the
-- messages that caused them, so "what did this supplier actually see?" has an
-- answer that does not depend on a provider's dashboard.
--
-- Second, making the channel demonstrable. A buyer evaluating OTP in a meeting
-- room has no Twilio account, and describing a WhatsApp bid is far less
-- convincing than watching one arrive. The demo therefore drives the real
-- pipeline — same parser, same gateway, same validation — and differs only in
-- who is trusted to inject a message.
--
-- Everything in this file is gated on demo mode AND on the RFQ being a demo
-- RFQ, so no path here can read or write a real supplier conversation. The demo
-- also keeps the identity rules: it shows aliases and masked numbers, never a
-- business name, because the whole point being demonstrated is that the buyer
-- cannot see who is bidding.

-- ---------------------------------------------------------------------------
-- Outbound replies
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_outbound_message(p_message jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id          uuid;
  v_rfq_id      uuid := NULLIF(p_message ->> 'rfqId', '')::uuid;
  v_phone       text := NULLIF(p_message ->> 'phone', '');
  v_supplier_id uuid;
BEGIN
  -- Resolved here rather than passed in, so the reply is attributed to the same
  -- supplier the inbound message was attributed to, by the same lookup.
  SELECT supplier_id INTO v_supplier_id
  FROM supplier_messaging_channels
  WHERE phone_e164 = v_phone
    AND channel = (p_message ->> 'channel')::messaging_channel
    AND status <> 'RETIRED';

  INSERT INTO messaging_events (
    provider, channel, direction, external_message_id, phone_e164,
    supplier_id, rfq_id, raw_payload, normalized_message,
    processing_status, error_code, is_demo, processed_at
  )
  VALUES (
    (p_message ->> 'provider')::messaging_provider,
    (p_message ->> 'channel')::messaging_channel,
    'OUTBOUND',
    NULLIF(p_message ->> 'externalMessageId', ''),
    v_phone,
    v_supplier_id,
    v_rfq_id,
    jsonb_build_object('templateId', p_message ->> 'templateId'),
    p_message ->> 'body',
    CASE WHEN (p_message ->> 'status') = 'FAILED'
         THEN 'FAILED' ELSE 'ACCEPTED' END::messaging_processing_status,
    NULLIF(p_message ->> 'failureReason', ''),
    COALESCE((SELECT is_demo FROM rfqs WHERE id = v_rfq_id), false),
    now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.record_outbound_message(jsonb) IS
  'Logs a reply we sent a supplier, so the conversation is readable without the provider dashboard.';

GRANT EXECUTE ON FUNCTION public.record_outbound_message(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- Demo gate
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.demo_messaging_allowed(p_rfq_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.demo_mode_enabled()
    AND EXISTS (SELECT 1 FROM rfqs WHERE id = p_rfq_id AND is_demo)
    AND (
      private.can_access_rfq_as_buyer(p_rfq_id)
      OR private.can_access_rfq_as_committee(p_rfq_id)
      OR private.is_platform_admin()
    );
$$;

COMMENT ON FUNCTION private.demo_messaging_allowed(uuid) IS
  'Demo mode on, RFQ is a demo RFQ, and the caller already has access to it. All three.';

-- ---------------------------------------------------------------------------
-- Who the demo can send as
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.demo_messaging_recipients(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT private.demo_messaging_allowed(p_rfq_id) THEN
    RAISE EXCEPTION 'Messaging simulation is available on demo enquiries only';
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY row ->> 'alias'), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      -- The alias is the handle. Simulating a reply never needs a supplier id,
      -- so the browser never receives one.
      'alias', ri.anonymous_label,
      'channel', smc.channel,
      'phoneMasked', regexp_replace(smc.phone_e164, '.{5}$', '•••••'),
      -- Exposed because a bidder who has texted STOP must stay visible: the
      -- demo needs to show consent being withdrawn AND restored, and hiding the
      -- number after STOP would leave START unreachable.
      'channelStatus', smc.status,
      'invitationStatus', ri.status,
      'notified', EXISTS (
        SELECT 1 FROM supplier_notifications n
        WHERE n.rfq_id = ri.rfq_id AND n.supplier_id = ri.supplier_id
      ),
      'quoteStatus', (
        SELECT q.status FROM quotes q
        WHERE q.rfq_id = ri.rfq_id AND q.supplier_id = ri.supplier_id
      )
    ) AS row
    FROM rfq_invitations ri
    JOIN supplier_messaging_channels smc
      ON smc.supplier_id = ri.supplier_id AND smc.status <> 'RETIRED'
    WHERE ri.rfq_id = p_rfq_id
  ) rows;

  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.demo_messaging_recipients(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- The conversation, as the demo shows it
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.demo_messaging_thread(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT private.demo_messaging_allowed(p_rfq_id) THEN
    RAISE EXCEPTION 'Messaging inspection is available on demo enquiries only';
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY row ->> 'at'), '[]'::jsonb)
  INTO v_rows
  FROM (
    -- The enquiry going out.
    SELECT jsonb_build_object(
      'kind', 'NOTIFICATION',
      'direction', 'OUTBOUND',
      'alias', ri.anonymous_label,
      'channel', n.channel,
      'body', n.body,
      'status', n.status,
      'at', COALESCE(n.sent_at, n.created_at)
    ) AS row
    FROM supplier_notifications n
    JOIN rfq_invitations ri
      ON ri.rfq_id = n.rfq_id AND ri.supplier_id = n.supplier_id
    WHERE n.rfq_id = p_rfq_id
      -- Previous demo runs stay in the table and out of the screen.
      AND n.demo_run_id IS NOT DISTINCT FROM private.demo_run_id()

    UNION ALL

    -- Everything the supplier sent, and every reply we sent back.
    SELECT jsonb_build_object(
      'kind', 'MESSAGE',
      'direction', e.direction,
      'alias', ri.anonymous_label,
      'channel', e.channel,
      'body', e.normalized_message,
      'status', e.processing_status,
      'errorCode', e.error_code,
      'at', e.created_at
    ) AS row
    FROM messaging_events e
    JOIN rfq_invitations ri
      ON ri.rfq_id = e.rfq_id AND ri.supplier_id = e.supplier_id
    WHERE e.rfq_id = p_rfq_id
      AND e.demo_run_id IS NOT DISTINCT FROM private.demo_run_id()
  ) rows;

  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.demo_messaging_thread(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Resolving an alias to a handset, for the simulator only
--
-- Service role, because the edge function needs the number to build an inbound
-- message that looks exactly like a real one. Alias in, phone out, demo RFQs
-- only — never reachable from a browser.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.demo_messaging_sender(
  p_rfq_id uuid,
  p_alias text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT private.demo_mode_enabled()
     OR NOT EXISTS (SELECT 1 FROM rfqs WHERE id = p_rfq_id AND is_demo) THEN
    RAISE EXCEPTION 'Messaging simulation is available on demo enquiries only';
  END IF;

  -- Any live channel, not only a verified one, matching the lookup the gateway
  -- itself does. A number that has opted out can still text START, and the demo
  -- has to be able to send that message.
  SELECT jsonb_build_object('phone', smc.phone_e164, 'channel', smc.channel)
  INTO v_result
  FROM rfq_invitations ri
  JOIN supplier_messaging_channels smc
    ON smc.supplier_id = ri.supplier_id AND smc.status <> 'RETIRED'
  WHERE ri.rfq_id = p_rfq_id AND ri.anonymous_label = p_alias
  LIMIT 1;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'No messaging-capable bidder called % on this enquiry', p_alias;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.demo_messaging_sender(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- May the caller simulate at all
--
-- Called by the edge function with the user's own token, so the answer is about
-- the signed-in person rather than about the service role the function holds.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.demo_may_simulate_messaging(p_rfq_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.demo_messaging_allowed(p_rfq_id);
$$;

GRANT EXECUTE ON FUNCTION public.demo_may_simulate_messaging(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Sending the enquiry out
--
-- Lists the suppliers that should be messaged for an RFQ, with the allow-listed
-- payload already assembled. The caller renders and sends; it never gets to
-- choose what a supplier may know.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.supplier_message_queue(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'supplierId', ri.supplier_id,
    'channel', smc.channel,
    'phone', smc.phone_e164,
    'payload', public.supplier_rfq_message_payload(p_rfq_id, ri.supplier_id)
  )), '[]'::jsonb)
  INTO v_rows
  FROM rfq_invitations ri
  JOIN supplier_messaging_channels smc
    ON smc.supplier_id = ri.supplier_id AND smc.status = 'VERIFIED'
  WHERE ri.rfq_id = p_rfq_id
    AND ri.status = 'INVITED'
    -- Not messaged for this enquiry yet. Re-running the send must not text
    -- everyone a second time.
    AND NOT EXISTS (
      SELECT 1 FROM supplier_notifications n
      WHERE n.rfq_id = p_rfq_id
        AND n.supplier_id = ri.supplier_id
        AND n.channel = smc.channel
        AND n.status <> 'FAILED'
    );

  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.supplier_message_queue(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Simulating a supplier reply
--
-- The demo needs to answer an enquiry as a supplier would. It does that by
-- calling the same gateway a real message goes through, so what the audience
-- sees is the real validation, the real versioning and the real refusals —
-- including the ones that reject a bid.
--
-- The parse is done by the caller here, exactly as the webhook does it, and is
-- trusted exactly as little: ingest_supplier_message re-checks the sender, the
-- invitation, the enquiry state, the deadline and the amount regardless. What
-- this function adds is the demo gate and the alias-to-handset lookup, so a
-- browser never has to hold a phone number or a supplier id.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.demo_simulate_supplier_message(
  p_rfq_id uuid,
  p_alias text,
  p_body text,
  p_parsed jsonb DEFAULT NULL,
  p_message_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender jsonb;
  v_result jsonb;
BEGIN
  IF NOT private.demo_messaging_allowed(p_rfq_id) THEN
    RAISE EXCEPTION 'Messaging simulation is available on demo enquiries only';
  END IF;

  v_sender := public.demo_messaging_sender(p_rfq_id, p_alias);

  v_result := public.ingest_supplier_message(jsonb_build_object(
    'provider', 'MOCK',
    'channel', v_sender ->> 'channel',
    -- Passed through when the caller supplies one, so replaying the same id
    -- demonstrates that a duplicate delivery cannot create a second quote.
    'externalMessageId', COALESCE(NULLIF(p_message_id, ''),
                                 'sim-' || gen_random_uuid()::text),
    'phone', v_sender ->> 'phone',
    'body', p_body,
    'raw', jsonb_build_object('simulated', true, 'alias', p_alias),
    'parsed', p_parsed
  ));

  -- The gateway only files a message against an enquiry once it has read a
  -- reference out of it, which is right: a message it could not read belongs to
  -- no enquiry, and guessing one in production would put a supplier's words
  -- under a tender they never named.
  --
  -- The demo is the one place where that association is known independently —
  -- the presenter was sitting on this enquiry when they sent it. Filing it here
  -- is what lets the conversation show a refusal, instead of showing a reply
  -- with nothing above it.
  IF (v_result ? 'eventId') THEN
    UPDATE messaging_events
    SET rfq_id = p_rfq_id, is_demo = true
    WHERE id = (v_result ->> 'eventId')::uuid
      AND rfq_id IS NULL;
  END IF;

  -- The channel is useful to the caller for rendering the reply the way the
  -- supplier would have received it.
  RETURN v_result || jsonb_build_object('channel', v_sender ->> 'channel');
END;
$$;

GRANT EXECUTE ON FUNCTION public.demo_simulate_supplier_message(
  uuid, text, text, jsonb, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Logging the reply the demo showed
--
-- Cosmetic, and scoped accordingly: it records the text of a reply so the
-- conversation reads as a conversation. It cannot change a quote, an invitation
-- or a delivery state.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.demo_record_reply(
  p_rfq_id uuid,
  p_alias text,
  p_body text,
  p_template_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender jsonb;
  v_id     uuid;
BEGIN
  IF NOT private.demo_messaging_allowed(p_rfq_id) THEN
    RAISE EXCEPTION 'Messaging simulation is available on demo enquiries only';
  END IF;

  v_sender := public.demo_messaging_sender(p_rfq_id, p_alias);

  v_id := public.record_outbound_message(jsonb_build_object(
    'provider', 'MOCK',
    'channel', v_sender ->> 'channel',
    'externalMessageId', 'sim-out-' || gen_random_uuid()::text,
    'phone', v_sender ->> 'phone',
    'rfqId', p_rfq_id,
    'body', p_body,
    'templateId', p_template_id,
    'status', 'SENT'
  ));

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.demo_record_reply(uuid, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Sending the enquiry, in the demo
--
-- Queues and records the outbound notification for every messaging-capable
-- bidder. The body is rendered by the caller from the allow-listed payload, so
-- the demo shows the same words a supplier would actually receive.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.demo_messaging_outbox(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT private.demo_messaging_allowed(p_rfq_id) THEN
    RAISE EXCEPTION 'Messaging simulation is available on demo enquiries only';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'alias', ri.anonymous_label,
    'channel', smc.channel,
    'payload', public.supplier_rfq_message_payload(p_rfq_id, ri.supplier_id)
  ) ORDER BY ri.anonymous_label), '[]'::jsonb)
  INTO v_rows
  FROM rfq_invitations ri
  JOIN supplier_messaging_channels smc
    ON smc.supplier_id = ri.supplier_id AND smc.status = 'VERIFIED'
  WHERE ri.rfq_id = p_rfq_id
    AND NOT EXISTS (
      SELECT 1 FROM supplier_notifications n
      WHERE n.rfq_id = p_rfq_id
        AND n.supplier_id = ri.supplier_id
        AND n.demo_run_id IS NOT DISTINCT FROM private.demo_run_id()
    );

  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.demo_messaging_outbox(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.demo_send_notification(
  p_rfq_id uuid,
  p_alias text,
  p_body text,
  p_template_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supplier_id uuid;
  v_channel     messaging_channel;
BEGIN
  IF NOT private.demo_messaging_allowed(p_rfq_id) THEN
    RAISE EXCEPTION 'Messaging simulation is available on demo enquiries only';
  END IF;

  SELECT ri.supplier_id, smc.channel
  INTO v_supplier_id, v_channel
  FROM rfq_invitations ri
  JOIN supplier_messaging_channels smc
    ON smc.supplier_id = ri.supplier_id AND smc.status = 'VERIFIED'
  WHERE ri.rfq_id = p_rfq_id AND ri.anonymous_label = p_alias
  LIMIT 1;

  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'No messaging-capable bidder called % on this enquiry', p_alias;
  END IF;

  RETURN public.record_supplier_notification(jsonb_build_object(
    'rfqId', p_rfq_id,
    'supplierId', v_supplier_id,
    'channel', v_channel,
    'provider', 'MOCK',
    'status', 'DELIVERED',
    'templateId', p_template_id,
    'body', p_body
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.demo_send_notification(uuid, text, text, text) TO authenticated;
