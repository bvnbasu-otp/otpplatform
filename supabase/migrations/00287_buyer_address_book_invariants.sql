-- 00287: enforce the buyer address book at the database RPC boundary.
--
-- The canonical address_type values remain unchanged. New RFQs capture the
-- current default address; historical RFQ/PO snapshots are never refreshed
-- when the address book changes.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS buyer_addresses_one_active_primary_org
  ON public.buyer_addresses (organization_id)
  WHERE organization_id IS NOT NULL AND is_active AND is_primary;

CREATE UNIQUE INDEX IF NOT EXISTS buyer_addresses_one_active_primary_personal
  ON public.buyer_addresses (profile_id)
  WHERE organization_id IS NULL AND is_active AND is_primary;

CREATE OR REPLACE FUNCTION private.lock_buyer_address_scope(p_profile_id uuid, p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF p_org_id IS NOT NULL THEN
    PERFORM 1 FROM public.organizations WHERE id = p_org_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Address organization does not exist (ADDRESS-SCOPE-NOT-FOUND)'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended('buyer-address:' || p_profile_id::text, 0));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.lock_buyer_address_scope(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.upsert_buyer_address_atomic(
  p_label          text,
  p_line1          text,
  p_city           text,
  p_state          text,
  p_pincode        text,
  p_line2          text DEFAULT NULL,
  p_landmark       text DEFAULT NULL,
  p_country        text DEFAULT 'India',
  p_is_primary     boolean DEFAULT false,
  p_address_type   text DEFAULT 'DELIVERY',
  p_org_id         uuid DEFAULT NULL,
  p_address_id     uuid DEFAULT NULL,
  p_contact_person text DEFAULT NULL,
  p_contact_phone  text DEFAULT NULL,
  p_state_code     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, pg_temp
AS $$
DECLARE
  v_caller_id uuid := private.get_profile_id();
  v_res_id uuid;
  v_now timestamptz := now();
  v_existing public.buyer_addresses%ROWTYPE;
  v_count integer;
  v_primary boolean := COALESCE(p_is_primary, false);
BEGIN
  IF auth.uid() IS NULL OR v_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication required');
  END IF;
  IF p_line1 IS NULL OR btrim(p_line1) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Address line 1 is required');
  END IF;
  IF p_city IS NULL OR btrim(p_city) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'City is required');
  END IF;
  IF p_state IS NULL OR btrim(p_state) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'State is required');
  END IF;
  IF p_pincode IS NULL OR NOT (btrim(p_pincode) ~ '^[1-9][0-9]{5}$') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Valid 6-digit Indian PIN code is required');
  END IF;
  IF p_address_type IS NULL OR upper(btrim(p_address_type)) NOT IN
     ('DELIVERY', 'BILLING', 'BOTH', 'REGISTERED', 'SITE') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid canonical address type');
  END IF;
  IF p_org_id IS NOT NULL
     AND NOT private.is_org_member(p_org_id)
     AND NOT private.is_platform_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Access denied to organization');
  END IF;

  PERFORM private.lock_buyer_address_scope(v_caller_id, p_org_id);

  IF p_address_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.buyer_addresses
    WHERE id = p_address_id
    FOR UPDATE;
    IF NOT FOUND OR NOT (
      private.is_platform_admin()
      OR (v_existing.organization_id IS NULL AND v_existing.profile_id = v_caller_id)
      OR (v_existing.organization_id IS NOT NULL AND private.is_org_member(v_existing.organization_id))
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Address record not found');
    END IF;
    IF v_existing.organization_id IS DISTINCT FROM p_org_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'An address cannot be moved between a personal profile and an organization');
    END IF;
    IF v_existing.is_active AND v_existing.is_primary AND NOT v_primary THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Set another address as default before unsetting the current default'
      );
    END IF;
  ELSE
    SELECT count(*)::integer INTO v_count
    FROM public.buyer_addresses
    WHERE is_active
      AND (
        (p_org_id IS NOT NULL AND organization_id = p_org_id)
        OR (p_org_id IS NULL AND organization_id IS NULL AND profile_id = v_caller_id)
      );
    IF v_count >= 3 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'A maximum of three saved addresses is allowed', 'code', 'ADDRESS-LIMIT');
    END IF;
    IF v_count = 0 THEN
      v_primary := true;
    END IF;
  END IF;

  IF v_primary THEN
    UPDATE public.buyer_addresses
    SET is_primary = false, updated_at = v_now
    WHERE is_active
      AND is_primary
      AND (p_address_id IS NULL OR id <> p_address_id)
      AND (
        (p_org_id IS NOT NULL AND organization_id = p_org_id)
        OR (p_org_id IS NULL AND organization_id IS NULL AND profile_id = v_caller_id)
      );
  END IF;

  IF p_address_id IS NULL THEN
    INSERT INTO public.buyer_addresses (
      profile_id, organization_id, label, address_line1, address_line2,
      landmark, city, state, state_code, pincode, country, contact_person,
      contact_phone, is_primary, address_type, is_active, created_at, updated_at
    ) VALUES (
      v_caller_id, p_org_id, COALESCE(NULLIF(btrim(p_label), ''), 'Primary Site'),
      btrim(p_line1), NULLIF(btrim(p_line2), ''), NULLIF(btrim(p_landmark), ''),
      btrim(p_city), btrim(p_state), NULLIF(btrim(p_state_code), ''), btrim(p_pincode),
      COALESCE(NULLIF(btrim(p_country), ''), 'India'),
      NULLIF(btrim(p_contact_person), ''), NULLIF(btrim(p_contact_phone), ''),
      v_primary, upper(btrim(p_address_type)), true, v_now, v_now
    ) RETURNING id INTO v_res_id;
  ELSE
    UPDATE public.buyer_addresses
    SET label = COALESCE(NULLIF(btrim(p_label), ''), label),
        address_line1 = btrim(p_line1),
        address_line2 = NULLIF(btrim(p_line2), ''),
        landmark = NULLIF(btrim(p_landmark), ''),
        city = btrim(p_city),
        state = btrim(p_state),
        state_code = NULLIF(btrim(p_state_code), ''),
        pincode = btrim(p_pincode),
        country = COALESCE(NULLIF(btrim(p_country), ''), 'India'),
        contact_person = NULLIF(btrim(p_contact_person), ''),
        contact_phone = NULLIF(btrim(p_contact_phone), ''),
        is_primary = v_primary,
        address_type = upper(btrim(p_address_type)),
        is_active = true,
        updated_at = v_now
    WHERE id = p_address_id
    RETURNING id INTO v_res_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'address_id', v_res_id, 'is_primary', v_primary);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_buyer_address_atomic(text, text, text, text, text, text, text, text, boolean, text, uuid, uuid, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_buyer_address_atomic(text, text, text, text, text, text, text, text, boolean, text, uuid, uuid, text, text, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.deactivate_buyer_address_atomic(
  p_address_id uuid,
  p_replacement_address_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, pg_temp
AS $$
DECLARE
  v_caller_id uuid := private.get_profile_id();
  v_target public.buyer_addresses%ROWTYPE;
  v_replacement public.buyer_addresses%ROWTYPE;
  v_count integer;
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL OR v_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication required');
  END IF;
  SELECT * INTO v_target FROM public.buyer_addresses WHERE id = p_address_id FOR UPDATE;
  IF NOT FOUND OR NOT v_target.is_active OR NOT (
    private.is_platform_admin()
    OR (v_target.organization_id IS NULL AND v_target.profile_id = v_caller_id)
    OR (v_target.organization_id IS NOT NULL AND private.is_org_member(v_target.organization_id))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Address record not found');
  END IF;

  PERFORM private.lock_buyer_address_scope(v_target.profile_id, v_target.organization_id);
  SELECT count(*)::integer INTO v_count
  FROM public.buyer_addresses
  WHERE is_active
    AND (
      (v_target.organization_id IS NOT NULL AND organization_id = v_target.organization_id)
      OR (v_target.organization_id IS NULL AND organization_id IS NULL AND profile_id = v_target.profile_id)
    );
  IF v_count <= 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'The last saved address cannot be deleted', 'code', 'ADDRESS-LAST');
  END IF;

  IF v_target.is_primary THEN
    IF p_replacement_address_id IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Choose another saved address as the default before deleting the current default',
        'code', 'ADDRESS-DEFAULT-REPLACEMENT-REQUIRED'
      );
    END IF;
    SELECT * INTO v_replacement
    FROM public.buyer_addresses
    WHERE id = p_replacement_address_id
      AND is_active
      AND id <> v_target.id
      AND organization_id IS NOT DISTINCT FROM v_target.organization_id
      AND (
        v_target.organization_id IS NOT NULL
        OR profile_id = v_target.profile_id
      )
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Replacement address is not eligible');
    END IF;
    -- The unique partial index is immediate. Clear the old default first;
    -- both writes are still atomic because they are in this RPC transaction.
    UPDATE public.buyer_addresses
    SET is_primary = false, updated_at = v_now
    WHERE id = v_target.id;
    UPDATE public.buyer_addresses
    SET is_primary = true, updated_at = v_now
    WHERE id = v_replacement.id;
  END IF;

  UPDATE public.buyer_addresses
  SET is_active = false, is_primary = false, updated_at = v_now
  WHERE id = v_target.id;

  RETURN jsonb_build_object(
    'ok', true,
    'address_id', v_target.id,
    'replacement_address_id', CASE WHEN v_target.is_primary THEN v_replacement.id ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_buyer_address_atomic(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_buyer_address_atomic(uuid, uuid) TO authenticated, service_role;

-- Clients must use the concurrency-safe RPCs. SELECT remains governed by RLS.
REVOKE INSERT, UPDATE, DELETE ON public.buyer_addresses FROM authenticated;

CREATE OR REPLACE FUNCTION private.snapshot_primary_buyer_address_for_rfq()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_address public.buyer_addresses%ROWTYPE;
  v_snapshot jsonb;
BEGIN
  IF NEW.delivery_address_snapshot IS NOT NULL
     AND NEW.billing_address_snapshot IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_address
  FROM public.buyer_addresses
  WHERE is_active
    AND is_primary
    AND (
      (NEW.organization_id IS NOT NULL AND organization_id = NEW.organization_id)
      OR (
        NEW.organization_id IS NULL
        AND organization_id IS NULL
        AND profile_id = NEW.owner_profile_id
      )
    )
  ORDER BY created_at, id
  LIMIT 1;

  IF FOUND THEN
    v_snapshot := jsonb_strip_nulls(jsonb_build_object(
      'addressId', v_address.id,
      'label', v_address.label,
      'line1', v_address.address_line1,
      'line2', v_address.address_line2,
      'landmark', v_address.landmark,
      'city', v_address.city,
      'state', v_address.state,
      'stateCode', v_address.state_code,
      'pincode', v_address.pincode,
      'country', v_address.country,
      'contactPerson', v_address.contact_person,
      'contactPhone', v_address.contact_phone,
      'capturedAt', now(),
      'isFrozen', true
    ));
    NEW.delivery_address_snapshot := COALESCE(NEW.delivery_address_snapshot, v_snapshot);
    NEW.billing_address_snapshot := COALESCE(NEW.billing_address_snapshot, v_snapshot);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.snapshot_primary_buyer_address_for_rfq()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_snapshot_primary_buyer_address_for_rfq ON public.rfqs;
CREATE TRIGGER trg_snapshot_primary_buyer_address_for_rfq
BEFORE INSERT ON public.rfqs
FOR EACH ROW
EXECUTE FUNCTION private.snapshot_primary_buyer_address_for_rfq();

-- Domain rule: a PIN is six digits and the first digit cannot be zero.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.buyer_addresses
    WHERE pincode IS NOT NULL AND btrim(pincode) !~ '^[1-9][0-9]{5}$'
  ) THEN
    RAISE EXCEPTION 'Existing buyer addresses use a PIN the domain rule rejects (PIN-LEGACY-DATA)';
  END IF;
  ALTER TABLE public.buyer_addresses DROP CONSTRAINT IF EXISTS chk_buyer_pincode_format;
  ALTER TABLE public.buyer_addresses
    ADD CONSTRAINT chk_buyer_pincode_format CHECK (pincode ~ '^[1-9][0-9]{5}$');
END $$;

COMMIT;
