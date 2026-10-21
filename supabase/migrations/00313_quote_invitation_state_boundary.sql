-- 00313: a declined or already-used invitation cannot submit a quote.

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_supplier_quote_atomic(
  p_rfq_id uuid,
  p_invitation_id uuid,
  p_supplier_id uuid,
  p_snapshot jsonb,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
DECLARE
  v_profile uuid := private.get_profile_id();
  v_invitation public.rfq_invitations%ROWTYPE;
  v_quote_id uuid;
  v_version_id uuid;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL
     OR NOT private.is_supplier_user_for(p_supplier_id) THEN
    RAISE EXCEPTION 'Supplier authorization is required (QUOTE-SUPPLIER-AUTH)'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_invitation
  FROM public.rfq_invitations i
  WHERE i.id = p_invitation_id
    AND i.rfq_id = p_rfq_id
    AND i.supplier_id = p_supplier_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The invitation does not belong to this RFQ and supplier (QUOTE-INVITATION-MISMATCH)'
      USING ERRCODE = '42501';
  END IF;
  IF v_invitation.status NOT IN ('INVITED', 'VIEWED') THEN
    RAISE EXCEPTION 'The invitation is not eligible for quote submission (QUOTE-INVITATION-INELIGIBLE)'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.rfqs WHERE id = p_rfq_id FOR UPDATE;
  IF private.quoting_refusal(p_rfq_id) IS NOT NULL THEN
    RAISE EXCEPTION 'This enquiry is not accepting quotes (QUOTE-WINDOW-CLOSED)'
      USING ERRCODE = '42501';
  END IF;
  IF private.quote_snapshot_price(p_snapshot) <= 0 THEN
    RAISE EXCEPTION 'A qualifying quote requires a positive comparable price (QUOTE-PRICE-INVALID)'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('otp.atomic_quote_write', 'on', true);
  INSERT INTO public.quotes (
    rfq_id, supplier_id, invitation_id, status, current_version, submitted_at
  ) VALUES (
    p_rfq_id, p_supplier_id, p_invitation_id, 'SUBMITTED', 1, now()
  )
  RETURNING id INTO v_quote_id;

  INSERT INTO public.quote_versions (quote_id, version, snapshot, notes, created_by)
  VALUES (v_quote_id, 1, p_snapshot, p_notes, v_profile)
  RETURNING id INTO v_version_id;

  UPDATE public.rfq_invitations
  SET status = 'QUOTED', viewed_at = COALESCE(viewed_at, now())
  WHERE id = p_invitation_id;

  RETURN jsonb_build_object(
    'ok', true,
    'quoteId', v_quote_id,
    'versionId', v_version_id,
    'allowanceConsumed', EXISTS (
      SELECT 1 FROM public.rfq_allowance_consumptions c WHERE c.rfq_id = p_rfq_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_supplier_quote_atomic(uuid, uuid, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_supplier_quote_atomic(uuid, uuid, uuid, jsonb, text) TO authenticated;

COMMIT;
