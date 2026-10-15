-- Migration 00271: Fix Supplier Messaging Channels Unique Constraint & Resilient Dispatch
--
-- 1. Deduplicates and establishes UNIQUE INDEX on supplier_messaging_channels (supplier_id, channel)
--    so ON CONFLICT (supplier_id, channel) in invitation triggers resolves cleanly without error 42P10.
-- 2. Hardens private.dispatch_supplier_invitation_notification() with an EXCEPTION block to guarantee
--    that downstream notification dispatch failures never roll back core rfq_invitations transactions.

-- 1. Cleanly deduplicate any legacy multiple entries per supplier per channel
DELETE FROM public.supplier_messaging_channels
WHERE id IN (
  SELECT id
  FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY supplier_id, channel
      ORDER BY (status = 'VERIFIED') DESC, verified_at DESC NULLS LAST, created_at DESC
    ) AS rnum
    FROM public.supplier_messaging_channels
  ) t
  WHERE t.rnum > 1
);

-- 2. Create authoritative unique index on (supplier_id, channel)
CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_messaging_channels_supp_channel
  ON public.supplier_messaging_channels (supplier_id, channel);

-- 3. Replace dispatch_supplier_invitation_notification with resilient exception handling
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
  v_phone_digits text;
  v_phone_e164   text;
BEGIN
  IF private.supplier_network_stub_enabled() THEN RETURN; END IF;

  SELECT * INTO v_inv FROM rfq_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT is_demo INTO v_is_demo FROM rfqs WHERE id = v_inv.rfq_id;
  IF COALESCE(v_is_demo, false) THEN RETURN; END IF;

  -- Ensure the supplier has a verified channel in supplier_messaging_channels
  IF NOT EXISTS (
    SELECT 1 FROM supplier_messaging_channels
    WHERE supplier_id = v_inv.supplier_id AND status = 'VERIFIED'
  ) THEN
    -- Fall back to suppliers.contact_phone
    SELECT contact_phone INTO v_supp_phone
    FROM suppliers
    WHERE id = v_inv.supplier_id;

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
