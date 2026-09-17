-- =============================================================================
-- Migration 00176: Phase 5D — Accounting & Double-Entry Financial Ledger Architecture
--
-- Description:
--   1. Top Helper Functions:
--      - private.get_user_org_ids()
--      - private.get_user_supplier_ids()
--   2. Tables:
--      - public.accounting_periods: Accounting period lifecycle (OPEN, CLOSED, LOCKED).
--      - public.ledger_accounts: Multi-tenant Chart of Accounts with standard classifications.
--      - public.journal_entries: Double-entry header with source event provenance and status (DRAFT, POSTED, REVERSED).
--      - public.journal_lines: Individual debit/credit lines with exact numeric precision, account linkage, and check constraints.
--      - public.account_balance_snapshots: Periodic summary snapshots for fast read-model performance.
--   3. Database Triggers & Invariants:
--      - trg_enforce_accounting_period_status: Blocks inserting or modifying journals in CLOSED/LOCKED periods.
--      - trg_protect_posted_journal_immutability: Strictly prevents direct UPDATE/DELETE on POSTED journals.
--      - trg_validate_journal_entry_balance: Validates SUM(debits) = SUM(credits) upon transition to POSTED status.
--      - trg_validate_journal_line_constraints: Validates positive amounts, prohibited dual debit/credit, non-zero line items.
--   4. Atomic RPCs (SECURITY DEFINER SET search_path = public, private, pg_temp):
--      - public.initialize_standard_chart_of_accounts_atomic(p_org_id uuid)
--      - public.post_journal_entry_atomic(p_org_id uuid, p_period_id uuid, p_entry_type text, p_narration text, p_source_entity_type text, p_source_entity_id text, p_idempotency_key text, p_lines jsonb)
--      - public.reverse_journal_entry_atomic(p_org_id uuid, p_journal_id uuid, p_reversal_reason text)
--      - public.generate_procurement_journal_atomic(p_org_id uuid, p_event_type text, p_source_id uuid, p_period_id uuid)
--      - public.close_accounting_period_atomic(p_org_id uuid, p_period_id uuid)
--      - public.reopen_accounting_period_atomic(p_org_id uuid, p_period_id uuid, p_reason text)
--      - public.get_ledger_balance_summary(p_org_id uuid, p_period_id uuid)
--   5. Multi-Tenant RLS Policies:
--      - Buyer OWNER / MANAGER mutate authority, tenant members read-only, strict cross-tenant isolation.
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
-- 1. Create public.accounting_periods Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_periods (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  period_code                 text NOT NULL,
  period_name                 text NOT NULL,
  start_date                  date NOT NULL,
  end_date                    date NOT NULL,
  status                      text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'CLOSED', 'LOCKED')),
  closed_at                   timestamptz,
  closed_by                   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  locked_at                   timestamptz,
  locked_by                   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reopened_at                 timestamptz,
  reopened_by                 uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reopen_reason               text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_accounting_periods_org_code UNIQUE (organization_id, period_code),
  CONSTRAINT chk_period_dates_valid CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_org ON public.accounting_periods(organization_id);
CREATE INDEX IF NOT EXISTS idx_accounting_periods_status ON public.accounting_periods(status);
CREATE INDEX IF NOT EXISTS idx_accounting_periods_dates ON public.accounting_periods(start_date, end_date);

DROP TRIGGER IF EXISTS trg_accounting_periods_updated_at ON public.accounting_periods;
CREATE TRIGGER trg_accounting_periods_updated_at
  BEFORE UPDATE ON public.accounting_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accounting_periods_select ON public.accounting_periods;
CREATE POLICY accounting_periods_select ON public.accounting_periods
  FOR SELECT
  USING (
    private.is_platform_admin()
    OR organization_id IN (SELECT private.get_user_org_ids())
  );

DROP POLICY IF EXISTS accounting_periods_mutate ON public.accounting_periods;
CREATE POLICY accounting_periods_mutate ON public.accounting_periods
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
-- 2. Create public.ledger_accounts Table (Chart of Accounts)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ledger_accounts (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  account_code                text NOT NULL,
  account_name                text NOT NULL,
  classification              text NOT NULL
    CHECK (classification IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
  subtype                     text NOT NULL
    CHECK (subtype IN (
      'CURRENT_ASSET', 'BANK', 'ACCOUNTS_RECEIVABLE', 'ADVANCE_TO_SUPPLIER',
      'CURRENT_LIABILITY', 'ACCOUNTS_PAYABLE', 'TDS_PAYABLE', 'GST_PAYABLE', 'GST_INPUT_TAX',
      'SETTLEMENT_CLEARING', 'OPERATING_REVENUE', 'PLATFORM_FEE_REVENUE',
      'DIRECT_EXPENSE', 'PROCUREMENT_EXPENSE', 'CONTRA_ACCOUNT'
    )),
  currency                    text NOT NULL DEFAULT 'INR',
  is_system_account           boolean NOT NULL DEFAULT true,
  status                      text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'INACTIVE', 'DEPRECATED')),
  description                 text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ledger_accounts_org_code UNIQUE (organization_id, account_code)
);

CREATE INDEX IF NOT EXISTS idx_ledger_accounts_org ON public.ledger_accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_class ON public.ledger_accounts(classification);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_subtype ON public.ledger_accounts(subtype);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_status ON public.ledger_accounts(status);

DROP TRIGGER IF EXISTS trg_ledger_accounts_updated_at ON public.ledger_accounts;
CREATE TRIGGER trg_ledger_accounts_updated_at
  BEFORE UPDATE ON public.ledger_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ledger_accounts_select ON public.ledger_accounts;
CREATE POLICY ledger_accounts_select ON public.ledger_accounts
  FOR SELECT
  USING (
    private.is_platform_admin()
    OR organization_id IN (SELECT private.get_user_org_ids())
  );

DROP POLICY IF EXISTS ledger_accounts_mutate ON public.ledger_accounts;
CREATE POLICY ledger_accounts_mutate ON public.ledger_accounts
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
-- 3. Create public.journal_entries Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  period_id                   uuid NOT NULL REFERENCES public.accounting_periods(id) ON DELETE RESTRICT,
  journal_number              text NOT NULL,
  entry_date                  date NOT NULL DEFAULT CURRENT_DATE,
  entry_type                  text NOT NULL CHECK (
    entry_type IN (
      'INVOICE_OBLIGATION',
      'PAYMENT_DISBURSEMENT',
      'ADVANCE_PAYMENT',
      'ADVANCE_ALLOCATION',
      'STATUTORY_TDS_ACCRUAL',
      'PLATFORM_FEE_REVENUE',
      'CREDIT_NOTE_ADJUSTMENT',
      'DEBIT_NOTE_ADJUSTMENT',
      'SETTLEMENT_RECONCILIATION',
      'JOURNAL_REVERSAL',
      'MANUAL_JOURNAL'
    )
  ),
  status                      text NOT NULL DEFAULT 'POSTED'
    CHECK (status IN ('DRAFT', 'POSTED', 'REVERSED')),
  narration                   text NOT NULL,
  source_entity_type          text,
  source_entity_id            text,
  idempotency_key             text,
  reversed_by_journal_id      uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  reverses_journal_id         uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  reversal_reason             text,
  total_debit                 numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_debit >= 0),
  total_credit                numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_credit >= 0),
  posted_by                   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  posted_at                   timestamptz NOT NULL DEFAULT now(),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_journal_entries_org_num UNIQUE (organization_id, journal_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_idempotency
  ON public.journal_entries (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journal_entries_org ON public.journal_entries(organization_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_period ON public.journal_entries(period_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON public.journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_type ON public.journal_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON public.journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_source ON public.journal_entries(source_entity_type, source_entity_id);

DROP TRIGGER IF EXISTS trg_journal_entries_updated_at ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_updated_at
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS journal_entries_select ON public.journal_entries;
CREATE POLICY journal_entries_select ON public.journal_entries
  FOR SELECT
  USING (
    private.is_platform_admin()
    OR organization_id IN (SELECT private.get_user_org_ids())
  );

DROP POLICY IF EXISTS journal_entries_mutate ON public.journal_entries;
CREATE POLICY journal_entries_mutate ON public.journal_entries
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
-- 4. Create public.journal_lines Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journal_lines (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id            uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  line_number                 integer NOT NULL CHECK (line_number > 0),
  account_id                  uuid NOT NULL REFERENCES public.ledger_accounts(id) ON DELETE RESTRICT,
  debit_amount                numeric(14, 2) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount               numeric(14, 2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  currency                    text NOT NULL DEFAULT 'INR',
  description                 text,
  supplier_id                 uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  purchase_order_id           uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  invoice_id                  uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  payment_id                  uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_journal_lines_seq UNIQUE (journal_entry_id, line_number),
  CONSTRAINT chk_journal_line_nonzero CHECK (debit_amount > 0 OR credit_amount > 0),
  CONSTRAINT chk_journal_line_no_dual CHECK (NOT (debit_amount > 0 AND credit_amount > 0))
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON public.journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON public.journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_po ON public.journal_lines(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_invoice ON public.journal_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_payment ON public.journal_lines(payment_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_supplier ON public.journal_lines(supplier_id);

ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS journal_lines_select ON public.journal_lines;
CREATE POLICY journal_lines_select ON public.journal_lines
  FOR SELECT
  USING (
    private.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.id = journal_lines.journal_entry_id
        AND je.organization_id IN (SELECT private.get_user_org_ids())
    )
  );

DROP POLICY IF EXISTS journal_lines_mutate ON public.journal_lines;
CREATE POLICY journal_lines_mutate ON public.journal_lines
  FOR ALL
  USING (
    private.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.id = journal_lines.journal_entry_id
        AND private.get_org_role(je.organization_id) IN ('OWNER', 'MANAGER')
    )
  )
  WITH CHECK (
    private.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.id = journal_lines.journal_entry_id
        AND private.get_org_role(je.organization_id) IN ('OWNER', 'MANAGER')
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Create public.account_balance_snapshots Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_balance_snapshots (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  period_id                   uuid NOT NULL REFERENCES public.accounting_periods(id) ON DELETE RESTRICT,
  account_id                  uuid NOT NULL REFERENCES public.ledger_accounts(id) ON DELETE RESTRICT,
  snapshot_date               date NOT NULL,
  total_debits                numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_debits >= 0),
  total_credits               numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total_credits >= 0),
  net_balance                 numeric(14, 2) NOT NULL DEFAULT 0,
  balance_type                text NOT NULL CHECK (balance_type IN ('DEBIT', 'CREDIT', 'ZERO')),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_account_balance_snapshot UNIQUE (organization_id, period_id, account_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_account_snapshots_org_period ON public.account_balance_snapshots(organization_id, period_id);
CREATE INDEX IF NOT EXISTS idx_account_snapshots_account ON public.account_balance_snapshots(account_id);

ALTER TABLE public.account_balance_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_balance_snapshots_select ON public.account_balance_snapshots;
CREATE POLICY account_balance_snapshots_select ON public.account_balance_snapshots
  FOR SELECT
  USING (
    private.is_platform_admin()
    OR organization_id IN (SELECT private.get_user_org_ids())
  );

DROP POLICY IF EXISTS account_balance_snapshots_mutate ON public.account_balance_snapshots;
CREATE POLICY account_balance_snapshots_mutate ON public.account_balance_snapshots
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
-- 6. Invariant & Immutability Triggers
-- ---------------------------------------------------------------------------

-- Invariant Trigger: Protect Posted Journal Immutability
CREATE OR REPLACE FUNCTION public.trg_fn_protect_posted_journal_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('POSTED', 'REVERSED') THEN
      RAISE EXCEPTION 'DIRECT_DELETE_FORBIDDEN: Posted or reversed journal entries cannot be deleted. Use reverse_journal_entry_atomic instead.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'POSTED' AND NEW.status = 'POSTED' THEN
      -- Allow updating metadata like reversed_by_journal_id, but forbid altering core financial fields
      IF OLD.total_debit != NEW.total_debit OR
         OLD.total_credit != NEW.total_credit OR
         OLD.entry_date != NEW.entry_date OR
         OLD.organization_id != NEW.organization_id OR
         OLD.period_id != NEW.period_id THEN
        RAISE EXCEPTION 'POSTED_JOURNAL_IMMUTABLE: Financial fields on a posted journal entry cannot be modified. Post a reversal journal instead.'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
    
    IF OLD.status = 'REVERSED' AND NEW.status != 'REVERSED' THEN
      RAISE EXCEPTION 'REVERSED_JOURNAL_IMMUTABLE: A reversed journal entry cannot be reopened or edited.'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_posted_journal_immutability ON public.journal_entries;
CREATE TRIGGER trg_protect_posted_journal_immutability
  BEFORE UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_protect_posted_journal_immutability();

-- Invariant Trigger: Enforce Accounting Period Status
CREATE OR REPLACE FUNCTION public.trg_fn_enforce_accounting_period_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period_status text;
BEGIN
  SELECT status INTO v_period_status
  FROM public.accounting_periods
  WHERE id = NEW.period_id;

  IF v_period_status IS NULL THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: Referenced accounting period does not exist.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_period_status != 'OPEN' THEN
    RAISE EXCEPTION 'PERIOD_CLOSED_OR_LOCKED: Postings to accounting period in status "%" are prohibited.', v_period_status
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_accounting_period_status ON public.journal_entries;
CREATE TRIGGER trg_enforce_accounting_period_status
  BEFORE INSERT OR UPDATE OF period_id ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_enforce_accounting_period_status();

-- Invariant Trigger: Validate Journal Entry Balance & Active Accounts
CREATE OR REPLACE FUNCTION public.trg_fn_validate_journal_lines_account_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_acc_status text;
  v_acc_org_id uuid;
  v_journal_org_id uuid;
BEGIN
  SELECT status, organization_id INTO v_acc_status, v_acc_org_id
  FROM public.ledger_accounts
  WHERE id = NEW.account_id;

  IF v_acc_status IS NULL THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: Referenced ledger account % does not exist.', NEW.account_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_acc_status != 'ACTIVE' THEN
    RAISE EXCEPTION 'INACTIVE_ACCOUNT: Cannot post journal lines to account with status "%".', v_acc_status
      USING ERRCODE = 'P0001';
  END IF;

  SELECT organization_id INTO v_journal_org_id
  FROM public.journal_entries
  WHERE id = NEW.journal_entry_id;

  IF v_acc_org_id != v_journal_org_id THEN
    RAISE EXCEPTION 'CROSS_TENANT_ACCOUNT: Account belongs to org % but journal belongs to org %.', v_acc_org_id, v_journal_org_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_journal_lines_account_active ON public.journal_lines;
CREATE TRIGGER trg_validate_journal_lines_account_active
  BEFORE INSERT OR UPDATE ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_validate_journal_lines_account_active();

-- ---------------------------------------------------------------------------
-- 7. Atomic RPC Functions
-- ---------------------------------------------------------------------------

-- RPC: Initialize Standard Chart of Accounts
CREATE OR REPLACE FUNCTION public.initialize_standard_chart_of_accounts_atomic(
  p_org_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_actor_role text;
  v_count integer := 0;
BEGIN
  -- Permission Check
  IF NOT private.is_platform_admin() THEN
    v_actor_role := private.get_org_role(p_org_id);
    IF v_actor_role NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'PERMISSION_DENIED: Buyer OWNER or MANAGER role required to initialize chart of accounts.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Insert Standard Accounts
  INSERT INTO public.ledger_accounts (
    organization_id, account_code, account_name, classification, subtype, is_system_account, status, description
  ) VALUES
    (p_org_id, '1010-BANK-DEFAULT', 'Bank / Main Operating Account', 'ASSET', 'BANK', true, 'ACTIVE', 'Primary corporate bank account'),
    (p_org_id, '1020-ACCOUNTS-RECEIVABLE', 'Accounts Receivable', 'ASSET', 'ACCOUNTS_RECEIVABLE', true, 'ACTIVE', 'Receivables from buyers / customers'),
    (p_org_id, '1030-ADVANCES-TO-SUPPLIERS', 'Advances to Suppliers', 'ASSET', 'ADVANCE_TO_SUPPLIER', true, 'ACTIVE', 'Unallocated advances paid to suppliers'),
    (p_org_id, '1040-GST-INPUT-TAX-CGST', 'GST Input Tax Credit - CGST', 'ASSET', 'GST_INPUT_TAX', true, 'ACTIVE', 'Input Central GST recoverable'),
    (p_org_id, '1041-GST-INPUT-TAX-SGST', 'GST Input Tax Credit - SGST', 'ASSET', 'GST_INPUT_TAX', true, 'ACTIVE', 'Input State GST recoverable'),
    (p_org_id, '1042-GST-INPUT-TAX-IGST', 'GST Input Tax Credit - IGST', 'ASSET', 'GST_INPUT_TAX', true, 'ACTIVE', 'Input Integrated GST recoverable'),
    (p_org_id, '1043-GST-INPUT-TAX-UTGST', 'GST Input Tax Credit - UTGST', 'ASSET', 'GST_INPUT_TAX', true, 'ACTIVE', 'Input Union Territory GST recoverable'),
    (p_org_id, '2010-ACCOUNTS-PAYABLE', 'Accounts Payable (Trade Payables)', 'LIABILITY', 'ACCOUNTS_PAYABLE', true, 'ACTIVE', 'Trade payables owed to suppliers'),
    (p_org_id, '2020-TDS-PAYABLE-STATUTORY', 'TDS Payable (Statutory Withholdings)', 'LIABILITY', 'TDS_PAYABLE', true, 'ACTIVE', 'Statutory TDS withholdings payable to government'),
    (p_org_id, '2030-GST-OUTPUT-PAYABLE', 'GST Output Tax Liability', 'LIABILITY', 'GST_PAYABLE', true, 'ACTIVE', 'Output GST liability accrued'),
    (p_org_id, '2090-SETTLEMENT-CLEARING', 'Settlement Clearing Account', 'LIABILITY', 'SETTLEMENT_CLEARING', true, 'ACTIVE', 'Intermediate settlement clearing account'),
    (p_org_id, '4010-PLATFORM-FEE-REVENUE', 'Platform Fee Revenue', 'REVENUE', 'PLATFORM_FEE_REVENUE', true, 'ACTIVE', 'OTP platform facilitation fee earned'),
    (p_org_id, '5010-PROCUREMENT-EXPENSE', 'Procurement Purchases & Work Orders', 'EXPENSE', 'PROCUREMENT_EXPENSE', true, 'ACTIVE', 'Procurement expense incurred for goods/services')
  ON CONFLICT (organization_id, account_code) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Create Default Current Period if none exists
  INSERT INTO public.accounting_periods (
    organization_id, period_code, period_name, start_date, end_date, status
  ) VALUES (
    p_org_id,
    to_char(CURRENT_DATE, 'YYYY-MM'),
    to_char(CURRENT_DATE, 'FMMonth YYYY') || ' Accounting Period',
    date_trunc('month', CURRENT_DATE)::date,
    (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date,
    'OPEN'
  ) ON CONFLICT (organization_id, period_code) DO NOTHING;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.initialize_standard_chart_of_accounts_atomic(uuid) TO authenticated, service_role;

-- RPC: Post Journal Entry Atomic
CREATE OR REPLACE FUNCTION public.post_journal_entry_atomic(
  p_org_id uuid,
  p_period_id uuid,
  p_entry_type text,
  p_narration text,
  p_source_entity_type text DEFAULT NULL,
  p_source_entity_id text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_lines jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_period_status text;
  v_existing_id uuid;
  v_journal_id uuid;
  v_journal_num text;
  v_total_debit numeric(14, 2) := 0;
  v_total_credit numeric(14, 2) := 0;
  v_line_item jsonb;
  v_idx integer := 0;
  v_line_count integer := 0;
  v_debit numeric(14, 2);
  v_credit numeric(14, 2);
  v_acc_id uuid;
  v_acc_org_id uuid;
  v_acc_status text;
BEGIN
  v_actor_id := private.get_profile_id();

  -- Permission Check
  IF NOT private.is_platform_admin() THEN
    v_actor_role := private.get_org_role(p_org_id);
    IF v_actor_role NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'PERMISSION_DENIED: Buyer OWNER or MANAGER role required to post journal entries.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Idempotency Check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.journal_entries
    WHERE organization_id = p_org_id
      AND idempotency_key = p_idempotency_key;

    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'journal_id', v_existing_id,
        'status', 'POSTED',
        'is_duplicate', true
      );
    END IF;
  END IF;

  -- Period Lock & Status Check (Pessimistic Locking)
  SELECT status INTO v_period_status
  FROM public.accounting_periods
  WHERE id = p_period_id AND organization_id = p_org_id
  FOR UPDATE;

  IF v_period_status IS NULL THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: Accounting period % not found for organization %.', p_period_id, p_org_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_period_status != 'OPEN' THEN
    RAISE EXCEPTION 'PERIOD_CLOSED: Cannot post journal entry into % period.', v_period_status
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate Lines Count
  v_line_count := jsonb_array_length(p_lines);
  IF v_line_count < 2 THEN
    RAISE EXCEPTION 'DOUBLE_ENTRY_VIOLATION: Journal entry must contain at least 2 lines.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Compute totals and pre-validate line items
  FOR v_idx IN 0..(v_line_count - 1) LOOP
    v_line_item := p_lines->v_idx;
    v_debit := round(COALESCE((v_line_item->>'debit_amount')::numeric, 0), 2);
    v_credit := round(COALESCE((v_line_item->>'credit_amount')::numeric, 0), 2);
    v_acc_id := (v_line_item->>'account_id')::uuid;

    IF v_acc_id IS NULL THEN
      RAISE EXCEPTION 'LINE_INVALID: Line % is missing account_id.', (v_idx + 1)
        USING ERRCODE = 'P0001';
    END IF;

    IF v_debit < 0 OR v_credit < 0 THEN
      RAISE EXCEPTION 'NEGATIVE_AMOUNT_PROHIBITED: Line % has negative debit (%) or credit (%).', (v_idx + 1), v_debit, v_credit
        USING ERRCODE = 'P0001';
    END IF;

    IF v_debit > 0 AND v_credit > 0 THEN
      RAISE EXCEPTION 'DUAL_DEBIT_CREDIT_PROHIBITED: Line % cannot have both debit (%) and credit (%) populated.', (v_idx + 1), v_debit, v_credit
        USING ERRCODE = 'P0001';
    END IF;

    IF v_debit = 0 AND v_credit = 0 THEN
      RAISE EXCEPTION 'ZERO_LINE_PROHIBITED: Line % has zero amount for both debit and credit.', (v_idx + 1)
        USING ERRCODE = 'P0001';
    END IF;

    -- Verify account validity & tenant isolation
    SELECT organization_id, status INTO v_acc_org_id, v_acc_status
    FROM public.ledger_accounts
    WHERE id = v_acc_id;

    IF v_acc_status IS NULL THEN
      RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: Ledger account % does not exist.', v_acc_id
        USING ERRCODE = 'P0002';
    END IF;

    IF v_acc_org_id != p_org_id THEN
      RAISE EXCEPTION 'CROSS_TENANT_ACCOUNT_VIOLATION: Account % belongs to org % but posting for org %.', v_acc_id, v_acc_org_id, p_org_id
        USING ERRCODE = 'P0001';
    END IF;

    IF v_acc_status != 'ACTIVE' THEN
      RAISE EXCEPTION 'INACTIVE_ACCOUNT_VIOLATION: Account % has status %.', v_acc_id, v_acc_status
        USING ERRCODE = 'P0001';
    END IF;

    v_total_debit := round(v_total_debit + v_debit, 2);
    v_total_credit := round(v_total_credit + v_credit, 2);
  END LOOP;

  -- Enforce Exact Mathematical Balance
  IF v_total_debit != v_total_credit THEN
    RAISE EXCEPTION 'UNBALANCED_JOURNAL_VIOLATION: Total debits (%) does not equal total credits (%). Difference: %',
      v_total_debit, v_total_credit, abs(v_total_debit - v_total_credit)
      USING ERRCODE = 'P0001';
  END IF;

  -- Generate Sequential Journal Number
  v_journal_num := 'JRN-' || to_char(CURRENT_DATE, 'YYYYMM') || '-' || lpad((nextval('public.journal_number_seq'::regclass))::text, 5, '0');

  -- Insert Journal Header
  INSERT INTO public.journal_entries (
    organization_id,
    period_id,
    journal_number,
    entry_date,
    entry_type,
    status,
    narration,
    source_entity_type,
    source_entity_id,
    idempotency_key,
    total_debit,
    total_credit,
    posted_by,
    posted_at
  ) VALUES (
    p_org_id,
    p_period_id,
    v_journal_num,
    CURRENT_DATE,
    p_entry_type,
    'POSTED',
    p_narration,
    p_source_entity_type,
    p_source_entity_id,
    p_idempotency_key,
    v_total_debit,
    v_total_credit,
    v_actor_id,
    now()
  ) RETURNING id INTO v_journal_id;

  -- Insert Journal Lines
  FOR v_idx IN 0..(v_line_count - 1) LOOP
    v_line_item := p_lines->v_idx;
    INSERT INTO public.journal_lines (
      journal_entry_id,
      line_number,
      account_id,
      debit_amount,
      credit_amount,
      currency,
      description,
      supplier_id,
      purchase_order_id,
      invoice_id,
      payment_id
    ) VALUES (
      v_journal_id,
      v_idx + 1,
      (v_line_item->>'account_id')::uuid,
      round(COALESCE((v_line_item->>'debit_amount')::numeric, 0), 2),
      round(COALESCE((v_line_item->>'credit_amount')::numeric, 0), 2),
      COALESCE(v_line_item->>'currency', 'INR'),
      v_line_item->>'description',
      (v_line_item->>'supplier_id')::uuid,
      (v_line_item->>'purchase_order_id')::uuid,
      (v_line_item->>'invoice_id')::uuid,
      (v_line_item->>'payment_id')::uuid
    );
  END LOOP;

  -- Log Audit Event
  INSERT INTO public.audit_events (
    actor_id,
    organization_id,
    event_type,
    entity_id,
    entity_type,
    payload
  ) VALUES (
    v_actor_id,
    p_org_id,
    'JOURNAL_POSTED',
    v_journal_id,
    'JOURNAL_ENTRY',
    jsonb_build_object(
      'journal_number', v_journal_num,
      'entry_type', p_entry_type,
      'total_debit', v_total_debit,
      'total_credit', v_total_credit,
      'period_id', p_period_id,
      'source_entity_type', p_source_entity_type,
      'source_entity_id', p_source_entity_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'journal_id', v_journal_id,
    'journal_number', v_journal_num,
    'total_amount', v_total_debit,
    'status', 'POSTED'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_journal_entry_atomic(uuid, uuid, text, text, text, text, text, jsonb) TO authenticated, service_role;

-- Sequence for journal numbering if not exists
CREATE SEQUENCE IF NOT EXISTS public.journal_number_seq START 1;

-- RPC: Reverse Journal Entry Atomic
CREATE OR REPLACE FUNCTION public.reverse_journal_entry_atomic(
  p_org_id uuid,
  p_journal_id uuid,
  p_reversal_reason text DEFAULT 'Reversal of authorized journal entry'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_orig_journal record;
  v_reversal_journal_id uuid;
  v_reversal_journal_num text;
  v_orig_line record;
  v_line_num integer := 1;
BEGIN
  v_actor_id := private.get_profile_id();

  -- Permission Check
  IF NOT private.is_platform_admin() THEN
    v_actor_role := private.get_org_role(p_org_id);
    IF v_actor_role NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'PERMISSION_DENIED: Buyer OWNER or MANAGER role required to reverse journal entries.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Fetch & Lock Original Journal
  SELECT * INTO v_orig_journal
  FROM public.journal_entries
  WHERE id = p_journal_id AND organization_id = p_org_id
  FOR UPDATE;

  IF v_orig_journal.id IS NULL THEN
    RAISE EXCEPTION 'JOURNAL_NOT_FOUND: Journal entry % not found for organization %.', p_journal_id, p_org_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_orig_journal.status = 'REVERSED' THEN
    RAISE EXCEPTION 'ALREADY_REVERSED: Journal entry % is already in REVERSED status.', p_journal_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_orig_journal.status != 'POSTED' THEN
    RAISE EXCEPTION 'CANNOT_REVERSE_NON_POSTED: Only POSTED journal entries can be reversed. Current status: %', v_orig_journal.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Generate Reversal Number
  v_reversal_journal_num := 'REV-' || to_char(CURRENT_DATE, 'YYYYMM') || '-' || lpad((nextval('public.journal_number_seq'::regclass))::text, 5, '0');

  -- Create Mirrored Reversal Journal Entry
  INSERT INTO public.journal_entries (
    organization_id,
    period_id,
    journal_number,
    entry_date,
    entry_type,
    status,
    narration,
    source_entity_type,
    source_entity_id,
    reverses_journal_id,
    reversal_reason,
    total_debit,
    total_credit,
    posted_by,
    posted_at
  ) VALUES (
    p_org_id,
    v_orig_journal.period_id,
    v_reversal_journal_num,
    CURRENT_DATE,
    'JOURNAL_REVERSAL',
    'POSTED',
    'Reversal of ' || v_orig_journal.journal_number || ': ' || COALESCE(p_reversal_reason, 'Correction/Cancellation'),
    v_orig_journal.source_entity_type,
    v_orig_journal.source_entity_id,
    p_journal_id,
    p_reversal_reason,
    v_orig_journal.total_credit, -- Debits mirror Credits
    v_orig_journal.total_debit,  -- Credits mirror Debits
    v_actor_id,
    now()
  ) RETURNING id INTO v_reversal_journal_id;

  -- Swap debit and credit lines
  FOR v_orig_line IN
    SELECT * FROM public.journal_lines
    WHERE journal_entry_id = p_journal_id
    ORDER BY line_number ASC
  LOOP
    INSERT INTO public.journal_lines (
      journal_entry_id,
      line_number,
      account_id,
      debit_amount,
      credit_amount,
      currency,
      description,
      supplier_id,
      purchase_order_id,
      invoice_id,
      payment_id
    ) VALUES (
      v_reversal_journal_id,
      v_line_num,
      v_orig_line.account_id,
      v_orig_line.credit_amount, -- Swapped
      v_orig_line.debit_amount,  -- Swapped
      v_orig_line.currency,
      'Reversal: ' || COALESCE(v_orig_line.description, ''),
      v_orig_line.supplier_id,
      v_orig_line.purchase_order_id,
      v_orig_line.invoice_id,
      v_orig_line.payment_id
    );
    v_line_num := v_line_num + 1;
  END LOOP;

  -- Mark Original Journal as REVERSED
  UPDATE public.journal_entries
  SET status = 'REVERSED',
      reversed_by_journal_id = v_reversal_journal_id,
      reversal_reason = p_reversal_reason,
      updated_at = now()
  WHERE id = p_journal_id;

  -- Audit Event
  INSERT INTO public.audit_events (
    actor_id,
    organization_id,
    event_type,
    entity_id,
    entity_type,
    payload
  ) VALUES (
    v_actor_id,
    p_org_id,
    'JOURNAL_REVERSED',
    p_journal_id,
    'JOURNAL_ENTRY',
    jsonb_build_object(
      'original_journal_number', v_orig_journal.journal_number,
      'reversal_journal_id', v_reversal_journal_id,
      'reversal_journal_number', v_reversal_journal_num,
      'reason', p_reversal_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'original_journal_id', p_journal_id,
    'reversal_journal_id', v_reversal_journal_id,
    'reversal_journal_number', v_reversal_journal_num,
    'status', 'REVERSED'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_journal_entry_atomic(uuid, uuid, text) TO authenticated, service_role;

-- RPC: Close Accounting Period Atomic
CREATE OR REPLACE FUNCTION public.close_accounting_period_atomic(
  p_org_id uuid,
  p_period_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_period record;
  v_unbalanced_count integer;
BEGIN
  v_actor_id := private.get_profile_id();

  -- Permission Check: Buyer OWNER only
  IF NOT private.is_platform_admin() THEN
    v_actor_role := private.get_org_role(p_org_id);
    IF v_actor_role != 'OWNER' THEN
      RAISE EXCEPTION 'PERMISSION_DENIED: Buyer OWNER role required to close accounting periods.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_period
  FROM public.accounting_periods
  WHERE id = p_period_id AND organization_id = p_org_id
  FOR UPDATE;

  IF v_period.id IS NULL THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: Accounting period % not found for organization %.', p_period_id, p_org_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_period.status = 'CLOSED' OR v_period.status = 'LOCKED' THEN
    RAISE EXCEPTION 'PERIOD_ALREADY_CLOSED: Accounting period is already in status "%".', v_period.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Update Period Status to CLOSED
  UPDATE public.accounting_periods
  SET status = 'CLOSED',
      closed_at = now(),
      closed_by = v_actor_id,
      updated_at = now()
  WHERE id = p_period_id;

  -- Audit Event
  INSERT INTO public.audit_events (
    actor_id,
    organization_id,
    event_type,
    entity_id,
    entity_type,
    payload
  ) VALUES (
    v_actor_id,
    p_org_id,
    'ACCOUNTING_PERIOD_CLOSED',
    p_period_id,
    'ACCOUNTING_PERIOD',
    jsonb_build_object(
      'period_code', v_period.period_code,
      'period_name', v_period.period_name
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'period_id', p_period_id,
    'period_code', v_period.period_code,
    'status', 'CLOSED'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_accounting_period_atomic(uuid, uuid) TO authenticated, service_role;

-- RPC: Reopen Accounting Period Atomic
CREATE OR REPLACE FUNCTION public.reopen_accounting_period_atomic(
  p_org_id uuid,
  p_period_id uuid,
  p_reason text DEFAULT 'Authorized period reopening for audit adjustments'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_period record;
BEGIN
  v_actor_id := private.get_profile_id();

  -- Permission Check: Buyer OWNER only
  IF NOT private.is_platform_admin() THEN
    v_actor_role := private.get_org_role(p_org_id);
    IF v_actor_role != 'OWNER' THEN
      RAISE EXCEPTION 'PERMISSION_DENIED: Explicit Buyer OWNER role required to reopen an accounting period.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_period
  FROM public.accounting_periods
  WHERE id = p_period_id AND organization_id = p_org_id
  FOR UPDATE;

  IF v_period.id IS NULL THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: Accounting period % not found.', p_period_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_period.status = 'OPEN' THEN
    RAISE EXCEPTION 'PERIOD_ALREADY_OPEN: Period is already OPEN.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.accounting_periods
  SET status = 'OPEN',
      reopened_at = now(),
      reopened_by = v_actor_id,
      reopen_reason = p_reason,
      updated_at = now()
  WHERE id = p_period_id;

  INSERT INTO public.audit_events (
    actor_id,
    organization_id,
    event_type,
    entity_id,
    entity_type,
    payload
  ) VALUES (
    v_actor_id,
    p_org_id,
    'ACCOUNTING_PERIOD_REOPENED',
    p_period_id,
    'ACCOUNTING_PERIOD',
    jsonb_build_object(
      'period_code', v_period.period_code,
      'reopen_reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'period_id', p_period_id,
    'status', 'OPEN'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reopen_accounting_period_atomic(uuid, uuid, text) TO authenticated, service_role;

-- RPC: Get Ledger Balance Summary & Trial Balance
CREATE OR REPLACE FUNCTION public.get_ledger_balance_summary(
  p_org_id uuid,
  p_period_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_actor_role text;
  v_accounts jsonb;
  v_total_debits numeric(14, 2) := 0;
  v_total_credits numeric(14, 2) := 0;
  v_total_assets numeric(14, 2) := 0;
  v_total_liabilities numeric(14, 2) := 0;
  v_total_equity numeric(14, 2) := 0;
  v_total_revenue numeric(14, 2) := 0;
  v_total_expense numeric(14, 2) := 0;
BEGIN
  -- Permission Check: Member of organization or platform admin
  IF NOT private.is_platform_admin() THEN
    IF NOT (p_org_id IN (SELECT private.get_user_org_ids())) THEN
      RAISE EXCEPTION 'PERMISSION_DENIED: You do not have access to view this organization ledger.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  WITH account_totals AS (
    SELECT
      la.id AS account_id,
      la.account_code,
      la.account_name,
      la.classification,
      la.subtype,
      la.currency,
      COALESCE(SUM(jl.debit_amount), 0) AS debit_total,
      COALESCE(SUM(jl.credit_amount), 0) AS credit_total,
      COUNT(jl.id) AS line_count
    FROM public.ledger_accounts la
    LEFT JOIN public.journal_lines jl ON jl.account_id = la.id
    LEFT JOIN public.journal_entries je ON je.id = jl.journal_entry_id
      AND je.status = 'POSTED'
      AND (p_period_id IS NULL OR je.period_id = p_period_id)
    WHERE la.organization_id = p_org_id
      AND la.status = 'ACTIVE'
    GROUP BY la.id, la.account_code, la.account_name, la.classification, la.subtype, la.currency
  ),
  classified_totals AS (
    SELECT
      account_id,
      account_code,
      account_name,
      classification,
      subtype,
      currency,
      debit_total,
      credit_total,
      line_count,
      CASE
        WHEN classification IN ('ASSET', 'EXPENSE') THEN (debit_total - credit_total)
        ELSE (credit_total - debit_total)
      END AS net_balance,
      CASE
        WHEN classification IN ('ASSET', 'EXPENSE') THEN
          CASE WHEN (debit_total - credit_total) > 0 THEN 'DEBIT' WHEN (debit_total - credit_total) < 0 THEN 'CREDIT' ELSE 'ZERO' END
        ELSE
          CASE WHEN (credit_total - debit_total) > 0 THEN 'CREDIT' WHEN (credit_total - debit_total) < 0 THEN 'DEBIT' ELSE 'ZERO' END
      END AS balance_type
    FROM account_totals
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'account_id', account_id,
        'account_code', account_code,
        'account_name', account_name,
        'classification', classification,
        'subtype', subtype,
        'currency', currency,
        'debit_total', debit_total,
        'credit_total', credit_total,
        'net_balance', net_balance,
        'balance_type', balance_type,
        'line_count', line_count
      ) ORDER BY account_code ASC
    ), '[]'::jsonb),
    COALESCE(SUM(debit_total), 0),
    COALESCE(SUM(credit_total), 0),
    COALESCE(SUM(CASE WHEN classification = 'ASSET' THEN net_balance ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN classification = 'LIABILITY' THEN net_balance ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN classification = 'EQUITY' THEN net_balance ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN classification = 'REVENUE' THEN net_balance ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN classification = 'EXPENSE' THEN net_balance ELSE 0 END), 0)
  INTO
    v_accounts,
    v_total_debits,
    v_total_credits,
    v_total_assets,
    v_total_liabilities,
    v_total_equity,
    v_total_revenue,
    v_total_expense
  FROM classified_totals;

  RETURN jsonb_build_object(
    'organization_id', p_org_id,
    'period_id', p_period_id,
    'as_of_date', CURRENT_DATE,
    'total_debits', v_total_debits,
    'total_credits', v_total_credits,
    'difference', abs(v_total_debits - v_total_credits),
    'is_balanced', (v_total_debits = v_total_credits),
    'total_assets', v_total_assets,
    'total_liabilities', v_total_liabilities,
    'total_equity', v_total_equity,
    'total_revenue', v_total_revenue,
    'total_expense', v_total_expense,
    'accounts', v_accounts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ledger_balance_summary(uuid, uuid) TO authenticated, service_role;

COMMIT;
