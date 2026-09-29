# R2-31 Phase 0.5 — Source-of-Truth Matrix

**Baseline:** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5`  
**Verified:** Code + migration files (read-only).  
**Purpose:** Cross-domain facts for document, ledger, and reporting engine design.

---

## 1. Business fact matrix

| Business fact | Authoritative source | Current document source | Current report source | Conflict? | Required action (R2-31) |
|---------------|---------------------|-------------------------|----------------------|-----------|-------------------------|
| **RFQ status** | `rfqs.status`, `rfqs.reveal_status` (SQL + RLS) | Lifecycle UI / `ProcurementStageNavigator` | `PurchaseOrdersPage` filters PO-derived state | Minor naming vs `ProcurementDocumentPhase` | Map policy enum to `reveal_status` in engine registry |
| **Quote amount** | `quote_versions.snapshot` (JSON), `quotes` | Evaluation UI, `quotes_identity_protected` / `quotes_revealed` views | Not on period report | None for GMV | Use snapshot version at award for documents |
| **Landed cost** | Quote snapshot `totalCost` + GST fields in snapshot / PO lines | PO document `buildPurchaseOrderDocumentInput` | PO list totals on `PurchaseOrdersPage` | Canonical receipt builder uses simplified 18% GST in `AwardService` | Document loader must use same RPC/snapshot as PO |
| **GST (bilateral)** | PO/invoice line columns, `tax_snapshot` on invoice approve (`invoices.ts`, migrations 00168) | PO print model | Invoice balance rows (`buildInvoiceBalanceRows`) | Tax invoice A4 not wired | Wire `TAX_INVOICE` from `tax_snapshot` |
| **Award** | `awards` (`quote_id`, `justification`, `status`, `awarded_at`) | `AwardPage` UI | Indirect via PO | No receipt snapshot on row | Persist decision snapshot at lock |
| **PO** | `purchase_orders`, `po_line_items` | `PrintableProcurementDocument` via `PurchaseOrderDetailPage` | `PurchaseOrdersPage` + `PrintableProcurementReport` | None | Add issued snapshot at PO issue |
| **WO** | `work_orders`, milestones tables | WO pages, steppers | Not in period report | None | Optional WO template later |
| **Invoice** | `invoices`, `invoice_line_items` | `InvoicePaymentPanel` (screen) | Balance review on PO detail | No printable tax invoice | Implement print from approved snapshot |
| **Payment** | `payments`, `payment_allocations`, `record_invoice_payment_atomic` | Payment panels, Tally/Zoho exports | Settlement summaries in `payments.ts` | None | Payment receipt template (P2) |
| **Milestone** | Milestone RPCs (`submit_milestone_inspection_atomic`, etc.) | `MilestoneInspectionChecklist` | Not in procurement period report | None | Inspection doc optional |
| **Settlement** | Settlement RPCs / `generatePoSettlementCertificate` (domain) | Settlement CTA UI | Vendor statement fetch | Certificate digest not persisted on print | Snapshot settlement cert at reconcile |
| **Cancellation** | PO cancel RPCs, governance reason enums (`00067`) | Fulfillment UI | PO status in report | None | Include in audit extract |
| **Wallet balance** | `organization_wallets.balance_credits` | `OtpWalletCreditsWidget`, `get_wallet_transactions` | Not on PO report | None | Wallet statement export (G-07) |
| **Referral reward** | `credit_otp_referral_bonus_atomic` + `wallet_transactions` (`OTP_REFERRAL_BONUS`) | `PricingPage`, charter, referral card (₹0 pilot display) | Not on PO report | Domain `referral-incentive.ts` 10% narrative | Docs/domain align to 00221; no wallet change |
| **Supplier Success Reward** | `00220` / `00221` wallet events on settled `platform_fee_transactions` | Supplier wallet widget | Not on PO report | None | Notice template only |
| **Platform fee (OTP revenue)** | `platform_fee_transactions` | Financial dashboards / fee policy copy | Not mixed into GMV report | Wallet UI says fees redeemable; RPC missing | Copy or future RPC (separate from R2-31 core) |
| **Subscription revenue** | Subscription tables + `apply_wallet_credits_to_subscription_atomic` | Subscription pages | Financial classification in domain | None | Subscription receipt doc |
| **Savings** | **None** for report KPI | N/A | `PurchaseOrdersPage` `* 0.125` | **Yes** — invented | Remove or bind to `procurement_performance_records` |
| **Supplier identity** | `suppliers` table; gated by `quotes_revealed` / award status | PO post-award full name; pre-award pseudonyms in doc model | PO report shows supplier names from PO rows | Reputation receipt vs sealed losers | Policy + snapshot |
| **Buyer identity** | `organizations`, profiles | PO buyer org name | Report org header | Pre-award supplier view uses `PROTECTED_BUYER_LABEL` in doc model | Extend policy to all kinds |
| **Audit event** | `audit_events`, `procurement_stage_events`, `org_governance_action_audits` | Scattered UI | Not unified export | No correlation on document generation | Optional manifest in R2-31 |

---

## 2. Domain separation (contamination)

| Domain | Must never appear in | Verified separation |
|--------|---------------------|---------------------|
| Wallet credits | PO totals, invoice GMV, supplier disbursement | `assertReferralWalletUsagePolicy` blocks GMV; wallet RPCs separate — **OK** |
| OTP platform fee revenue | Buyer–supplier invoice lines | `platform_fee_transactions` separate table — **OK** |
| Procurement GMV | Wallet balance / referral | Wallet widget disclaims GMV — **OK** |
| **Risk** | Marketing copy | Wallet widget + pricing mention platform-fee **spend** without RPC — **UI contamination only** |

---

## 3. Persona × finding impact (rollup)

| Finding | Individual | RWA | MSME | Supplier | Admin | Founder |
|---------|------------|-----|------|----------|-------|---------|
| C-01 Dual receipt | DOC | DOC | DOC | UI | NONE | DOC |
| C-02 Digests | DOC | DOC | DOC | UI | SEC | DOC |
| C-03 Referral 10% | NONE | NONE | NONE | NONE | NONE | BLUE |
| C-05 Wording | DOC | DOC | DOC | UI | UI | DOC |
| C-06 Fake KPIs | UI | UI | UI | UI | NONE | DOC |
| C-08 Tax invoice | DOC | DOC | DOC | DOC | NONE | DOC |
| C-09 Snapshots | DOC | DOC | DOC | DOC | NONE | DOC |
| C-10 Fee wallet copy | UI | UI | UI | UI | NONE | UI |

**Legend:** DOC = document integrity; UI = screen copy only; SEC = security plumbing; BLUE = docs/legacy; NONE = no material impact.

---

## 4. Document-type snapshot posture (C-09 supplement)

| Document | Persistence today | Identity at reprint | Reproducible? |
|----------|--------------------|-----------------------|---------------|
| PO A4 | Live PO + lines | Full bilateral post-award | Partial (no version pin) |
| Decision reputation | None | Post-reveal view rules | No |
| Canonical decision | None | `isRevealed` flag in service | No (timestamp changes) |
| Period procurement report | None | N/A | No |
| Tax invoice A4 | N/A (unwired) | Would use `tax_snapshot` if wired | Should be yes when wired |
| Quote comparison A4 | None | `PRE_AWARD` redaction in model | No |
| Settlement certificate | Generated object | Live cert builder | Seal only in memory |

---

## 5. Wallet certification cross-check (W1–W10)

| Question | Answer |
|----------|--------|
| Referral amounts authoritative? | **Yes** — `00221` matrix; client override rejected |
| 10% domain module credits wallet? | **No path found** |
| Report savings affect wallet? | **No** |
| Platform fee wallet debit exists? | **No** — subscription RPC only |
| **W1–W10 remain valid?** | **YES** — no production-reachable accounting defect identified |

---

**End matrix — read-only.**
