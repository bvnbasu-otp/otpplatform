-- Migration 00272: Add WAHA to messaging_provider Enum & Isolate Operator Gateway Phone
--
-- 1. Adds 'WAHA' to enum messaging_provider so record_supplier_notification can log WAHA dispatches without type errors.
-- 2. Updates legacy QA test suppliers (A2Z, SUPPLIER-B) away from operator phone (+919972967530).
-- 3. Hardens dispatch_supplier_invitation_notification to NEVER dispatch quote invitations to:
--    a) The platform gateway operator handset (+919972967530).
--    b) The buyer's own phone number (self-invitation prevention).

-- 1. Add WAHA to messaging_provider enum
ALTER TYPE public.messaging_provider ADD VALUE IF NOT EXISTS 'WAHA';

-- 2. Update legacy test suppliers to dedicated mock/demo phone numbers
UPDATE public.suppliers
SET contact_phone = '+919845000021'
WHERE contact_phone = '+919972967530' AND business_name = 'A2Z';

UPDATE public.suppliers
SET contact_phone = '+919845000022'
WHERE contact_phone = '+919972967530' AND business_name = 'SUPPLIER-B';

-- Remove any messaging channel records mapping operator phone to a supplier
DELETE FROM public.supplier_messaging_channels
WHERE phone_e164 = '+919972967530';

-- 3. Replace dispatch_supplier_invitation_notification with operator & buyer phone protection
CREATE OR REPLACE FUNCTION private.dispatch_supplier_invitation_notification(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_inv          rfq_invitations%ROWTYPE;
  v_is_demo      boolean;
  v_supabase_url text;
  v_service_key  text;
  v_supp_phone   text;
  v_buyer_phone  text;
  v_phone_digits text;
  v_buyer_digits text;
  v_phone_e164   text;
BEGIN
  IF private.supplier_network_stub_enabled() THEN RETURN; END IF;

  SELECT * INTO v_inv FROM rfq_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT is_demo INTO v_is_demo FROM rfqs WHERE id = v_inv.rfq_id;
  IF COALESCE(v_is_demo, false) THEN RETURN; END IF;

  -- Fetch supplier contact phone
  SELECT contact_phone INTO v_supp_phone
  FROM suppliers
  WHERE id = v_inv.supplier_id;

  -- Ensure the supplier has a verified channel in supplier_messaging_channels
  IF NOT EXISTS (
    SELECT 1 FROM supplier_messaging_channels
    WHERE supplier_id = v_inv.supplier_id AND status = 'VERIFIED'
  ) THEN
    IF v_supp_phone IS NOT NULL AND btrim(v_supp_phone) <> '' THEN
      v_phone_digits := regexp_replace(v_supp_phone, '[^0-9]', '', 'g');
      IF length(v_phone_digits) = 10 THEN
        v_phone_e164 := '+91' || v_phone_digits;
      ELSIF length(v_phone_digits) = 12 AND v_phone_digits LIKE '91%' THEN
        v_phone_e164 := '+' || v_phone_digits;
      ELSIF length(v_phone_digits) >= 10 THEN
        v_phone_e164 := '+' || v_phone_digits;
      END IF;

      IF v_phone_e164 IS NOT NULL THEN
        INSERT INTO supplier_messaging_channels (
          supplier_id, channel, phone_e164, status, verified_at
        ) VALUES (
          v_inv.supplier_id, 'WHATSAPP', v_phone_e164, 'VERIFIED', now()
        )
        ON CONFLICT (supplier_id, channel) DO UPDATE
          SET phone_e164 = EXCLUDED.phone_e164,
              status = 'VERIFIED',
              verified_at = now();
      ELSE
        RETURN;
      END IF;
    ELSE
      RETURN;
    END IF;
  ELSE
    SELECT phone_e164 INTO v_phone_e164
    FROM supplier_messaging_channels
    WHERE supplier_id = v_inv.supplier_id AND status = 'VERIFIED'
    LIMIT 1;
    v_phone_digits := regexp_replace(COALESCE(v_phone_e164, ''), '[^0-9]', '', 'g');
  END IF;

  -- GUARD 1: Operator / gateway sender handset: must never receive quote invitations
  IF v_phone_digits LIKE '%9972967530' THEN
    RETURN;
  END IF;

  -- GUARD 2: Self-invitation prevention: never send RFQ quote invitation to buyer's own phone
  SELECT p.phone INTO v_buyer_phone
  FROM rfqs r
  JOIN profiles p ON p.id = r.created_by
  WHERE r.id = v_inv.rfq_id;

  IF v_buyer_phone IS NOT NULL THEN
    v_buyer_digits := regexp_replace(v_buyer_phone, '[^0-9]', '', 'g');
    IF v_buyer_digits <> '' AND v_phone_digits LIKE ('%' || v_buyer_digits) THEN
      RETURN;
    END IF;
  END IF;

  v_supabase_url := coalesce(
    nullif(current_setting('app.settings.supabase_url', true), ''),
    (SELECT value FROM private.platform_secrets WHERE key = 'supabase_url'),
    'https://qsuvtcezffomtwzwyrso.supabase.co'
  );
  v_service_key := coalesce(
    nullif(current_setting('app.settings.service_role_key', true), ''),
    (SELECT value FROM private.platform_secrets WHERE key = 'service_role_key'),
    ''
  );

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/messaging-outbound',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'rfqId', v_inv.rfq_id,
      'supplierId', v_inv.supplier_id,
      'invitationId', v_inv.id
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Resilient: Notification dispatch must never abort or roll back the core rfq_invitations transaction
    RAISE WARNING 'dispatch_supplier_invitation_notification failed for invitation %: %', p_invitation_id, SQLERRM;
END;
$$;
