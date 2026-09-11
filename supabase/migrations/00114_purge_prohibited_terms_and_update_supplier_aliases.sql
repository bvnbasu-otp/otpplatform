-- =============================================================================
-- Migration 00114: Purge Prohibited Terms & Standardize on Canonical Procurement Vocabulary
--
-- Core Principle: OTP Platform is an identity-protected institutional procurement
-- platform. It is NOT an auction house or bidding site.
-- The terms 'blind', 'bid', 'bidder', and 'bidding' are strictly prohibited.
-- Canonical vocabulary: 'identity-protected', 'quote', 'supplier', 'quoting'.
-- =============================================================================

-- 1. Update anonymous alias generator from 'Bidder ' to 'Supplier '
CREATE OR REPLACE FUNCTION private.assign_anonymous_label(p_rfq_id uuid, p_supplier_id uuid)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_salt  text;
  v_try   integer := 0;
  v_label text;
BEGIN
  SELECT alias_salt INTO v_salt FROM rfqs WHERE id = p_rfq_id;

  IF v_salt IS NULL THEN
    RAISE EXCEPTION 'RFQ % has no alias salt', p_rfq_id;
  END IF;

  LOOP
    -- Canonical vocabulary: 'Supplier ' followed by short cryptographic code
    v_label := 'Supplier ' || private.short_code(
      v_salt || ':' || p_supplier_id::text || ':' || v_try, 4
    );

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM rfq_invitations
      WHERE rfq_id = p_rfq_id AND anonymous_label = v_label
    );

    v_try := v_try + 1;
    IF v_try > 50 THEN
      RAISE EXCEPTION 'Could not allocate a unique supplier alias';
    END IF;
  END LOOP;

  RETURN v_label;
END;
$function$;

-- Update any historical invitation labels that started with 'Bidder ' to 'Supplier '
UPDATE rfq_invitations
SET anonymous_label = REPLACE(anonymous_label, 'Bidder ', 'Supplier ')
WHERE anonymous_label LIKE 'Bidder %';

-- Update audit events containing 'Bidder '
UPDATE audit_events
SET payload = jsonb_set(
  payload,
  '{alias}',
  to_jsonb(REPLACE(payload->>'alias', 'Bidder ', 'Supplier '))
)
WHERE payload->>'alias' LIKE 'Bidder %';

-- 2. Update public.user_roles descriptions to eliminate 'bid' / 'bids'
UPDATE public.user_roles
SET description = 'Decision and governance: compares quotes side by side, votes on the shortlist, signs off purchase orders. Does not raise enquiries.'
WHERE code = 'COMMITTEE_MEMBER';

UPDATE public.user_roles
SET description = 'Financial view: budget allocations, itemised quote breakdowns, payment schedules, approved orders. Approves money, does not source.'
WHERE code = 'FINANCE_APPROVER';

UPDATE public.user_roles
SET description = 'Commercial authority: authorises quotes, negotiates, accepts awarded orders, sees the buyer once identities are revealed.'
WHERE code = 'SUPPLIER_FOUNDER';

UPDATE public.user_roles
SET description = 'Commercial authority alongside the owner: authorises quotes, negotiates, accepts awarded orders.'
WHERE code = 'SUPPLIER_BD_HEAD';

UPDATE public.user_roles
SET description = 'Billing: raises invoices against completed work and tracks payment. Does not price quotes.'
WHERE code = 'SUPPLIER_FINANCE';

-- 3. Supplier outcome notification & audit function (replacing notify_bidders_of_outcome)
CREATE OR REPLACE FUNCTION private.notify_suppliers_of_outcome(p_rfq_id uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_ref   text;
  v_count integer := 0;
BEGIN
  SELECT public_ref INTO v_ref FROM rfqs WHERE id = p_rfq_id;

  INSERT INTO notifications (profile_id, channel, event_type, payload)
  SELECT
    su.profile_id,
    'IN_APP',
    CASE WHEN q.status = 'SELECTED' THEN 'rfq.awarded_to_you' ELSE 'rfq.not_selected' END,
    jsonb_build_object(
      'rfqId', p_rfq_id,
      'publicRef', v_ref,
      'alias', ri.anonymous_label,
      'outcome', CASE WHEN q.status = 'SELECTED' THEN 'WON' ELSE 'NOT_SELECTED' END
    )
  FROM rfq_invitations ri
  JOIN quotes q          ON q.invitation_id = ri.id
  JOIN supplier_users su ON su.supplier_id = ri.supplier_id
  WHERE ri.rfq_id = p_rfq_id
    AND q.status IN ('SELECTED', 'NOT_SELECTED');

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  )
  SELECT
    'rfq.suppliers_closed_out',
    private.get_profile_id(),
    r.organization_id,
    'rfq',
    p_rfq_id::text,
    jsonb_build_object(
      'publicRef', v_ref,
      'notified', v_count,
      'selected', (SELECT jsonb_agg(ri.anonymous_label)
                   FROM rfq_invitations ri JOIN quotes q ON q.invitation_id = ri.id
                   WHERE ri.rfq_id = p_rfq_id AND q.status = 'SELECTED'),
      'notSelected', (SELECT jsonb_agg(ri.anonymous_label)
                      FROM rfq_invitations ri JOIN quotes q ON q.invitation_id = ri.id
                      WHERE ri.rfq_id = p_rfq_id AND q.status = 'NOT_SELECTED')
    )
  FROM rfqs r WHERE r.id = p_rfq_id;

  RETURN v_count;
END;
$function$;

-- Keep backward-compatible signature forwarding to new function
CREATE OR REPLACE FUNCTION private.notify_bidders_of_outcome(p_rfq_id uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  RETURN private.notify_suppliers_of_outcome(p_rfq_id);
END;
$function$;

-- 4. Alias view my_quote_outcome for my_bid_outcome
CREATE OR REPLACE VIEW public.my_quote_outcome AS
SELECT * FROM public.my_bid_outcome;

GRANT SELECT ON public.my_quote_outcome TO authenticated;
