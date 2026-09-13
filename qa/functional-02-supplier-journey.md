# Phase B: Functional QA Audit Report
## Supplier Journey & Portal Operations Evaluation
**Platform:** OTP (Open Trade & Procurement) Platform  
**Target Milestone:** Supplier Journey End-to-End Verification  
**Evaluation Scope:** Registration → Capabilities → Invitation Inbox → Anonymous Bid Review → Clarifications → Sealed Quoting & Revision → Award Acceptance → Work Order Execution → 100% Delivery Sign-off → Invoicing & Settlement → Performance Scorecard  
**Audit Standard:** *"Don't make the user understand OTP. Make OTP help the user accomplish something."*  
**Date:** September 13, 2026  
**Status:** **PASSED (Functional Grade: A+ / Production Ready)**

---

## 1. Executive Functional Scorecard

| Journey Stage | Primary Components & APIs | Functional Status | Anonymity / Security | Defect Severity |
| :--- | :--- | :---: | :---: | :---: |
| **1. Registration & Capabilities** | `SupplierRegisterForm.tsx`, `SupplierCapabilitiesPage.tsx`, `capabilities.ts`, `validateGstin` | **PASS** | High (Multi-tenant RLS isolated) | None |
| **2. Workspace & Inbox** | `SupplierDashboardPage.tsx`, `SupplierInvitationList.tsx`, `use-supplier-invitations.ts`, `rfqs_supplier_masked` | **PASS** | High (Pseudonymous aliasing) | None |
| **3. RFQ Review & Anon Bidding** | `SupplierRfqPage.tsx`, `SupplierRequirementPanel.tsx`, `AttachmentList.tsx` | **PASS** | Strict (Buyer identity protected) | None |
| **4. Clarifications & Q&A** | `ClarificationThread.tsx`, `clarification.ts`, `rfq_clarification_supplier` | **PASS** | Strict (Thread-isolated aliases) | None |
| **5. Sealed Quote & Revision** | `QuoteForm.tsx`, `SupplierQuotePanel.tsx`, `quote-mutations.ts`, `QuickQuotePage.tsx` | **PASS** | Strict (Blind to competitors) | None (Resolved P2) |
| **6. Award & PO Acceptance** | `PurchaseOrderDetailPage.tsx`, `purchase-orders.ts`, `create_purchase_order_from_award` | **PASS** | Post-Award Revealed Contract | None |
| **7. Work Order & Milestones** | `SupplierWorkOrderPage.tsx`, `work-orders.ts`, `DeliveryInspectionPanel.tsx` | **PASS** | Transparent B2B Coordination | None |
| **8. Invoicing & Settlement** | `InvoicePaymentPanel.tsx`, `invoices.ts`, `payments.ts`, `verifyPayment` | **PASS** | Verified UPI/Bank Settlement | None |
| **9. Performance & Reputation** | `SupplierPerformanceSection.tsx`, `fetch-supplier-performance.ts`, `SupplierPerformancePage.tsx` | **PASS** | Verifiable On-Platform Trust | None |

---

## 2. Step-by-Step Functional Journey Trace

### Stage 1: Supplier Registration & Portal Onboarding
* **Entry Routes:** `/signup?side=supplier`, `/seller`, `/supplier`, `/supplier/register`
* **Inputs & Controls:**
  - **Entity Classification Toggle:** `GST_REGISTERED` (Companies, LLPs) vs `MICRO_CONTRACTOR` (Individual service contractors under ₹20L/₹40L statutory GST exemption thresholds).
  - **Dynamic Tax Profiling:** Live GSTIN format verification (`validateGstin`) with automatic business name, registered city, state, and pin code population. Micro-contractor PAN input with statutory threshold guidance.
  - **Service Taxonomy:** Multi-category picker (`fetchServiceCategories`).
  - **Notification Channels:** Selection of WhatsApp, SMS, or Email verification channel with automated onboarding dispatch.
* **Backend RPC / State Mutation:**
  - Calls `submitSignupRequest` with side `'SUPPLIER'`. Inserts into `suppliers` and `supplier_users` tables.
* **Capabilities & Service Radius (`/supplier/capabilities`):**
  - **Capabilities Catalog:** Declarations with capacity metrics and units (`supplier_capabilities` table). Enforced unique constraint (`23505`) prevents duplicate rows.
  - **Service Geographies:** Addition of city, 6-digit postal code, and travel radius in kilometers (`supplier_service_areas` table).
  - **GST Verification RPC:** `verify_supplier_gstin` verifies taxpayer identity and awards the official `✓ VERIFIED TAXPAYER` badge.

---

### Stage 2: Supplier Workspace & Invitation Inbox
* **Entry Route:** `/dashboard` (automatically routes suppliers via `HomePage.tsx` -> `SupplierDashboardPage.tsx`).
* **Header & Quick Stats Ribbon:**
  - Real-time rating badge: `⭐ ratingAvg / 5.0 Rating` with platform reputation indicator.
  - Neutral Anonymity indicator tag.
  - Direct quick navigation buttons: `Active POs →` and `Capabilities →`.
* **Action Required Alert Ribbon:**
  - `⚡ Action Required: Purchase Orders Awaiting Acceptance` displays pending PO number, requirement title, contract value, and `⚡ Accept PO →` button.
* **4-Column Seller KPI Ribbon:**
  1. *New RFQ Invites* (triggers filter tab `ACTION_REQUIRED`)
  2. *Active Quotes* (triggers filter tab `EVALUATING`)
  3. *In Execution* (deep-links to active purchase orders)
  4. *Completed* (deep-links to completed/settled purchase orders)
* **Filter Tabs:**
  - `ALL`, `ACTION_REQUIRED` (Quote), `EVALUATING` (Submitted), `AWARDED`, `PO_ISSUED` (Work Orders), `SETTLED`, `STALLED` (>24h stale invitation detector), `CANCELLED_LOST`.
* **Data Ingestion:**
  - `SupplierInvitationList.tsx` queries `rfqs_supplier_masked` view.
  - Renders requirement title, public reference (`RFQ-XXXXXX`), buyer display name ("Identity protected"), supplier's pseudonymous alias (`Supplier QK7T`), and deadline formatted in IST.

---

### Stage 3: RFQ Review & Anonymous Bid Ingestion
* **Entry Route:** `/supplier/rfq/:rfqId` (`SupplierRfqPage.tsx`)
* **Neutral Anonymity Guarantees:**
  - Supplier views buyer scope, technical specifications, and delivery city while buyer organizational name is shielded under "Identity protected".
  - Supplier views only their own alias (`Supplier QK7T`) and their own quote snapshot; competitors' identities and bid numbers are completely omitted from client SQL payloads.
* **Buyer Reliability & Trust Score:**
  - Displays `⭐ Buyer Reliability Score: 96% (VERIFIED PRIME)` indicating verified on-platform payment and settlement history.
* **Specification & Document Ingestion:**
  - `SupplierRequirementPanel.tsx` displays custom attribute dictionaries, delivery timelines (`timing(rfq)`), fulfillment logistics mode, and transparent evaluation weights (`Price 50%`, `Delivery 30%`, `Warranty 20%`).
  - `AttachmentList.tsx` renders technical drawings, BOQs, and customer specifications.

---

### Stage 4: Clarifications & Q&A (Supplier Perspective)
* **Lifecycle Phase:** Active when RFQ status is in `CLARIFICATION`.
* **Component:** `ClarificationThread.tsx` (via `fetchClarificationMessagesForSupplier`).
* **Data Flow:**
  - Reads from `rfq_clarification_supplier` view (isolated per RFQ and `invitation_id`).
  - Supplier posts inquiries without revealing corporate identity; buyer receives inquiries tagged with the supplier's anonymous alias.
  - Supports bidirectional negotiation and technical clarifications prior to final quote locking.

---

### Stage 5: Sealed Quote Formulation & Revision
* **Components:** `QuoteForm.tsx`, `SupplierQuotePanel.tsx`, `quote-mutations.ts`, `QuickQuotePage.tsx`.
* **Commercial Inputs:**
  - **Mode 1 (Fast):** "⚡ 1-Tap All-Inclusive Price" allows entering a total gross deal amount with auto-calculated tax and base separation.
  - **Mode 2 (Itemized):** Base Unit Price + Indian GST Slabs (0% Exempt, 5% Basic, 12% Construction, 18% Standard, 28% Heavy) + Freight/Packaging.
* **Non-Price Commitments:**
  - 1-Tap delivery turnaround chips (Tomorrow 1d, 3 Days, 1 Week, 15 Days, Custom).
  - 1-Tap warranty chips (None, 6 Months, 1 Year, 2 Years, Custom).
  - Commercial terms and inclusions textarea.
* **Technical Quotation Attachments:**
  - `AttachmentUploader` with metadata stripping; buyer sees uploaded attachments as anonymized "Document 1".
* **Quote Mutations & Gating:**
  - `submitSupplierQuote`: Verifies RFQ is `OPEN`, writes initial version (v1) to `quotes` and `quote_versions`, updates invitation status to `QUOTED`.
  - `reviseSupplierQuote`: Allows revisions while RFQ is `OPEN` or in `CLARIFICATION`, increments `current_version`, appends immutable snapshot to `quote_versions`, and resets evaluation score.
  - `finalizeSupplierQuote`: Locks quote status to `FINAL` for governance evaluation.
* **Mobile WhatsApp/SMS Quoting (`QuickQuotePage.tsx`):**
  - Instant token-based quote submission (`/q/:token`) without login requirements. Optimized for sub-360px mobile viewports with 44px+ tap targets.

---

### Stage 6: Award Notification & Purchase Order Acceptance
* **Trigger:** Buyer awards requirement via `create_purchase_order_from_award` RPC.
* **Supplier Notification:** High-visibility banner on Supplier Workspace and list status badge `⚡ AWARDED TO YOU · PO ISSUED`.
* **Contract Reveal & Detail View (`PurchaseOrderDetailPage.tsx`):**
  - Direct B2B Commercial Contract terms revealed:
    - **Bill To (Buyer Org):** Legal name, GSTIN (for ITC claim), contact person, phone, email, delivery site address.
    - **Issued To (Supplier):** Legal business name, verified GSTIN, contact details.
* **PO Acceptance Action:**
  - Supplier clicks `⚡ Accept PO`. Calls `updatePurchaseOrderStatus('ACCEPTED')`, stamping `acknowledged_at`.
  - Automatically triggers `createWorkOrder` / `initialize_work_order` to initialize milestone fulfillment tracking.

---

### Stage 7: Work Order Execution & Milestone Progress Reporting
* **Pages:** `/supplier/purchase-orders/:poId` and `/supplier/work-orders/:woId` (`SupplierWorkOrderPage.tsx`).
* **Progress Slider & Milestone Reporting:**
  - Interactive buttons: `25% (Started)` → `50% (In Progress)` → `75% (Near End)` → `100% (Done)`.
  - Calls `updateWorkOrderProgress`, updating status (`IN_PROGRESS` → `COMPLETED`) and recording `completed_at`.
* **Mutual Delivery & Quality Inspection:**
  - Marking 100% completion alerts the buyer for formal physical inspection.
  - `DeliveryInspectionPanel.tsx` enforces mandatory 1–5 star rating, observation check items, and review notes before inspection sign-off (`acceptDeliveryInspection`).

---

### Stage 8: Invoicing & Payment Settlement Confirmation
* **Component:** `InvoicePaymentPanel.tsx`
* **Gated Sequence:**
  - Invoice submission is locked until the buyer acknowledges 100% delivery inspection sign-off.
  - Supplier enters Invoice Number and Amount (prefilled from PO total) → calls `submitInvoice`.
  - Buyer reviews and approves (`approveInvoice`), then records payment method (UPI / Bank Transfer) and transaction reference (`recordPayment`).
  - Buyer verifies payment (`verifyPayment`), executing an automated 5-tier entity state cascade:
    1. `payments.status` → `'VERIFIED'`
    2. `invoices.status` → `'PAID'`
    3. `work_orders.status` → `'COMPLETED'`
    4. `purchase_orders.status` → `'COMPLETED'`
    5. `requirements.status` → `'COMPLETED'`
* **Settlement Banner:** Displays `🏁 Transaction Verified & Settled · ✓ 7. SETTLED` confirming direct B2B settlement completion.

---

### Stage 9: Performance Metrics & Reputation
* **Components:** `fetchSupplierPerformance.ts`, `SupplierPerformanceSection.tsx`, `SupplierPerformancePage.tsx`.
* **Performance Indicators:**
  - Overall Merit Score: Computed average star rating (e.g. `⭐ 4.9 / 5.0`).
  - Order Metrics: Completed jobs count, on-time delivery percentage, total verified reviews.
  - Star Histogram: Breakdown across 5, 4, 3, 2, 1 star tiers.
  - Verified Buyer Reviews Feed: Real-time list of reviews showing PO number, RFQ scope, rating, and inspection observations.
  - Continuous Improvement Guide: Explains how verified ratings prioritize supplier discovery matching and boost committee evaluation scoring.

---

## 3. Edge Cases & Error Handling Evaluation

| Edge Case Scenario | System Behavior & Protection | Validation Result |
| :--- | :--- | :---: |
| **Quote submission after deadline** | Database trigger `quote_versions_quoting_window` rejects with exception `The quoting deadline for this enquiry has passed`. | **PASS** |
| **Quote revision while RFQ is OPEN** | Client RPC `reviseSupplierQuote` and phase engine allow updating preliminary quotes before deadline. | **PASS** (Resolved) |
| **Quote revision after window closure** | Revisions blocked once RFQ transitions to `EVALUATING` or `CLOSED`. | **PASS** |
| **Invalid or Malformed GSTIN** | `validateGstin` regex and checksum validation flags invalid length/format before submission. | **PASS** |
| **Duplicate Capability Declaration** | Unique constraint `(supplier_id, capability_id)` returns error code `23505` handled gracefully in UI. | **PASS** |
| **Direct Invite Idempotency** | `invite_direct_supplier` normalizes phone numbers and emails, returning `reused: true` without creating duplicate records. | **PASS** |
| **Invoice Submission Before Delivery** | `InvoicePaymentPanel` disables invoice form until `workOrder.buyerAcceptedAt` is present. | **PASS** |
| **Missing PO / Work Order Route** | Fallback component `PoRouteErrorFallback` renders clear error state with retry and return buttons. | **PASS** |
| **Deep Link Routing (/supplier, /supplier/register)** | Explicit route aliases redirect gracefully to signup or dashboard based on session state. | **PASS** (Added) |

---

## 4. Data Integrity & Neutral Anonymity Verification

1. **SQL View Layer Masking (`rfqs_supplier_masked` / `rfqs_supplier_blind`):**
   - Verified that buyer organization IDs, corporate email domains, and buyer identity details are hidden behind `'Identity protected'` during quoting and evaluation phases.
2. **Competitor Data Isolation:**
   - Multi-tenant RLS policies on `quotes` and `quote_versions` strictly restrict SELECT queries to `supplier_id = current_supplier_id()`. Suppliers can never inspect rival quote numbers, aliases, or commercial terms.
3. **Immutable Version Auditing:**
   - Database triggers `quote_versions_no_update` and `quote_versions_no_delete` prevent tampering with submitted quote histories.
4. **Post-Award Transparent Contracting:**
   - Upon PO issuance and acceptance, both parties' GST compliance information is verified and surfaced for seamless GST Input Tax Credit (ITC) claiming and direct settlement.

---

## 5. Identified Polish Items & Fixes Applied

| ID | Priority | Description | Resolution / Status |
| :--- | :---: | :--- | :--- |
| **FIX-01** | **P2** | `reviseSupplierQuote` previously allowed revisions only during `CLARIFICATION`, causing initial quotes submitted in `OPEN` phase to fail revision when edited before deadline. | **FIXED:** Updated `quote-mutations.ts` to allow revisions during both `OPEN` and `CLARIFICATION`, matching UI state. |
| **FIX-02** | **P2** | External bookmarks or navigation to `/supplier` or `/supplier/register` fell through to wildcard landing page. | **FIXED:** Added explicit route redirects in `App.tsx` (`/supplier`, `/supplier/register`, `/supplier/onboarding`). |
| **ENH-01** | **P3** | Real-time tax split calculation in `QuoteForm.tsx` auto-updates base amount and GST amounts for Indian GST slabs (0%, 5%, 12%, 18%, 28%). | **VERIFIED:** Working seamlessly in both itemized and 1-tap modes. |

---

## 6. Final Functional Verdict for Supplier Journey

* **Functional Health:** **100% OPERATIONAL**
* **Lifecycle Integrity:** **VERIFIED** across all 9 milestone phases from registration to final settlement.
* **Neutral Anonymity:** **STRICT & UNCOMPROMISED**
* **Mobile Usability:** **EXCELLENT** (sub-360px support, large touch targets, 1-tap quick quote).
* **Verdict:** **READY FOR DEPLOYMENT / SIGN-OFF**
