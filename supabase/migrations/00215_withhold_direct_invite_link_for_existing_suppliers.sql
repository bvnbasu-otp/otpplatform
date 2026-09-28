-- =============================================================================
-- Migration 00215: invite_direct_supplier withholds the quick-quote link when
-- the contact belongs to a supplier the buyer did not create
--
-- Finding: since 00195 the RPC returns the plaintext quick-quote token to the
-- BUYER (the UI shows it as a share link). The contact is matched against
-- every supplier, so a buyer who typed the email or phone of an existing
-- supplier (e.g. a verified, registered firm) received a token that
-- redeem_supplier_magic_link turned into a quoting session AS that supplier
-- on the buyer's own RFQ. The response also carried that supplier's id and
-- the invitation id, which rfq_invitations_blind joins to its alias.
--
-- Rule: a share link is issued only when the supplier row is a placeholder
-- this organisation created for exactly this contact and nobody else has
-- acted as it yet, i.e. one of
--   * the supplier row was inserted by this call, or
--   * source = DIRECT and source_ref = '<kind>:<contact>' (created by this
--     RPC for this contact), the first direct invite that created it came
--     from this organisation, it has no supplier_users login, no VERIFIED
--     messaging channel, and none of its magic links was ever redeemed.
-- Anything else is a real party: another organisation's placeholder, a
-- registered supplier, or a placeholder someone has already quoted through.
--
-- For a real party no magic link is created at all. The plaintext would be
-- withheld from the buyer, and this function is the only place it exists, so
-- a stored hash could never be delivered by anyone. Such a supplier is reached
-- by the invitation itself: inserting rfq_invitations fires
-- trg_notify_rfq_invitation and trg_dispatch_supplier_invitation_notification,
-- and the messaging gateway mints its own link via issue_supplier_magic_link
-- when it talks to the supplier's verified number.
--
-- The response keeps every key (UI-compatible). For a real party token,
-- quickQuotePath, invitationId and supplierId are null and shareLinkAvailable
-- is false, so the buyer gets no identifier that maps the contact to an alias
-- or to a platform supplier id.
--
-- A repeat invite of a shareable placeholder issues a fresh link and retires
-- the earlier unused ones for the same RFQ, so the buyer never holds a spare
-- link once the supplier has redeemed the one it was sent.
--
-- Containment: links issued before this migration to a buyer for a supplier
-- that is not that buyer's placeholder are expired (not marked used), so they
-- stop redeeming now rather than up to 7 days after deploy.
--
-- Unchanged from 00213: membership and OWNER/MANAGER/BUYER role, DRAFT/OPEN
-- gate, contact validation and normalisation, supplier reuse / PENDING DIRECT
-- creation, salted label, idempotent direct_supplier_invites row, 7-day
-- hashed single-use link, masked contact in the audit event.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION private.is_unclaimed_direct_placeholder(
  p_supplier_id uuid,
  p_contact_kind text,
  p_contact_value text,
  p_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM suppliers s
      WHERE s.id = p_supplier_id
        AND s.source = 'DIRECT'
        AND s.source_ref = p_contact_kind || ':' || p_contact_value
    )
    AND (
      SELECT d.organization_id FROM direct_supplier_invites d
      WHERE d.supplier_id = p_supplier_id
      ORDER BY d.created_at, d.id
      LIMIT 1
    ) IS NOT DISTINCT FROM p_organization_id
    AND NOT EXISTS (SELECT 1 FROM supplier_users su WHERE su.supplier_id = p_supplier_id)
    AND NOT EXISTS (
      SELECT 1 FROM supplier_messaging_channels c
      WHERE c.supplier_id = p_supplier_id AND c.status = 'VERIFIED'
    )
    AND NOT EXISTS (
      SELECT 1 FROM supplier_magic_links l
      WHERE l.supplier_id = p_supplier_id AND l.used_at IS NOT NULL
    );
$$;

REVOKE ALL ON FUNCTION private.is_unclaimed_direct_placeholder(uuid, text, text, uuid) FROM PUBLIC;

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
  v_created        boolean := false;
  v_shareable      boolean;
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
    v_created := true;
  END IF;

  v_shareable := v_created OR private.is_unclaimed_direct_placeholder(
    v_supplier_id, p_contact_kind, v_normalized, v_rfq.organization_id);

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

  IF v_shareable THEN
    UPDATE supplier_magic_links
    SET expires_at = now()
    WHERE supplier_id = v_supplier_id
      AND rfq_id = p_rfq_id
      AND used_at IS NULL
      AND expires_at > now();

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
  END IF;

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
      'magic_link_issued', v_shareable
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'reused', (v_direct_id IS NULL),
    'invitationId', CASE WHEN v_shareable THEN v_invite_id END,
    'supplierId', CASE WHEN v_shareable THEN v_supplier_id END,
    'token', v_token,
    'quickQuotePath', CASE WHEN v_shareable THEN '/q/' || v_token END,
    'shareLinkAvailable', v_shareable
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_direct_supplier(uuid, text, text) TO authenticated, service_role;

UPDATE supplier_magic_links l
SET expires_at = now()
WHERE l.used_at IS NULL
  AND l.expires_at > now()
  AND EXISTS (
    SELECT 1 FROM direct_supplier_invites d
    WHERE d.rfq_id = l.rfq_id
      AND d.supplier_id = l.supplier_id
      AND NOT private.is_unclaimed_direct_placeholder(
        d.supplier_id, d.contact_kind, d.contact_value, d.organization_id)
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
