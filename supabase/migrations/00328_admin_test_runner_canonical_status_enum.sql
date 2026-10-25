-- 00328: correct UNIT-001's canonical enum names in already-migrated databases.
-- 00261's source is corrected for fresh replays; this forward migration repairs
-- databases where the previous function body is already installed.

DO $migration$
DECLARE
  v_definition text;
  v_new_names text := 'AND t.typname IN (''rfq_status'', ''requirement_status'')';
BEGIN
  v_definition := pg_get_functiondef(
    'public.admin_run_test_case(text,text)'::regprocedure
  );

  IF position('rfq_phase' IN v_definition) > 0 THEN
    v_definition := replace(v_definition, 'rfq_phase', 'rfq_status');
    EXECUTE v_definition;
  ELSIF strpos(v_definition, v_new_names) = 0 THEN
    RAISE EXCEPTION 'admin_run_test_case UNIT-001 does not match a known enum-check definition';
  END IF;

  IF position('rfq_phase' IN pg_get_functiondef(
    'public.admin_run_test_case(text,text)'::regprocedure
  )) > 0 THEN
    RAISE EXCEPTION 'admin_run_test_case still references the nonexistent rfq_phase enum';
  END IF;
END
$migration$;
