-- Persist category-scoped Google Places coverage in OTP's canonical supplier registry.
-- PIN-only onboarding coverage remains location coverage and is never assigned a category.

BEGIN;

CREATE OR REPLACE FUNCTION private.rfq_requirement_coverage_scope_key(p_req requirements)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_state text;
  v_city text;
  v_pincode text;
  v_category text;
  v_subcategory text;
BEGIN
  v_pincode := coalesce(
    nullif(btrim(p_req.delivery_pincode), ''),
    nullif(btrim(p_req.structured_specs -> 'deliveryLocation' ->> 'pincode'), ''),
    nullif(btrim(p_req.structured_specs -> 'deliveryLocation' ->> 'postalCode'), '')
  );
  IF v_pincode IS NULL OR v_pincode !~ '^[0-9]{6}$' THEN
    RETURN NULL;
  END IF;

  v_city := coalesce(
    nullif(btrim(p_req.delivery_city), ''),
    nullif(btrim(p_req.structured_specs -> 'deliveryLocation' ->> 'city'), '')
  );
  v_state := coalesce(
    nullif(btrim(p_req.delivery_state), ''),
    nullif(btrim(p_req.structured_specs -> 'deliveryLocation' ->> 'state'), ''),
    nullif(btrim(p_req.attributes ->> 'delivery_state'), '')
  );

  SELECT c.name INTO v_category
  FROM public.requirement_categories c
  WHERE c.id = p_req.category_id;

  SELECT s.name INTO v_subcategory
  FROM public.requirement_subcategories s
  WHERE s.id = p_req.subcategory_id;

  IF coalesce(btrim(v_category), '') = '' THEN
    v_category := v_subcategory;
  ELSIF coalesce(btrim(v_subcategory), '') <> '' THEN
    v_category := v_category || ' > ' || v_subcategory;
  END IF;

  IF coalesce(btrim(v_category), '') = '' OR coalesce(btrim(v_state), '') = '' OR coalesce(btrim(v_city), '') = '' THEN
    RETURN NULL;
  END IF;

  RETURN public.location_pin_coverage_build_scope_key(v_state, v_city, v_pincode, v_category);
END;
$$;

CREATE OR REPLACE FUNCTION public.location_pin_coverage_upsert_suppliers(
  p_scope_key text,
  p_state text,
  p_city text,
  p_pincode text,
  p_category text,
  p_suppliers jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_item jsonb;
  v_place_id text;
  v_supplier_id uuid;
  v_category_name text;
  v_count integer := 0;
BEGIN
  PERFORM public.location_pin_coverage_ensure_scope_row(
    p_scope_key, p_state, p_city, p_pincode, p_category
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_suppliers, '[]'::jsonb))
  LOOP
    v_place_id := nullif(btrim(coalesce(v_item->>'placeId', v_item->>'place_id', '')), '');
    IF v_place_id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.location_pin_coverage_supplier (scope_key, place_id, supplier_json, last_seen_at)
    VALUES (p_scope_key, v_place_id, v_item, now())
    ON CONFLICT (scope_key, place_id) DO UPDATE
      SET supplier_json = EXCLUDED.supplier_json,
          last_seen_at = now();

    IF upper(btrim(p_category)) <> '__PIN_ONLY_WARMING__' THEN
      v_supplier_id := private.ensure_supplier_from_pin_coverage(v_place_id, v_item, p_scope_key);
      IF v_supplier_id IS NOT NULL THEN
        UPDATE public.suppliers
        SET categories = array_remove(COALESCE(categories, ARRAY[]::text[]), p_category)
        WHERE id = v_supplier_id;

        FOREACH v_category_name IN ARRAY string_to_array(p_category, '>')
        LOOP
          v_category_name := btrim(v_category_name);
          IF v_category_name <> '' THEN
            UPDATE public.suppliers
            SET categories = CASE
              WHEN EXISTS (
                SELECT 1 FROM unnest(COALESCE(categories, ARRAY[]::text[])) existing_category
                WHERE lower(existing_category) = lower(v_category_name)
              ) THEN COALESCE(categories, ARRAY[]::text[])
              ELSE array_append(COALESCE(categories, ARRAY[]::text[]), v_category_name)
            END
            WHERE id = v_supplier_id;
          END IF;
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  SELECT count(*)::integer INTO v_count
  FROM public.location_pin_coverage_supplier
  WHERE scope_key = p_scope_key;

  IF v_count > 0 THEN
    UPDATE public.location_pin_coverage_scope
    SET supplier_count = v_count,
        updated_at = now()
    WHERE scope_key = p_scope_key;
  END IF;

  RETURN v_count;
END;
$$;

DO $$
DECLARE
  v_coverage record;
  v_supplier_id uuid;
  v_category_name text;
BEGIN
  FOR v_coverage IN
    SELECT l.place_id, l.supplier_json, l.scope_key, s.category
    FROM public.location_pin_coverage_supplier l
    JOIN public.location_pin_coverage_scope s ON s.scope_key = l.scope_key
    WHERE upper(btrim(s.category)) <> '__PIN_ONLY_WARMING__'
  LOOP
    v_supplier_id := private.ensure_supplier_from_pin_coverage(
      v_coverage.place_id, v_coverage.supplier_json, v_coverage.scope_key
    );
    IF v_supplier_id IS NOT NULL THEN
      UPDATE public.suppliers
      SET categories = array_remove(COALESCE(categories, ARRAY[]::text[]), v_coverage.category)
      WHERE id = v_supplier_id;

      FOREACH v_category_name IN ARRAY string_to_array(v_coverage.category, '>')
      LOOP
        v_category_name := btrim(v_category_name);
        IF v_category_name <> '' THEN
          UPDATE public.suppliers
          SET categories = CASE
            WHEN EXISTS (
              SELECT 1 FROM unnest(COALESCE(categories, ARRAY[]::text[])) existing_category
              WHERE lower(existing_category) = lower(v_category_name)
            ) THEN COALESCE(categories, ARRAY[]::text[])
            ELSE array_append(COALESCE(categories, ARRAY[]::text[]), v_category_name)
          END
          WHERE id = v_supplier_id;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.location_pin_coverage_complete_generation(
  p_scope_key text,
  p_lock_token uuid,
  p_status text,
  p_error_code text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.location_pin_coverage_generation
  SET status = p_status,
      completed_at = now(),
      error_code = p_error_code
  WHERE scope_key = p_scope_key
    AND lock_token = p_lock_token
    AND status = 'in_progress';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 1 AND p_status = 'completed' AND p_error_code IS NULL THEN
    UPDATE public.location_pin_coverage_scope
    SET last_successful_discovery_at = now(),
        updated_at = now()
    WHERE scope_key = p_scope_key
      AND supplier_count > 0;
  END IF;

  RETURN v_updated = 1;
END;
$$;

COMMIT;