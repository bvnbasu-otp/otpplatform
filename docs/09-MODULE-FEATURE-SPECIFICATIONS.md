# 09. Comprehensive Feature Specifications by Module

## 1. Module 1: Super Admin Console (`/admin`)

The Super Admin Console is the operational command center for cross-tenant governance, lifecycle diagnostics, and platform maintenance. It provides platform administrators with real-time visibility, troubleshooting toolkits, and safe remediation RPCs.

### 1.1 8-State Canonical Order Telemetry & Lifecycle Management
Orders are managed and monitored across **8 canonical procurement lifecycle states**:
- `DRAFT`: Requirement created, intake specifications being drafted.
- `QUOTING`: Sourcing window open; sealed quotes submitted by invited suppliers.
- `EVALUATING`: Sourcing closed; quotes identity-protected for committee review and voting.
- `AWARDED`: Winning quote selected and approved; mutual identity reveal triggered.
- `PO_ISSUED`: Formal Purchase Order issued; awaiting supplier acceptance.
- `INVOICED`: Delivery milestones completed; tax invoice submitted by supplier.
- `SETTLED`: Payment verified by buyer; order automatically marked as fully settled.
- `STALLED`: Order halted due to missing quorum, SLA breach, or unaccepted PO (>24 hours).

**Key Capabilities:**
- **Buyer Orders Ledger (`/admin?tab=transactions`)**: Filterable by all 8 states, organization, and date range. Displays real-time state badges, requirement budgets, sealed quote counts, and active PO links.
- **Seller Orders Ledger (`/admin?tab=seller_orders`)**: Real-time supplier fulfillment tracker showing quoting activity, milestone completion, inspection signoffs, and invoice payment statuses.
- **Real-Time Telemetry Stream**: Live event bus logging state changes, quote submissions, committee votes, and automated settlement triggers.

### 1.2 SQL Query Terminal (`/admin?tab=terminal`)
An in-console PostgreSQL diagnostic console equipped with safe read-only execution and 6 one-click operational presets:
1. **Stalled Order Diagnostics**:
   - Query: `WHERE state = 'STALLED' OR updatedAt < NOW() - INTERVAL '24 HOURS'`
   - Identifies stalled background workers, overdue vendor responses, and blocked approval gates.
2. **Quote Submission Integrity (QUOTING / EVALUATING)**:
   - Compares sealed quote counts against buyer visibility to detect draft quotes or encryption payload locks.
3. **Awarding & Lock Verification (AWARDED / PO_ISSUED)**:
   - Verifies winning quote selection validity, PO creation timestamps, and missing supplier acceptance flags.
4. **PO Acceptance & Delivery Tracking (PO_ISSUED / INVOICED)**:
   - Inspects supplier acceptance status, work order milestones, and delivery inspection schedules.
5. **Invoice Settlement Audit (INVOICED / SETTLED)**:
   - Audits tax invoices against purchase orders, payment verification flags, and automatic settlement transitions.
6. **Orphaned Records & Data Integrity Scan**:
   - Detects quotes without parent RFQs, purchase orders without requirements, or unassigned invitations.

### 1.3 Deep Troubleshooting & Remediation Toolkits
- **Buyer Troubleshooter (`/admin?tab=buyer_debug`)**:
  - **Force State Transition**: Safely advances or resets an order stuck in background processing via `admin_force_transition_order_state` with mandatory audit logging.
  - **Bypass Approval Gate**: Bypasses stalled committee voting or quorum locks via `admin_bypass_approval_gate` with platform admin justification.
  - **Toggle GST Compliance**: Overrides GSTIN verification and tax exemption flags for buying organizations via `admin_toggle_entity_gst_compliance`.
- **Seller Troubleshooter (`/admin?tab=supplier_debug`)**:
  - **Unblock Sealed Quote**: Clears encryption locks and unsubmitted states via `admin_unblock_sealed_quote`.
  - **Simulate PO Acceptance**: Manually registers supplier acceptance when webhook callbacks fail via `admin_simulate_po_acceptance`.
  - **Retry Payment Webhook**: Retries failed payment webhooks via `admin_retry_invoice_payment_webhook`, automatically transitioning orders to `SETTLED`.

### 1.4 Central Support Ticket Management (`/admin?tab=tickets`)
A centralized customer support hub linking user-submitted feedback directly to platform operations:
- **Mobile-Optimized Help Button Modal (`SupportHelpButtonModal.tsx`)**:
  - Floating trigger button present on all screens.
  - Centered mobile sheet preventing keyboard zoom issues (`text-sm sm:text-xs`).
  - Supports 5 ticket categories: `BUG`, `FEATURE`, `SALES`, `OPS`, `ENHANCEMENT`.
- **Primary Superadmin Dispatch (`bvnbasu@gmail.com`)**:
  - All tickets automatically route notifications and email alerts to primary superadmin `bvnbasu@gmail.com`.
  - Immediate in-app notification recorded in `notifications` table (`channel = 'IN_APP'`, `status = 'PENDING'`).
  - Tamper-evident entry logged in `audit_events`.
- **Admin Support Console**:
  - Filter chips for ticket status (`ALL`, `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`) and categories.
  - Resolution modal enabling administrators to record internal remediation notes and close tickets with timestamped audit entries.

### 1.5 System Diagnostics, Test Center & Service Actions
- **System Health (`/admin?tab=health`)**: Real-time probes for PostgreSQL latency, table record counts, audit chain integrity, Kong gateway, and WAHA WhatsApp session.
- **Service Actions Panel (`/admin?tab=actions`)**: One-click execution of administrative routines (Kong restart, WAHA restart, database vacuum, mode-aware transaction purge).
- **Pre-Production Test Center (`/admin?tab=tests`)**: Complete master regression matrix (631 tests across 12 layers) with an interactive 25-test live database test runner.

---

## 2. Module 2: Buyer Portal (`/requirements`, `/rfq`)

Designed for procurement managers, facility secretaries, and institutional buyers:

### 2.1 Dual-Track Intake Wizards
- **Fast Track (2-Step)**: Category selection, Indian Standards quantity unit, budget range, and immediate RFQ dispatch.
- **Full Governance (4-Step)**: AI/rule-based NLP parsing of requirement text, compliance document uploads, custom evaluation weight assignment (60/30/10), and committee assignment.

### 2.2 Identity-Protected Comparison Room
- **Sealed Supplier Proposals**: Quotes displayed side-by-side with pseudonyms (`Supplier 7X4M`).
- **Normalized Spec Comparison**: Compares warranty terms, delivery timelines, and unit rates against Indian Standards baselines.
- **Bi-Directional Clarification Thread**: Chat with suppliers through masked channels without exposing buyer or seller contact details.

### 2.3 Committee Voting & Decision Enforcement
- **Conflict-of-Interest Signoff**: Mandatory declaration before viewing quote details.
- **Quorum-Protected Balloting**: Tally board tracks committee participation; prevents unilateral award decisions.
- **Award Justification Gate**: Requires institutional justification text exceeding character minimums.
- **Purchase Order & Decision Receipt**: Automatic generation of binding PO and cryptographic audit certificate upon award.

---

## 3. Module 3: Supplier Portal (`/supplier`)

Designed for commercial vendors and contractors:

### 3.1 RFQ Invitation & Quoting Desk
- **Inbound Invitations**: Real-time notifications of new RFQs matching supplier capabilities.
- **Sealed Proposal Builder**: Structured quote submission form with line-item pricing, GST breakdown, HSN codes, and delivery schedules.
- **Milestone Payment Schedules**: Propose staged payment terms (e.g., 30% advance, 50% on delivery, 20% on signoff).

### 3.2 Masked Clarifications & Outcome Transparency
- **Private Clarification Thread**: Ask questions directly to the buying committee without revealing identity.
- **Automated Closeout Notices**: Transparent outcome status (`WON` or `NOT_SELECTED`) received immediately upon award lock.
- **Work Orders & Invoicing**: Post-award tracking of delivery milestones, work order signoffs, and invoice submission.

---

## 4. Cross-Platform Experience & Navigation Architecture

### 4.1 Universal OTP Logo Redirection
- **Behavior**: Clicking the OTP logo anywhere in the application (`SiteHeader.tsx`, `AppLayout.tsx`, `LegalPage.tsx`) navigates strictly to `/` (Home page).
- **Public & Guest Visitors**: Delivered directly to the public landing page with product overview, architecture diagrams, and authentication entry points.
- **Authenticated Users**: Navigated directly to `/` without forced auto-redirects, allowing users to review landing page content, explore public materials, or switch context.

### 4.2 Authenticated Home Page State
- When a logged-in user visits `/`:
  - **Session Status Badge**: Displays an active session chip (`Signed in as user@example.com`).
  - **Quick Dashboard Navigation**: Provides high-visibility "Go to Dashboard" CTA buttons in the desktop header, hero section, mobile navigation drawer, and footer.
  - **Zero Disruption**: Never loops or traps the user in redirect cycles.

