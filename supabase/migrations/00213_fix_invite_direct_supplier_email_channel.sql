-- =============================================================================
-- Migration 00213: invite_direct_supplier accepts EMAIL contacts again
--
-- Symptom: inviting a direct supplier by email fails with
--   22P02 invalid input value for enum messaging_channel: "EMAIL"
--
-- Root cause: 00195 added magic-link issuance to invite_direct_supplier and
-- cast the EMAIL branch to 'EMAIL'::messaging_channel. messaging_channel is
-- the SMS/WhatsApp access layer (00036: {SMS, WHATSAPP}); it types
-- supplier_messaging_channels (E.164 numbers only), inbound messaging_events
-- and outbound supplier_notifications. There is no email transport in it.
--
-- supplier_magic_links.channel is nullable, and issue_supplier_magic_link
-- (00037) already issues links with a NULL channel. A link for an EMAIL
-- contact is therefore recorded with channel NULL: the link is not bound to a
-- messaging channel. The enum is deliberately NOT extended, so no messaging
-- path (inbound routing, opt-in/out, outbound dispatch) starts accepting
-- EMAIL.
--
-- Everything else is the 00195 definition unchanged: org membership and
-- OWNER/MANAGER/BUYER role, DRAFT/OPEN gate, contact validation and
-- normalisation, supplier reuse/PENDING DIRECT creation, salted anonymous
-- label, idempotent direct_supplier_invites row, 7-day hashed single-use link,
-- masked contact in the audit event.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.invite_direct_supplier(
  p_rfq_id uuid,
  p_contact_kind text,
  p_contact_value text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_rfq            rfqs%ROWTYPE;
  v_supplier_id    uuid;
  v_invite_id      uuid;
  v_direct_id      uuid;
  v_normalized     text;
  v_label          text;
  v_profile_id     uuid;
  v_token          text;
  v_channel        messaging_channel;
  v_link_id        uuid;
BEGIN
  IF p_contact_kind IS NULL OR p_contact_kind NOT IN ('PHONE', 'EMAIL') THEN
    RAISE EXCEPTION 'contact_kind must be PHONE or EMAIL';
  END IF;

  IF COALESCE(btrim(p_contact_value), '') = '' THEN
    RAISE EXCEPTION 'contact_value is required';
  END IF;

  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  IF NOT private.is_org_member(v_rfq.organization_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF private.get_org_role(v_rfq.organization_id) NOT IN ('OWNER', 'MANAGER', 'BUYER')
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Insufficient role for direct invitation';
  END IF;

  IF v_rfq.status NOT IN ('DRAFT', 'OPEN') THEN
    RAISE EXCEPTION 'Direct invitations only allowed while RFQ is DRAFT or OPEN';
  END IF;

  v_profile_id := private.get_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'No profile for caller';
  END IF;

  -- Normalize contact info
  IF p_contact_kind = 'EMAIL' THEN
    v_normalized := lower(btrim(p_contact_value));
    IF v_normalized !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      RAISE EXCEPTION 'Not a valid email';
    END IF;
    -- messaging_channel has no email transport; the link is not bound to one.
    v_channel := NULL;
  ELSE
    v_normalized := regexp_replace(btrim(p_contact_value), '[^0-9+]', '', 'g');
    IF v_normalized !~ '^\+?[0-9]{8,15}$' THEN
      RAISE EXCEPTION 'Not a valid phone number';
    END IF;
    v_channel := 'WHATSAPP'::messaging_channel;
  END IF;

  -- Match existing supplier or insert a new PENDING supplier
  IF p_contact_kind = 'PHONE' THEN
    SELECT id INTO v_supplier_id
    FROM suppliers WHERE contact_phone = v_normalized LIMIT 1;
  ELSE
    SELECT id INTO v_supplier_id
    FROM suppliers WHERE contact_email = v_normalized LIMIT 1;
  END IF;

  IF v_supplier_id IS NULL THEN
    INSERT INTO suppliers (
      business_name, source, source_ref, status,
      contact_phone, contact_email, categories
    ) VALUES (
      'Invited supplier',
      'DIRECT',
      p_contact_kind || ':' || v_normalized,
      'PENDING',
      CASE WHEN p_contact_kind = 'PHONE' THEN v_normalized END,
      CASE WHEN p_contact_kind = 'EMAIL' THEN v_normalized END,
      ARRAY[]::text[]
    ) RETURNING id INTO v_supplier_id;
  END IF;

  -- Reuse existing invitation or allocate canonical Crockford Base32 pseudonym label
  SELECT id INTO v_invite_id
  FROM rfq_invitations
  WHERE rfq_id = p_rfq_id AND supplier_id = v_supplier_id;

  IF v_invite_id IS NULL THEN
    -- Canonical Base32 pseudonym (e.g. 'Supplier A7K3')
    v_label := private.assign_anonymous_label(p_rfq_id, v_supplier_id);

    INSERT INTO rfq_invitations (
      rfq_id, supplier_id, anonymous_label, status, match_reasons
    ) VALUES (
      p_rfq_id, v_supplier_id, v_label, 'INVITED',
      ARRAY['direct:' || lower(p_contact_kind)]
    ) RETURNING id INTO v_invite_id;
  END IF;

  -- Insert direct invite record if not present
  INSERT INTO direct_supplier_invites (
    rfq_id, organization_id, invited_by,
    contact_kind, contact_value, supplier_id, invitation_id
  ) VALUES (
    p_rfq_id, v_rfq.organization_id, v_profile_id,
    p_contact_kind, v_normalized, v_supplier_id, v_invite_id
  ) ON CONFLICT (rfq_id, contact_kind, contact_value) DO NOTHING
  RETURNING id INTO v_direct_id;

  -- Generate Single-Use Quick-Quote Magic Link Token (32-byte URL-safe)
  v_token := rtrim(
    replace(replace(encode(extensions.gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'),
    '=');

  INSERT INTO supplier_magic_links (
    supplier_id, rfq_id, token_hash, expires_at, channel, is_demo
  ) VALUES (
    v_supplier_id, p_rfq_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    now() + interval '7 days',
    v_channel,
    COALESCE(v_rfq.is_demo, false)
  ) RETURNING id INTO v_link_id;

  INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
  VALUES (
    'rfq.direct_invitation_created',
    'rfq',
    p_rfq_id::text,
    jsonb_build_object(
      'supplier_id', v_supplier_id,
      'invitation_id', v_invite_id,
      'contact_kind', p_contact_kind,
      'contact_value_masked', CASE
        WHEN p_contact_kind = 'PHONE' THEN regexp_replace(v_normalized, '.(?=.{4})', '*', 'g')
        ELSE regexp_replace(v_normalized, '(^.).*(@.*$)', '\1***\2')
      END,
      'magic_link_issued', true
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'reused', (v_direct_id IS NULL),
    'invitationId', v_invite_id,
    'supplierId', v_supplier_id,
    'token', v_token,
    'quickQuotePath', '/q/' || v_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_direct_supplier(uuid, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
