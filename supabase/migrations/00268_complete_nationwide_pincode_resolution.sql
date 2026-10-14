-- Migration: 00268_complete_nationwide_pincode_resolution.sql
-- Description: Complete nationwide Indian postal state/UT resolution covering all 28 states and 8 Union Territories.
-- Corrects omission of prefix 79 (North East states) and refines Union Territories (Ladakh, Sikkim, A&N, Lakshadweep, Puducherry, DNH & DD).

BEGIN;

CREATE OR REPLACE FUNCTION public.infer_indian_state_from_pincode(p_pincode text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean text;
  v_p2 text;
  v_p3 text;
BEGIN
  IF p_pincode IS NULL THEN
    RETURN NULL;
  END IF;
  v_clean := btrim(p_pincode);
  IF v_clean !~ '^[0-9]{6}$' THEN
    RETURN NULL;
  END IF;

  v_p2 := substring(v_clean from 1 for 2);
  v_p3 := substring(v_clean from 1 for 3);

  -- 3-digit specific overrides for Union Territories & North East
  IF v_p3 = '194' THEN RETURN 'Ladakh';
  ELSIF v_p3 = '396' THEN RETURN 'Dadra and Nagar Haveli and Daman and Diu';
  ELSIF v_p3 = '403' THEN RETURN 'Goa';
  ELSIF v_p3 = '605' THEN RETURN 'Puducherry';
  ELSIF v_p3 = '682' THEN RETURN 'Lakshadweep';
  ELSIF v_p3 = '737' THEN RETURN 'Sikkim';
  ELSIF v_p3 = '744' THEN RETURN 'Andaman and Nicobar Islands';
  -- North East circle 79xx prefix resolution
  ELSIF v_p3 IN ('790', '791', '792') THEN RETURN 'Arunachal Pradesh';
  ELSIF v_p3 IN ('793', '794') THEN RETURN 'Meghalaya';
  ELSIF v_p3 = '795' THEN RETURN 'Manipur';
  ELSIF v_p3 = '796' THEN RETURN 'Mizoram';
  ELSIF v_p3 IN ('797', '798') THEN RETURN 'Nagaland';
  ELSIF v_p3 = '799' THEN RETURN 'Tripura';
  END IF;

  -- 2-digit circle resolution
  IF v_p2 = '11' THEN RETURN 'Delhi';
  ELSIF v_p2 IN ('12', '13') THEN RETURN 'Haryana';
  ELSIF v_p2 IN ('14', '15') THEN RETURN 'Punjab';
  ELSIF v_p2 = '16' THEN RETURN 'Chandigarh';
  ELSIF v_p2 = '17' THEN RETURN 'Himachal Pradesh';
  ELSIF v_p2 IN ('18', '19') THEN RETURN 'Jammu and Kashmir';
  ELSIF v_p2 IN ('20', '21', '22', '23', '25', '26', '27', '28') THEN RETURN 'Uttar Pradesh';
  ELSIF v_p2 = '24' THEN RETURN 'Uttarakhand';
  ELSIF v_p2 IN ('30', '31', '32', '33', '34') THEN RETURN 'Rajasthan';
  ELSIF v_p2 IN ('36', '37', '38', '39') THEN RETURN 'Gujarat';
  ELSIF v_p2 IN ('40', '41', '42', '43', '44') THEN RETURN 'Maharashtra';
  ELSIF v_p2 IN ('45', '46', '47', '48') THEN RETURN 'Madhya Pradesh';
  ELSIF v_p2 = '49' THEN RETURN 'Chhattisgarh';
  ELSIF v_p2 = '50' THEN RETURN 'Telangana';
  ELSIF v_p2 IN ('51', '52', '53') THEN RETURN 'Andhra Pradesh';
  ELSIF v_p2 IN ('56', '57', '58', '59') THEN RETURN 'Karnataka';
  ELSIF v_p2 IN ('60', '61', '62', '63', '64', '65', '66') THEN RETURN 'Tamil Nadu';
  ELSIF v_p2 IN ('67', '68', '69') THEN RETURN 'Kerala';
  ELSIF v_p2 IN ('70', '71', '72', '73', '74') THEN RETURN 'West Bengal';
  ELSIF v_p2 IN ('75', '76', '77') THEN RETURN 'Odisha';
  ELSIF v_p2 = '78' THEN RETURN 'Assam';
  ELSIF v_p2 IN ('80', '84', '85') THEN RETURN 'Bihar';
  ELSIF v_p2 IN ('81', '82', '83') THEN RETURN 'Jharkhand';
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.infer_indian_state_from_pincode(text) IS
  'Authoritative Indian Postal State & Union Territory inference covering all 28 states and 8 UTs.';

GRANT EXECUTE ON FUNCTION public.infer_indian_state_from_pincode(text) TO authenticated, service_role, anon;

COMMIT;
