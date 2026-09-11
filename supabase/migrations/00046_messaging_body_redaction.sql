-- Redaction for the messaging layer.
--
-- 00042 established the redaction rule for the clarification thread: on the way
-- in, on write, so the identifying text is never stored. That is the right lock
-- for a thread the two sides are typing at each other in real time.
--
-- The WhatsApp/SMS gateway is different in one respect that matters here. A
-- supplier's inbound body is evidence: raw_payload keeps the provider's copy
-- for a dispute over a mis-read decimal point, and normalized_message is the
-- text the same supplier reads back in their own inbox. Redacting either would
-- change what a supplier can be shown to have said. RLS on messaging_events
-- already denies every buyer role read access — see 00036 — so the bar this
-- migration meets is defence in depth: a public, callable redactor for any
-- surface that later renders a supplier message body to somebody who is not
-- that supplier.
--
-- The redactor itself is the same one the clarification trigger uses. This
-- migration exposes it as a public function so downstream code cannot drift
-- into its own patterns.

CREATE OR REPLACE FUNCTION public.redact_message_body(p_body text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result record;
BEGIN
  IF p_body IS NULL THEN
    RETURN jsonb_build_object('body', NULL, 'kinds', jsonb_build_array());
  END IF;

  SELECT * INTO v_result FROM private.redact_contact_details(p_body);

  RETURN jsonb_build_object(
    'body',  v_result.body,
    'kinds', COALESCE(to_jsonb(v_result.kinds), jsonb_build_array())
  );
END;
$$;

COMMENT ON FUNCTION public.redact_message_body(text) IS
  'Strips emails, links, handles, phone numbers and tax registrations from a supplier message body. Use this before rendering any supplier free text to somebody who is not that supplier — the RFQ owner, an evaluator, an auditor. Returns {body, kinds} so the caller can label the placeholder rather than hiding that a change was made.';

GRANT EXECUTE ON FUNCTION public.redact_message_body(text) TO authenticated, service_role;
