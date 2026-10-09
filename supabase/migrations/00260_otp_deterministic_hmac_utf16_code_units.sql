-- =============================================================================
-- 00260: UTF-16 code-unit parity for private.otp_deterministic_hmac
--
-- Root cause: 00222/00259 iterated PostgreSQL characters via ascii(substr(...)),
-- which uses Unicode code points (and UTF-8 first-byte semantics for non-ASCII),
-- while domain computeDeterministicHmac uses JavaScript String UTF-16 code units
-- (charCodeAt / length). ASCII-only inputs remain identical; emoji and other
-- supplementary-plane text diverged.
--
-- Fix: decode UTF-8 code points, expand supplementary characters to UTF-16
-- surrogate pairs, iterate code units (matches TS). BMP and ASCII unchanged.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION private.utf8_char_to_codepoint(p_char text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  b bytea;
  n integer;
BEGIN
  b := convert_to(p_char, 'UTF8');
  n := octet_length(b);
  IF n = 1 THEN
    RETURN get_byte(b, 0);
  ELSIF n = 2 THEN
    RETURN ((get_byte(b, 0) & 31) << 6) | (get_byte(b, 1) & 63);
  ELSIF n = 3 THEN
    RETURN ((get_byte(b, 0) & 15) << 12)
         | ((get_byte(b, 1) & 63) << 6)
         | (get_byte(b, 2) & 63);
  ELSIF n = 4 THEN
    RETURN ((get_byte(b, 0) & 7) << 18)
         | ((get_byte(b, 1) & 63) << 12)
         | ((get_byte(b, 2) & 63) << 6)
         | (get_byte(b, 3) & 63);
  END IF;
  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION private.js_string_utf16_length(p_text text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  v_len integer := 0;
  v_cp integer;
  v_ch text;
BEGIN
  IF p_text IS NULL OR p_text = '' THEN
    RETURN 0;
  END IF;
  FOR v_ch IN SELECT (m)[1] FROM regexp_matches(p_text, '.', 'g') AS m LOOP
    v_cp := private.utf8_char_to_codepoint(v_ch);
    IF v_cp > 65535 THEN
      v_len := v_len + 2;
    ELSE
      v_len := v_len + 1;
    END IF;
  END LOOP;
  RETURN v_len;
END;
$$;

CREATE OR REPLACE FUNCTION private.js_string_utf16_code_unit_at(p_text text, p_index integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  v_pos integer := 0;
  v_cp integer;
  v_ch text;
BEGIN
  IF p_text IS NULL OR p_text = '' OR p_index IS NULL OR p_index < 1 THEN
    RETURN 0;
  END IF;
  FOR v_ch IN SELECT (m)[1] FROM regexp_matches(p_text, '.', 'g') AS m LOOP
    v_cp := private.utf8_char_to_codepoint(v_ch);
    IF v_cp > 65535 THEN
      v_pos := v_pos + 1;
      IF v_pos = p_index THEN
        RETURN (55296 + ((v_cp - 65536) >> 10))::integer;
      END IF;
      v_pos := v_pos + 1;
      IF v_pos = p_index THEN
        RETURN (56320 + ((v_cp - 65536) & 1023))::integer;
      END IF;
    ELSE
      v_pos := v_pos + 1;
      IF v_pos = p_index THEN
        RETURN v_cp;
      END IF;
    END IF;
  END LOOP;
  RETURN 0;
END;
$$;

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
  v_n integer;
  v_ch integer;
  h1 integer := (-559038737)::integer;   -- int32(0xDEADBEEF)
  h2 integer := 1103547991;              -- int32(0x41C6CE57)
  h3 integer := (-2048144789)::integer;  -- int32(0x85EBCA6B)
  h4 integer := (-1028477387)::integer;  -- int32(0xC2B2AE35)
  v_hex text;
BEGIN
  v_combined := p_secret || ':' || p_message;
  v_n := private.js_string_utf16_length(v_combined);
  FOR v_i IN 1 .. v_n LOOP
    v_ch := private.js_string_utf16_code_unit_at(v_combined, v_i);
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
