# 06. Database Schema, Migrations & Row-Level Security (RLS)

## 1. Database Architecture & Applied Migrations

The OTP database runs on **PostgreSQL 15** with **185 applied production migrations** located in `supabase/migrations/` (tracked via `public.otp_schema_migrations`).

### Migration Progression Overview:
- `00001 - 00015`: Foundation schema, user profiles, organizations, and multi-tenant member roles.
- `00016 - 00030`: Core procurement entities (requirements, RFQs, quotes, awards, purchase orders).
- `00031 - 00050`: Identity protection engine, cryptographic alias generation, band-rounded scoring, and mutual reveal gates (`00039` granting public/anon access to `role_catalog`).
- `00051 - 00075`: Zero-cost messaging channels, WhatsApp notification dispatchers, and clarification threads.
- `00076 - 00095`: Fulfillment tracking, delivery inspections, work orders, invoices, and payments.
- `00096 - 00110`: Superadmin telemetry RPCs, live pre-production test runner, and network stubs.
- `00111 - 00125`: Domain supplier standardization, canonical procurement vocabulary purge (`00114`), benchmark RWA organization seeding (`00115`), multi-user org hierarchy (`00121`), superadmin role purity (`00123`), production data preservation & staging gate (`00125`).
- `00126 - 00140`: Admin orders join deduplication (`00126`), member invite RPCs (`00127`), demo vs prod data isolation (`00128`), admin snapshots schema fix (`00133`), award-to-PO flow fix (`00136`), admin 8-state operations & troubleshooting suite (`00139`), centralized support tickets to `bvnbasu@gmail.com` (`00140`).
- `00141 - 00161`: Cryptographic payment settlement (`00150`), atomic award locking RPC (`00151`), platform SuperAdmin whitelist & immutable role trigger (`00152`), sliding-window API rate limiting (`00153`), spend analytics indexes (`00154`), exponential backoff retry queue (`00155`), bilateral buyer/supplier reveal for GST ITC (`00156`), multi-tier signup review (`00161`).
- `00162 - 00166`: Presence heartbeats (`00162`), audit event RLS optimization (`00163`), supplier profile side context (`00164`), superadmin presence visibility (`00165`), buyer auto-approval and free RFQ credits (`00166`).
- `00167 - 00176`: Phase 5 progressive invoicing line items (`00167`), statutory GST and tax splitting (`00168`), payment allocations and partial settlement (`00169`), idempotency & atomic payment allocation RPC (`00170`), cumulative reconciliation & PO settlement (`00171`), payment vouchers & adjustments (`00172`), TDS withholding & change orders (`00173`), settlement execution fees (`00174`), ERP manifests (`00175`), double-entry financial ledger schema & journal rules (`00176`).
- `00177 - 00183`: Phase 6 database hardening (`00177`), edge adapters & retry bridges (`00178`), cross-cutting remediation (`00179`), signup & publish audit fixes (`00180`), wallet and sourcing rewards schema (`00181`), omnichannel communications, milestone inspections, dispute escalation (`00182`), vendor master intelligence (VMI) scorecards, multi-tier enterprise approval matrix, and tamper-evident contracts (`00183`).
- `00184 - 00185`: Phase 7.1 clean state reset and isolation (`00184`), fix `list_org_members` `joined_at` column reference RPC (`00185`). All stored procedures hardened with explicit `SECURITY DEFINER SET search_path = public, private, auth, extensions;`.

---

## 2. Core Entity Tables & Schema

| Table Name | Primary Key | Key Foreign Keys | Purpose |
| :--- | :--- | :--- | :--- |
| `organizations` | `id` (UUID) | — | Purchasing entity (RWA, Society, Enterprise, MSME) with `gst_verified` and `tax_exempt` flags. |
| `organization_members` | `id` (UUID) | `organization_id`, `profile_id` | User memberships with roles (`OWNER`, `MANAGER`, `BUYER`, `COMMITTEE_MEMBER`, `FINANCE_LEAD`). |
| `profiles` | `id` (UUID) | `auth_user_id` ➔ `auth.users` | Application user profiles, platform superadmin flags. |
| `suppliers` | `id` (UUID) | — | Registered commercial vendors, GSTIN, PAN, verification tier, domain capabilities. |
| `supplier_users` | `id` (UUID) | `supplier_id`, `profile_id` | Authenticated logins tied to a supplier. |
| `requirements` | `id` (UUID) | `organization_id`, `created_by` | Procurement specifications, estimated budget, Indian Standards units. |
| `rfqs` | `id` (UUID) | `requirement_id`, `organization_id` | Sourcing window, 15-step linear state, alias salt, reveal status. |
| `rfq_invitations` | `id` (UUID) | `rfq_id`, `supplier_id` | Supplier dispatch, stores per-RFQ `anonymous_label` (`Supplier 7X4M`). |
| `quotes` | `id` (UUID) | `rfq_id`, `supplier_id`, `invitation_id`| Sealed commercial quotation, unit rates, taxes, delivery days. |
| `committee_votes` | `id` (UUID) | `rfq_id`, `profile_id`, `quote_id` | Immutable committee ballots, technical scores, justification. |
| `organization_approval_policies`| `id` (UUID)| `organization_id` | Multi-tier threshold configs (<₹5L, ₹5L–₹25L, >₹25L), anti-bypass rules. |
| `rfq_approval_stages` | `id` (UUID) | `rfq_id`, `organization_id` | Sequential approval stages, approver profile IDs, digital signature hashes. |
| `contract_agreements` | `id` (UUID) | `rfq_id`, `award_id`, `supplier_id` | Step 11 compiled markdown contracts, SHA-256 document checksums, sign-off hashes. |
| `awards` | `id` (UUID) | `rfq_id`, `quote_id`, `awarded_by` | Irrevocable award decision, commercial commitment record. |
| `purchase_orders` | `id` (UUID) | `rfq_id`, `award_id`, `supplier_id` | Binding purchase contract, PO reference number, settlement terms. |
| `work_orders` | `id` (UUID) | `purchase_order_id`, `rfq_id` | Delivery tracking, milestone signoffs, execution records. |
| `work_order_inspections` | `id` (UUID) | `work_order_id`, `milestone_id` | 5-point milestone checklist evaluations, inspector digital sign-off hashes. |
| `disputes` | `id` (UUID) | `organization_id`, `entity_id` | 7-artifact dispute records, 4 severity levels, SLA deadlines, 4-tier escalation. |
| `dispute_events` | `id` (UUID) | `dispute_id`, `actor_id` | Immutable append-only audit trail of dispute comments, status changes, and evidence. |
| `invoices` | `id` (UUID) | `purchase_order_id`, `supplier_id` | Tax invoices, GST breakup, milestone verification. |
| `organization_wallets` | `id` (UUID) | `organization_id` | Wallet balances, 0.10% buyer sourcing reward credits, subscription discounts. |
| `wallet_transactions` | `id` (UUID) | `organization_id`, `wallet_id` | Ledger of reward credits, redemption debits, adjustments, and expiry. |
| `supplier_performance_scorecards`| `id` (UUID)| `supplier_id` | VMI 35/30/20/15 dimensional ratings, overall scores, and performance tiers. |
| `platform_fee_transactions`| `id` (UUID) | `purchase_order_id`, `supplier_id`| 0.50% supplier platform fee calculations, fee statuses, and net settlement tracking. |
| `journal_entries` | `id` (UUID) | `organization_id` | Double-entry accounting vouchers, balanced debits and credits. |
| `support_tickets` | `id` (UUID) | `profile_id`, `organization_id` | Central support tickets routed to primary admin `bvnbasu@gmail.com`. |
| `audit_events` | `id` (UUID) | `actor_id`, `organization_id` | Tamper-evident, cryptographically chained audit events. |
| `notifications` | `id` (UUID) | `profile_id` | Multi-channel dispatch records (`WHATSAPP`, `EMAIL`, `IN_APP`). |
| `notification_dispatch_queue`| `id` (UUID)| `recipient_user_id` | Omnichannel queue items with exponential backoff retries and payload redaction. |

---

## 3. Row-Level Security (RLS) Policy Matrix

Row Level Security is enabled on **all core tables** in the public schema:

| Table | SELECT Policy | INSERT Policy | UPDATE / DELETE Policy |
| :--- | :--- | :--- | :--- |
| `requirements` | Own organization members only OR Platform Admin | Org Owner / Manager / Buyer | Org Owner / Manager |
| `rfqs` | Own organization members OR Invited Suppliers (via identity-protected view `rfqs_supplier_masked`) | Org Owner / Manager | Org Owner / Manager |
| `quotes` | **RESTRICTED**: Base table accessible ONLY by owning supplier. Buyers access via `quotes_identity_protected` | Owning Supplier while RFQ phase is `QUOTING` | Owning Supplier while in `DRAFT` |
| `quotes_identity_protected` (View) | Buyer organization members & committee | N/A (View) | N/A (View) |
| `committee_votes` | Voters see own vote; aggregate visible via `rfq_vote_tally` | Assigned committee member with valid COI | **IMMUTABLE** (Update/Delete strictly denied) |
| `contract_agreements` | Buyer org members & awarded winning supplier | System RPC upon award sign-off | Immutable once signed |
| `work_order_inspections` | Buyer org members & assigned supplier | Designated site inspector | Org Manager / Inspector |
| `disputes` | Buyer org members & counterparty supplier | Any authenticated participant | Assigned arbitrator / Admin |
| `organization_wallets` | Own organization financial leads & Platform Admin | System triggers on settlement | System ledger RPCs only |
| `purchase_orders` | Buyer organization members & Awarded Supplier | Org Manager upon award execution | Org Manager |
| `support_tickets` | Ticket submitter & Platform Admin | Any authenticated user / visitor | Platform Admin only |
| `audit_events` | Platform Admin & Org Members (scoped to own org) | System RPCs / Triggers only | **IMMUTABLE** (Delete strictly gated by admin purge) |

---

## 4. Canonical Identity-Protected Database Views

In compliance with the **Canonical Vocabulary Standard**, all legacy alias views containing deprecated vocabulary were permanently purged in migrations `00114` and `00117`. The platform enforces identity protection through two canonical security definer views:

1. `public.quotes_identity_protected`:
   - Strips `supplier_id`, `business_name`, `contact_phone`, `gstin`, and raw attachment URLs.
   - Replaces identity with cryptographic pseudonym `anonymous_label` (`Supplier 7X4M`).
   - Rounds experience metrics and VMI scorecards to privacy bands to prevent vendor fingerprinting.
   - Restricts unmasking until bilateral reveal occurs post-contract sign-off (Step 12).
2. `public.rfqs_supplier_masked`:
   - Allows invited suppliers to see RFQ technical specifications, requirements, and deadlines.
   - Masks competing vendor identities, quote counts, and buyer committee discussions.

---

## 5. Operational & Troubleshooting RPCs (Migrations 00139, 00140, 00170, 00183, 00185)

PostgreSQL security definer RPCs power real-time operational troubleshooting across all canonical lifecycle states:

| RPC Name | Parameters | Capabilities |
| :--- | :--- | :--- |
| `admin_force_transition_order_state` | `p_requirement_id`, `p_target_state`, `p_reason` | Manually transitions an order stuck in background processing to any canonical state with mandatory audit logging. |
| `admin_bypass_approval_gate` | `p_requirement_id`, `p_reason` | Advances an order through committee voting or governance locks when committee members are unavailable. |
| `admin_toggle_entity_gst_compliance`| `p_entity_id`, `p_entity_type`, `p_gst_verified`, `p_tax_exempt` | Overrides or updates GSTIN verification and tax exemption flags for organizations or suppliers. |
| `admin_unblock_sealed_quote` | `p_quote_id`, `p_reason` | Clears payload encryption locks or unsubmitted draft states on sealed quotes. |
| `admin_simulate_po_acceptance` | `p_po_id`, `p_reason` | Simulates vendor acceptance for purchase orders when automated acceptance callbacks stall. |
| `admin_retry_invoice_payment_webhook`| `p_invoice_id` | Re-triggers payment verification webhooks, transitioning the order to `SETTLED` upon confirmation. |
| `admin_get_entity_audit_trail` | `p_entity_id`, `p_entity_type` | Retrieves the immutable audit trail and state timeline for any requirement, RFQ, PO, or contract. |
| `admin_get_system_alerts` | — | Scans for stalled orders (>24h without progress), pending webhook retries, and high-priority support tickets. |
| `create_support_ticket` | `p_subject`, `p_description`, `p_category`, `p_contact_email`, `p_contact_phone` | Submits a support ticket, logs an audit event, and dispatches alerts to primary superadmin `bvnbasu@gmail.com`. |
| `lock_and_reveal_award_atomic` | `p_rfq_id`, `p_quote_id`, `p_justification`, `p_actor_id` | Atomically locks the award, compiles contract records, and executes bilateral identity unmasking with `SELECT FOR UPDATE`. |
| `record_verified_payment` | `p_invoice_id`, `p_gateway_event_id`, `p_amount`, `p_currency` | Idempotently records payment, updates double-entry ledger, credits buyer wallet rewards, and transitions to `SETTLED`. |
| `list_org_members` (Migration 00185) | `p_organization_id` | Returns organization members ordered by `joined_at` timestamp with caller identity context and RBAC enforcement. |

---

## 6. Financial Ledger Invariants & Double-Entry Verification

Implemented in migrations `00170`–`00176` and domain accounting:
1. **Mathematical Ledger Balancing**: Every financial settlement transaction generates dual balanced debit and credit entries in `journal_entries` and `journal_lines`.
2. **Paise-Exact Mathematical Invariant**:
   $$\text{Gross Invoice Amount} = \text{TDS Withheld} + \text{0.50% Platform Fee} + \text{Net Supplier Settlement}$$
3. **Buyer Reward Allocation**: $0.10\%$ sourcing reward credited to `organization_wallets(balance_credits)` without altering the non-custodial direct settlement flow.
4. **Search Path Hardening**: Every stored procedure and trigger across all 185 migrations explicitly declares:
   ```sql
   SECURITY DEFINER SET search_path = public, private, auth, extensions;
   ```
   This neutralizes search-path hijacking and guarantees 100% tenant isolation across database operations.
