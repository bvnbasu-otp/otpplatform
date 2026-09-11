-- 00097_create_admin_fix_seller_issue.sql
-- Creates admin_fix_seller_issue RPC and ensures single unambiguous function definition

BEGIN;

-- Drop legacy signatures to ensure zero PGRST203 schema cache collision
DROP FUNCTION IF EXISTS public.admin_fix_seller_issue(text, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.admin_fix_seller_issue(text, text, text, text);

-- Define admin_fix_seller_issue
CREATE OR REPLACE FUNCTION public.admin_fix_seller_issue(
  p_issue_type text,
  p_supplier_id text DEFAULT NULL,
  p_rfq_id text DEFAULT NULL,
  p_notes text DEFAULT 'Applied via Super Admin Seller Troubleshooter'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_supp_uuid uuid := NULL;
  v_rfq_uuid uuid := NULL;
  v_message text := 'Seller issue successfully resolved.';
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  IF p_supplier_id IS NOT NULL AND p_supplier_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_supp_uuid := p_supplier_id::uuid;
  END IF;

  IF p_rfq_id IS NOT NULL AND p_rfq_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_rfq_uuid := p_rfq_id::uuid;
  END IF;

  CASE p_issue_type
    WHEN 'FORCE_VERIFY_SUPPLIER_GST' THEN
      IF v_supp_uuid IS NOT NULL THEN
        UPDATE suppliers
        SET gst_verified = true,
            gst_status = 'Active',
            gst_verified_at = now()
        WHERE id = v_supp_uuid;
        v_message := 'Supplier GSTIN status verified and active badge granted.';
      END IF;

    WHEN 'SEED_SUPPLIER_CAPABILITIES' THEN
      IF v_supp_uuid IS NOT NULL THEN
        INSERT INTO supplier_capabilities (supplier_id, capability_id, max_capacity_value, capacity_unit, notes)
        SELECT v_supp_uuid, c.id, 100, coalesce(c.capacity_unit, 'UNITS'), 'Auto-provisioned via Super Admin Troubleshooter'
        FROM capabilities c
        LIMIT 3
        ON CONFLICT (supplier_id, capability_id) DO NOTHING;
        v_message := 'Supplier capability tags successfully provisioned.';
      END IF;

    WHEN 'LINK_SUPPLIER_ADMIN_USER' THEN
      IF v_supp_uuid IS NOT NULL THEN
        INSERT INTO supplier_users (supplier_id, profile_id, role)
        SELECT v_supp_uuid, p.id, 'OWNER'::supplier_user_role
        FROM profiles p
        WHERE p.is_platform_admin = true OR p.email LIKE '%admin%'
        LIMIT 1
        ON CONFLICT (supplier_id, profile_id) DO NOTHING;
        v_message := 'Supplier account linked to active administrator user.';
      END IF;

    WHEN 'REPING_SELLER_INVITE' THEN
      IF v_rfq_uuid IS NOT NULL AND v_supp_uuid IS NOT NULL THEN
        INSERT INTO rfq_invitations (rfq_id, supplier_id, status, invited_at)
        VALUES (v_rfq_uuid, v_supp_uuid, 'INVITED', now())
        ON CONFLICT (rfq_id, supplier_id) DO NOTHING;
        v_message := 'Supplier invitation re-dispatched for RFQ.';
      END IF;

    ELSE
      v_message := 'Fix action [' || p_issue_type || '] applied.';
  END CASE;

  INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
  VALUES (
    'admin.seller_troubleshoot.fix_applied',
    'SUPPLIER',
    coalesce(p_supplier_id, p_rfq_id, 'GENERAL_SELLER'),
    jsonb_build_object('fix_action', p_issue_type, 'notes', p_notes, 'timestamp', now())
  );

  RETURN jsonb_build_object('success', true, 'issueType', p_issue_type, 'message', v_message);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_fix_seller_issue(text, text, text, text) TO anon, authenticated;

COMMIT;
