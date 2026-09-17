-- =============================================================================
-- Migration 00175: Phase 5C.6 — Financial Operations, Settlement Lifecycle & Production Controls
--
-- Description:
--   1. Top Helper Functions:
--      - private.get_user_org_ids()
--      - private.get_user_supplier_ids()
--   2. Table public.erp_export_manifests:
--      - Tracks ERP and compliance export manifests with SHA-256 checksums and duplicate export guards.
--   3. Modify public.payment_allocations:
--      - Adds idempotency_key text with partial unique index.
--      - Adds allocated_by uuid REFERENCES public.profiles(id).
--   4. Update allocate_advance_payment_atomic & record_invoice_payment_atomic:
--      - Supports allocation idempotency and records allocated_by actor provenance.
--   5. Update reverse_payment_allocation_atomic:
--      - Cascades reversal to linked platform fee transactions (status -> REVERSED, voided_at -> now()).
--      - Emits PLATFORM_FEE_REVERSED audit event.
--   6. Extend get_financial_observability_summary:
--      - Computes financial_aging (unpaid_invoices_aging, stuck_advances_aging, unresolved_exceptions_aging) across 0-7d, 8-15d, 16-30d, >30d.
--   7. Table public.settlement_exception_events:
--      - Multi-stage investigation timeline tracking state transitions, notes, and actor provenance.
--   8. Atomic RPCs:
--      - public.record_erp_export_manifest_atomic(...)
--      - public.invalidate_bank_reconciliation_atomic(...)
--      - public.sync_po_settlement_reconciliations_atomic(...)
--      - public.add_settlement_exception_event_atomic(...)
--   9. Multi-Tenant RLS Policies and Invariant Triggers.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Helper Functions: Organization and Supplier Membership Sets
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.get_user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT om.organization_id
  FROM organization_members om
  WHERE om.profile_id = private.get_profile_id();
$$;

CREATE OR REPLACE FUNCTION private.get_user_supplier_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT su.supplier_id
  FROM supplier_users su
  WHERE su.profile_id = private.get_profile_id();
$$;

GRANT EXECUTE ON FUNCTION private.get_user_org_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_user_supplier_ids() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Create public.erp_export_manifests Table (GAP-5C6-01)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.erp_export_manifests (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  export_type                 text NOT NULL CHECK (
    export_type IN (
      'TALLY_PAYMENT_VOUCHER',
      'ZOHO_PAYMENT_RECEIPT',
      'FINANCIAL_AUDIT_PACK_CSV',
      'FINANCIAL_AUDIT_PACK_JSON'
    )
  ),
  batch_reference             text NOT NULL,
  export_version              integer NOT NULL DEFAULT 1 CHECK (export_version > 0),
  purchase_order_id           uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  payment_id                  uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  record_count                integer NOT NULL CHECK (record_count >= 0),
  total_amount                numeric(14, 2) NOT NULL CHECK (total_amount >= 0),
  payload_checksum_sha256     text NOT NULL,
  exported_by                 uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  exported_at                 timestamptz NOT NULL DEFAULT now(),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_erp_manifests_version UNIQUE (organization_id, batch_reference, export_version)
);

CREATE INDEX IF NOT EXISTS idx_erp_manifests_org ON public.erp_export_manifests(organization_id);
CREATE INDEX IF NOT EXISTS idx_erp_manifests_batch ON public.erp_export_manifests(batch_reference);
CREATE INDEX IF NOT EXISTS idx_erp_manifests_po ON public.erp_export_manifests(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_erp_manifests_type ON public.erp_export_manifests(export_type);

-- Enable RLS
ALTER TABLE public.erp_export_manifests ENABLE ROW LEVEL SECURITY;

-- SELECT Policy: Tenant members & admins can view manifests
DROP POLICY IF EXISTS erp_export_manifests_select ON public.erp_export_manifests;
CREATE POLICY erp_export_manifests_select ON public.erp_export_manifests
  FOR SELECT
  USING (
    private.is_platform_admin()
    OR organization_id IN (SELECT private.get_user_org_ids())
  );

-- MUTATE Policy: Buyer OWNER / MANAGER or Platform Admin can create manifests
DROP POLICY IF EXISTS erp_export_manifests_mutate ON public.erp_export_manifests;
CREATE POLICY erp_export_manifests_mutate ON public.erp_export_manifests
  FOR ALL
  USING (
    private.is_platform_admin()
    OR private.get_org_role(organization_id) IN ('OWNER', 'MANAGER')
  )
  WITH CHECK (
    private.is_platform_admin()
    OR private.get_org_role(organization_id) IN ('OWNER', 'MANAGER')
  );

-- ---------------------------------------------------------------------------
-- 2. Modify public.payment_allocations Table (GAP-5C6-02 & GAP-5C6-07)
-- ---------------------------------------------------------------------------
ALTER TABLE public.payment_allocations
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS allocated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_allocations_idempotency
  ON public.payment_allocations (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_allocations_allocated_by
  ON public.payment_allocations (allocated_by);

-- ---------------------------------------------------------------------------
-- 3. Create public.settlement_exception_events Table (GAP-5C6-05)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlement_exception_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_id    uuid NOT NULL REFERENCES public.settlement_exceptions(id) ON DELETE CASCADE,
  event_type      text NOT NULL CHECK (
    event_type IN ('CREATED', 'ASSIGNED', 'INVESTIGATION_NOTE', 'STATUS_CHANGE', 'RESOLVED', 'REOPENED')
  ),
  from_status     text CHECK (from_status IS NULL OR from_status IN ('OPEN', 'INVESTIGATING', 'RESOLVED')),
  to_status       text CHECK (to_status IS NULL OR to_status IN ('OPEN', 'INVESTIGATING', 'RESOLVED')),
  notes           text,
  actor_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_exception_events_exception ON public.settlement_exception_events(exception_id);
CREATE INDEX IF NOT EXISTS idx_settlement_exception_events_created_at ON public.settlement_exception_events(created_at);

-- Enable RLS
ALTER TABLE public.settlement_exception_events ENABLE ROW LEVEL SECURITY;

-- SELECT Policy
DROP POLICY IF EXISTS settlement_exception_events_select ON public.settlement_exception_events;
CREATE POLICY settlement_exception_events_select ON public.settlement_exception_events
  FOR SELECT
  USING (
    private.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.settlement_exceptions se
      WHERE se.id = settlement_exception_events.exception_id
        AND (
          se.organization_id IN (SELECT private.get_user_org_ids())
          OR EXISTS (
            SELECT 1 FROM public.purchase_orders po
            WHERE po.id = se.purchase_order_id
              AND po.supplier_id IN (SELECT private.get_user_supplier_ids())
          )
        )
    )
  );

-- MUTATE Policy (Buyer OWNER / MANAGER only)
DROP POLICY IF EXISTS settlement_exception_events_mutate ON public.settlement_exception_events;
CREATE POLICY settlement_exception_events_mutate ON public.settlement_exception_events
  FOR ALL
  USING (
    private.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.settlement_exceptions se
      WHERE se.id = settlement_exception_events.exception_id
        AND private.get_org_role(se.organization_id) IN ('OWNER', 'MANAGER')
    )
  )
  WITH CHECK (
    private.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.settlement_exceptions se
      WHERE se.id = settlement_exception_events.exception_id
        AND private.get_org_role(se.organization_id) IN ('OWNER', 'MANAGER')
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Atomic RPC: public.record_erp_export_manifest_atomic (GAP-5C6-01)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_erp_export_manifest_atomic(
  p_organization_id uuid,
  p_export_type text,
  p_batch_reference text,
  p_record_count integer,
  p_total_amount numeric(14, 2),
  p_payload_checksum_sha256 text,
  p_purchase_order_id uuid DEFAULT NULL,
  p_payment_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_caller_role text;
  v_latest_version integer := 0;
  v_existing_manifest RECORD;
  v_is_duplicate boolean := false;
  v_new_version integer := 1;
  v_manifest_id uuid;
  v_saved_manifest RECORD;
BEGIN
  -- 1. Authorization check: Buyer OWNER or MANAGER or Platform Admin
  IF NOT v_is_admin THEN
    v_caller_role := private.get_org_role(p_organization_id);
    IF v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'Unauthorized: Only Buyer OWNER or MANAGER can record ERP export manifests (RED-16/ERP-5C6-UNAUTHORIZED)';
    END IF;
  END IF;

  -- 2. Parameter validation
  IF p_batch_reference IS NULL OR trim(p_batch_reference) = '' THEN
    RAISE EXCEPTION 'Batch reference is required (ERP-5C6-INVALID-BATCH)';
  END IF;

  IF p_payload_checksum_sha256 IS NULL OR length(trim(p_payload_checksum_sha256)) < 32 THEN
    RAISE EXCEPTION 'Valid SHA-256 payload checksum is required (ERP-5C6-INVALID-CHECKSUM)';
  END IF;

  -- 3. Check existing export history for batch reference
  SELECT * INTO v_existing_manifest
  FROM public.erp_export_manifests
  WHERE organization_id = p_organization_id
    AND export_type = p_export_type
    AND batch_reference = p_batch_reference
  ORDER BY export_version DESC
  LIMIT 1;

  IF FOUND THEN
    v_latest_version := v_existing_manifest.export_version;
    v_new_version := v_latest_version + 1;

    -- Exact payload replay detection
    IF v_existing_manifest.payload_checksum_sha256 = p_payload_checksum_sha256 THEN
      v_is_duplicate := true;
    END IF;
  END IF;

  -- 4. Insert Manifest
  INSERT INTO public.erp_export_manifests (
    organization_id,
    export_type,
    batch_reference,
    export_version,
    purchase_order_id,
    payment_id,
    record_count,
    total_amount,
    payload_checksum_sha256,
    exported_by,
    exported_at
  ) VALUES (
    p_organization_id,
    p_export_type,
    p_batch_reference,
    v_new_version,
    p_purchase_order_id,
    p_payment_id,
    p_record_count,
    p_total_amount,
    p_payload_checksum_sha256,
    v_caller_profile_id,
    now()
  ) RETURNING id INTO v_manifest_id;

  SELECT * INTO v_saved_manifest FROM public.erp_export_manifests WHERE id = v_manifest_id;

  -- 5. Record Audit Event
  INSERT INTO public.audit_events (
    action,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'ERP_EXPORT_RECORDED',
    'ERP_EXPORT_MANIFEST',
    v_manifest_id,
    jsonb_build_object(
      'organization_id', p_organization_id,
      'export_type', p_export_type,
      'batch_reference', p_batch_reference,
      'export_version', v_new_version,
      'is_duplicate', v_is_duplicate,
      'checksum', p_payload_checksum_sha256,
      'record_count', p_record_count,
      'total_amount', p_total_amount
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'manifest_id', v_manifest_id,
    'export_version', v_new_version,
    'is_duplicate', v_is_duplicate,
    'manifest', row_to_json(v_saved_manifest)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_erp_export_manifest_atomic TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Updated Atomic Advance Allocation RPC: public.allocate_advance_payment_atomic (GAP-5C6-02 & GAP-5C6-07)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.allocate_advance_payment_atomic(
  p_payment_id uuid,
  p_invoice_id uuid,
  p_amount numeric(14, 2),
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_allocated_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_pay RECORD;
  v_inv RECORD;
  v_po_id uuid;
  v_allocation_id uuid;
  v_existing_alloc RECORD;
  v_effective_actor uuid := COALESCE(v_caller_profile_id, p_allocated_by);
  v_now timestamptz := now();
  v_final_inv RECORD;
  v_final_pay RECORD;
BEGIN
  -- 1. Validate Amount
  IF p_amount IS NULL OR p_amount <= 0.00 THEN
    RAISE EXCEPTION 'Allocation amount must be strictly greater than 0 (ADV-5C2-INVALID-AMOUNT)';
  END IF;

  -- 2. Idempotency Pre-check (GAP-5C6-02)
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_alloc
    FROM public.payment_allocations
    WHERE idempotency_key = p_idempotency_key
      AND status = 'ALLOCATED'
    LIMIT 1;

    IF FOUND THEN
      SELECT * INTO v_final_inv FROM public.invoices WHERE id = v_existing_alloc.invoice_id;
      SELECT * INTO v_final_pay FROM public.payments WHERE id = v_existing_alloc.payment_id;

      RETURN jsonb_build_object(
        'ok', true,
        'idempotent_replay', true,
        'allocation_id', v_existing_alloc.id,
        'payment_id', v_existing_alloc.payment_id,
        'invoice_id', v_existing_alloc.invoice_id,
        'allocated_amount', v_existing_alloc.allocated_amount,
        'payment', jsonb_build_object(
          'id', v_final_pay.id,
          'amount', v_final_pay.amount,
          'unallocated_amount', v_final_pay.unallocated_amount,
          'status', v_final_pay.status
        ),
        'invoice', jsonb_build_object(
          'id', v_final_inv.id,
          'amount', v_final_inv.amount,
          'paid_amount', v_final_inv.paid_amount,
          'balance_due', v_final_inv.balance_due,
          'status', v_final_inv.status
        )
      );
    END IF;
  END IF;

  -- 3. Lock Payment Row Pessimistically
  SELECT id, amount, unallocated_amount, purchase_order_id, invoice_id, status
  INTO v_pay
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found (ADV-5C2-PAY-NOT-FOUND)', p_payment_id;
  END IF;

  -- 4. Lock Invoice Row Pessimistically
  SELECT id, amount, status, paid_amount, balance_due, purchase_order_id, work_order_id, supplier_id
  INTO v_inv
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found (ADV-5C2-INV-NOT-FOUND)', p_invoice_id;
  END IF;

  -- 5. Resolve and Match PO / Tenant alignment
  v_po_id := v_inv.purchase_order_id;
  IF v_po_id IS NULL AND v_inv.work_order_id IS NOT NULL THEN
    SELECT purchase_order_id INTO v_po_id FROM public.work_orders WHERE id = v_inv.work_order_id;
  END IF;

  IF v_pay.purchase_order_id IS NOT NULL AND v_po_id IS NOT NULL THEN
    IF v_pay.purchase_order_id <> v_po_id THEN
      RAISE EXCEPTION 'Payment purchase order (%) does not match invoice purchase order (%) (ADV-5C2-PO-MISMATCH)',
        v_pay.purchase_order_id, v_po_id;
    END IF;
  END IF;

  -- 6. Authorization Check: Platform Admin or Buyer Owner/Manager for PO
  IF NOT v_is_admin THEN
    IF v_po_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.purchase_orders po
        WHERE po.id = v_po_id
          AND private.get_org_role(po.organization_id) IN ('OWNER', 'MANAGER')
      ) THEN
        RAISE EXCEPTION 'Unauthorized: only buyer OWNER or MANAGER can allocate advance payments (ADV-5C2-UNAUTHORIZED)';
      END IF;
    END IF;
  END IF;

  -- 7. Validate Invoice State Eligibility
  IF v_inv.status NOT IN ('APPROVED', 'PARTIALLY_PAID') THEN
    RAISE EXCEPTION 'Invoice % is in status %, but must be APPROVED or PARTIALLY_PAID to receive advance allocation (ADV-5C2-INV-NOT-PAYABLE)',
      p_invoice_id, v_inv.status;
  END IF;

  -- 8. Validate Caps: Payment Unallocated Amount & Invoice Balance Due
  IF p_amount > v_pay.unallocated_amount THEN
    RAISE EXCEPTION 'Allocation amount (₹%) exceeds available payment unallocated balance (₹%) (ADV-5C2-PAY-OVERALLOC)',
      p_amount, v_pay.unallocated_amount;
  END IF;

  IF p_amount > v_inv.balance_due THEN
    RAISE EXCEPTION 'Allocation amount (₹%) exceeds invoice balance due (₹%) (ADV-5C2-INV-OVERALLOC)',
      p_amount, v_inv.balance_due;
  END IF;

  -- 9. Insert Payment Allocation Record (GAP-5C6-02 idempotency_key & GAP-5C6-07 allocated_by)
  BEGIN
    INSERT INTO public.payment_allocations (
      payment_id,
      invoice_id,
      allocated_amount,
      allocated_at,
      status,
      idempotency_key,
      allocated_by,
      notes
    ) VALUES (
      p_payment_id,
      p_invoice_id,
      p_amount,
      v_now,
      'ALLOCATED',
      p_idempotency_key,
      v_effective_actor,
      COALESCE(p_notes, 'Advance payment balance allocation')
    ) RETURNING id INTO v_allocation_id;
  EXCEPTION
    WHEN unique_violation THEN
      IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_existing_alloc
        FROM public.payment_allocations
        WHERE idempotency_key = p_idempotency_key;

        IF FOUND THEN
          SELECT * INTO v_final_inv FROM public.invoices WHERE id = v_existing_alloc.invoice_id;
          SELECT * INTO v_final_pay FROM public.payments WHERE id = v_existing_alloc.payment_id;

          RETURN jsonb_build_object(
            'ok', true,
            'idempotent_replay', true,
            'allocation_id', v_existing_alloc.id,
            'payment_id', v_existing_alloc.payment_id,
            'invoice_id', v_existing_alloc.invoice_id,
            'allocated_amount', v_existing_alloc.allocated_amount,
            'payment', jsonb_build_object(
              'id', v_final_pay.id,
              'amount', v_final_pay.amount,
              'unallocated_amount', v_final_pay.unallocated_amount,
              'status', v_final_pay.status
            ),
            'invoice', jsonb_build_object(
              'id', v_final_inv.id,
              'amount', v_final_inv.amount,
              'paid_amount', v_final_inv.paid_amount,
              'balance_due', v_final_inv.balance_due,
              'status', v_final_inv.status
            )
          );
        END IF;
      END IF;
      RAISE;
  END;

  -- 10. Fetch synchronized final state
  SELECT * INTO v_final_inv FROM public.invoices WHERE id = p_invoice_id;
  SELECT * INTO v_final_pay FROM public.payments WHERE id = p_payment_id;

  -- 11. Record Audit Event
  INSERT INTO public.audit_events (
    action,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'ADVANCE_PAYMENT_ALLOCATED',
    'PAYMENT_ALLOCATION',
    v_allocation_id,
    jsonb_build_object(
      'payment_id', p_payment_id,
      'invoice_id', p_invoice_id,
      'purchase_order_id', v_po_id,
      'allocated_amount', p_amount,
      'notes', p_notes,
      'idempotency_key', p_idempotency_key,
      'allocated_by', v_effective_actor
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent_replay', false,
    'allocation_id', v_allocation_id,
    'payment_id', p_payment_id,
    'invoice_id', p_invoice_id,
    'allocated_amount', p_amount,
    'payment', jsonb_build_object(
      'id', v_final_pay.id,
      'amount', v_final_pay.amount,
      'unallocated_amount', v_final_pay.unallocated_amount,
      'status', v_final_pay.status
    ),
    'invoice', jsonb_build_object(
      'id', v_final_inv.id,
      'amount', v_final_inv.amount,
      'paid_amount', v_final_inv.paid_amount,
      'balance_due', v_final_inv.balance_due,
      'status', v_final_inv.status
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Updated record_invoice_payment_atomic (GAP-5C6-07 allocated_by & idempotency)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_invoice_payment_atomic(
  p_invoice_id uuid,
  p_amount numeric(14, 2),
  p_method public.payment_method,
  p_reference text DEFAULT NULL,
  p_currency text DEFAULT 'INR',
  p_purchase_order_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_allocated_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_effective_actor uuid := COALESCE(v_caller_profile_id, p_allocated_by);
  v_inv RECORD;
  v_po_id uuid := p_purchase_order_id;
  v_cur_bal_due numeric(14, 2);
  v_now timestamptz := now();
  v_payment_id uuid;
  v_allocation_id uuid;
  v_existing_payment_id uuid;
  v_existing_alloc_id uuid;
  v_final_inv RECORD;
  v_final_pay RECORD;
BEGIN
  -- 1. Validate payment amount
  IF p_amount IS NULL OR p_amount <= 0.00 THEN
    RAISE EXCEPTION 'Payment amount must be strictly greater than 0 (PAY-5C-INVALID-AMOUNT)';
  END IF;

  -- 2. Check Idempotency (Pre-check if key provided)
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_payment_id
    FROM public.payments
    WHERE gateway_event_id = p_idempotency_key
    LIMIT 1;

    IF v_existing_payment_id IS NOT NULL THEN
      SELECT id INTO v_existing_alloc_id
      FROM public.payment_allocations
      WHERE payment_id = v_existing_payment_id AND invoice_id = p_invoice_id AND status = 'ALLOCATED'
      LIMIT 1;

      SELECT * INTO v_final_inv FROM public.invoices WHERE id = p_invoice_id;
      SELECT * INTO v_final_pay FROM public.payments WHERE id = v_existing_payment_id;

      RETURN jsonb_build_object(
        'ok', true,
        'idempotent_replay', true,
        'payment_id', v_existing_payment_id,
        'allocation_id', v_existing_alloc_id,
        'payment', jsonb_build_object(
          'id', v_final_pay.id,
          'amount', v_final_pay.amount,
          'unallocated_amount', v_final_pay.unallocated_amount,
          'status', v_final_pay.status
        ),
        'invoice', jsonb_build_object(
          'id', v_final_inv.id,
          'amount', v_final_inv.amount,
          'paid_amount', v_final_inv.paid_amount,
          'balance_due', v_final_inv.balance_due,
          'status', v_final_inv.status
        )
      );
    END IF;
  END IF;

  -- 3. Lock target invoice row pessimistically
  SELECT id, amount, status, paid_amount, balance_due, purchase_order_id, work_order_id
  INTO v_inv
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target Invoice % not found (PAY-5C-INV-NOT-FOUND)', p_invoice_id;
  END IF;

  -- 4. Validate Invoice eligibility
  IF v_inv.status NOT IN ('APPROVED', 'PARTIALLY_PAID') THEN
    RAISE EXCEPTION 'Invoice % status is %, but must be APPROVED or PARTIALLY_PAID before payment (PAY-5C-INV-NOT-PAYABLE)',
      p_invoice_id, v_inv.status;
  END IF;

  -- Resolve purchase order id
  IF v_po_id IS NULL THEN
    IF v_inv.purchase_order_id IS NOT NULL THEN
      v_po_id := v_inv.purchase_order_id;
    ELSIF v_inv.work_order_id IS NOT NULL THEN
      SELECT purchase_order_id INTO v_po_id
      FROM public.work_orders
      WHERE id = v_inv.work_order_id;
    END IF;
  END IF;

  -- 5. Validate amount does not exceed invoice balance due
  v_cur_bal_due := v_inv.balance_due;
  IF p_amount > v_cur_bal_due THEN
    RAISE EXCEPTION 'Payment amount (₹%) exceeds invoice balance due (₹%) (PAY-5C-OVERPAYMENT)',
      p_amount, v_cur_bal_due;
  END IF;

  -- 6. Authorization Check: Platform Admin or Buyer Owner/Manager
  IF NOT v_is_admin THEN
    IF v_po_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.purchase_orders po
        WHERE po.id = v_po_id
          AND private.get_org_role(po.organization_id) IN ('OWNER', 'MANAGER')
      ) THEN
        RAISE EXCEPTION 'Unauthorized: only buyer OWNER or MANAGER can record payments (PAY-5C-UNAUTHORIZED)';
      END IF;
    END IF;
  END IF;

  -- 7. Insert Payment record
  BEGIN
    INSERT INTO public.payments (
      invoice_id,
      purchase_order_id,
      amount,
      unallocated_amount,
      currency,
      method,
      status,
      reference,
      gateway_event_id,
      recorded_by,
      recorded_at
    ) VALUES (
      p_invoice_id,
      v_po_id,
      p_amount,
      0.00,
      p_currency,
      p_method,
      'RECORDED',
      p_reference,
      p_idempotency_key,
      v_effective_actor,
      v_now
    ) RETURNING id INTO v_payment_id;
  EXCEPTION
    WHEN unique_violation THEN
      IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing_payment_id
        FROM public.payments
        WHERE gateway_event_id = p_idempotency_key
        LIMIT 1;

        IF v_existing_payment_id IS NOT NULL THEN
          SELECT id INTO v_existing_alloc_id
          FROM public.payment_allocations
          WHERE payment_id = v_existing_payment_id AND invoice_id = p_invoice_id AND status = 'ALLOCATED'
          LIMIT 1;

          SELECT * INTO v_final_inv FROM public.invoices WHERE id = p_invoice_id;
          SELECT * INTO v_final_pay FROM public.payments WHERE id = v_existing_payment_id;

          RETURN jsonb_build_object(
            'ok', true,
            'idempotent_replay', true,
            'payment_id', v_existing_payment_id,
            'allocation_id', v_existing_alloc_id,
            'payment', jsonb_build_object(
              'id', v_final_pay.id,
              'amount', v_final_pay.amount,
              'unallocated_amount', v_final_pay.unallocated_amount,
              'status', v_final_pay.status
            ),
            'invoice', jsonb_build_object(
              'id', v_final_inv.id,
              'amount', v_final_inv.amount,
              'paid_amount', v_final_inv.paid_amount,
              'balance_due', v_final_inv.balance_due,
              'status', v_final_inv.status
            )
          );
        END IF;
      END IF;
      RAISE;
  END;

  -- 8. Insert Payment Allocation record (GAP-5C6-07 allocated_by)
  INSERT INTO public.payment_allocations (
    payment_id,
    invoice_id,
    allocated_amount,
    allocated_at,
    status,
    idempotency_key,
    allocated_by,
    notes
  ) VALUES (
    v_payment_id,
    p_invoice_id,
    p_amount,
    v_now,
    'ALLOCATED',
    p_idempotency_key,
    v_effective_actor,
    COALESCE(p_notes, 'Atomic invoice payment remittance')
  ) RETURNING id INTO v_allocation_id;

  -- 9. Fetch synchronized final state
  SELECT * INTO v_final_inv FROM public.invoices WHERE id = p_invoice_id;
  SELECT * INTO v_final_pay FROM public.payments WHERE id = v_payment_id;

  -- 10. Record Audit Event
  INSERT INTO public.audit_events (
    action,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'PAYMENT_RECORDED_ATOMIC',
    'PAYMENT',
    v_payment_id,
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'purchase_order_id', v_po_id,
      'amount', p_amount,
      'allocation_id', v_allocation_id,
      'method', p_method,
      'idempotency_key', p_idempotency_key,
      'allocated_by', v_effective_actor
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent_replay', false,
    'payment_id', v_payment_id,
    'allocation_id', v_allocation_id,
    'payment', jsonb_build_object(
      'id', v_final_pay.id,
      'amount', v_final_pay.amount,
      'unallocated_amount', v_final_pay.unallocated_amount,
      'status', v_final_pay.status
    ),
    'invoice', jsonb_build_object(
      'id', v_final_inv.id,
      'amount', v_final_inv.amount,
      'paid_amount', v_final_inv.paid_amount,
      'balance_due', v_final_inv.balance_due,
      'status', v_final_inv.status
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Updated reverse_payment_allocation_atomic (GAP-5C6-03 Fee Synchronization)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_payment_allocation_atomic(
  p_allocation_id uuid,
  p_reason text,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_alloc RECORD;
  v_pay RECORD;
  v_inv RECORD;
  v_po RECORD;
  v_po_id uuid;
  v_org_id uuid;
  v_new_paid numeric(14, 2);
  v_new_bal numeric(14, 2);
  v_new_status public.invoice_status;
  v_fee_tx RECORD;
  v_final_inv RECORD;
  v_final_pay RECORD;
  v_final_alloc RECORD;
BEGIN
  -- 1. Validate Input Parameters
  IF p_allocation_id IS NULL THEN
    RAISE EXCEPTION 'Allocation ID is required (REV-5C3-INVALID-ID)';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Reversal reason is required (REV-5C3-INVALID-REASON)';
  END IF;

  -- 2. Lock Allocation Row Pessimistically
  SELECT * INTO v_alloc
  FROM public.payment_allocations
  WHERE id = p_allocation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment allocation % not found (REV-5C3-NOT-FOUND)', p_allocation_id;
  END IF;

  -- Check if already reversed or voided
  IF v_alloc.status IN ('REVERSED', 'VOIDED') THEN
    RAISE EXCEPTION 'Payment allocation % is already % (REV-5C3-ALREADY-REVERSED)',
      p_allocation_id, v_alloc.status;
  END IF;

  -- 3. Lock Payment Row Pessimistically
  SELECT * INTO v_pay
  FROM public.payments
  WHERE id = v_alloc.payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated payment % not found (REV-5C3-PAY-NOT-FOUND)', v_alloc.payment_id;
  END IF;

  -- 4. Lock Invoice Row Pessimistically
  SELECT * INTO v_inv
  FROM public.invoices
  WHERE id = v_alloc.invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated invoice % not found (REV-5C3-INV-NOT-FOUND)', v_alloc.invoice_id;
  END IF;

  -- 5. Resolve PO & Organization
  v_po_id := COALESCE(v_inv.purchase_order_id, v_pay.purchase_order_id);
  IF v_po_id IS NULL AND v_inv.work_order_id IS NOT NULL THEN
    SELECT purchase_order_id INTO v_po_id FROM public.work_orders WHERE id = v_inv.work_order_id;
  END IF;

  IF v_po_id IS NOT NULL THEN
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = v_po_id FOR UPDATE;
    IF FOUND THEN
      v_org_id := v_po.organization_id;
    END IF;
  END IF;

  IF v_org_id IS NULL THEN
    SELECT po.organization_id INTO v_org_id
    FROM public.invoices inv
    JOIN public.work_orders wo ON inv.work_order_id = wo.id
    JOIN public.purchase_orders po ON wo.purchase_order_id = po.id
    WHERE inv.id = v_alloc.invoice_id;
  END IF;

  -- Authorization check (Buyer OWNER/MANAGER or Platform Admin)
  IF NOT v_is_admin THEN
    IF v_org_id IS NULL OR private.get_org_role(v_org_id) NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'Unauthorized: only buyer OWNER or MANAGER can reverse payment allocations (REV-5C3-UNAUTHORIZED)';
    END IF;
  END IF;

  -- Closed PO Guard (Cannot reverse on COMPLETED PO)
  IF v_po.id IS NOT NULL AND v_po.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'Cannot reverse payment allocation on a COMPLETED purchase order (REV-5C3-PO-CLOSED)';
  END IF;

  -- Balance conservation invariant checks
  IF v_inv.paid_amount < v_alloc.allocated_amount THEN
    RAISE EXCEPTION 'Reversal invariant violation: allocation ₹% exceeds invoice paid balance ₹% (REV-5C3-INVALID-INVOICE-PAID)',
      v_alloc.allocated_amount, v_inv.paid_amount;
  END IF;

  IF (v_pay.unallocated_amount + v_alloc.allocated_amount) > v_pay.amount THEN
    RAISE EXCEPTION 'Reversal invariant violation: resulting unallocated amount exceeds payment total (REV-5C3-INVALID-PAYMENT-UNALLOC)',
      (v_pay.unallocated_amount + v_alloc.allocated_amount), v_pay.amount;
  END IF;

  -- 6. Execute Reversal Updates
  -- Update Allocation
  UPDATE public.payment_allocations
  SET status = 'REVERSED',
      notes = CASE
        WHEN notes IS NULL OR notes = '' THEN '[REVERSED: ' || p_reason || ']'
        ELSE notes || ' [REVERSED: ' || p_reason || ']'
      END,
      updated_at = now()
  WHERE id = p_allocation_id;

  -- Update Payment unallocated_amount
  UPDATE public.payments
  SET unallocated_amount = LEAST(v_pay.amount, unallocated_amount + v_alloc.allocated_amount),
      updated_at = now()
  WHERE id = v_alloc.payment_id;

  -- Update Invoice paid_amount, balance_due, and status
  v_new_paid := GREATEST(0.00, v_inv.paid_amount - v_alloc.allocated_amount);
  v_new_bal := GREATEST(0.00, v_inv.amount - v_new_paid);
  v_new_status := CASE
    WHEN v_new_paid = 0.00 THEN 'APPROVED'::public.invoice_status
    ELSE 'PARTIALLY_PAID'::public.invoice_status
  END;

  UPDATE public.invoices
  SET paid_amount = v_new_paid,
      balance_due = v_new_bal,
      status = v_new_status,
      updated_at = now()
  WHERE id = v_alloc.invoice_id;

  -- 7. GAP-5C6-03: Locate and Reverse linked platform fee transactions atomically
  FOR v_fee_tx IN
    SELECT * FROM public.platform_fee_transactions
    WHERE payment_allocation_id = p_allocation_id
      AND status IN ('APPLIED', 'SETTLED')
    FOR UPDATE
  LOOP
    UPDATE public.platform_fee_transactions
    SET status = 'REVERSED',
        voided_at = now(),
        updated_at = now(),
        notes = COALESCE(notes, '') || ' [AUTO_REVERSED on allocation reversal ' || p_allocation_id || ']'
    WHERE id = v_fee_tx.id;

    -- Emit PLATFORM_FEE_REVERSED audit event
    INSERT INTO public.audit_events (
      action,
      entity_type,
      entity_id,
      payload,
      actor_id
    ) VALUES (
      'PLATFORM_FEE_REVERSED',
      'PLATFORM_FEE_TRANSACTION',
      v_fee_tx.id,
      jsonb_build_object(
        'payment_allocation_id', p_allocation_id,
        'fee_amount', v_fee_tx.fee_amount,
        'reason', 'Cascading reversal from allocation reversal ' || p_allocation_id || ': ' || p_reason
      ),
      v_caller_profile_id
    );
  END LOOP;

  -- 8. Record Allocation Reversal Audit Event
  INSERT INTO public.audit_events (
    action,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'PAYMENT_ALLOCATION_REVERSED',
    'PAYMENT_ALLOCATION',
    p_allocation_id,
    jsonb_build_object(
      'payment_id', v_alloc.payment_id,
      'invoice_id', v_alloc.invoice_id,
      'purchase_order_id', v_po_id,
      'reversed_amount', v_alloc.allocated_amount,
      'reason', p_reason,
      'idempotency_key', p_idempotency_key
    ),
    v_caller_profile_id
  );

  -- 9. Fetch Final Synchronized State
  SELECT * INTO v_final_inv FROM public.invoices WHERE id = v_alloc.invoice_id;
  SELECT * INTO v_final_pay FROM public.payments WHERE id = v_alloc.payment_id;
  SELECT * INTO v_final_alloc FROM public.payment_allocations WHERE id = p_allocation_id;

  RETURN jsonb_build_object(
    'ok', true,
    'allocation_id', p_allocation_id,
    'allocation', row_to_json(v_final_alloc),
    'payment', row_to_json(v_final_pay),
    'invoice', row_to_json(v_final_inv)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Atomic RPC: public.invalidate_bank_reconciliation_atomic (GAP-5C6-06)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invalidate_bank_reconciliation_atomic(
  p_reconciliation_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_caller_role text;
  v_rec RECORD;
  v_final_rec RECORD;
BEGIN
  -- 1. Validate reason
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Invalidation reason must be at least 5 characters (REC-5C6-INVALID-REASON)';
  END IF;

  -- 2. Lock Bank Reconciliation row
  SELECT * INTO v_rec
  FROM public.bank_reconciliation_records
  WHERE id = p_reconciliation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bank reconciliation record % not found (REC-5C6-NOT-FOUND)', p_reconciliation_id;
  END IF;

  -- 3. Authorization check: Buyer OWNER / MANAGER or Platform Admin
  IF NOT v_is_admin THEN
    v_caller_role := private.get_org_role(v_rec.organization_id);
    IF v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'Unauthorized: Only Buyer OWNER or MANAGER can invalidate bank reconciliations (REC-5C6-UNAUTHORIZED)';
    END IF;
  END IF;

  -- 4. Transition status to DISCREPANCY, discrepancy_type = MANUALLY_INVALIDATED
  UPDATE public.bank_reconciliation_records
  SET status = 'DISCREPANCY',
      discrepancy_type = 'MANUALLY_INVALIDATED',
      discrepancy_details = 'Reconciliation invalidated: ' || trim(p_reason),
      resolution_notes = 'Invalidated by ' || COALESCE(v_caller_profile_id::text, 'user') || ': ' || trim(p_reason),
      updated_at = now()
  WHERE id = p_reconciliation_id;

  SELECT * INTO v_final_rec FROM public.bank_reconciliation_records WHERE id = p_reconciliation_id;

  -- 5. Record Audit Event
  INSERT INTO public.audit_events (
    action,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'BANK_RECONCILIATION_INVALIDATED',
    'BANK_RECONCILIATION',
    p_reconciliation_id,
    jsonb_build_object(
      'reconciliation_id', p_reconciliation_id,
      'utr_number', v_rec.utr_number,
      'previous_status', v_rec.status,
      'reason', trim(p_reason)
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'reconciliation_id', p_reconciliation_id,
    'status', 'DISCREPANCY',
    'discrepancy_type', 'MANUALLY_INVALIDATED',
    'reconciliation', row_to_json(v_final_rec)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.invalidate_bank_reconciliation_atomic TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Atomic RPC: public.sync_po_settlement_reconciliations_atomic (GAP-5C6-08)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_po_settlement_reconciliations_atomic(
  p_po_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_caller_role text;
  v_po RECORD;
  v_inv RECORD;
  v_synced_count integer := 0;
  v_res jsonb;
BEGIN
  -- 1. Lock PO row
  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = p_po_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order % not found (SYNC-5C6-PO-NOT-FOUND)', p_po_id;
  END IF;

  -- 2. Authorization check: Buyer OWNER / MANAGER or Platform Admin
  IF NOT v_is_admin THEN
    v_caller_role := private.get_org_role(v_po.organization_id);
    IF v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'Unauthorized: Only Buyer OWNER or MANAGER can sync PO settlement reconciliations (SYNC-5C6-UNAUTHORIZED)';
    END IF;
  END IF;

  -- 3. Lock associated non-rejected invoices in deterministic order
  FOR v_inv IN
    SELECT id FROM public.invoices
    WHERE purchase_order_id = p_po_id
      AND status NOT IN ('REJECTED', 'CANCELLED')
    ORDER BY id ASC
    FOR UPDATE
  LOOP
    -- Execute settlement reconciliation atomically per invoice
    v_res := public.execute_settlement_reconciliation_atomic(
      v_po.organization_id,
      v_inv.id
    );

    IF (v_res->>'ok')::boolean = true THEN
      v_synced_count := v_synced_count + 1;
    END IF;
  END LOOP;

  -- 4. Emit Audit Event
  INSERT INTO public.audit_events (
    action,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'PO_SETTLEMENT_RECONCILIATIONS_SYNCHRONIZED',
    'PURCHASE_ORDER',
    p_po_id,
    jsonb_build_object(
      'purchase_order_id', p_po_id,
      'synced_invoice_count', v_synced_count
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'purchase_order_id', p_po_id,
    'synced_count', v_synced_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_po_settlement_reconciliations_atomic TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Update resolve_settlement_exception_atomic & add_settlement_exception_event_atomic (GAP-5C6-05)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_settlement_exception_atomic(
  p_exception_id uuid,
  p_resolution_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_caller_role text;
  v_exception RECORD;
BEGIN
  -- 1. Lock Exception row
  SELECT * INTO v_exception
  FROM public.settlement_exceptions
  WHERE id = p_exception_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement exception % not found', p_exception_id;
  END IF;

  -- 2. Authorization check: Buyer OWNER / MANAGER only
  IF NOT v_is_admin THEN
    v_caller_role := private.get_org_role(v_exception.organization_id);
    IF v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'Unauthorized: Only Buyer OWNER or MANAGER can resolve settlement exceptions (RED-21: UNAUTHORIZED_EXCEPTION_RESOLUTION)';
    END IF;
  END IF;

  -- 3. Check already resolved
  IF v_exception.status = 'RESOLVED' THEN
    RAISE EXCEPTION 'Settlement exception % is already resolved', p_exception_id;
  END IF;

  -- 4. Validate resolution note
  IF p_resolution_notes IS NULL OR length(trim(p_resolution_notes)) < 5 THEN
    RAISE EXCEPTION 'Resolution notes must be at least 5 characters long';
  END IF;

  -- 5. Update Exception record
  UPDATE public.settlement_exceptions
  SET
    status = 'RESOLVED',
    resolution_notes = trim(p_resolution_notes),
    resolved_by = v_caller_profile_id,
    resolved_at = now(),
    updated_at = now()
  WHERE id = p_exception_id;

  -- 6. Record RESOLVED Timeline Event (GAP-5C6-05)
  INSERT INTO public.settlement_exception_events (
    exception_id,
    event_type,
    from_status,
    to_status,
    notes,
    actor_id
  ) VALUES (
    p_exception_id,
    'RESOLVED',
    v_exception.status,
    'RESOLVED',
    trim(p_resolution_notes),
    v_caller_profile_id
  );

  -- 7. Update corresponding reconciliation record status
  UPDATE public.settlement_reconciliations
  SET
    status = 'RESOLVED',
    notes = 'Exception resolved: ' || trim(p_resolution_notes),
    reconciled_at = now(),
    reconciled_by = v_caller_profile_id,
    updated_at = now()
  WHERE id = v_exception.reconciliation_id;

  -- 8. Audit Event
  INSERT INTO public.audit_events (
    action,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'SETTLEMENT_EXCEPTION_RESOLVED',
    'SETTLEMENT_EXCEPTION',
    p_exception_id,
    jsonb_build_object(
      'reconciliation_id', v_exception.reconciliation_id,
      'resolution_notes', p_resolution_notes,
      'resolved_by', v_caller_profile_id
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'exception_id', p_exception_id,
    'status', 'RESOLVED',
    'resolved_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.add_settlement_exception_event_atomic(
  p_exception_id uuid,
  p_event_type text,
  p_notes text,
  p_to_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_caller_role text;
  v_exception RECORD;
  v_event_id uuid;
  v_from_status text;
  v_to_status text;
BEGIN
  -- 1. Parameter checks
  IF p_notes IS NULL OR trim(p_notes) = '' THEN
    RAISE EXCEPTION 'Event notes cannot be empty (EXC-5C6-INVALID-NOTES)';
  END IF;

  -- 2. Lock Exception row
  SELECT * INTO v_exception
  FROM public.settlement_exceptions
  WHERE id = p_exception_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement exception % not found', p_exception_id;
  END IF;

  -- 3. Authorization check
  IF NOT v_is_admin THEN
    v_caller_role := private.get_org_role(v_exception.organization_id);
    IF v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'Unauthorized: Only Buyer OWNER or MANAGER can add exception timeline events';
    END IF;
  END IF;

  v_from_status := v_exception.status;
  v_to_status := COALESCE(p_to_status, v_from_status);

  -- 4. Status transition if requested
  IF p_to_status IS NOT NULL AND p_to_status <> v_from_status THEN
    UPDATE public.settlement_exceptions
    SET status = p_to_status,
        updated_at = now()
    WHERE id = p_exception_id;
  END IF;

  -- 5. Insert Event
  INSERT INTO public.settlement_exception_events (
    exception_id,
    event_type,
    from_status,
    to_status,
    notes,
    actor_id
  ) VALUES (
    p_exception_id,
    p_event_type,
    v_from_status,
    v_to_status,
    trim(p_notes),
    v_caller_profile_id
  ) RETURNING id INTO v_event_id;

  -- 6. Audit Event
  INSERT INTO public.audit_events (
    action,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'SETTLEMENT_EXCEPTION_EVENT_LOGGED',
    'SETTLEMENT_EXCEPTION_EVENT',
    v_event_id,
    jsonb_build_object(
      'exception_id', p_exception_id,
      'event_type', p_event_type,
      'from_status', v_from_status,
      'to_status', v_to_status,
      'notes', trim(p_notes)
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'event_id', v_event_id,
    'exception_id', p_exception_id,
    'from_status', v_from_status,
    'to_status', v_to_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_settlement_exception_event_atomic TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. Extend Financial Observability Summary RPC with Financial Aging (GAP-5C6-04)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_financial_observability_summary(
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_caller_role text;

  v_total_po_authorized numeric(14, 2) := 0.00;
  v_open_po_count integer := 0;
  v_completed_po_count integer := 0;

  v_total_invoiced numeric(14, 2) := 0.00;
  v_total_paid numeric(14, 2) := 0.00;
  v_total_tds_withheld numeric(14, 2) := 0.00;
  v_total_tds_deposited numeric(14, 2) := 0.00;
  v_total_debit_notes numeric(14, 2) := 0.00;
  v_total_credit_notes numeric(14, 2) := 0.00;
  v_total_outstanding numeric(14, 2) := 0.00;
  v_total_unallocated_adv numeric(14, 2) := 0.00;
  v_total_utr_cleared numeric(14, 2) := 0.00;
  v_discrepancy_count integer := 0;
  v_discrepancy_amount numeric(14, 2) := 0.00;

  -- Phase 5C.5 Metrics
  v_total_fee_calculated numeric(14, 2) := 0.00;
  v_total_fee_settled numeric(14, 2) := 0.00;
  v_settlement_rec_count integer := 0;
  v_settlement_mismatch_count integer := 0;
  v_open_exception_count integer := 0;
  v_resolved_exception_count integer := 0;

  -- Phase 5C.6 Financial Aging Metrics
  v_inv_aging_0_7d numeric(14, 2) := 0.00;
  v_inv_aging_8_15d numeric(14, 2) := 0.00;
  v_inv_aging_16_30d numeric(14, 2) := 0.00;
  v_inv_aging_over_30d numeric(14, 2) := 0.00;

  v_adv_aging_0_7d numeric(14, 2) := 0.00;
  v_adv_aging_8_15d numeric(14, 2) := 0.00;
  v_adv_aging_16_30d numeric(14, 2) := 0.00;
  v_adv_aging_over_30d numeric(14, 2) := 0.00;

  v_exc_aging_0_7d numeric(14, 2) := 0.00;
  v_exc_aging_8_15d numeric(14, 2) := 0.00;
  v_exc_aging_16_30d numeric(14, 2) := 0.00;
  v_exc_aging_over_30d numeric(14, 2) := 0.00;
BEGIN
  -- 1. Authorization check
  IF NOT v_is_admin THEN
    v_caller_role := private.get_org_role(p_organization_id);
    IF v_caller_role IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: Caller cannot access financial observability metrics for organization % (RED-09/OBS-5C5-UNAUTHORIZED)',
        p_organization_id;
    END IF;
  END IF;

  -- 2. PO Aggregations
  SELECT
    COALESCE(SUM(total_amount), 0.00),
    COUNT(*) FILTER (WHERE status NOT IN ('COMPLETED', 'CANCELLED')),
    COUNT(*) FILTER (WHERE status = 'COMPLETED')
  INTO
    v_total_po_authorized,
    v_open_po_count,
    v_completed_po_count
  FROM public.purchase_orders
  WHERE organization_id = p_organization_id;

  -- 3. Invoices Aggregation (excluding REJECTED and CANCELLED)
  SELECT COALESCE(SUM(amount), 0.00)
  INTO v_total_invoiced
  FROM public.invoices
  WHERE organization_id = p_organization_id
    AND status NOT IN ('REJECTED', 'CANCELLED');

  -- 4. Active Allocations Aggregation
  SELECT COALESCE(SUM(pa.allocated_amount), 0.00)
  INTO v_total_paid
  FROM public.payment_allocations pa
  JOIN public.invoices inv ON inv.id = pa.invoice_id
  WHERE inv.organization_id = p_organization_id
    AND pa.status = 'ALLOCATED';

  -- 5. TDS Deductions Aggregation
  SELECT
    COALESCE(SUM(tds_amount) FILTER (WHERE status != 'VOIDED'), 0.00),
    COALESCE(SUM(tds_amount) FILTER (WHERE status IN ('DEPOSITED', 'CERTIFIED')), 0.00)
  INTO
    v_total_tds_withheld,
    v_total_tds_deposited
  FROM public.tds_deductions
  WHERE organization_id = p_organization_id;

  -- 6. Credit and Debit Notes Aggregation
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE note_type = 'DEBIT_NOTE' AND status NOT IN ('CANCELLED', 'DRAFT')), 0.00),
    COALESCE(SUM(amount) FILTER (WHERE note_type = 'CREDIT_NOTE' AND status NOT IN ('CANCELLED', 'DRAFT')), 0.00)
  INTO
    v_total_debit_notes,
    v_total_credit_notes
  FROM public.credit_debit_notes
  WHERE organization_id = p_organization_id;

  -- 7. Outstanding Obligations (Invariant: max(0, Invoiced - Debit + Credit - TDS - Paid))
  v_total_outstanding := GREATEST(
    0.00,
    v_total_invoiced - v_total_debit_notes + v_total_credit_notes - v_total_tds_withheld - v_total_paid
  );

  -- 8. Unallocated Advances
  SELECT COALESCE(SUM(unallocated_amount), 0.00)
  INTO v_total_unallocated_adv
  FROM public.payments
  WHERE organization_id = p_organization_id;

  -- 9. Bank UTR Reconciliations
  SELECT
    COALESCE(SUM(bank_cleared_amount), 0.00),
    COUNT(*) FILTER (WHERE status = 'DISCREPANCY'),
    COALESCE(SUM(ABS(amount_difference)) FILTER (WHERE status = 'DISCREPANCY'), 0.00)
  INTO
    v_total_utr_cleared,
    v_discrepancy_count,
    v_discrepancy_amount
  FROM public.bank_reconciliation_records
  WHERE organization_id = p_organization_id;

  -- 10. Platform Fees Aggregation
  SELECT
    COALESCE(SUM(fee_amount) FILTER (WHERE status NOT IN ('VOIDED', 'REVERSED')), 0.00),
    COALESCE(SUM(fee_amount) FILTER (WHERE status = 'SETTLED'), 0.00)
  INTO
    v_total_fee_calculated,
    v_total_fee_settled
  FROM public.platform_fee_transactions
  WHERE organization_id = p_organization_id;

  -- 11. Settlement Reconciliations Aggregation
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('MISMATCH', 'DISPUTED'))
  INTO
    v_settlement_rec_count,
    v_settlement_mismatch_count
  FROM public.settlement_reconciliations
  WHERE organization_id = p_organization_id;

  -- 12. Settlement Exceptions Aggregation
  SELECT
    COUNT(*) FILTER (WHERE status IN ('OPEN', 'INVESTIGATING')),
    COUNT(*) FILTER (WHERE status = 'RESOLVED')
  INTO
    v_open_exception_count,
    v_resolved_exception_count
  FROM public.settlement_exceptions
  WHERE organization_id = p_organization_id;

  -- 13. Phase 5C.6: Financial Aging Buckets Calculation
  -- A. Unpaid Invoices Aging
  SELECT
    COALESCE(SUM(GREATEST(0, amount - COALESCE(paid_amount, 0))) FILTER (WHERE EXTRACT(DAY FROM (now() - created_at)) <= 7), 0.00),
    COALESCE(SUM(GREATEST(0, amount - COALESCE(paid_amount, 0))) FILTER (WHERE EXTRACT(DAY FROM (now() - created_at)) > 7 AND EXTRACT(DAY FROM (now() - created_at)) <= 15), 0.00),
    COALESCE(SUM(GREATEST(0, amount - COALESCE(paid_amount, 0))) FILTER (WHERE EXTRACT(DAY FROM (now() - created_at)) > 15 AND EXTRACT(DAY FROM (now() - created_at)) <= 30), 0.00),
    COALESCE(SUM(GREATEST(0, amount - COALESCE(paid_amount, 0))) FILTER (WHERE EXTRACT(DAY FROM (now() - created_at)) > 30), 0.00)
  INTO
    v_inv_aging_0_7d,
    v_inv_aging_8_15d,
    v_inv_aging_16_30d,
    v_inv_aging_over_30d
  FROM public.invoices
  WHERE organization_id = p_organization_id
    AND status NOT IN ('REJECTED', 'CANCELLED', 'PAID');

  -- B. Stuck Advances Aging
  SELECT
    COALESCE(SUM(unallocated_amount) FILTER (WHERE EXTRACT(DAY FROM (now() - created_at)) <= 7), 0.00),
    COALESCE(SUM(unallocated_amount) FILTER (WHERE EXTRACT(DAY FROM (now() - created_at)) > 7 AND EXTRACT(DAY FROM (now() - created_at)) <= 15), 0.00),
    COALESCE(SUM(unallocated_amount) FILTER (WHERE EXTRACT(DAY FROM (now() - created_at)) > 15 AND EXTRACT(DAY FROM (now() - created_at)) <= 30), 0.00),
    COALESCE(SUM(unallocated_amount) FILTER (WHERE EXTRACT(DAY FROM (now() - created_at)) > 30), 0.00)
  INTO
    v_adv_aging_0_7d,
    v_adv_aging_8_15d,
    v_adv_aging_16_30d,
    v_adv_aging_over_30d
  FROM public.payments
  WHERE organization_id = p_organization_id
    AND status NOT IN ('FAILED', 'REVERSED', 'VOIDED')
    AND unallocated_amount > 0;

  -- C. Unresolved Exceptions Aging
  SELECT
    COALESCE(SUM(amount_in_dispute) FILTER (WHERE EXTRACT(DAY FROM (now() - created_at)) <= 7), 0.00),
    COALESCE(SUM(amount_in_dispute) FILTER (WHERE EXTRACT(DAY FROM (now() - created_at)) > 7 AND EXTRACT(DAY FROM (now() - created_at)) <= 15), 0.00),
    COALESCE(SUM(amount_in_dispute) FILTER (WHERE EXTRACT(DAY FROM (now() - created_at)) > 15 AND EXTRACT(DAY FROM (now() - created_at)) <= 30), 0.00),
    COALESCE(SUM(amount_in_dispute) FILTER (WHERE EXTRACT(DAY FROM (now() - created_at)) > 30), 0.00)
  INTO
    v_exc_aging_0_7d,
    v_exc_aging_8_15d,
    v_exc_aging_16_30d,
    v_exc_aging_over_30d
  FROM public.settlement_exceptions
  WHERE organization_id = p_organization_id
    AND status IN ('OPEN', 'INVESTIGATING');

  RETURN jsonb_build_object(
    'organization_id', p_organization_id,
    'total_po_authorized', v_total_po_authorized,
    'total_invoiced', v_total_invoiced,
    'total_paid', v_total_paid,
    'total_tds_withheld', v_total_tds_withheld,
    'total_tds_deposited', v_total_tds_deposited,
    'total_debit_notes', v_total_debit_notes,
    'total_credit_notes', v_total_credit_notes,
    'total_outstanding_obligations', v_total_outstanding,
    'total_unallocated_advances', v_total_unallocated_adv,
    'total_utr_cleared', v_total_utr_cleared,
    'reconciliation_discrepancy_count', v_discrepancy_count,
    'reconciliation_discrepancy_amount', v_discrepancy_amount,
    'open_po_count', v_open_po_count,
    'completed_po_count', v_completed_po_count,
    'total_platform_fee_calculated', v_total_fee_calculated,
    'total_platform_fee_settled', v_total_fee_settled,
    'settlement_reconciliation_count', v_settlement_rec_count,
    'settlement_mismatch_count', v_settlement_mismatch_count,
    'open_exception_count', v_open_exception_count,
    'resolved_exception_count', v_resolved_exception_count,
    'financial_aging', jsonb_build_object(
      'unpaid_invoices_aging', jsonb_build_object(
        'bucket_0_7d', v_inv_aging_0_7d,
        'bucket_8_15d', v_inv_aging_8_15d,
        'bucket_16_30d', v_inv_aging_16_30d,
        'bucket_over_30d', v_inv_aging_over_30d
      ),
      'stuck_advances_aging', jsonb_build_object(
        'bucket_0_7d', v_adv_aging_0_7d,
        'bucket_8_15d', v_adv_aging_8_15d,
        'bucket_16_30d', v_adv_aging_16_30d,
        'bucket_over_30d', v_adv_aging_over_30d
      ),
      'unresolved_exceptions_aging', jsonb_build_object(
        'bucket_0_7d', v_exc_aging_0_7d,
        'bucket_8_15d', v_exc_aging_8_15d,
        'bucket_16_30d', v_exc_aging_16_30d,
        'bucket_over_30d', v_exc_aging_over_30d
      )
    ),
    'generated_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_financial_observability_summary(uuid) TO authenticated, service_role;

COMMIT;
