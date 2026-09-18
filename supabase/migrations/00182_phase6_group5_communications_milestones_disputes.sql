-- =============================================================================
-- Migration 00182: Phase 6 Group 5 — Omnichannel Procurement Communications,
-- Automated Supplier Engagement & Milestone Execution Controls
--
-- Features:
--   1. Omnichannel Communications & Identity Redaction:
--      - public.notification_templates: Allow-listed templates, versioning, category & lifecycle stages.
--      - public.notification_preferences: User/org channel preferences (WhatsApp, SMS, Email, In-App), opt-outs, quiet hours.
--      - public.notification_dispatch_queue: Multi-channel dispatch queue, idempotency, backoff retries, dead-letter queue, masking status.
--   2. Progressive Milestone Inspection & Quality Sign-Off:
--      - public.work_order_inspections: Inspection records, scoring, digital signoff hash, rework tracking, invoice eligibility.
--      - public.work_order_inspection_items: Itemized checklist (materials, completion, safety, quality, spec), evidence attachments & hashes.
--   3. Dispute Resolution & Exception Escalation:
--      - public.disputes: Structured dispute records covering PO, WO, milestone, invoice, payment, settlement, delivery with SLA timers.
--      - public.dispute_evidence: Immutable cryptographic evidence attachments (mime/size validated, SHA-256 integrity).
--      - public.dispute_events: Append-only immutable dispute audit trail & multi-level escalation events.
--   4. Atomic RPCs:
--      - public.dispatch_notification_event_atomic(...)
--      - public.update_notification_preferences_atomic(...)
--      - public.submit_milestone_inspection_atomic(...)
--      - public.approve_milestone_inspection_atomic(...)
--      - public.reject_milestone_inspection_atomic(...)
--      - public.open_dispute_atomic(...)
--      - public.escalate_dispute_atomic(...)
--      - public.resolve_dispute_atomic(...)
--   5. Multi-Tenant RLS & Immutability Triggers.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Create public.notification_templates Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code               text NOT NULL UNIQUE,
  version                     integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  channel                     text NOT NULL CHECK (channel IN ('WHATSAPP', 'SMS', 'EMAIL', 'IN_APP')),
  category                    text NOT NULL CHECK (category IN (
                                'RFQ_INVITATION', 'QUOTE_SUBMITTED', 'AWARD_DECISION',
                                'WORK_ORDER_ISSUED', 'MILESTONE_SUBMITTED', 'INSPECTION_COMPLETED',
                                'DISPUTE_OPENED', 'DISPUTE_ESCALATED', 'DISPUTE_RESOLVED',
                                'PAYMENT_CONFIRMED', 'SYSTEM_ALERT'
                              )),
  lifecycle_stages            text[] NOT NULL DEFAULT '{}',
  subject_template            text,
  body_template               text NOT NULL,
  variables_schema            jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active                   boolean NOT NULL DEFAULT true,
  requires_identity_redaction boolean NOT NULL DEFAULT true,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_templates_code ON public.notification_templates(template_code);
CREATE INDEX IF NOT EXISTS idx_notif_templates_cat_chan ON public.notification_templates(category, channel);

DROP TRIGGER IF EXISTS trg_notif_templates_updated_at ON public.notification_templates;
CREATE TRIGGER trg_notif_templates_updated_at
  BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Create public.notification_preferences Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id     uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel_preferences jsonb NOT NULL DEFAULT '{"WHATSAPP": true, "SMS": true, "EMAIL": true, "IN_APP": true}'::jsonb,
  category_opt_outs   text[] NOT NULL DEFAULT '{}',
  phone_number        text,
  email               text,
  quiet_hours_start   text,
  quiet_hours_end     text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_notif_pref_user_org UNIQUE (user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_notif_pref_user ON public.notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_pref_org ON public.notification_preferences(organization_id);

DROP TRIGGER IF EXISTS trg_notif_pref_updated_at ON public.notification_preferences;
CREATE TRIGGER trg_notif_pref_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Create public.notification_dispatch_queue Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_dispatch_queue (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  recipient_user_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  recipient_address     text NOT NULL,
  channel               text NOT NULL CHECK (channel IN ('WHATSAPP', 'SMS', 'EMAIL', 'IN_APP')),
  category              text NOT NULL CHECK (category IN (
                          'RFQ_INVITATION', 'QUOTE_SUBMITTED', 'AWARD_DECISION',
                          'WORK_ORDER_ISSUED', 'MILESTONE_SUBMITTED', 'INSPECTION_COMPLETED',
                          'DISPUTE_OPENED', 'DISPUTE_ESCALATED', 'DISPUTE_RESOLVED',
                          'PAYMENT_CONFIRMED', 'SYSTEM_ALERT'
                        )),
  template_code         text REFERENCES public.notification_templates(template_code) ON DELETE RESTRICT,
  template_version      integer NOT NULL DEFAULT 1,
  payload               jsonb NOT NULL DEFAULT '{}'::jsonb,
  redacted_payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_identity_masked    boolean NOT NULL DEFAULT true,
  status                text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'DEAD_LETTER', 'SUPPRESSED')),
  retry_count           integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  max_retries           integer NOT NULL DEFAULT 5 CHECK (max_retries >= 0),
  next_retry_at         timestamptz NOT NULL DEFAULT now(),
  error_log             jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider_message_id   text,
  provider_response     jsonb,
  idempotency_key       text UNIQUE,
  delivery_confirmed_at timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_queue_status_retry ON public.notification_dispatch_queue(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_notif_queue_org ON public.notification_dispatch_queue(organization_id);
CREATE INDEX IF NOT EXISTS idx_notif_queue_idempotency ON public.notification_dispatch_queue(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_notif_queue_recipient ON public.notification_dispatch_queue(recipient_user_id);

DROP TRIGGER IF EXISTS trg_notif_queue_updated_at ON public.notification_dispatch_queue;
CREATE TRIGGER trg_notif_queue_updated_at
  BEFORE UPDATE ON public.notification_dispatch_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Create public.work_order_inspections Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_order_inspections (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id           uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  milestone_id            uuid NOT NULL REFERENCES public.work_order_milestones(id) ON DELETE CASCADE,
  organization_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  inspector_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  inspection_type         text NOT NULL CHECK (inspection_type IN ('PHYSICAL_ONSITE', 'DOCUMENT_VERIFICATION', 'REMOTE_AUDIT', 'THIRD_PARTY_QA')),
  status                  text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'REWORK_REQUESTED')),
  checklist_template_code text NOT NULL,
  overall_score           numeric(5, 2) CHECK (overall_score >= 0 AND overall_score <= 100),
  passed                  boolean NOT NULL DEFAULT false,
  digital_signoff_hash    text,
  rework_reason           text,
  rework_count            integer NOT NULL DEFAULT 0 CHECK (rework_count >= 0),
  evidence_version        integer NOT NULL DEFAULT 1 CHECK (evidence_version >= 1),
  notes                   text,
  approved_at             timestamptz,
  rejected_at             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wo_inspections_wo ON public.work_order_inspections(work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_inspections_milestone ON public.work_order_inspections(milestone_id);
CREATE INDEX IF NOT EXISTS idx_wo_inspections_org ON public.work_order_inspections(organization_id);
CREATE INDEX IF NOT EXISTS idx_wo_inspections_status ON public.work_order_inspections(status);

DROP TRIGGER IF EXISTS trg_wo_inspections_updated_at ON public.work_order_inspections;
CREATE TRIGGER trg_wo_inspections_updated_at
  BEFORE UPDATE ON public.work_order_inspections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Create public.work_order_inspection_items Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_order_inspection_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id     uuid NOT NULL REFERENCES public.work_order_inspections(id) ON DELETE CASCADE,
  item_code         text NOT NULL,
  category          text NOT NULL CHECK (category IN ('MATERIALS', 'COMPLETION', 'SAFETY', 'QUALITY', 'SPECIFICATION')),
  description       text NOT NULL,
  status            text NOT NULL CHECK (status IN ('PASSED', 'FAILED', 'WARNING', 'NOT_APPLICABLE')),
  score             numeric(5, 2) CHECK (score >= 0 AND score <= 100),
  evidence_urls     text[] NOT NULL DEFAULT '{}',
  evidence_metadata jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wo_inspection_items_inspection ON public.work_order_inspection_items(inspection_id);
CREATE INDEX IF NOT EXISTS idx_wo_inspection_items_cat ON public.work_order_inspection_items(category);

-- ---------------------------------------------------------------------------
-- 6. Create public.disputes Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.disputes (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_number                text NOT NULL UNIQUE,
  organization_id               uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  counterparty_organization_id  uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  entity_type                   text NOT NULL CHECK (entity_type IN ('PURCHASE_ORDER', 'WORK_ORDER', 'MILESTONE', 'INVOICE', 'PAYMENT', 'SETTLEMENT', 'DELIVERY')),
  entity_id                     uuid NOT NULL,
  category                      text NOT NULL CHECK (category IN (
                                  'QUALITY_DEFICIENCY', 'DELIVERY_DELAY', 'NON_PERFORMANCE',
                                  'SPEC_DEVIATION', 'BILLING_DISCREPANCY', 'MILESTONE_REJECTION',
                                  'PAYMENT_SHORTAGE', 'UNAUTHORIZED_ALTERATION'
                                )),
  severity                      text NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status                        text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED', 'CLOSED', 'WITHDRAWN')),
  escalation_level              integer NOT NULL DEFAULT 1 CHECK (escalation_level >= 1 AND escalation_level <= 4),
  disputed_amount               numeric(14, 2) NOT NULL DEFAULT 0.00 CHECK (disputed_amount >= 0),
  currency                      text NOT NULL DEFAULT 'INR',
  title                         text NOT NULL,
  description                   text NOT NULL,
  sla_deadline                  timestamptz NOT NULL,
  opened_by                     uuid NOT NULL REFERENCES public.profiles(id),
  assigned_to                   uuid REFERENCES public.profiles(id),
  resolved_by                   uuid REFERENCES public.profiles(id),
  resolution_summary            text,
  resolution_category           text CHECK (resolution_category IN (
                                  'NO_ACTION_REQUIRED', 'REWORK_AGREED', 'PRICE_ADJUSTMENT_MUTUAL',
                                  'CHANGE_ORDER_ISSUED', 'TERMINATION_SETTLED', 'CLAIM_REJECTED'
                                )),
  resolved_at                   timestamptz,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disputes_org ON public.disputes(organization_id);
CREATE INDEX IF NOT EXISTS idx_disputes_counterparty ON public.disputes(counterparty_organization_id);
CREATE INDEX IF NOT EXISTS idx_disputes_entity ON public.disputes(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON public.disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_sla ON public.disputes(sla_deadline);

DROP TRIGGER IF EXISTS trg_disputes_updated_at ON public.disputes;
CREATE TRIGGER trg_disputes_updated_at
  BEFORE UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. Create public.dispute_evidence Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dispute_evidence (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id      uuid NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  uploaded_by     uuid NOT NULL REFERENCES public.profiles(id),
  file_name       text NOT NULL,
  file_url        text NOT NULL,
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 25000000),
  mime_type       text NOT NULL CHECK (mime_type IN (
                    'image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                  )),
  sha256_hash     text NOT NULL,
  description     text,
  is_immutable    boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute ON public.dispute_evidence(dispute_id);

-- Prevent mutation or deletion of committed dispute evidence
CREATE OR REPLACE FUNCTION private.trg_prevent_dispute_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  RAISE EXCEPTION 'Dispute evidence attachments are strictly immutable and cannot be modified or deleted (DISP-01: IMMUTABLE_EVIDENCE).';
END;
$$;

DROP TRIGGER IF EXISTS trg_dispute_evidence_immutable ON public.dispute_evidence;
CREATE TRIGGER trg_dispute_evidence_immutable
  BEFORE UPDATE OR DELETE ON public.dispute_evidence
  FOR EACH ROW EXECUTE FUNCTION private.trg_prevent_dispute_evidence_mutation();

-- ---------------------------------------------------------------------------
-- 8. Create public.dispute_events Table (Append-Only Event Ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dispute_events (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id                uuid NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  event_type                text NOT NULL CHECK (event_type IN (
                              'OPENED', 'COMMENT_ADDED', 'EVIDENCE_ATTACHED', 'ESCALATED',
                              'ASSIGNED', 'REBUTTAL_SUBMITTED', 'STATUS_CHANGED', 'RESOLVED', 'CLOSED', 'REOPENED'
                            )),
  actor_id                  uuid NOT NULL REFERENCES public.profiles(id),
  actor_role                text NOT NULL,
  previous_status           text,
  new_status                text,
  previous_escalation_level integer,
  new_escalation_level      integer,
  notes                     text,
  payload                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispute_events_dispute ON public.dispute_events(dispute_id, created_at ASC);

-- Prevent mutation or deletion on dispute_events (append-only ledger)
CREATE OR REPLACE FUNCTION private.trg_prevent_dispute_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  RAISE EXCEPTION 'Dispute event records are strictly immutable and cannot be updated or deleted (DISP-02: IMMUTABLE_EVENT_LEDGER).';
END;
$$;

DROP TRIGGER IF EXISTS trg_dispute_events_immutable ON public.dispute_events;
CREATE TRIGGER trg_dispute_events_immutable
  BEFORE UPDATE OR DELETE ON public.dispute_events
  FOR EACH ROW EXECUTE FUNCTION private.trg_prevent_dispute_event_mutation();

-- ---------------------------------------------------------------------------
-- 9. Multi-Tenant Row-Level Security (RLS) Configuration
-- ---------------------------------------------------------------------------
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates FORCE ROW LEVEL SECURITY;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences FORCE ROW LEVEL SECURITY;

ALTER TABLE public.notification_dispatch_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_dispatch_queue FORCE ROW LEVEL SECURITY;

ALTER TABLE public.work_order_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_inspections FORCE ROW LEVEL SECURITY;

ALTER TABLE public.work_order_inspection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_inspection_items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes FORCE ROW LEVEL SECURITY;

ALTER TABLE public.dispute_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_evidence FORCE ROW LEVEL SECURITY;

ALTER TABLE public.dispute_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_events FORCE ROW LEVEL SECURITY;

-- 9.1 Templates Policies: Readable by all authenticated users, writable only by platform admin
DROP POLICY IF EXISTS notification_templates_select ON public.notification_templates;
CREATE POLICY notification_templates_select ON public.notification_templates
  FOR SELECT TO authenticated
  USING (is_active = true OR private.is_platform_admin());

DROP POLICY IF EXISTS notification_templates_mutate ON public.notification_templates;
CREATE POLICY notification_templates_mutate ON public.notification_templates
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

-- 9.2 Preferences Policies: Users can view & manage their own preferences
DROP POLICY IF EXISTS notification_preferences_select ON public.notification_preferences;
CREATE POLICY notification_preferences_select ON public.notification_preferences
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND organization_id IN (SELECT private.get_user_org_ids()))
    OR private.is_platform_admin()
  );

DROP POLICY IF EXISTS notification_preferences_mutate ON public.notification_preferences;
CREATE POLICY notification_preferences_mutate ON public.notification_preferences
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR private.is_platform_admin()
  )
  WITH CHECK (
    user_id = auth.uid()
    OR private.is_platform_admin()
  );

-- 9.3 Notification Queue Policies: User or tenant org members can see dispatched notifications
DROP POLICY IF EXISTS notification_queue_select ON public.notification_dispatch_queue;
CREATE POLICY notification_queue_select ON public.notification_dispatch_queue
  FOR SELECT TO authenticated
  USING (
    recipient_user_id = auth.uid()
    OR (organization_id IS NOT NULL AND organization_id IN (SELECT private.get_user_org_ids()))
    OR private.is_platform_admin()
  );

-- 9.4 Work Order Inspections Policies: Buyer org members, assigned inspectors, suppliers on the WO, and admins
DROP POLICY IF EXISTS wo_inspections_select ON public.work_order_inspections;
CREATE POLICY wo_inspections_select ON public.work_order_inspections
  FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT private.get_user_org_ids())
    OR inspector_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.work_orders wo
      JOIN public.purchase_orders po ON po.id = wo.purchase_order_id
      WHERE wo.id = work_order_inspections.work_order_id
        AND (
          private.can_access_rfq_as_buyer(po.rfq_id)
          OR private.is_supplier_user_for(po.supplier_id)
        )
    )
    OR private.is_platform_admin()
  );

DROP POLICY IF EXISTS wo_inspections_mutate ON public.work_order_inspections;
CREATE POLICY wo_inspections_mutate ON public.work_order_inspections
  FOR ALL TO authenticated
  USING (
    organization_id IN (SELECT private.get_user_org_ids())
    OR inspector_id = auth.uid()
    OR private.is_platform_admin()
  )
  WITH CHECK (
    organization_id IN (SELECT private.get_user_org_ids())
    OR inspector_id = auth.uid()
    OR private.is_platform_admin()
  );

-- 9.5 Work Order Inspection Items Policies
DROP POLICY IF EXISTS wo_inspection_items_select ON public.work_order_inspection_items;
CREATE POLICY wo_inspection_items_select ON public.work_order_inspection_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.work_order_inspections i
      WHERE i.id = work_order_inspection_items.inspection_id
        AND (
          i.organization_id IN (SELECT private.get_user_org_ids())
          OR i.inspector_id = auth.uid()
          OR private.is_platform_admin()
        )
    )
  );

DROP POLICY IF EXISTS wo_inspection_items_mutate ON public.work_order_inspection_items;
CREATE POLICY wo_inspection_items_mutate ON public.work_order_inspection_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.work_order_inspections i
      WHERE i.id = work_order_inspection_items.inspection_id
        AND (
          i.organization_id IN (SELECT private.get_user_org_ids())
          OR i.inspector_id = auth.uid()
          OR private.is_platform_admin()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.work_order_inspections i
      WHERE i.id = work_order_inspection_items.inspection_id
        AND (
          i.organization_id IN (SELECT private.get_user_org_ids())
          OR i.inspector_id = auth.uid()
          OR private.is_platform_admin()
        )
    )
  );

-- 9.6 Disputes Policies: Parties involved (initiator org, counterparty org) or platform admin
DROP POLICY IF EXISTS disputes_select ON public.disputes;
CREATE POLICY disputes_select ON public.disputes
  FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT private.get_user_org_ids())
    OR (counterparty_organization_id IS NOT NULL AND counterparty_organization_id IN (SELECT private.get_user_org_ids()))
    OR opened_by = auth.uid()
    OR assigned_to = auth.uid()
    OR private.is_platform_admin()
  );

DROP POLICY IF EXISTS disputes_mutate ON public.disputes;
CREATE POLICY disputes_mutate ON public.disputes
  FOR ALL TO authenticated
  USING (
    organization_id IN (SELECT private.get_user_org_ids())
    OR (counterparty_organization_id IS NOT NULL AND counterparty_organization_id IN (SELECT private.get_user_org_ids()))
    OR private.is_platform_admin()
  )
  WITH CHECK (
    organization_id IN (SELECT private.get_user_org_ids())
    OR (counterparty_organization_id IS NOT NULL AND counterparty_organization_id IN (SELECT private.get_user_org_ids()))
    OR private.is_platform_admin()
  );

-- 9.7 Dispute Evidence Policies
DROP POLICY IF EXISTS dispute_evidence_select ON public.dispute_evidence;
CREATE POLICY dispute_evidence_select ON public.dispute_evidence
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.disputes d
      WHERE d.id = dispute_evidence.dispute_id
        AND (
          d.organization_id IN (SELECT private.get_user_org_ids())
          OR (d.counterparty_organization_id IS NOT NULL AND d.counterparty_organization_id IN (SELECT private.get_user_org_ids()))
          OR d.opened_by = auth.uid()
          OR d.assigned_to = auth.uid()
          OR private.is_platform_admin()
        )
    )
  );

DROP POLICY IF EXISTS dispute_evidence_insert ON public.dispute_evidence;
CREATE POLICY dispute_evidence_insert ON public.dispute_evidence
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.disputes d
      WHERE d.id = dispute_evidence.dispute_id
        AND (
          d.organization_id IN (SELECT private.get_user_org_ids())
          OR (d.counterparty_organization_id IS NOT NULL AND d.counterparty_organization_id IN (SELECT private.get_user_org_ids()))
          OR d.opened_by = auth.uid()
          OR private.is_platform_admin()
        )
    )
  );

-- 9.8 Dispute Events Policies
DROP POLICY IF EXISTS dispute_events_select ON public.dispute_events;
CREATE POLICY dispute_events_select ON public.dispute_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.disputes d
      WHERE d.id = dispute_events.dispute_id
        AND (
          d.organization_id IN (SELECT private.get_user_org_ids())
          OR (d.counterparty_organization_id IS NOT NULL AND d.counterparty_organization_id IN (SELECT private.get_user_org_ids()))
          OR d.opened_by = auth.uid()
          OR d.assigned_to = auth.uid()
          OR private.is_platform_admin()
        )
    )
  );

DROP POLICY IF EXISTS dispute_events_insert ON public.dispute_events;
CREATE POLICY dispute_events_insert ON public.dispute_events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.disputes d
      WHERE d.id = dispute_events.dispute_id
        AND (
          d.organization_id IN (SELECT private.get_user_org_ids())
          OR (d.counterparty_organization_id IS NOT NULL AND d.counterparty_organization_id IN (SELECT private.get_user_org_ids()))
          OR d.opened_by = auth.uid()
          OR private.is_platform_admin()
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 10. Atomic RPC: dispatch_notification_event_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_notification_event_atomic(
  p_recipient_user_id     uuid,
  p_recipient_address     text,
  p_channel               text,
  p_category              text,
  p_template_code         text,
  p_payload               jsonb DEFAULT '{}'::jsonb,
  p_organization_id       uuid DEFAULT NULL,
  p_idempotency_key       text DEFAULT NULL,
  p_is_identity_masked    boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_queue_id        uuid;
  v_template        public.notification_templates%ROWTYPE;
  v_prefs           public.notification_preferences%ROWTYPE;
  v_is_opted_out    boolean := false;
  v_is_chan_enabled boolean := true;
  v_status          text := 'PENDING';
  v_redacted_payload jsonb;
BEGIN
  -- 1. Idempotency Check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, status INTO v_queue_id, v_status
    FROM public.notification_dispatch_queue
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent_replay', true,
        'queue_id', v_queue_id,
        'status', v_status
      );
    END IF;
  END IF;

  -- 2. Template Validation
  SELECT * INTO v_template
  FROM public.notification_templates
  WHERE template_code = p_template_code AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification template % not found or inactive (COMM-01: TEMPLATE_NOT_FOUND)', p_template_code;
  END IF;

  -- 3. Preference Check (Opt-Outs & Channel Settings)
  IF p_recipient_user_id IS NOT NULL THEN
    SELECT * INTO v_prefs
    FROM public.notification_preferences
    WHERE user_id = p_recipient_user_id
      AND (organization_id = p_organization_id OR organization_id IS NULL)
    ORDER BY organization_id NULLS LAST
    LIMIT 1;

    IF FOUND THEN
      IF p_category = ANY(v_prefs.category_opt_outs) THEN
        v_is_opted_out := true;
        v_status := 'SUPPRESSED';
      END IF;

      IF v_prefs.channel_preferences ? p_channel AND NOT (v_prefs.channel_preferences->>p_channel)::boolean THEN
        v_is_chan_enabled := false;
        v_status := 'SUPPRESSED';
      END IF;
    END IF;
  END IF;

  -- 4. Identity Redaction if required
  v_redacted_payload := p_payload;
  IF p_is_identity_masked AND v_template.requires_identity_redaction THEN
    -- Strip direct supplier identifying information if masked
    IF v_redacted_payload ? 'supplier_legal_name' THEN
      v_redacted_payload := v_redacted_payload - 'supplier_legal_name';
    END IF;
    IF v_redacted_payload ? 'supplier_gstin' THEN
      v_redacted_payload := v_redacted_payload - 'supplier_gstin';
    END IF;
    IF v_redacted_payload ? 'supplier_phone' THEN
      v_redacted_payload := v_redacted_payload - 'supplier_phone';
    END IF;
  END IF;

  -- 5. Insert into dispatch queue
  INSERT INTO public.notification_dispatch_queue (
    organization_id,
    recipient_user_id,
    recipient_address,
    channel,
    category,
    template_code,
    template_version,
    payload,
    redacted_payload,
    is_identity_masked,
    status,
    idempotency_key,
    next_retry_at
  ) VALUES (
    p_organization_id,
    p_recipient_user_id,
    p_recipient_address,
    p_channel,
    p_category,
    p_template_code,
    v_template.version,
    p_payload,
    v_redacted_payload,
    p_is_identity_masked,
    v_status,
    p_idempotency_key,
    now()
  )
  RETURNING id INTO v_queue_id;

  RETURN jsonb_build_object(
    'success', true,
    'queue_id', v_queue_id,
    'status', v_status,
    'is_suppressed', (v_status = 'SUPPRESSED'),
    'channel', p_channel,
    'recipient', p_recipient_address
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Atomic RPC: update_notification_preferences_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_notification_preferences_atomic(
  p_user_id             uuid,
  p_organization_id     uuid DEFAULT NULL,
  p_channel_preferences jsonb DEFAULT '{"WHATSAPP": true, "SMS": true, "EMAIL": true, "IN_APP": true}'::jsonb,
  p_category_opt_outs   text[] DEFAULT '{}',
  p_phone_number        text DEFAULT NULL,
  p_email               text DEFAULT NULL,
  p_quiet_hours_start   text DEFAULT NULL,
  p_quiet_hours_end     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_pref_id uuid;
BEGIN
  -- Security check: Caller must be self or platform admin
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: Cannot modify notification preferences for other users (AUTH-01: FORBIDDEN)';
  END IF;

  INSERT INTO public.notification_preferences (
    user_id,
    organization_id,
    channel_preferences,
    category_opt_outs,
    phone_number,
    email,
    quiet_hours_start,
    quiet_hours_end
  ) VALUES (
    p_user_id,
    p_organization_id,
    p_channel_preferences,
    p_category_opt_outs,
    p_phone_number,
    p_email,
    p_quiet_hours_start,
    p_quiet_hours_end
  )
  ON CONFLICT (user_id, organization_id) DO UPDATE
  SET channel_preferences = EXCLUDED.channel_preferences,
      category_opt_outs   = EXCLUDED.category_opt_outs,
      phone_number        = COALESCE(EXCLUDED.phone_number, notification_preferences.phone_number),
      email               = COALESCE(EXCLUDED.email, notification_preferences.email),
      quiet_hours_start   = EXCLUDED.quiet_hours_start,
      quiet_hours_end     = EXCLUDED.quiet_hours_end,
      updated_at          = now()
  RETURNING id INTO v_pref_id;

  RETURN jsonb_build_object(
    'success', true,
    'preference_id', v_pref_id,
    'user_id', p_user_id,
    'organization_id', p_organization_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. Atomic RPC: submit_milestone_inspection_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_milestone_inspection_atomic(
  p_work_order_id           uuid,
  p_milestone_id            uuid,
  p_organization_id         uuid,
  p_inspector_id            uuid,
  p_inspection_type         text,
  p_checklist_template_code text,
  p_items                   jsonb, -- Array of items {item_code, category, description, status, score, evidence_urls, evidence_metadata, notes}
  p_notes                   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_inspection_id uuid;
  v_wo            public.work_orders%ROWTYPE;
  v_milestone     public.work_order_milestones%ROWTYPE;
  v_item          jsonb;
  v_passed_count  integer := 0;
  v_total_count   integer := 0;
  v_overall_score numeric(5, 2) := 0.00;
  v_passed        boolean := true;
  v_score_sum     numeric(10, 2) := 0.00;
BEGIN
  -- 1. Validate Work Order & Milestone existence
  SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work order % not found (INSP-01: WO_NOT_FOUND)', p_work_order_id;
  END IF;

  SELECT * INTO v_milestone FROM public.work_order_milestones WHERE id = p_milestone_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Milestone % not found on work order (INSP-02: MILESTONE_NOT_FOUND)', p_milestone_id;
  END IF;

  -- 2. Validate Items & calculate score
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Inspection must include at least one checklist item (INSP-03: EMPTY_CHECKLIST)';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_total_count := v_total_count + 1;
    IF (v_item->>'status') = 'PASSED' THEN
      v_passed_count := v_passed_count + 1;
    ELSIF (v_item->>'status') = 'FAILED' THEN
      v_passed := false;
    END IF;

    IF v_item ? 'score' AND (v_item->>'score') IS NOT NULL THEN
      v_score_sum := v_score_sum + (v_item->>'score')::numeric;
    END IF;
  END LOOP;

  IF v_total_count > 0 THEN
    v_overall_score := round(v_score_sum / v_total_count, 2);
  END IF;

  -- 3. Create Inspection Header
  INSERT INTO public.work_order_inspections (
    work_order_id,
    milestone_id,
    organization_id,
    inspector_id,
    inspection_type,
    status,
    checklist_template_code,
    overall_score,
    passed,
    notes
  ) VALUES (
    p_work_order_id,
    p_milestone_id,
    p_organization_id,
    p_inspector_id,
    p_inspection_type,
    'SUBMITTED',
    p_checklist_template_code,
    v_overall_score,
    v_passed,
    p_notes
  )
  RETURNING id INTO v_inspection_id;

  -- 4. Insert Inspection Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.work_order_inspection_items (
      inspection_id,
      item_code,
      category,
      description,
      status,
      score,
      evidence_urls,
      evidence_metadata,
      notes
    ) VALUES (
      v_inspection_id,
      v_item->>'item_code',
      v_item->>'category',
      v_item->>'description',
      v_item->>'status',
      CASE WHEN v_item ? 'score' THEN (v_item->>'score')::numeric ELSE NULL END,
      CASE WHEN v_item ? 'evidence_urls' THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'evidence_urls')) ELSE '{}'::text[] END,
      COALESCE(v_item->'evidence_metadata', '[]'::jsonb),
      v_item->>'notes'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'inspection_id', v_inspection_id,
    'overall_score', v_overall_score,
    'passed', v_passed,
    'item_count', v_total_count
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 13. Atomic RPC: approve_milestone_inspection_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_milestone_inspection_atomic(
  p_inspection_id          uuid,
  p_approver_id            uuid,
  p_digital_signoff_hash   text,
  p_notes                  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_insp        public.work_order_inspections%ROWTYPE;
  v_milestone   public.work_order_milestones%ROWTYPE;
BEGIN
  -- 1. Lock inspection
  SELECT * INTO v_insp FROM public.work_order_inspections WHERE id = p_inspection_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inspection % not found (INSP-04: NOT_FOUND)', p_inspection_id;
  END IF;

  IF v_insp.status = 'APPROVED' THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent_replay', true,
      'inspection_id', p_inspection_id,
      'status', 'APPROVED'
    );
  END IF;

  -- 2. Validate signoff hash
  IF p_digital_signoff_hash IS NULL OR length(p_digital_signoff_hash) < 16 THEN
    RAISE EXCEPTION 'A valid digital signoff hash is required for milestone approval (INSP-05: INVALID_SIGNOFF_HASH)';
  END IF;

  -- 3. Update inspection
  UPDATE public.work_order_inspections
  SET status               = 'APPROVED',
      passed               = true,
      digital_signoff_hash = p_digital_signoff_hash,
      approved_at          = now(),
      notes                = COALESCE(p_notes, notes),
      updated_at           = now()
  WHERE id = p_inspection_id;

  -- 4. Update Milestone status to VERIFIED_BY_BUYER to unlock progressive invoice eligibility
  UPDATE public.work_order_milestones
  SET status      = 'VERIFIED_BY_BUYER',
      verified_at = now(),
      updated_at  = now()
  WHERE id = v_insp.milestone_id;

  RETURN jsonb_build_object(
    'success', true,
    'inspection_id', p_inspection_id,
    'milestone_id', v_insp.milestone_id,
    'status', 'APPROVED',
    'signoff_hash', p_digital_signoff_hash,
    'invoice_eligible', true
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 14. Atomic RPC: reject_milestone_inspection_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_milestone_inspection_atomic(
  p_inspection_id uuid,
  p_rejector_id   uuid,
  p_rework_reason text,
  p_notes         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_insp public.work_order_inspections%ROWTYPE;
BEGIN
  -- 1. Lock inspection
  SELECT * INTO v_insp FROM public.work_order_inspections WHERE id = p_inspection_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inspection % not found (INSP-06: NOT_FOUND)', p_inspection_id;
  END IF;

  IF p_rework_reason IS NULL OR trim(p_rework_reason) = '' THEN
    RAISE EXCEPTION 'A clear rework reason is strictly required when rejecting milestone inspection (INSP-07: REWORK_REASON_REQUIRED)';
  END IF;

  -- 2. Update inspection
  UPDATE public.work_order_inspections
  SET status        = 'REWORK_REQUESTED',
      passed        = false,
      rework_reason = p_rework_reason,
      rework_count  = rework_count + 1,
      rejected_at   = now(),
      notes         = COALESCE(p_notes, notes),
      updated_at    = now()
  WHERE id = p_inspection_id;

  -- 3. Milestone remains blocked from progressive invoicing (status kept PENDING or reverted)
  UPDATE public.work_order_milestones
  SET status     = 'PENDING',
      updated_at = now()
  WHERE id = v_insp.milestone_id;

  RETURN jsonb_build_object(
    'success', true,
    'inspection_id', p_inspection_id,
    'milestone_id', v_insp.milestone_id,
    'status', 'REWORK_REQUESTED',
    'rework_count', v_insp.rework_count + 1,
    'rework_reason', p_rework_reason,
    'invoice_eligible', false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 15. Atomic RPC: open_dispute_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_dispute_atomic(
  p_organization_id               uuid,
  p_entity_type                   text,
  p_entity_id                     uuid,
  p_category                      text,
  p_severity                      text,
  p_title                         text,
  p_description                   text,
  p_opened_by                     uuid,
  p_counterparty_organization_id  uuid DEFAULT NULL,
  p_disputed_amount               numeric(14, 2) DEFAULT 0.00,
  p_currency                      text DEFAULT 'INR'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_dispute_id    uuid;
  v_dispute_no    text;
  v_sla_hours     integer;
  v_sla_deadline  timestamptz;
  v_seq_val       integer;
BEGIN
  -- 1. SLA Calculation based on severity
  CASE p_severity
    WHEN 'CRITICAL' THEN v_sla_hours := 24;
    WHEN 'HIGH'     THEN v_sla_hours := 48;
    WHEN 'MEDIUM'   THEN v_sla_hours := 72;
    WHEN 'LOW'      THEN v_sla_hours := 120;
    ELSE                 v_sla_hours := 72;
  END CASE;

  v_sla_deadline := now() + (v_sla_hours || ' hours')::interval;

  -- 2. Generate Human-Readable Dispute Number (e.g. DSP-2026-XXXX)
  v_dispute_no := 'DSP-' || to_char(now(), 'YYYY') || '-' || upper(substring(gen_random_uuid()::text from 1 for 8));

  -- 3. Insert Dispute
  INSERT INTO public.disputes (
    dispute_number,
    organization_id,
    counterparty_organization_id,
    entity_type,
    entity_id,
    category,
    severity,
    status,
    escalation_level,
    disputed_amount,
    currency,
    title,
    description,
    sla_deadline,
    opened_by
  ) VALUES (
    v_dispute_no,
    p_organization_id,
    p_counterparty_organization_id,
    p_entity_type,
    p_entity_id,
    p_category,
    p_severity,
    'OPEN',
    1,
    p_disputed_amount,
    p_currency,
    p_title,
    p_description,
    v_sla_deadline,
    p_opened_by
  )
  RETURNING id INTO v_dispute_id;

  -- 4. Record Immutable Initial Dispute Event
  INSERT INTO public.dispute_events (
    dispute_id,
    event_type,
    actor_id,
    actor_role,
    previous_status,
    new_status,
    previous_escalation_level,
    new_escalation_level,
    notes,
    payload
  ) VALUES (
    v_dispute_id,
    'OPENED',
    p_opened_by,
    'INITIATOR',
    NULL,
    'OPEN',
    NULL,
    1,
    'Dispute opened: ' || p_title,
    jsonb_build_object(
      'entity_type', p_entity_type,
      'entity_id', p_entity_id,
      'category', p_category,
      'severity', p_severity,
      'disputed_amount', p_disputed_amount,
      'sla_hours', v_sla_hours
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'dispute_id', v_dispute_id,
    'dispute_number', v_dispute_no,
    'status', 'OPEN',
    'escalation_level', 1,
    'sla_deadline', v_sla_deadline
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 16. Atomic RPC: escalate_dispute_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.escalate_dispute_atomic(
  p_dispute_id    uuid,
  p_actor_id      uuid,
  p_actor_role    text,
  p_reason        text,
  p_assign_to     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_disp          public.disputes%ROWTYPE;
  v_new_level     integer;
  v_new_deadline  timestamptz;
BEGIN
  SELECT * INTO v_disp FROM public.disputes WHERE id = p_dispute_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispute % not found (DISP-03: NOT_FOUND)', p_dispute_id;
  END IF;

  IF v_disp.status IN ('RESOLVED', 'CLOSED', 'WITHDRAWN') THEN
    RAISE EXCEPTION 'Cannot escalate a closed or resolved dispute (DISP-04: TERMINAL_STATE)';
  END IF;

  IF v_disp.escalation_level >= 4 THEN
    RAISE EXCEPTION 'Dispute is already at maximum escalation level 4 (DISP-05: MAX_ESCALATION)';
  END IF;

  v_new_level := v_disp.escalation_level + 1;
  -- Tighten SLA upon escalation
  v_new_deadline := now() + interval '24 hours';

  UPDATE public.disputes
  SET escalation_level = v_new_level,
      status           = 'ESCALATED',
      assigned_to      = COALESCE(p_assign_to, assigned_to),
      sla_deadline     = v_new_deadline,
      updated_at       = now()
  WHERE id = p_dispute_id;

  -- Append Immutable Event
  INSERT INTO public.dispute_events (
    dispute_id,
    event_type,
    actor_id,
    actor_role,
    previous_status,
    new_status,
    previous_escalation_level,
    new_escalation_level,
    notes,
    payload
  ) VALUES (
    p_dispute_id,
    'ESCALATED',
    p_actor_id,
    p_actor_role,
    v_disp.status,
    'ESCALATED',
    v_disp.escalation_level,
    v_new_level,
    p_reason,
    jsonb_build_object(
      'escalated_to_level', v_new_level,
      'reason', p_reason,
      'assigned_to', p_assign_to,
      'new_sla_deadline', v_new_deadline
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'dispute_id', p_dispute_id,
    'escalation_level', v_new_level,
    'status', 'ESCALATED',
    'sla_deadline', v_new_deadline
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 17. Atomic RPC: resolve_dispute_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_dispute_atomic(
  p_dispute_id            uuid,
  p_resolved_by           uuid,
  p_actor_role            text,
  p_resolution_category   text,
  p_resolution_summary    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_disp public.disputes%ROWTYPE;
BEGIN
  SELECT * INTO v_disp FROM public.disputes WHERE id = p_dispute_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispute % not found (DISP-06: NOT_FOUND)', p_dispute_id;
  END IF;

  IF v_disp.status IN ('RESOLVED', 'CLOSED') THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent_replay', true,
      'dispute_id', p_dispute_id,
      'status', v_disp.status
    );
  END IF;

  IF p_resolution_summary IS NULL OR trim(p_resolution_summary) = '' THEN
    RAISE EXCEPTION 'Resolution summary is required (DISP-07: SUMMARY_REQUIRED)';
  END IF;

  UPDATE public.disputes
  SET status              = 'RESOLVED',
      resolved_by         = p_resolved_by,
      resolution_category = p_resolution_category,
      resolution_summary  = p_resolution_summary,
      resolved_at         = now(),
      updated_at          = now()
  WHERE id = p_dispute_id;

  -- Append Immutable Event
  INSERT INTO public.dispute_events (
    dispute_id,
    event_type,
    actor_id,
    actor_role,
    previous_status,
    new_status,
    previous_escalation_level,
    new_escalation_level,
    notes,
    payload
  ) VALUES (
    p_dispute_id,
    'RESOLVED',
    p_resolved_by,
    p_actor_role,
    v_disp.status,
    'RESOLVED',
    v_disp.escalation_level,
    v_disp.escalation_level,
    'Dispute resolved: ' || p_resolution_summary,
    jsonb_build_object(
      'resolution_category', p_resolution_category,
      'resolution_summary', p_resolution_summary,
      'resolved_at', now()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'dispute_id', p_dispute_id,
    'status', 'RESOLVED',
    'resolution_category', p_resolution_category
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 18. Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.notification_templates TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.notification_dispatch_queue TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.work_order_inspections TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.work_order_inspection_items TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.disputes TO authenticated, service_role;
GRANT SELECT, INSERT ON public.dispute_evidence TO authenticated, service_role;
GRANT SELECT, INSERT ON public.dispute_events TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.dispatch_notification_event_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_notification_preferences_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_milestone_inspection_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_milestone_inspection_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_milestone_inspection_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.open_dispute_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.escalate_dispute_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_dispute_atomic TO authenticated, service_role;

COMMIT;
