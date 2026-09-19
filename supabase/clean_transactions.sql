-- =============================================================================
-- OTP Authoritative Transactional Purge Script
-- Comprehensive reset across all Phase 1-6 transactional tables.
-- Preserves canonical users, organizations, suppliers, categories, and chart of accounts.
-- =============================================================================

TRUNCATE TABLE 
  -- Phase 5D & 6 Ledger, Wallets, Rewards, Scorecards, Contracts & Disputes
  public.account_balance_snapshots,
  public.journal_lines,
  public.journal_entries,
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
  public.notification_dispatch_queue,

  -- Phase 5A-5C Settlements, TDS, Change Orders, Bank Reconciliations, Platform Fees
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
  public.purchase_order_line_items,

  -- Phase 1-4 Orders, Invoices, Payments, Milestones, Inspections, POs, Awards
  public.payments,
  public.delivery_inspections,
  public.work_order_milestones,
  public.invoices,
  public.work_orders,
  public.purchase_orders,
  public.procurement_performance_records,
  public.awards,

  -- Evaluations, Votes, Quotes, RFQs, Requirements
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
  public.requirements,

  -- Communications, Channels, Sessions, Tickets, Signups
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
  public.signup_requests
CASCADE;

-- Reset Organization Wallet balances to 0.00
UPDATE public.organization_wallets
SET balance_credits = 0.00,
    status = 'ACTIVE',
    updated_at = now();
