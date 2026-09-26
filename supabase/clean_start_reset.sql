-- =============================================================================
-- OTP PLATFORM — AUTHORITATIVE CLEAN-START TRANSACTIONAL DATABASE RESET
-- Stage R2-27: Referral, Growth, Product Completeness, Data Purity & Fresh-Start Reset
--
-- OPERATING INVARIANTS:
--   1. Migration Ceiling: Strictly locked at 197 migrations. Zero migrations modified.
--   2. Structure & Master Data Preserved:
--      - public.otp_schema_migrations (All 197 migrations intact)
--      - public.categories, public.requirement_categories, master taxonomy
--      - public.ledger_accounts (Double-entry Chart of Accounts)
--      - public.accounting_periods
--      - public.platform_fee_policies, public.organization_approval_policies
--      - public.notification_templates, public.notification_preferences
--      - public.platform_environment_settings
--   3. Transactional & Demo Data Cascaded to Clean 0 Count:
--      - Requirements, RFQs, Invitations, Clarifications, Attachments
--      - Quotes, Quote Versions, Evaluator Scores, Committee Votes, Awards
--      - Purchase Orders, PO Lines, Change Orders, Fee Snapshots
--      - Work Orders, Milestones, Inspections, Inspection Items
--      - Invoices, Invoice Lines, Payments, Allocations, TDS Deductions
--      - Double-Entry Journal Entries, Journal Lines, Balance Snapshots
--      - Buyer Reward Allocations, Wallet Transactions (Org Wallets reset to 0.00)
--      - Disputes, Dispute Evidence, Events, Scorecards, Contracts
--      - Notifications, Dispatch Queue, Messaging, OTPs, Support Tickets
-- =============================================================================

BEGIN;

-- 1. Snapshot capture in admin_database_snapshots prior to purge
INSERT INTO public.admin_database_snapshots (
  id,
  name,
  label,
  snapshot_type,
  records_count,
  table_counts,
  metadata,
  size_bytes,
  created_by
) VALUES (
  gen_random_uuid(),
  'R2-27 Clean Start Pre-Purge Snapshot ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS UTC'),
  'R2-27 Clean Start Pre-Purge Snapshot ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS UTC'),
  'CLEAN_START_PRE_PURGE',
  (
    (SELECT count(*) FROM public.requirements) +
    (SELECT count(*) FROM public.rfqs) +
    (SELECT count(*) FROM public.quotes) +
    (SELECT count(*) FROM public.purchase_orders) +
    (SELECT count(*) FROM public.invoices) +
    (SELECT count(*) FROM public.payments)
  ),
  jsonb_build_object(
    'requirements', (SELECT count(*) FROM public.requirements),
    'rfqs', (SELECT count(*) FROM public.rfqs),
    'quotes', (SELECT count(*) FROM public.quotes),
    'purchase_orders', (SELECT count(*) FROM public.purchase_orders),
    'invoices', (SELECT count(*) FROM public.invoices),
    'payments', (SELECT count(*) FROM public.payments)
  ),
  jsonb_build_object(
    'stage', 'R2-27',
    'reason', 'PRODUCTION_FRESH_START_RESET',
    'timestamp', now()
  ),
  0,
  'superadmin@otp.test'
);

-- 2. Truncate Double-Entry Accounting Ledger (Phase 5D)
TRUNCATE TABLE 
  public.account_balance_snapshots,
  public.journal_lines,
  public.journal_entries
CASCADE;

-- 3. Truncate Commercial Wallets, Rewards, Vendor Intelligence, Contracts & Disputes (Phase 6)
TRUNCATE TABLE 
  public.buyer_reward_allocations,
  public.wallet_transactions,
  public.dispute_events,
  public.dispute_evidence,
  public.disputes,
  public.work_order_inspection_items,
  public.work_order_inspections,
  public.procurement_contracts,
  public.scorecard_dimension_history,
  public.supplier_scorecards,
  public.rfq_approval_stages,
  public.notification_dispatch_queue
CASCADE;

-- Reset Organization Wallets Balance to 0.00
UPDATE public.organization_wallets
SET balance_credits = 0.00,
    status = 'ACTIVE',
    updated_at = now();

-- 4. Truncate Settlements, Reconciliations, TDS, Change Orders, PO Line Items (Phase 5A-5C)
TRUNCATE TABLE 
  public.settlement_exception_events,
  public.settlement_exceptions,
  public.settlement_reconciliations,
  public.erp_export_manifests,
  public.bank_reconciliation_records,
  public.platform_fee_transactions,
  public.po_fee_snapshots,
  public.tds_deductions,
  public.po_change_order_items,
  public.po_change_orders,
  public.credit_debit_notes,
  public.payment_allocations,
  public.invoice_line_items,
  public.purchase_order_line_items
CASCADE;

-- 5. Truncate Fulfillment, Invoices, Payments, Milestones, Inspections, Orders, Awards
TRUNCATE TABLE 
  public.payments,
  public.delivery_inspections,
  public.work_order_milestones,
  public.invoices,
  public.work_orders,
  public.purchase_orders,
  public.procurement_performance_records,
  public.awards
CASCADE;

-- 6. Truncate Dynamic Routing, Market Intelligence Snapshots & Stage Events
TRUNCATE TABLE 
  public.rfq_approval_route_evaluations,
  public.market_intelligence_snapshots,
  public.org_governance_action_audits,
  public.procurement_stage_events,
  public.audit_pings
CASCADE;

-- 7. Truncate Governance, Evaluations, Quotes, RFQs, Requirements
TRUNCATE TABLE 
  public.evaluator_scores,
  public.rfq_evaluation_rounds,
  public.rfq_invited_suppliers,
  public.supplier_evaluations,
  public.committee_votes,
  public.conflict_of_interest_declarations,
  public.committee_assignments,
  public.approval_instances,
  public.quote_evaluations,
  public.quote_versions,
  public.clarification_messages,
  public.rfq_clarification_messages,
  public.rfq_cancellations,
  public.direct_supplier_invites,
  public.rfq_invitations,
  public.quotes,
  public.attachments,
  public.rfqs,
  public.requirements
CASCADE;

-- 8. Truncate Specifications, Communications, Channels, Sessions, Tickets, Signups
TRUNCATE TABLE 
  public.requirement_specifications,
  public.requirement_attachments,
  public.messaging_messages,
  public.messaging_channels,
  public.supplier_messaging_channels,
  public.messaging_events,
  public.messaging_rate_limits,
  public.supplier_quote_sessions,
  public.supplier_notifications,
  public.supplier_magic_links,
  public.support_tickets,
  public.notifications,
  public.password_reset_otps,
  public.signup_verification_otps,
  public.profile_verification_otps,
  public.subscription_payment_logs,
  public.signup_requests
CASCADE;

-- 9. Record Final Clean-Start Audit Event
INSERT INTO public.audit_events (
  event_type,
  entity_type,
  entity_id,
  payload,
  occurred_at
) VALUES (
  'admin.clean_start_reset',
  'DATABASE_RESET',
  gen_random_uuid()::text,
  jsonb_build_object(
    'stage', 'R2-27',
    'status', 'COMPLETED',
    'active_rfqs', 0,
    'active_quotes', 0,
    'active_purchase_orders', 0,
    'active_invoices', 0,
    'active_payments', 0,
    'schema_migrations_count', 197,
    'timestamp', now()
  ),
  now()
);

COMMIT;
