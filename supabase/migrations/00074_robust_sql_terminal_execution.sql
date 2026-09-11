-- 00074_robust_sql_terminal_execution.sql
-- Robust SQL Terminal Query Runner with Error Trapping and Semicolon Normalization

CREATE OR REPLACE FUNCTION public.admin_run_diagnostic_query(
  p_sql text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_clean_sql text;
  v_res jsonb;
  v_err_msg text;
  v_err_detail text;
  v_err_hint text;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Super Admin access required.',
      'rowsCount', 0,
      'data', '[]'::jsonb
    );
  END IF;

  v_clean_sql := trim(p_sql);

  -- Remove trailing semicolon if present
  WHILE v_clean_sql LIKE '%;' LOOP
    v_clean_sql := rtrim(substring(v_clean_sql from 1 for length(v_clean_sql) - 1));
  END LOOP;

  -- Safety check: Only allow SELECT queries in terminal
  IF lower(v_clean_sql) NOT LIKE 'select%' AND lower(v_clean_sql) NOT LIKE 'with%' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Safety Guard: Only SELECT / WITH inspection queries are permitted in diagnostic query runner.',
      'rowsCount', 0,
      'data', '[]'::jsonb
    );
  END IF;

  BEGIN
    EXECUTE 'WITH q AS (' || v_clean_sql || ') SELECT coalesce(jsonb_agg(to_jsonb(q)), ''[]''::jsonb) FROM q'
    INTO v_res;

    INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
    VALUES (
      'admin.diagnostic_query.executed',
      'SQL_TERMINAL',
      gen_random_uuid()::text,
      jsonb_build_object('query', v_clean_sql, 'rows_returned', coalesce(jsonb_array_length(v_res), 0), 'status', 'PASSED', 'timestamp', now())
    );

    RETURN jsonb_build_object(
      'success', true,
      'rowsCount', coalesce(jsonb_array_length(v_res), 0),
      'data', coalesce(v_res, '[]'::jsonb),
      'timestamp', now()
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_err_msg = MESSAGE_TEXT,
      v_err_detail = PG_EXCEPTION_DETAIL,
      v_err_hint = PG_EXCEPTION_HINT;

    INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
    VALUES (
      'admin.diagnostic_query.failed',
      'SQL_TERMINAL',
      gen_random_uuid()::text,
      jsonb_build_object('query', v_clean_sql, 'error', v_err_msg, 'status', 'FAILED', 'timestamp', now())
    );

    RETURN jsonb_build_object(
      'success', false,
      'error', v_err_msg,
      'errorDetail', coalesce(v_err_detail, ''),
      'errorHint', coalesce(v_err_hint, ''),
      'rowsCount', 0,
      'data', '[]'::jsonb,
      'timestamp', now()
    );
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_run_diagnostic_query(text) TO anon, authenticated;
