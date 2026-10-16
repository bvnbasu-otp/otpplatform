-- Fail closed: enforcement cannot be activated while legal approval is missing.
-- This does not approve either agreement, set a rollout timestamp, or enable enforcement.

BEGIN;

CREATE OR REPLACE FUNCTION public.activate_legal_enforcement(p_rollout_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_cfg public.legal_enforcement_config;
  v_missing integer;
BEGIN
  IF p_rollout_at IS NULL THEN
    RAISE EXCEPTION 'A rollout timestamp is required (LEGAL_ENFORCEMENT_MISCONFIGURED)';
  END IF;
  SELECT * INTO v_cfg FROM public.legal_enforcement_config WHERE singleton FOR UPDATE;
  IF v_cfg.rollout_at IS NOT NULL THEN
    RAISE EXCEPTION 'Legal enforcement was already activated (LEGAL_CONFIG_IMMUTABLE)';
  END IF;

  SELECT count(*)::integer INTO v_missing
  FROM (VALUES ('CUSTOMER_EULA'), ('SUPPLIER_EULA')) AS required(agreement_type)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.legal_document_versions v
    WHERE v.agreement_type = required.agreement_type
      AND v.retired_at IS NULL
      AND v.legal_approval_status = 'APPROVED'
  );
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Legal enforcement cannot start until the current Buyer and Supplier agreements are approved (LEGAL_APPROVAL_REQUIRED)'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.legal_enforcement_config
  SET rollout_at = p_rollout_at, enforcement_enabled = true, activated_at = now()
  WHERE singleton;
  INSERT INTO public.audit_events (event_type, entity_type, entity_id, payload)
  VALUES ('legal.enforcement_activated', 'LEGAL_ENFORCEMENT', 'singleton',
          jsonb_build_object('rollout_at', p_rollout_at, 'grace_days', v_cfg.grace_days));
  RETURN jsonb_build_object('rollout_at', p_rollout_at, 'grace_days', v_cfg.grace_days,
                            'grace_ends_at', p_rollout_at + make_interval(days => v_cfg.grace_days));
END;
$$;

REVOKE ALL ON FUNCTION public.activate_legal_enforcement(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_legal_enforcement(timestamptz) TO service_role;

COMMIT;
