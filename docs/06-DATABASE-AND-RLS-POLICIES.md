# 06. Database Schema, Migrations & Row-Level Security (RLS)

## 1. Database Architecture & Applied Migrations

The OTP database runs on **PostgreSQL 15** with **155 applied production migrations** located in `supabase/migrations/`.

### Migration Progression Overview:
- `00001 - 00015`: Foundation schema, user profiles, organizations, and multi-tenant member roles.
- `00016 - 00030`: Core procurement entities (requirements, RFQs, quotes, awards, purchase orders).
- `00031 - 00050`: Identity protection engine, cryptographic alias generation, band-rounded scoring, and mutual reveal gates.
- `00051 - 00075`: Zero-cost messaging channels, WhatsApp notification dispatchers, and clarification threads.
- `00076 - 00095`: Fulfillment tracking, delivery inspections, work orders, invoices, and payments.
- `00096 - 00110`: Superadmin telemetry RPCs, live pre-production test runner, and network stubs.
- `00111 - 00115`: Domain supplier standardization, real Superadmin seeding (`bvnbasu@gmail.com`), canonical procurement vocabulary purge (`00114`), and benchmark RWA organization seeding (`00115`).
- `00116 - 00120`: Admin mark-as-read RPCs (`00116`), canonical identity-protected views (`00117`), WhatsApp self-service password reset (`00118`), demo discovery overloads (`00119`), and canonical discovery engine restore (`00120`).
- `00121 - 00125`: Multi-user organization hierarchy & context switching (`00121`), signup active org sync (`00122`), superadmin pure role isolation (`00123`), clean production reset & transaction purge (`00124`), production data preservation & staging gate (`00125`).
- `00126 - 00135`: Admin orders join deduplication (`00126`), member invite RPCs (`00127`), demo vs production admin mode data isolation (`00128`), safe transactional record purge (`00129`), mode-aware audit logs & notifications purge (`00130`-`00132`), admin snapshots schema fix (`00133`), audit trail mode logging (`00134`), clean ASCII notifications & RPC templates (`00135`).
- `00136 - 00140`: Identity-protected quotes & award-to-PO flow fix (`00136`), discovery anti-leak policy fix (`00137`), contact supplier login seed & onboarding (`00138`), admin operations & 8-state troubleshooting suite (`00139`), centralized support ticket routing & notification to primary admin `bvnbasu@gmail.com` (`00140`).
- `00141 - 00149`: Staging gate verification certificate tracking, schema cache refresh triggers, and audit event indexing.
- `00150`: Cryptographic webhook payment settlement (`record_verified_payment` RPC) for Razorpay and Stripe with unique constraint on `gateway_event_id`.
- `00151`: Consolidated atomic award, reveal, and purchase order transaction (`lock_and_reveal_award_atomic` RPC) with `SELECT FOR UPDATE` row-level locks.
- `00152`: Platform SuperAdmin whitelist & PostgreSQL immutable role trigger (`private_security.admin_whitelist` table, `enforce_superadmin_immutability` trigger).
- `00153`: Sliding-window API rate limiting engine (`check_and_increment_rate_limit` RPC, `api_rate_limits` table with composite indexes).
- `00154`: Composite B-Tree performance indexes (`purchase_orders`, `quotes`, `rfqs`, `invoices`, `payments`) and spend analytics RPC (`get_organization_spend_analytics`).
- `00155`: Outbound notification exponential backoff retry queue (`messaging_events` retry columns, `record_notification_failure_with_backoff` RPC).
- `00156`: Mutual Buyer & Supplier Identity Reveal on PO Issuance & Tax Compliance (`organizations_select` RLS bilateral visibility for awarded suppliers, `lock_and_reveal_award_atomic` complete buyer tax and legal payload for GST ITC eligibility under CGST Section 16).

---

## 2. Core Entity Tables & Schema

| Table Name | Primary Key | Key Foreign Keys | Purpose |
| :--- | :--- | :--- | :--- |
| `organizations` | `id` (UUID) | — | Purchasing entity (RWA, Society, Enterprise, MSME) with `gst_verified` and `tax_exempt` flags. |
| `organization_members` | `id` (UUID) | `organization_id`, `profile_id` | User memberships with roles (`OWNER`, `MANAGER`, `BUYER`, `COMMITTEE_MEMBER`). |
| `profiles` | `id` (UUID) | `auth_user_id` ➔ `auth.users` | Application user profiles, platform superadmin flags. |
| `suppliers` | `id` (UUID) | — | Registered commercial vendors, GSTIN, PAN, verification tier, domain capabilities. |
| `supplier_users` | `id` (UUID) | `supplier_id`, `profile_id` | Authenticated logins tied to a supplier. |
| `requirements` | `id` (UUID) | `organization_id`, `created_by` | Procurement specifications, estimated budget, Indian Standards units. |
| `rfqs` | `id` (UUID) | `requirement_id`, `organization_id` | Sourcing window, phase state machine, alias salt, reveal status. |
| `rfq_invitations` | `id` (UUID) | `rfq_id`, `supplier_id` | Supplier dispatch, stores per-RFQ `anonymous_label` (`Supplier 7X4M`). |
| `quotes` | `id` (UUID) | `rfq_id`, `supplier_id`, `invitation_id`| Sealed commercial quotation, unit rates, taxes, delivery days. |
| `committee_votes` | `id` (UUID) | `rfq_id`, `profile_id`, `quote_id` | Immutable committee ballots, technical scores, justification. |
| `awards` | `id` (UUID) | `rfq_id`, `quote_id`, `awarded_by` | Irrevocable award decision, commercial commitment record. |
| `purchase_orders` | `id` (UUID) | `rfq_id`, `award_id`, `supplier_id` | Binding purchase contract, PO reference number, settlement terms. |
| `work_orders` | `id` (UUID) | `purchase_order_id`, `rfq_id` | Delivery tracking, milestone signoffs, execution records. |
| `delivery_inspections` | `id` (UUID) | `work_order_id`, `inspector_id` | Quality checks, acceptance certifications, photographic proof. |
| `invoices` | `id` (UUID) | `purchase_order_id`, `supplier_id` | Tax invoices, GST breakup, milestone verification. |
| `support_tickets` | `id` (UUID) | `profile_id`, `organization_id` | Central support tickets routed to primary admin `bvnbasu@gmail.com`. |
| `audit_events` | `id` (UUID) | `actor_id`, `organization_id` | Tamper-evident, cryptographically chained audit events. |
| `notifications` | `id` (UUID) | `profile_id` | Multi-channel dispatch records (`WHATSAPP`, `EMAIL`, `IN_APP`). |
| `system_snapshots` | `id` (UUID) | — | Point-in-time state backups and schema restore points. |

---

## 3. Row-Level Security (RLS) Policy Matrix

Row Level Security is enabled on **all 34 tables** in the public schema:

| Table | SELECT Policy | INSERT Policy | UPDATE / DELETE Policy |
| :--- | :--- | :--- | :--- |
| `requirements` | Own organization members only OR Platform Admin | Org Owner / Manager / Buyer | Org Owner / Manager |
| `rfqs` | Own organization members OR Invited Suppliers (via identity-protected view `rfqs_supplier_masked`) | Org Owner / Manager | Org Owner / Manager |
| `quotes` | **RESTRICTED**: Base table accessible ONLY by owning supplier. Buyers access via `quotes_identity_protected` | Owning Supplier while RFQ phase is `QUOTING` | Owning Supplier while in `DRAFT` |
| `quotes_identity_protected` (View) | Buyer organization members & committee | N/A (View) | N/A (View) |
| `committee_votes` | Voters see own vote; aggregate visible via `rfq_vote_tally` | Assigned committee member with valid COI | **IMMUTABLE** (Update/Delete strictly denied) |
| `purchase_orders` | Buyer organization members & Awarded Supplier | Org Manager upon award execution | Org Manager |
| `support_tickets` | Ticket submitter & Platform Admin | Any authenticated user / visitor | Platform Admin only |
| `audit_events` | Platform Admin & Org Members (scoped to own org) | System RPCs / Triggers only | **IMMUTABLE** (Delete strictly gated by admin purge) |

---

## 4. Canonical Identity-Protected Database Views

In compliance with the **Canonical Vocabulary Standard**, all legacy alias views containing deprecated vocabulary (`quotes_blind`, `rfqs_supplier_blind`, `my_quote_outcome`) were permanently purged in migrations `00114` and `00117`. The platform enforces identity protection through two canonical security definer views:

1. `public.quotes_identity_protected`:
   - Strips `supplier_id`, `business_name`, `contact_phone`, `gstin`, and attachment URLs.
   - Replaces identity with cryptographic pseudonym `anonymous_label` (`Supplier 7X4M`).
   - Rounds experience metrics to privacy bands to prevent vendor fingerprinting.
   - Restricts unmasking until mutual reveal occurs post-award signoff.
2. `public.rfqs_supplier_masked`:
   - Allows invited suppliers to see RFQ technical specifications, requirements, and deadlines.
   - Masks competing vendor identities, quote counts, and buyer committee discussions.

---

## 5. Operational & Troubleshooting RPCs (Migrations 00139 & 00140)

PostgreSQL security definer RPCs power real-time operational troubleshooting across all 8 canonical lifecycle states (`DRAFT`, `QUOTING`, `EVALUATING`, `AWARDED`, `PO_ISSUED`, `INVOICED`, `SETTLED`, `STALLED`):

| RPC Name | Parameters | Capabilities |
| :--- | :--- | :--- |
| `admin_force_transition_order_state` | `p_requirement_id`, `p_target_state`, `p_reason` | Manually transitions an order stuck in background processing to any canonical state with mandatory audit logging. |
| `admin_bypass_approval_gate` | `p_requirement_id`, `p_reason` | Advances an order through committee voting or governance locks when committee members are unavailable. |
| `admin_toggle_entity_gst_compliance`| `p_entity_id`, `p_entity_type`, `p_gst_verified`, `p_tax_exempt` | Overrides or updates GSTIN verification and tax exemption flags for organizations or suppliers. |
| `admin_unblock_sealed_quote` | `p_quote_id`, `p_reason` | Clears payload encryption locks or unsubmitted draft states on sealed quotes. |
| `admin_simulate_po_acceptance` | `p_po_id`, `p_reason` | Simulates vendor acceptance for purchase orders when automated acceptance callbacks stall. |
| `admin_retry_invoice_payment_webhook`| `p_invoice_id` | Re-triggers payment verification webhooks, transitioning the order to `SETTLED` upon confirmation. |
| `admin_get_entity_audit_trail` | `p_entity_id`, `p_entity_type` | Retrieves the immutable audit trail and state timeline for any requirement, RFQ, or PO. |
| `admin_get_system_alerts` | — | Scans for stalled orders (>24h without progress), pending webhook retries, and high-priority support tickets. |
| `create_support_ticket` | `p_subject`, `p_description`, `p_category`, `p_contact_email`, `p_contact_phone` | Submits a support ticket, logs an audit event, and dispatches in-app/email alerts to primary superadmin `bvnbasu@gmail.com`. |
| `admin_get_support_tickets` | `p_status_filter`, `p_category_filter`, `p_limit`, `p_offset` | Lists support tickets with filtering by status (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`) and category. |
| `admin_resolve_support_ticket` | `p_ticket_id`, `p_resolution_notes` | Resolves a support ticket with audit trail entry and status update. |

