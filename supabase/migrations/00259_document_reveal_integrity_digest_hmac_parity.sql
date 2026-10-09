-- =============================================================================
-- 00259: Fix private.otp_deterministic_hmac parity with domain computeDeterministicHmac
--
-- Root cause: 00222 seeded h2–h4 with incorrect int32 literals (off-by drift from
-- 0x41C6CE57 / 0x85EBCA6B / 0xC2B2AE35). The avalanche also used js_imul64 on
-- bigint state instead of js_imul + js_urshift32. Together that produced wrong
-- digests and intermittent PRE_REVEAL vs POST_REVEAL verification_digest
-- collisions on distinct snapshot payloads.
--
-- Fix: correct int4 seeds + js_imul/js_urshift32 throughout (matches TS).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION private.otp_deterministic_hmac(p_message text, p_secret text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public, private
AS $$
DECLARE
  v_combined text;
  v_i integer;
  v_ch integer;
  h1 integer := (-559038737)::integer;   -- int32(0xDEADBEEF)
  h2 integer := 1103547991;              -- int32(0x41C6CE57)
  h3 integer := (-2048144789)::integer;  -- int32(0x85EBCA6B)
  h4 integer := (-1028477387)::integer;  -- int32(0xC2B2AE35)
  v_hex text;
BEGIN
  v_combined := p_secret || ':' || p_message;
  FOR v_i IN 1 .. length(v_combined) LOOP
    v_ch := ascii(substr(v_combined, v_i, 1));
    h1 := private.js_imul(h1 # v_ch, (-1640531535)::integer);
    h2 := private.js_imul(h2 # v_ch, 1597334677);
    h3 := private.js_imul(h3 # v_ch, (-2048144789)::integer);
    h4 := private.js_imul(h4 # v_ch, (-1028477387)::integer);
  END LOOP;

  h1 := private.js_imul(h1 # private.js_urshift32(h1, 16), (-2048144789)::integer)
      # private.js_imul(h2 # private.js_urshift32(h2, 13), (-1028477387)::integer);
  h2 := private.js_imul(h2 # private.js_urshift32(h2, 16), 1597334677)
      # private.js_imul(h3 # private.js_urshift32(h3, 13), (-1640531535)::integer);
  h3 := private.js_imul(h3 # private.js_urshift32(h3, 16), (-1028477387)::integer)
      # private.js_imul(h4 # private.js_urshift32(h4, 13), (-2048144789)::integer);
  h4 := private.js_imul(h4 # private.js_urshift32(h4, 16), (-1640531535)::integer)
      # private.js_imul(h1 # private.js_urshift32(h1, 13), 1597334677);

  v_hex := lpad(to_hex((h1::bigint & 4294967295)), 8, '0')
        || lpad(to_hex((h2::bigint & 4294967295)), 8, '0')
        || lpad(to_hex((h3::bigint & 4294967295)), 8, '0')
        || lpad(to_hex((h4::bigint & 4294967295)), 8, '0');
  RETURN v_hex || v_hex;
END;
$$;

COMMIT;
