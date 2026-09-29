# R2-31 — Document, Ledger & Reporting Engine — Forensic Discovery

**Baseline commit (read-only):** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5`  
**Production migration ceiling (external):** `00221` applied — not re-verified in this pass.  
**Hosted site (reference):** https://otpplatform-theta.vercel.app  
**Pass scope:** Discovery and architecture only. **NO CODE / MIGRATION / COMMIT / DEPLOY.**

**Evidence classes used:** `CODE`, `MIGRATION FILE`, `LOCAL ONLY`, `NOT FOUND`, `INFERENCE`.

**Working tree note:** Uncommitted edits exist in `AwardPage.tsx`, `DecisionReceiptCard.tsx`, `SiteLayout.tsx`, `SiteHeader.tsx` (copy/layout only). They do not change document engine behavior; baseline behavior below is **committed** `c444df6`.

---

## 1. Executive summary

OTP already has **three separable financial planes** in schema and domain (`procurement/GMV`, `OTP revenue` via `platform_fee_transactions`, `wallet/incentives` via `organization_wallets` / `wallet_transactions`), plus a **procurement stage event** append-only trail and a **double-entry** `journal_entries` / `ledger_accounts` stack. Printable output is **partially unified** through `buildProcurementDocumentModel` + `PrintableProcurementDocument` for **purchase orders** and a **period procurement report**, but **decision receipts**, **tax invoices**, and **quote comparisons** still rely on screen UI or `window.print()` without canonical snapshot persistence. **Two decision-receipt models** coexist: reputation narrative (`apps/web` `buildDecisionReceipt`) vs institutional canonical (`@otp/domain` `buildCanonicalDecisionReceipt`). Identity phases are enforced in SQL/views (`quotes_identity_protected`, `quotes_revealed`, `rfq.reveal_status`) but **document snapshot immutability on reveal is NOT FOUND** in persistence.

---

## 2. Discovery inventory (required)

| Area | Existing implementation | Authoritative source | Missing | Risk |
|------|-------------------------|----------------------|---------|------|
| **RFQ** | Requirements/RFQs tables; publish flows; `procurement_stage_events`; monitoring APIs | `supabase/migrations/00148_strict_linear_15_step_procurement_pipeline.sql`, `apps/web/src/features/rfq/` | Printable RFQ pack; server-side document snapshot at publish | P2 — buyers see UI only |
| **Quote** | `quotes`, sealed submission; views `quotes_identity_protected`, `quotes_blind`; supplier magic link `/q/:token` | `supabase/migrations/00136_fix_quotes_identity_protected_and_award_po_flow.sql`, `00178_phase6_group2_edge_and_adapters.sql` | Formal quote PDF to supplier; pre-award quote certificate | P2 |
| **Evaluation** | `EvaluationDecisionCockpit`; `fetch-quote-evaluations.ts`; scores in DB | `apps/web/src/features/evaluation/` | Export/evaluation report template wired to `procurement-document` | P2 |
| **Award** | `awards` table; `lock_and_reveal_award_atomic`; `AwardPage` | `supabase/migrations/00216_verified_remediation_p0_p1_security_integrity.sql`, `apps/web/src/features/award/` | Persisted canonical receipt JSON/hash on award row | **P1** — historical proof |
| **Decision Receipt** | **(A)** UI reputation receipt `DecisionReceipt` + `fetchDecisionReceipt` from `quotes_revealed`; **(B)** `CanonicalDecisionReceipt` + `DecisionReceiptCard` (tests only on pages); **(C)** `ProcurementDocumentKind` `DECISION_RECEIPT` model | (A) `apps/web/src/features/reveal/`; (B) `packages/domain/src/types/decision-receipt.ts`, `packages/services/src/services/award-service.ts`; (C) `apps/web/src/features/reporting/lib/procurement-document.ts` | Single user-facing canonical A4; wire `DecisionReceiptCard`; snapshot at award time | **P0** — split brain |
| **PO** | `purchase_orders`, line items, GST columns; **A4 print** via `buildPurchaseOrderDocumentInput` → `PrintableProcurementDocument` | `apps/web/src/features/fulfillment/pages/PurchaseOrderDetailPage.tsx`, `fulfillment/lib/po-document.ts` | Invoice-linked PO variants; archived PO revision history on PDF | P2 |
| **WO** | `work_orders`, milestones, inspections RPCs | `00002_core_tables.sql`, `00182_phase6_group5_communications_milestones_disputes.sql`, `MilestoneInspectionChecklist.tsx` | WO printable template | P2 |
| **Invoice** | `invoices`, `invoice_line_items`, GST freeze triggers (`00168`) | `supabase/migrations/00167_*`, `00168_phase5b_statutory_gst_and_tax_splitting.sql` | **TAX_INVOICE** A4 wired from invoice detail (model exists, UI **NOT FOUND**) | **P1** — statutory gap vs marketing |
| **Payment** | `payments`, allocations (`00169`), vouchers (`00172`); client exports | `apps/web/src/features/fulfillment/api/payments.ts` | Unified payment receipt PDF shell | P2 |
| **Milestone** | `submit_milestone_inspection_atomic`, `approve_milestone_inspection_atomic` | `00182`, `MilestoneInspectionChecklist.tsx` | Inspection sign-off document | P2 |
| **Settlement** | PO settlement RPCs; `generatePoSettlementCertificate` (domain + web API) | `00171`–`00175`, `packages/domain/src/types/financial-settlement-controls.ts`, `payments.ts` | Downloadable settlement PDF using A4 shell | P2 |
| **Procurement ledger** | `journal_entries`, `journal_entry_lines`, `ledger_accounts`; `get_ledger_balance_summary` | `supabase/migrations/00176_phase5d_double_entry_financial_ledger.sql`, `packages/domain/src/accounting/` | Buyer-facing GMV ledger statement template | P2 |
| **Wallet ledger** | `organization_wallets`, `wallet_transactions` (immutable); `get_wallet_transactions` | `00181_phase6_group4_wallet_and_rewards.sql`, `00220`, `00221` | Wallet statement export; platform-fee wallet spend RPC **NOT FOUND** (subscription only in `apply_wallet_credits_to_subscription_atomic`) | **P1** if product promises fee pay-by-wallet |
| **OTP revenue** | `platform_fee_transactions`, `platform_fee_policies`; fee RPCs in `00174` | `00174_phase5c5_settlement_execution_fees_and_reconciliation.sql` | OTP revenue report view + printable fee schedule | P2 |
| **GST/tax** | PO/invoice line GST columns; `tax_snapshot` jsonb; triggers on approve | `00168` (MIGRATION FILE) | **Legal tax invoice** status not asserted in app; GSP/e-invoice **NOT FOUND** | **P1** compliance claim gap |
| **TDS** | `tds_deductions`; `apply_tds_withholding_atomic`; domain `tds-calculator.ts` | `00173_phase5c4_tds_change_orders_and_reconciliation.sql` | Form 16A / statutory TDS certificate template **NOT FOUND** | P2 |
| **Referral** | `credit_otp_referral_bonus_atomic` profile matrix (`00221`); domain matrix in `persona-wallet.ts` | `00221_otp_referral_bonus_profile_matrix.sql` | Align domain `referral-incentive.ts` (10% subscription rule) with wallet matrix | **P1** contradiction |
| **Supplier fee** | `platform_fee_transactions`; supplier wallet success reward on `SETTLED` fee | `00174`, `00220_supplier_wallet_ledger_events.sql` | Fee invoice document to supplier | P2 |
| **Audit** | `audit_events`; `org_governance_action_audits`; `procurement_stage_events` | `00002_core_tables.sql`, `00197`, `00201` | Correlation ID on all document generations **NOT FOUND** | P2 |
| **Identity reveal** | `rfq_reveal_status`, `lock_and_reveal_award_atomic`, `quotes_revealed` view with `security_barrier` | `00178`, `00216`, `00196` | `PRE_REVEAL`/`POST_REVEAL` document policy object in code (partial: `ProcurementDocumentPhase`) | **P1** snapshot rule |
| **PDF** | Browser print CSS; **no** server PDF library in repo | `PrintableProcurementDocument.tsx`, `pdf-generator.ts` (`triggerPrintDialog` only) | True PDF bytes generation | P3 — acceptable if print-to-PDF |
| **Print** | PO + period report use `print:` hidden blocks; Award/Reveal use raw `window.print()` | `PurchaseOrderDetailPage.tsx`, `AwardPage.tsx`, `SupplierRevealPage.tsx` | Consistent A4 shell on all doc types | P2 |
| **Reports** | `PurchaseOrdersPage` analytics + `PrintableProcurementReport`; in-memory perf test | `apps/web/src/features/reporting/` | Dedicated `/reports` route **NOT FOUND** | P2 |
| **Verification** | HMAC hash on canonical receipt; `verifyDecisionReceiptIntegrity`; simpler SHA-256 in `pdf-generator.ts` for legacy receipt data | `decision-receipt.ts`, `pdf-receipt.test.ts` | Single verification reference registry; online verify endpoint **NOT FOUND** | **P1** |

---

## 3. Document & print surfaces (CODE)

| Artifact | Path | Status |
|----------|------|--------|
| A4 document model (4 kinds) | `apps/web/src/features/reporting/lib/procurement-document.ts` — `ProcurementDocumentKind`: `PURCHASE_ORDER`, `TAX_INVOICE`, `QUOTE_COMPARISON`, `DECISION_RECEIPT` | CODE |
| A4 renderer | `apps/web/src/features/reporting/components/PrintableProcurementDocument.tsx` | CODE |
| PO print wiring | `PurchaseOrderDetailPage.tsx` + `buildPurchaseOrderDocumentInput` | CODE |
| Period report print | `PrintableProcurementReport.tsx` + `PurchaseOrdersPage.tsx` | CODE |
| Legacy print helper | `apps/web/src/features/reporting/lib/pdf-generator.ts` — `triggerPrintDialog`, `computeReceiptAuditHash` | CODE |
| Reputation decision receipt UI | `DecisionReceipt.tsx`, `fetch-decision-receipt.ts` | CODE |
| Canonical receipt UI component | `DecisionReceiptCard.tsx` — **not imported by production pages** (only tests) | CODE |
| Institutional receipt builder (service) | `packages/services/src/services/award-service.ts` → `buildCanonicalDecisionReceipt` | CODE |

---

## 4. Ledger & event tables (MIGRATION FILE)

| Domain | Tables / views | Migration anchor |
|--------|----------------|------------------|
| Procurement timeline | `procurement_stage_events` | `00148` |
| GMV / double-entry | `ledger_accounts`, `journal_entries`, `journal_entry_lines` | `00176` |
| Payments & settlement | `payments`, `payment_allocations`, `settlements`, `credit_debit_notes` | `00169`–`00175` |
| TDS | `tds_deductions` | `00173` |
| OTP platform fee | `platform_fee_transactions` | `00174` |
| Wallet | `organization_wallets`, `wallet_transactions`, `buyer_reward_allocations` | `00181`, `00220`, `00221` |
| Audit | `audit_events`, `org_governance_action_audits` | `00002`, `00197` |
| Identity | `quotes_identity_protected`, `quotes_revealed` | `00136`, `00178` |
| Contracts | `procurement_contracts` | `00183` |
| ERP exports | `erp_export_manifests` | `00175` |

---

## 5. Wallet economics (committed + production ceiling; not redesigned)

| Persona | Credits (authoritative in SQL at 00221) | Evidence |
|---------|----------------------------------------|----------|
| Buyer | Success Cashback via `buyer_reward_allocations` + `credit_buyer_reward_on_settled_fee_atomic` (`00216`); Referral via `credit_otp_referral_bonus_atomic` | MIGRATION FILE |
| Supplier | Referral `SUPPLIER_REFERRAL_BONUS` / `OTP_REFERRAL_BONUS`; Success `SUPPLIER_SUCCESS_REWARD` on `SETTLED` `platform_fee_transactions` | `00220`, `00221` |
| Spend | `apply_wallet_credits_to_subscription_atomic` only (CODE + `00181`) | Platform fee wallet debit **NOT FOUND** |

Referral amounts (production per user constraint): Individual ₹10, RWA ₹25, MSME ₹50, Supplier ₹100 — `private.otp_referral_bonus_inr` in `00221`.

---

## 6. Identity phases

| Concept | Implementation | Evidence |
|---------|----------------|----------|
| Pre-award pseudonyms | `supplierPseudonym`, `PROTECTED_BUYER_LABEL`; `phase: PRE_AWARD` in document model | CODE `procurement-document.ts` |
| Reveal gate | `rfq.reveal_status`, `awards.status`, `lock_and_reveal_award_atomic` | MIGRATION FILE |
| Governance stages | `POST_AWARD_PRE_REVEAL`, `POST_REVEAL_PRE_PO` cancellation reasons | `00067_governance_p2_exit_reasons_and_buyer_scoring.sql` |
| **PRE_REVEAL / POST_REVEAL enum for documents** | Partial via `PRE_AWARD` / `POST_AWARD` only | INFERENCE — not 1:1 with reveal enum |

---

## 7. Document taxonomy (40 types)

**Source note:** No file in the repo enumerates “40 document types” (NOT FOUND). The table below is an **INFERENCE** catalog from constitution §22–23, F5 journey, module specs, and code surfaces — classified for engine planning.

| # | Document / output | Class | Wired today (c444df6) |
|---|-------------------|-------|------------------------|
| 1 | Requirement / RFQ summary | report view | ABSENT |
| 2 | Supplier invitation / magic link notice | NOT IN PRODUCT / GAP | messaging only |
| 3 | Sealed quote submission acknowledgement | NOT IN PRODUCT / GAP | |
| 4 | Quote comparison (pre-award) | template | model only (`QUOTE_COMPARISON`) |
| 5 | Evaluation scorecard export | export | ABSENT |
| 6 | Committee vote tally | report view | `WeightedTallyTable` UI |
| 7 | Award lock confirmation | report view | `AwardPage` UI |
| 8 | Reputation decision receipt | report view | `DecisionReceipt` + `window.print` |
| 9 | Institutional decision receipt (canonical) | template | domain + card; **not on pages** |
| 10 | Decision receipt A4 | template | `DECISION_RECEIPT` kind; **not wired** |
| 11 | Procurement contract (Step 11) | template | `procurement_contracts` + `contract-agreement.ts`; no print UI |
| 12 | Purchase order | template | **wired** |
| 13 | Work order schedule | report view | WO pages |
| 14 | Milestone inspection record | statement | RPC; no PDF |
| 15 | Delivery acceptance certificate | NOT IN PRODUCT / GAP | |
| 16 | Tax invoice (bilateral) | template | model only |
| 17 | Payment receipt | export | Tally/Zoho JSON/XML |
| 18 | PO settlement certificate | statement | `generatePoSettlementCertificate` |
| 19 | TDS deduction statement | statement | DB row; no printable |
| 20 | Debit note | statement | `credit_debit_notes` |
| 21 | Credit note | statement | same |
| 22 | Change order | statement | `00173`; UI partial |
| 23 | PO reconciliation summary | report view | RPCs in payments API |
| 24 | Platform fee assessment (OTP revenue) | statement | `platform_fee_transactions` |
| 25 | Buyer success cashback credit | statement | wallet tx + allocation |
| 26 | Referral bonus credit notice | statement | wallet tx |
| 27 | Supplier success reward notice | statement | `00220` event |
| 28 | Buyer wallet statement | statement | `get_wallet_transactions`; no export |
| 29 | Supplier wallet statement | statement | persona via `resolveWalletOrganizationId` |
| 30 | Subscription receipt | statement | subscription module |
| 31 | ERP export manifest | export | `erp_export_manifests` |
| 32 | Tally journal XML | export | `tally-xml-exporter.ts` |
| 33 | Tally payment voucher | export | `exportTallyPaymentVoucherXml` |
| 34 | Zoho Books JSON | export | `zoho-json-exporter.ts` |
| 35 | Zoho payment receipt JSON | export | `exportZohoPaymentReceiptJson` |
| 36 | Period procurement report | template | **wired** (`PrintableProcurementReport`) |
| 37 | Organization ledger trial balance | export | `get_ledger_balance_summary` |
| 38 | Audit event extract | export | admin tooling |
| 39 | Governance succession audit | export | `org_governance_action_audits` |
| 40 | Verification digest reference sheet | template | hash fields only; no registry |

---

## 8. Tests touching documents (CODE)

- `apps/web/src/features/reporting/procurement-document.test.tsx` — A4 model + PO page integration assertions  
- `apps/web/src/features/fulfillment/po-document.test.ts`  
- `apps/web/src/features/reveal/pdf-receipt.test.ts` — legacy SHA-256 helper  
- `packages/domain/src/types/decision-receipt.test.ts`  
- `apps/web/src/features/reveal/decision-receipt-card.test.tsx`, `award/decision-receipt-card.test.tsx`  
- Financial: `tests/security/financial-settlement-controls-redteam.test.ts`  

---

## 9. Dirty working tree (LOCAL ONLY)

| File | Nature |
|------|--------|
| `AwardPage.tsx` | Label text: committee vs buyer justification |
| `DecisionReceiptCard.tsx` | Removed “PA-09” from MSME label |
| `SiteLayout.tsx` / `SiteHeader.tsx` | Chrome/layout |

Does not affect committed document engine behavior.

---

**End of forensic discovery — no implementation in this pass.**
