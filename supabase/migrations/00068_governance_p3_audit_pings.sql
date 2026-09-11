-- 00068_governance_p3_audit_pings.sql
-- Phase 3 Governance: Automated Asynchronous Audit Deterrence & Leakage Detection Engine

CREATE TABLE IF NOT EXISTS public.audit_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scheduled_for timestamptz NOT NULL,
  ping_channel text NOT NULL DEFAULT 'WHATSAPP' CHECK (ping_channel IN ('WHATSAPP', 'EMAIL', 'IN_APP')),
  buyer_response text CHECK (buyer_response IN ('DROPPED', 'POSTPONED', 'EXECUTED_INTERNALLY', 'EXECUTED_WITH_VENDOR')),
  supplier_response text CHECK (supplier_response IN ('NO_CONTACT', 'IN_DISCUSSIONS', 'COMPLETED_OFFLINE', 'DROPPED')),
  discrepancy_detected boolean NOT NULL DEFAULT false,
  discrepancy_notes text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'RESPONDED', 'EXPIRED')),
  sent_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_pings_queue ON public.audit_pings (status, scheduled_for);

-- 2. Trigger: Auto-schedule T+14 Days Audit Ping on RFQ Cancellation
CREATE OR REPLACE FUNCTION private.auto_schedule_cancellation_audit_ping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq rfqs%ROWTYPE;
  v_supplier_id uuid;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = NEW.rfq_id;

  -- Find selected or lowest quote supplier if available
  SELECT q.supplier_id INTO v_supplier_id
  FROM quotes q
  WHERE q.rfq_id = NEW.rfq_id
  ORDER BY (q.status = 'SELECTED') DESC, q.total_cost ASC
  LIMIT 1;

  INSERT INTO public.audit_pings (
    rfq_id,
    supplier_id,
    organization_id,
    scheduled_for,
    ping_channel,
    status
  ) VALUES (
    NEW.rfq_id,
    v_supplier_id,
    v_rfq.organization_id,
    now() + interval '14 days',
    'WHATSAPP',
    'PENDING'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schedule_audit_ping ON public.rfq_cancellations;
CREATE TRIGGER trg_schedule_audit_ping
  AFTER INSERT ON public.rfq_cancellations
  FOR EACH ROW EXECUTE FUNCTION private.auto_schedule_cancellation_audit_ping();

-- 3. Record Audit Ping Response RPC
CREATE OR REPLACE FUNCTION public.record_audit_ping_response(
  p_ping_id uuid,
  p_party_side text, -- 'BUYER' or 'SUPPLIER'
  p_response_code text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ping audit_pings%ROWTYPE;
  v_discrepancy boolean := false;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_ping FROM audit_pings WHERE id = p_ping_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Audit ping not found'; END IF;

  IF upper(p_party_side) = 'BUYER' THEN
    UPDATE audit_pings
    SET
      buyer_response = p_response_code,
      responded_at = v_now,
      status = 'RESPONDED'
    WHERE id = p_ping_id;
  ELSIF upper(p_party_side) = 'SUPPLIER' THEN
    UPDATE audit_pings
    SET
      supplier_response = p_response_code,
      responded_at = v_now,
      status = 'RESPONDED'
    WHERE id = p_ping_id;
  END IF;

  SELECT * INTO v_ping FROM audit_pings WHERE id = p_ping_id;

  -- Discrepancy Detection Rule: Supplier says completed offline, buyer said dropped
  IF v_ping.supplier_response = 'COMPLETED_OFFLINE' AND v_ping.buyer_response IN ('DROPPED', 'POSTPONED') THEN
    v_discrepancy := true;
    UPDATE audit_pings
    SET
      discrepancy_detected = true,
      discrepancy_notes = 'Supplier reported job completed offline while buyer declared requirement dropped.'
    WHERE id = p_ping_id;

    INSERT INTO audit_events (
      event_type, organization_id, entity_type, entity_id, payload
    ) VALUES (
      'compliance.leakage_flagged',
      v_ping.organization_id,
      'audit_ping',
      p_ping_id::text,
      jsonb_build_object(
        'rfq_id', v_ping.rfq_id,
        'supplier_id', v_ping.supplier_id,
        'supplier_response', v_ping.supplier_response,
        'buyer_response', v_ping.buyer_response
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'ping_id', p_ping_id,
    'discrepancy_detected', v_discrepancy
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_audit_ping_response(uuid, text, text, text) TO authenticated, service_role;

-- 4. RLS
ALTER TABLE public.audit_pings ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_pings_admin_access ON public.audit_pings
  FOR ALL TO authenticated
  USING (private.is_platform_admin());

GRANT SELECT, INSERT, UPDATE ON public.audit_pings TO authenticated, service_role;

