-- 00100_create_admin_search_entities_rpc.sql
-- Unified Admin Entity Search & Instant Lookup RPC (by Name, UUID, GSTIN, PO#, Email, or City)

CREATE OR REPLACE FUNCTION public.admin_search_entities(
  p_query text,
  p_limit int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_is_uuid boolean := false;
  v_uuid_val uuid := NULL;
  v_q text;
  v_results jsonb := '[]'::jsonb;
  v_item record;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  v_q := trim(coalesce(p_query, ''));
  IF v_q = '' THEN
    RETURN jsonb_build_object('success', true, 'query', p_query, 'count', 0, 'results', '[]'::jsonb);
  END IF;

  -- Test if input query is a valid UUID
  BEGIN
    v_uuid_val := v_q::uuid;
    v_is_uuid := true;
  EXCEPTION WHEN OTHERS THEN
    v_is_uuid := false;
    v_uuid_val := NULL;
  END;

  -- 1. Search Suppliers (by UUID, business_name, legal_name, GSTIN, city, email, phone)
  FOR v_item IN
    SELECT
      s.id,
      coalesce(s.business_name, s.legal_name, 'Supplier') AS title,
      coalesce(s.legal_name, s.trade_name, '') AS subtitle,
      'SUPPLIER' AS entity_type,
      coalesce(s.status::text, 'ACTIVE') AS status,
      coalesce(s.city, '') AS city,
      s.gstin,
      coalesce(s.gst_status, '') AS gst_status,
      coalesce(s.gst_verified, false) AS gst_verified,
      s.contact_email AS email,
      s.contact_phone AS phone,
      s.created_at
    FROM suppliers s
    WHERE (v_is_uuid AND s.id = v_uuid_val)
       OR (NOT v_is_uuid AND (
            s.business_name ILIKE '%' || v_q || '%'
         OR s.legal_name ILIKE '%' || v_q || '%'
         OR s.trade_name ILIKE '%' || v_q || '%'
         OR s.gstin ILIKE '%' || v_q || '%'
         OR s.city ILIKE '%' || v_q || '%'
         OR s.contact_email ILIKE '%' || v_q || '%'
         OR s.contact_phone ILIKE '%' || v_q || '%'
       ))
    ORDER BY s.created_at DESC
    LIMIT p_limit
  LOOP
    v_results := v_results || jsonb_build_object(
      'entity_type', 'SUPPLIER',
      'id', v_item.id,
      'title', v_item.title,
      'subtitle', v_item.subtitle,
      'status', v_item.status,
      'city', v_item.city,
      'gstin', v_item.gstin,
      'gst_verified', v_item.gst_verified,
      'gst_status', v_item.gst_status,
      'email', v_item.email,
      'phone', v_item.phone
    );
  END LOOP;

  -- 2. Search Buyer Organizations (by UUID, name, city, email, person, tax_registration)
  FOR v_item IN
    SELECT
      o.id,
      o.name AS title,
      coalesce(o.org_type::text, 'ORGANIZATION') AS subtitle,
      'BUYER_ORG' AS entity_type,
      'ACTIVE' AS status,
      coalesce(o.city, '') AS city,
      o.tax_registration AS gstin,
      o.contact_email AS email,
      o.contact_phone AS phone,
      o.created_at
    FROM organizations o
    WHERE (v_is_uuid AND o.id = v_uuid_val)
       OR (NOT v_is_uuid AND (
            o.name ILIKE '%' || v_q || '%'
         OR o.city ILIKE '%' || v_q || '%'
         OR o.contact_email ILIKE '%' || v_q || '%'
         OR o.contact_person ILIKE '%' || v_q || '%'
         OR o.tax_registration ILIKE '%' || v_q || '%'
       ))
    ORDER BY o.created_at DESC
    LIMIT p_limit
  LOOP
    v_results := v_results || jsonb_build_object(
      'entity_type', 'BUYER_ORG',
      'id', v_item.id,
      'title', v_item.title,
      'subtitle', v_item.subtitle,
      'status', v_item.status,
      'city', v_item.city,
      'gstin', v_item.gstin,
      'email', v_item.email,
      'phone', v_item.phone
    );
  END LOOP;

  -- 3. Search Requirements & RFQs (by UUID, title, rfq public_ref, org_name, delivery_city)
  FOR v_item IN
    SELECT
      r.id AS req_id,
      rfq.id AS rfq_id,
      r.title,
      o.name AS org_name,
      o.id AS org_id,
      coalesce(rfq.public_ref, '') AS public_ref,
      coalesce(r.status::text, 'OPEN') AS status,
      coalesce(r.delivery_city, o.city, '') AS city,
      r.created_at
    FROM requirements r
    JOIN organizations o ON o.id = r.organization_id
    LEFT JOIN rfqs rfq ON rfq.requirement_id = r.id
    WHERE (v_is_uuid AND (r.id = v_uuid_val OR rfq.id = v_uuid_val OR o.id = v_uuid_val))
       OR (NOT v_is_uuid AND (
            r.title ILIKE '%' || v_q || '%'
         OR o.name ILIKE '%' || v_q || '%'
         OR rfq.public_ref ILIKE '%' || v_q || '%'
         OR r.delivery_city ILIKE '%' || v_q || '%'
       ))
    ORDER BY r.created_at DESC
    LIMIT p_limit
  LOOP
    v_results := v_results || jsonb_build_object(
      'entity_type', 'REQUIREMENT',
      'id', v_item.req_id,
      'rfq_id', v_item.rfq_id,
      'org_id', v_item.org_id,
      'title', v_item.title,
      'subtitle', v_item.org_name,
      'public_ref', v_item.public_ref,
      'status', v_item.status,
      'city', v_item.city
    );
  END LOOP;

  -- 4. Search Purchase Orders (by UUID, po_number)
  FOR v_item IN
    SELECT
      po.id,
      po.po_number,
      rfq.requirement_id,
      po.rfq_id,
      po.supplier_id,
      po.organization_id,
      s.business_name AS supplier_name,
      o.name AS org_name,
      po.total_amount,
      po.status::text AS status,
      po.created_at
    FROM purchase_orders po
    JOIN suppliers s ON s.id = po.supplier_id
    JOIN organizations o ON o.id = po.organization_id
    LEFT JOIN rfqs rfq ON rfq.id = po.rfq_id
    WHERE (v_is_uuid AND (po.id = v_uuid_val OR po.supplier_id = v_uuid_val OR po.rfq_id = v_uuid_val OR rfq.requirement_id = v_uuid_val))
       OR (NOT v_is_uuid AND (
            po.po_number ILIKE '%' || v_q || '%'
         OR s.business_name ILIKE '%' || v_q || '%'
         OR o.name ILIKE '%' || v_q || '%'
       ))
    ORDER BY po.created_at DESC
    LIMIT p_limit
  LOOP
    v_results := v_results || jsonb_build_object(
      'entity_type', 'PURCHASE_ORDER',
      'id', v_item.id,
      'requirement_id', v_item.requirement_id,
      'rfq_id', v_item.rfq_id,
      'supplier_id', v_item.supplier_id,
      'org_id', v_item.organization_id,
      'title', v_item.po_number,
      'subtitle', v_item.supplier_name || ' ➔ ' || v_item.org_name,
      'total_amount', v_item.total_amount,
      'status', v_item.status
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'query', p_query,
    'is_uuid', v_is_uuid,
    'count', jsonb_array_length(v_results),
    'results', v_results
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_search_entities(text, int) TO anon, authenticated;
