-- Direct supplier invitations by phone or email.
--
-- The "Direct suppliers" channel on the public site claims a buyer can invite a
-- known supplier without discovering them through the registry. Until this
-- migration that claim rested on the registry alone: an invited-supplier flow
-- did not exist and the channel was overclaimed. This adds the missing surface.
--
-- What the flow is
-- ----------------
-- 1. The buyer types a phone number or email into the discover screen and
--    submits it. The RPC below is the only path in.
-- 2. If a supplier already exists with that contact, we reuse them. Otherwise
--    we create a PENDING supplier row whose `source` is `DIRECT`, which is how
--    the existing `rfq_supplier_networks` view will count them under the
--    "Direct" bucket without any further work.
-- 3. An `rfq_invitations` row is created with a fresh anonymous label — the
--    same alias mechanism the discovery-based invitations use — so blind
--    evaluation is unaffected.
-- 4. A row in `direct_supplier_invites` records that the invitation came from
--    the direct channel, for audit and for the summary panel. The table is
--    write-only from the client's point of view; buyers read the aggregate.
--
-- What is deliberately not in this migration
-- ------------------------------------------
--   * Sending the WhatsApp/SMS. The existing OPEN-RFQ notification flow will
--     dispatch the message to the new invitation like any other; there is no
--     separate messaging path.
--   * Editing the direct supplier's business name, city or categories. The
--     supplier owns their own profile once they redeem the magic link; the
--     buyer only knows a contact and must not decide the supplier's identity
--     for them.
--   * A "list my direct invites" endpoint. Buyers see counts through
--     `rfq_supplier_networks`; a per-supplier list is what blind evaluation
--     exists to prevent.

CREATE TABLE direct_supplier_invites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id          uuid NOT NULL REFERENCES rfqs (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  invited_by      uuid NOT NULL REFERENCES profiles (id),
  contact_kind    text NOT NULL CHECK (contact_kind IN ('PHONE', 'EMAIL')),
  contact_value   text NOT NULL,
  supplier_id     uuid NOT NULL REFERENCES suppliers (id) ON DELETE CASCADE,
  invitation_id   uuid NOT NULL REFERENCES rfq_invitations (id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rfq_id, contact_kind, contact_value)
);

CREATE INDEX idx_direct_supplier_invites_rfq
  ON direct_supplier_invites (rfq_id);
CREATE INDEX idx_direct_supplier_invites_supplier
  ON direct_supplier_invites (supplier_id);

COMMENT ON TABLE direct_supplier_invites IS
  'Evidence trail for buyer-initiated invitations by phone or email. Not '
  'readable by clients; buyers see counts through the network summary view.';

ALTER TABLE direct_supplier_invites ENABLE ROW LEVEL SECURITY;

-- Only platform admins can SELECT — this is audit evidence, not a UI surface.
-- Buyers who inserted a row already know what they typed; letting them read
-- back the aggregated table would give them a per-supplier map that the blind
-- views deliberately hide.
CREATE POLICY direct_supplier_invites_admin_select ON direct_supplier_invites
  FOR SELECT USING (private.is_platform_admin());

-- No INSERT, UPDATE or DELETE policy: the SECURITY DEFINER function below is
-- the only writer.

-- ---------------------------------------------------------------------------
-- Function
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.invite_direct_supplier(
  p_rfq_id uuid,
  p_contact_kind text,
  p_contact_value text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq            rfqs%ROWTYPE;
  v_supplier_id    uuid;
  v_invite_id      uuid;
  v_direct_id      uuid;
  v_normalized     text;
  v_existing_count integer;
  v_label          text;
  v_profile_id     uuid;
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

  -- Normalize.
  --   * Emails are lowercased and shape-checked. Anything more sophisticated
  --     belongs in the parser, not here.
  --   * Phones keep a leading '+' and digits only. The rule matches the one the
  --     messaging gateway uses to identify a supplier by their number, so the
  --     row created here can be reached by the same webhook.
  IF p_contact_kind = 'EMAIL' THEN
    v_normalized := lower(btrim(p_contact_value));
    IF v_normalized !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      RAISE EXCEPTION 'Not a valid email';
    END IF;
  ELSE
    v_normalized := regexp_replace(btrim(p_contact_value), '[^0-9+]', '', 'g');
    IF v_normalized !~ '^\+?[0-9]{8,15}$' THEN
      RAISE EXCEPTION 'Not a valid phone number';
    END IF;
  END IF;

  -- Idempotent by (rfq, kind, value). A second call for the same contact on
  -- the same enquiry returns the existing rows rather than a duplicate — safer
  -- than a client-side check that could race a double-click.
  SELECT id, supplier_id, invitation_id
    INTO v_direct_id, v_supplier_id, v_invite_id
  FROM direct_supplier_invites
  WHERE rfq_id = p_rfq_id
    AND contact_kind = p_contact_kind
    AND contact_value = v_normalized;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'reused', true,
      'invitationId', v_invite_id,
      'supplierId', v_supplier_id
    );
  END IF;

  -- Match a supplier that already exists by that contact — otherwise create a
  -- PENDING one whose only known attribute is the contact the buyer typed.
  -- The business name is a placeholder; the supplier owns their own profile
  -- once they redeem the magic link, so this row must not decide who they are.
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

  -- Reuse the existing invitation if the supplier had already been invited by
  -- discovery. Otherwise mint a new anonymous label using the same 'Supplier
  -- X' shape as discover_and_invite_for_rfq — capped at 26 because further
  -- letters would need a two-character scheme the alias regex does not permit.
  SELECT id INTO v_invite_id
  FROM rfq_invitations
  WHERE rfq_id = p_rfq_id AND supplier_id = v_supplier_id;

  IF v_invite_id IS NULL THEN
    SELECT count(*)::int INTO v_existing_count
    FROM rfq_invitations WHERE rfq_id = p_rfq_id;

    IF v_existing_count >= 26 THEN
      RAISE EXCEPTION 'Too many invitations on this RFQ for the anonymous label scheme';
    END IF;

    v_label := 'Supplier ' || chr(65 + v_existing_count);

    INSERT INTO rfq_invitations (
      rfq_id, supplier_id, anonymous_label, status, match_reasons
    ) VALUES (
      p_rfq_id, v_supplier_id, v_label, 'INVITED',
      ARRAY['direct:' || lower(p_contact_kind)]
    ) RETURNING id INTO v_invite_id;
  END IF;

  INSERT INTO direct_supplier_invites (
    rfq_id, organization_id, invited_by,
    contact_kind, contact_value, supplier_id, invitation_id
  ) VALUES (
    p_rfq_id, v_rfq.organization_id, v_profile_id,
    p_contact_kind, v_normalized, v_supplier_id, v_invite_id
  ) RETURNING id INTO v_direct_id;

  -- The audit event carries the invitation and the supplier, not the phone or
  -- email. A buyer who typed the number has, at that point, seen it — but
  -- nothing downstream needs to keep a copy alongside every entity that touches
  -- the invitation.
  INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
  VALUES (
    'rfq.direct_invitation_created',
    'rfq_invitation', v_invite_id::text,
    jsonb_build_object(
      'rfqId', p_rfq_id,
      'contactKind', p_contact_kind,
      'supplierId', v_supplier_id,
      'directInviteId', v_direct_id
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'reused', false,
    'invitationId', v_invite_id,
    'supplierId', v_supplier_id
  );
END;
$$;

COMMENT ON FUNCTION public.invite_direct_supplier(uuid, text, text) IS
  'Invites a supplier the buyer already knows by phone or email. Idempotent '
  'by (rfq_id, contact_kind, contact_value).';

GRANT EXECUTE ON FUNCTION public.invite_direct_supplier(uuid, text, text)
  TO authenticated;
