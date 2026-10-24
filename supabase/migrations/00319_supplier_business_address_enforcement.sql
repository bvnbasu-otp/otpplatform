-- 00319: Supplier operating-address enforcement.
-- Promoted from internal_procurement_and_supplier_business_address.DEFERRED.UNVERSIONED.sql on 2026-10-24.
-- Forward-only; deployment remains a separate authorized operation.

-- ---------------------------------------------------------------------------
-- Operating address completeness (suppliers.address only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.supplier_operating_address_complete(p_address jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_address IS NOT NULL
     AND jsonb_typeof(p_address) = 'object'
     AND COALESCE(p_address->>'kind', '') IS DISTINCT FROM 'REGISTERED'
     AND length(btrim(COALESCE(p_address->>'line1', p_address->>'addressLine1', ''))) >= 3
     AND length(btrim(COALESCE(p_address->>'city', ''))) > 0
     AND length(btrim(COALESCE(p_address->>'state', ''))) > 0
     AND btrim(COALESCE(p_address->>'pincode', p_address->>'postalCode', '')) ~ '^[1-9][0-9]{5}$';
$$;

CREATE OR REPLACE FUNCTION private.supplier_has_operating_address(p_supplier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.suppliers s
    WHERE s.id = p_supplier_id
      AND private.supplier_operating_address_complete(s.address)
  );
$$;

-- ---------------------------------------------------------------------------
-- Supplier self-service write: address column only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_supplier_business_address(
  p_supplier_id uuid,
  p_line1 text,
  p_line2 text,
  p_city text,
  p_state text,
  p_pincode text,
  p_country text DEFAULT 'India'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_pin text := btrim(COALESCE(p_pincode, ''));
  v_address jsonb;
BEGIN
  IF NOT COALESCE(private.is_supplier_user_for(p_supplier_id), false) THEN
    RAISE EXCEPTION 'Access denied: you are not a user of this supplier' USING ERRCODE = '42501';
  END IF;

  IF length(btrim(COALESCE(p_line1, ''))) < 3 THEN
    RAISE EXCEPTION 'Business address line is required';
  END IF;
  IF length(btrim(COALESCE(p_city, ''))) = 0 OR length(btrim(COALESCE(p_state, ''))) = 0 THEN
    RAISE EXCEPTION 'Business city and state are required';
  END IF;
  IF v_pin !~ '^[1-9][0-9]{5}$' THEN
    RAISE EXCEPTION 'A valid 6-digit PIN code is required';
  END IF;

  v_address := jsonb_strip_nulls(jsonb_build_object(
    'kind', 'BUSINESS_OFFICE',
    'line1', btrim(p_line1),
    'line2', NULLIF(btrim(COALESCE(p_line2, '')), ''),
    'city', btrim(p_city),
    'state', btrim(p_state),
    'pincode', v_pin,
    'postalCode', v_pin,
    'country', COALESCE(NULLIF(btrim(COALESCE(p_country, '')), ''), 'India')
  ));

  -- registered_address is intentionally absent from this UPDATE.
  UPDATE public.suppliers
  SET address = v_address,
      updated_at = now()
  WHERE id = p_supplier_id;

  RETURN jsonb_build_object('ok', true, 'supplierId', p_supplier_id, 'address', v_address);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_supplier_business_address(uuid, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_supplier_business_address(uuid, text, text, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Statutory registered_address is not a self-service field.
-- Award-onboarding and other SECURITY DEFINER writers still run as the owner
-- and pass the existing current_user exemption.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.guard_supplier_trust_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR COALESCE(private.is_platform_admin(), false) THEN
    RETURN NEW;
  END IF;

  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.lifecycle_state IS DISTINCT FROM OLD.lifecycle_state
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.gst_verified IS DISTINCT FROM OLD.gst_verified
     OR NEW.gst_verified_at IS DISTINCT FROM OLD.gst_verified_at
     OR NEW.verification_notes IS DISTINCT FROM OLD.verification_notes
     OR NEW.legacy_verification_status IS DISTINCT FROM OLD.legacy_verification_status
     OR NEW.onboarding_claim_token_hash IS DISTINCT FROM OLD.onboarding_claim_token_hash
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.blocked_at IS DISTINCT FROM OLD.blocked_at
     OR NEW.blocked_reason IS DISTINCT FROM OLD.blocked_reason
     OR NEW.blocked_by IS DISTINCT FROM OLD.blocked_by
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.registered_address IS DISTINCT FROM OLD.registered_address THEN
    RAISE EXCEPTION 'Supplier verification, account status, and statutory registered address can only be changed by the platform (SUPPLIER-TRUST)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Internal operators cannot insert customer procurement rows.
-- get_profile_id() is null for migration/seed sessions, so those continue.
-- authoritative_internal_operator_access is the existing server predicate
-- (founder, platform admin, or internal_user_assignments). Customer buyers
-- without that predicate are unchanged.
-- publish_requirement's platform-admin role bypass is closed here because the
-- trigger runs with the caller's auth.uid() even inside that definer.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.reject_internal_customer_procurement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_profile uuid := private.get_profile_id();
BEGIN
  IF private.in_demo_reset()
     OR COALESCE(current_setting('otp.demo_staging', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  IF v_profile IS NULL THEN
    RETURN NEW;
  END IF;

  IF private.authoritative_internal_operator_access(v_profile) THEN
    RAISE EXCEPTION 'Internal operators cannot create customer requirements or orders'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_internal_requirement_insert ON public.requirements;
CREATE TRIGGER trg_reject_internal_requirement_insert
  BEFORE INSERT ON public.requirements
  FOR EACH ROW EXECUTE FUNCTION private.reject_internal_customer_procurement();

DROP TRIGGER IF EXISTS trg_reject_internal_rfq_insert ON public.rfqs;
CREATE TRIGGER trg_reject_internal_rfq_insert
  BEFORE INSERT ON public.rfqs
  FOR EACH ROW EXECUTE FUNCTION private.reject_internal_customer_procurement();

DROP TRIGGER IF EXISTS trg_reject_internal_po_insert ON public.purchase_orders;
CREATE TRIGGER trg_reject_internal_po_insert
  BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION private.reject_internal_customer_procurement();

-- ---------------------------------------------------------------------------
-- Quote insert requires the supplier operating address.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.reject_quote_without_business_address()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF NOT private.supplier_has_operating_address(NEW.supplier_id) THEN
    RAISE EXCEPTION 'Save the supplier business address before submitting a quote'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quote_requires_business_address ON public.quotes;
CREATE TRIGGER trg_quote_requires_business_address
  BEFORE INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION private.reject_quote_without_business_address();
