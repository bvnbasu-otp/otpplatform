-- 00325: The controlled pilot has no minimum-quote waiver.
--
-- Historical rows are preserved. New waiver flags are refused, the legacy
-- RPC always fails closed and is not executable by API roles, and every new
-- award is checked against the RFQ's actual FINAL quote count regardless of
-- any historical min_quotes_waived value.

CREATE OR REPLACE FUNCTION public.waive_rfq_quote_quorum(
  p_rfq_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  RAISE EXCEPTION 'PILOT_QUORUM_WAIVER_DISABLED: minimum-quote waiver is not available'
    USING ERRCODE = '0A000';
END;
$fn$;

ALTER FUNCTION public.waive_rfq_quote_quorum(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.waive_rfq_quote_quorum(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.enforce_no_pilot_quote_quorum_waiver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF NEW.min_quotes_waived IS TRUE
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.min_quotes_waived, false) IS NOT TRUE) THEN
    RAISE EXCEPTION 'PILOT_QUORUM_WAIVER_DISABLED: min_quotes_waived cannot be enabled'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$fn$;

ALTER FUNCTION private.enforce_no_pilot_quote_quorum_waiver() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.enforce_no_pilot_quote_quorum_waiver()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_no_pilot_quote_quorum_waiver
  BEFORE INSERT OR UPDATE OF min_quotes_waived ON public.rfqs
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_no_pilot_quote_quorum_waiver();

CREATE FUNCTION private.enforce_award_quote_quorum()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_required integer;
  v_final integer;
BEGIN
  SELECT min_quotes_required
  INTO v_required
  FROM public.rfqs
  WHERE id = NEW.rfq_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PILOT_QUORUM_REQUIRED: RFQ not found'
      USING ERRCODE = '23503';
  END IF;

  SELECT count(*)::integer
  INTO v_final
  FROM public.quotes
  WHERE rfq_id = NEW.rfq_id
    AND status = 'FINAL'::public.quote_status;

  IF v_final < v_required THEN
    RAISE EXCEPTION
      'PILOT_QUORUM_REQUIRED: RFQ requires % final quotes and has %',
      v_required,
      v_final
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$fn$;

ALTER FUNCTION private.enforce_award_quote_quorum() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.enforce_award_quote_quorum()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_award_requires_quote_quorum
  BEFORE INSERT ON public.awards
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_award_quote_quorum();
