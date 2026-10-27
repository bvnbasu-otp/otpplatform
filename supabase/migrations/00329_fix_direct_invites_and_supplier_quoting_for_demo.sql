-- Migration 00329: Fix direct supplier invites, synthetic quote permissions,
-- and supplier masked RFQ visibility for personal buyers and demo personas.

BEGIN;

-- 1. Allow direct_supplier_invites without organization_id (for personal/demo buyers)
ALTER TABLE public.direct_supplier_invites
  ALTER COLUMN organization_id DROP NOT NULL;

-- 2. Update private.assert_synthetic_quotes_allowed to allow creator/owner of demo RFQ
CREATE OR REPLACE FUNCTION private.assert_synthetic_quotes_allowed(p_rfq_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_is_demo boolean;
  v_org_id  uuid;
  v_creator uuid;
  v_owner   uuid;
BEGIN
  SELECT is_demo, organization_id, created_by, owner_profile_id
  INTO v_is_demo, v_org_id, v_creator, v_owner
  FROM public.rfqs
  WHERE id = p_rfq_id;

  IF NOT FOUND THEN
    RETURN 'RFQ not found';
  END IF;

  IF NOT (
    private.is_platform_admin()
    OR COALESCE(auth.role(), '') = 'service_role'
    OR session_user IN ('postgres', 'supabase_admin')
    OR (auth.uid() IS NOT NULL AND (
      (v_org_id IS NOT NULL AND private.is_org_member(v_org_id))
      OR v_creator = private.get_profile_id()
      OR (v_owner IS NOT NULL AND v_owner = private.get_profile_id())
    ))
  ) THEN
    RETURN 'Access denied: simulated quotes require platform admin or ownership/membership of the demo RFQ';
  END IF;

  IF v_is_demo IS NOT TRUE THEN
    RETURN 'Simulated quotes are disabled for real RFQs';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_synthetic_quotes_allowed(uuid) FROM PUBLIC, anon, authenticated;

-- 3. Update public.invite_direct_supplier to support personal buyers and issue demo links
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

  v_profile_id := private.get_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'No profile for caller';
  END IF;

  -- Access control: check org membership OR creator/owner scope OR admin
  IF NOT (
    private.is_platform_admin()
    OR (v_rfq.organization_id IS NOT NULL AND private.is_org_member(v_rfq.organization_id))
    OR v_rfq.created_by = v_profile_id
    OR (v_rfq.owner_profile_id IS NOT NULL AND v_rfq.owner_profile_id = v_profile_id)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_rfq.organization_id IS NOT NULL THEN
    IF private.get_org_role(v_rfq.organization_id) NOT IN ('OWNER', 'MANAGER', 'BUYER')
       AND NOT private.is_platform_admin() THEN
      RAISE EXCEPTION 'Insufficient role for direct invitation';
    END IF;
  END IF;

  IF v_rfq.status NOT IN ('DRAFT', 'OPEN') THEN
    RAISE EXCEPTION 'Direct invitations only allowed while RFQ is DRAFT or OPEN';
  END IF;

  -- Normalize contact info
  IF p_contact_kind = 'EMAIL' THEN
    v_normalized := lower(btrim(p_contact_value));
    IF v_normalized !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      RAISE EXCEPTION 'Not a valid email';
    END IF;
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

  -- Shareable if newly created unregistered placeholder, unclaimed direct, or in demo mode
  v_shareable := v_created
    OR private.is_unclaimed_direct_placeholder(v_supplier_id, p_contact_kind, v_normalized, v_rfq.organization_id)
    OR COALESCE(v_rfq.is_demo, false);

  -- Reuse existing invitation or allocate canonical Crockford Base32 pseudonym label
  SELECT id INTO v_invite_id
  FROM rfq_invitations
  WHERE rfq_id = p_rfq_id AND supplier_id = v_supplier_id;

  IF v_invite_id IS NULL THEN
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
    'quickQuotePath', CASE WHEN v_shareable AND v_token IS NOT NULL THEN '/q/' || v_token END,
    'shareLinkAvailable', v_shareable AND v_token IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_direct_supplier(uuid, text, text) TO authenticated, service_role;

-- 4. Fix rfqs_supplier_masked view to LEFT JOIN organizations (supports individual & demo buyers)
CREATE OR REPLACE VIEW public.rfqs_supplier_masked
WITH (security_barrier = true) AS
SELECT
    r.id AS rfq_id,
    r.public_ref,
    r.title,
    req.description,
    r.status,
    r.sourcing_mode,
    r.quote_deadline,
    r.min_quotes_required,
    r.created_at,
    ri.id AS invitation_id,
    ri.anonymous_label AS my_alias,
    ri.status AS my_invitation_status,
    ri.invited_at,
    cat.name AS category,
    sub.name AS subcategory,
    req.requirement_mode,
    req.quantity,
    req.unit,
    req.attributes,
    req.quality,
    req.commercial,
    req.required_by_mode,
    req.required_by_days,
    req.required_by_date,
    req.fulfilment_mode,
    req.delivery_city,
    r.evaluation_weights,
    CASE
        WHEN r.reveal_status = 'REVEALED' AND EXISTS (
          SELECT 1
          FROM awards a
          JOIN quotes q ON q.id = a.quote_id
          WHERE a.rfq_id = r.id
            AND a.status = 'REVEALED'
            AND q.supplier_id = ri.supplier_id
        ) THEN COALESCE(o.name, 'Individual Buyer')
        ELSE 'Identity protected'::text
    END AS buyer_display_name,
    CASE
        WHEN r.buyer_anonymous_to_suppliers THEN NULL::public.org_type
        ELSE COALESCE(o.org_type, 'INDIVIDUAL'::public.org_type)
    END AS buyer_type
FROM rfqs r
JOIN requirements req ON req.id = r.requirement_id
LEFT JOIN organizations o ON o.id = r.organization_id
JOIN rfq_invitations ri ON ri.rfq_id = r.id
LEFT JOIN requirement_categories cat ON cat.id = req.category_id
LEFT JOIN requirement_subcategories sub ON sub.id = req.subcategory_id
WHERE private.is_supplier_user_for(ri.supplier_id);

REVOKE ALL ON public.rfqs_supplier_masked FROM anon;
GRANT SELECT ON public.rfqs_supplier_masked TO authenticated, service_role;

COMMIT;
