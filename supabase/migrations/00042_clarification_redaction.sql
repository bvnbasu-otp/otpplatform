-- Keeping the masked thread masked.
--
-- The Q&A thread is the one place in a blind enquiry where the two sides type
-- free text at each other, which makes it the one place the masking can be
-- undone by the participants themselves. A supplier writes "call me on 98765
-- 43210" and every guarantee elsewhere in this schema — the salted alias, the
-- identity-free comparison view, the reveal that only happens on award — is
-- worth nothing for that enquiry.
--
-- Two observations shaped the design.
--
-- First, it is mostly not an attack. A contractor who has spent twenty years
-- doing business over the phone will offer a phone number because that is how
-- work gets done, not to defeat the evaluation. Refusing the message with an
-- error teaches them nothing and loses the question; replacing the number and
-- telling them so teaches them exactly what the rule is, on the first attempt.
--
-- Second, it has to happen on write, not on read. A body redacted only in a view
-- is a body still sitting in the table, readable by any future query, any export
-- and any bug in a policy. Redaction on the way in means the identifying text
-- was never stored.
--
-- What this is not: it is not a guarantee. "Ask the guard at the blue gate on
-- Anna Salai" is identifying and no pattern will catch it. What it does catch is
-- everything mechanical — numbers, addresses, links, social handles — which is
-- what people actually type, and it does it visibly enough that both sides
-- understand the thread is watched.

-- ---------------------------------------------------------------------------
-- What a redaction did
--
-- Stored alongside the message rather than only mentioned in the text, so the
-- interface can explain the placeholder, and so an auditor can see that the
-- platform altered a participant's words and why. Altering someone's message
-- silently would be the worse version of this feature.
-- ---------------------------------------------------------------------------

ALTER TABLE rfq_clarification_messages
  ADD COLUMN redactions text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN rfq_clarification_messages.redactions IS
  'Kinds of identifying content removed from this message on write, e.g. PHONE, EMAIL, LINK. Empty means the body is exactly as it was typed.';

/**
 * Removes contact details from a message body.
 *
 * Order matters. Emails and links are taken before phone numbers, because both
 * contain digits that the phone patterns would otherwise eat first, leaving a
 * mangled half-address behind that is still identifying.
 *
 * The phone patterns are the delicate part, and they are narrower than they
 * could be for a specific reason: this thread is where prices are negotiated, so
 * it is full of numbers that must survive. "45000 32000" is two amounts and has
 * to stay; "98765 43210" is a phone number and has to go. Both are ten digits
 * with a space in the middle. The rule that separates them is that phone numbers
 * come in recognised shapes — a country code, three groups, a punctuated pair, or
 * ten digits with nothing between them — while amounts do not.
 *
 * The honest limit: a number written out as "nine eight seven six five" is not
 * caught, and neither is "the yard behind the blue gate". This removes what
 * people mechanically type, which is almost all of it, and it makes clear to both
 * sides that the thread is watched. It is not a proof.
 */
CREATE OR REPLACE FUNCTION private.redact_contact_details(p_body text)
RETURNS TABLE (body text, kinds text[])
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_body  text := p_body;
  v_kinds text[] := '{}';
  v_before text;
BEGIN
  -- Email addresses.
  v_before := v_body;
  v_body := regexp_replace(
    v_body,
    '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}',
    '[email removed]', 'gi');
  IF v_body <> v_before THEN v_kinds := v_kinds || 'EMAIL'::text; END IF;

  -- Links, with or without a scheme.
  v_before := v_body;
  v_body := regexp_replace(v_body, '(https?://|www\.)[^[:space:]]+', '[link removed]', 'gi');
  IF v_body <> v_before THEN v_kinds := v_kinds || 'LINK'::text; END IF;

  -- Social and messaging handles. wa.me is the one that matters most in this
  -- market: it is a phone number wearing a URL.
  v_before := v_body;
  v_body := regexp_replace(
    v_body,
    '(wa\.me/[[:digit:]]+|@[[:alnum:]_.]{3,}|(instagram|facebook|linkedin|telegram|t)\.me?/[^[:space:]]+)',
    '[handle removed]', 'gi');
  IF v_body <> v_before THEN v_kinds := v_kinds || 'HANDLE'::text; END IF;

  -- Phone numbers, in the shapes they are actually written in. A leading + is
  -- treated as proof of intent and allows loose spacing; without it, a number
  -- has to arrive in one piece or in three groups before it is assumed to be a
  -- phone rather than a quantity.
  v_before := v_body;
  v_body := regexp_replace(
    v_body,
    '(\+[[:digit:]]{1,3}[[:space:]().-]*[[:digit:]][[:digit:][:space:]().-]{7,}[[:digit:]]'
    || '|[[:digit:]]{10,13}'
    || '|[[:digit:]]{2,3}[[:space:].-][[:digit:]]{5}[[:space:].-][[:digit:]]{5}'
    || '|[[:digit:]]{3}[[:space:].-][[:digit:]]{3}[[:space:].-][[:digit:]]{4}'
    || '|[[:digit:]]{2}[[:space:].-][[:digit:]]{4}[[:space:].-][[:digit:]]{4}'
    || '|[[:digit:]]{5}[.-][[:digit:]]{5})',
    '[phone removed]', 'g');
  IF v_body <> v_before THEN v_kinds := v_kinds || 'PHONE'::text; END IF;

  -- The hard case, and the common one: "98765 43210" is how an Indian mobile is
  -- normally written, and "45000 32000" is two prices. They are the same shape,
  -- so shape alone cannot separate them — but the sentence around them can. A
  -- person offering a number says so, and a person quoting two figures does not
  -- say "call". Reading that intent is how a human tells these apart, and it is
  -- the only rule here that produces neither eaten prices nor leaked numbers.
  --
  -- An address or handle already found in the same message counts as intent too:
  -- someone who has just given an email is not quoting two prices next to it.
  IF cardinality(v_kinds) > 0
     OR v_body ~* '(call|phone|mobile|whats[[:space:]]?app|ping|reach|contact|number|dial|ring|cell|direct)' THEN
    v_before := v_body;
    v_body := regexp_replace(
      v_body,
      '[[:digit:]]{5}[[:space:]][[:digit:]]{5}|[[:digit:]]{4}[[:space:]][[:digit:]]{6}',
      '[phone removed]', 'g');
    IF v_body <> v_before AND NOT ('PHONE' = ANY (v_kinds)) THEN
      v_kinds := v_kinds || 'PHONE'::text;
    END IF;
  END IF;

  -- A GST number identifies a business exactly and has a shape nothing else
  -- shares. A PAN is only removed when it is labelled as one: five letters, four
  -- digits and a letter is also what half the pump model numbers in this market
  -- look like, and redacting the model being quoted would be worse than useless.
  v_before := v_body;
  v_body := regexp_replace(
    v_body,
    '([[:digit:]]{2}[[:alpha:]]{5}[[:digit:]]{4}[[:alpha:]][[:alnum:]]{3}'
    || '|(pan|gst|gstin|tin)[[:space:]:.no-]*[[:alnum:]]{10,15})',
    '[registration removed]', 'gi');
  IF v_body <> v_before THEN v_kinds := v_kinds || 'REGISTRATION'::text; END IF;

  RETURN QUERY SELECT v_body, v_kinds;
END;
$$;

COMMENT ON FUNCTION private.redact_contact_details(text) IS
  'Strips emails, links, handles, phone numbers and tax registrations from free text. Tuned to over-redact rather than under-redact: a confusing placeholder is cheaper than a broken anonymity guarantee.';

/**
 * Applied on write, to both sides.
 *
 * Buyers are redacted too, and not for symmetry's sake: a buyer who leaves a
 * phone number in the thread has told every bidder who they are, which changes
 * what those bidders quote. Buyer anonymity is the default posture in this
 * schema, and this is the one route that could quietly opt out of it.
 *
 * The exception is an enquiry that has already been revealed. Once identities are
 * out, contact details are the point — that is how the two parties arrange the
 * work — and a redaction there would be theatre.
 */
CREATE OR REPLACE FUNCTION private.redact_clarification_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revealed boolean;
  v_result   record;
BEGIN
  SELECT r.reveal_status = 'REVEALED' INTO v_revealed
  FROM rfqs r WHERE r.id = NEW.rfq_id;

  IF COALESCE(v_revealed, false) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_result FROM private.redact_contact_details(NEW.body);

  NEW.body := v_result.body;
  NEW.redactions := v_result.kinds;

  -- A message that was nothing but a phone number leaves nothing behind worth
  -- sending. It does not leave an empty string, though — every pattern replaces
  -- what it removes with a placeholder — so the test is whether anything the
  -- recipient could read survives once the placeholders are set aside. Storing
  -- "[phone removed]" as a message would put a line in the thread that tells the
  -- other side nothing and tells the sender nothing either.
  IF regexp_replace(
       NEW.body,
       '\[(email|link|handle|phone|registration) removed\]',
       '', 'g'
     ) !~ '[[:alnum:]]' THEN
    RAISE EXCEPTION 'This message was only contact details, which cannot be shared while identities are protected'
      USING ERRCODE = 'check_violation',
            HINT = 'Ask your question here; contact details are exchanged automatically when the award is made.';
  END IF;

  RETURN NEW;
END;
$$;

-- BEFORE INSERT only. There is no UPDATE policy on this table — messages are not
-- editable — so an UPDATE trigger would guard a door with no handle.
CREATE TRIGGER clarification_messages_redact
  BEFORE INSERT ON rfq_clarification_messages
  FOR EACH ROW EXECUTE FUNCTION private.redact_clarification_message();

-- ---------------------------------------------------------------------------
-- The views carry the fact of redaction
--
-- redactions goes last in both. CREATE OR REPLACE VIEW can only append columns,
-- so putting it beside body — where it reads better — would require dropping the
-- views, and anything depending on them, to gain a column.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW rfq_clarification_blind
WITH (security_barrier = true) AS
SELECT
  m.id AS message_id,
  m.rfq_id,
  m.invitation_id,
  ri.anonymous_label,
  m.author_side,
  CASE
    WHEN m.author_side = 'BUYER' THEN 'Buyer organization'
    ELSE ri.anonymous_label
  END AS author_display,
  m.body,
  m.created_at,
  m.redactions
FROM rfq_clarification_messages m
JOIN rfq_invitations ri ON ri.id = m.invitation_id
JOIN rfqs r ON r.id = m.rfq_id
WHERE r.reveal_status = 'BLIND'
  AND (
    private.can_access_rfq_as_buyer(m.rfq_id)
    OR private.can_access_rfq_as_committee(m.rfq_id)
  );

CREATE OR REPLACE VIEW rfq_clarification_supplier
WITH (security_barrier = true) AS
SELECT
  m.id AS message_id,
  m.rfq_id,
  m.invitation_id,
  m.author_side,
  CASE
    WHEN m.author_side = 'BUYER' THEN 'Buyer organization'
    ELSE 'You'
  END AS author_display,
  m.body,
  m.created_at,
  m.redactions
FROM rfq_clarification_messages m
JOIN rfq_invitations ri ON ri.id = m.invitation_id
WHERE private.is_supplier_user_for(ri.supplier_id);

GRANT SELECT ON rfq_clarification_blind TO authenticated;
GRANT SELECT ON rfq_clarification_supplier TO authenticated;
