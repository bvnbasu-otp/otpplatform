# R2-31 — Gap & Contradiction Register

**Baseline:** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5`  
**Pass:** Discovery only — contradictions recorded, **not fixed**.

---

## Contradiction register

| ID | Evidence | Source | Severity | Recommended resolution |
|----|----------|--------|----------|------------------------|
| **C-01** | Two decision receipts: (1) `buildDecisionReceipt` + `quotes_revealed` reputation narrative; (2) `buildCanonicalDecisionReceipt` HMAC + governance fields. Award/Reveal pages use (1); `DecisionReceiptCard` + A4 `DECISION_RECEIPT` expect (2). | CODE: `apps/web/src/features/reveal/types/decision-receipt.ts` vs `packages/domain/src/types/decision-receipt.ts`; `AwardPage` imports `DecisionReceipt` not `DecisionReceiptCard` | **P0** | Single product definition: canonical receipt is legal/governance proof; reputation block becomes optional section. Wire one builder at award lock; deprecate duplicate hash in `pdf-generator.ts`. |
| **C-02** | `computeReceiptAuditHash` hashes `rfqPublicRef\|winnerBusinessName\|amount\|awardedAt` (Web Crypto SHA-256). Canonical receipt uses `computeDeterministicHmac` over structured JSON with salt `OTP-DECISION-RECEIPT-INTEGRITY-SALT-2026`. | CODE: `pdf-generator.ts` vs `decision-receipt.ts` | **P1** | Verification reference must cite canonical HMAC only; remove or gate legacy helper from user-visible “verification”. |
| **C-03** | `referral-incentive.ts` documents **10% of first subscription payment** and 30-day qualification. Production wallet referral uses **flat INR matrix** by referred profile (`00221`). | CODE `packages/domain/src/types/referral-incentive.ts` vs MIGRATION `00221` | **P1** | Mark subscription-percent module as legacy/pilot; single server matrix in docs and domain exports (`persona-wallet.ts` already closer). |
| **C-04** | `persona-wallet.ts` comment: “production SQL ceiling 00220 credits flat ₹100 for supplier referral” while user/production ceiling is **00221** tiered buyer referral + supplier rules. | CODE comment vs MIGRATION `00221` | **P2** | Update comment in implementation pass; discovery documents 00221 as authoritative for hosted DB. |
| **C-05** | Public/docs language: “digital signature”, “bilateral digital signatures”, “AUDIT SEALED” (historical). Code provides **HMAC integrity digests** and print layouts — not DSC/eSign statutory workflow. | CODE `decision-receipt.ts`, `contract-agreement.ts`; docs `09-MODULE-FEATURE-SPECIFICATIONS.md` §2.3 | **P1** | UI/PDF labels: “Verification digest (integrity check)” — never “legal signature”. |
| **C-06** | `PurchaseOrdersPage` sets `estimatedSavings: Math.round(totalAmount * 0.125)` and `complianceScorePercent: 100` — not derived from audit data. Violates “do not manufacture report facts.” | CODE: `apps/web/src/features/fulfillment/pages/PurchaseOrdersPage.tsx` | **P0** | Remove or replace with nullable metrics backed by `procurement_performance_records` or hide until computed. |
| **C-07** | `ProcurementDocumentPhase` uses `PRE_AWARD` / `POST_AWARD`; DB uses `rfq_reveal_status`, award `PENDING_REVEAL` / `REVEALED`, cancellation stages `POST_AWARD_PRE_REVEAL` / `POST_REVEAL_PRE_PO`. | CODE + MIGRATION `00067` | **P2** | Map document policy to `rfq_reveal_status` + viewer persona; alias names in one enum. |
| **C-08** | Tax invoice **template** exists (`TAX_INVOICE`) but invoice detail UI has **no** `PrintableProcurementDocument` wiring (unlike PO). Marketing/GST copy implies statutory invoices. | CODE search; `procurement-document.test.tsx` only | **P1** | Wire invoice print from frozen `tax_snapshot` or mark “provisional summary — not statutory e-invoice”. |
| **C-09** | No `awards` column or table stores `cryptographicAuditHash` or receipt snapshot JSON at lock time — reveal later changes visible supplier fields on regenerated PDFs. | NOT FOUND in migrations for award receipt persistence; `awards` columns in `00002` | **P0** | Persist immutable snapshot at `lock_and_reveal_award_atomic` (future migration) or store `document_snapshots` keyed by receiptId. |
| **C-10** | Wallet spend: product rules say subscription **and platform fee**; only `apply_wallet_credits_to_subscription_atomic` found. | CODE grep; `00181` | **P1** | Implement `apply_wallet_credits_to_platform_fee_atomic` or correct public copy to subscription-only. |

---

## Gap register (non-contradiction)

| ID | Gap | Evidence | Severity |
|----|-----|----------|----------|
| **G-01** | Unified document engine route/service layer | Reporting feature is folder-local, not a named engine | P2 |
| **G-02** | Server-side PDF bytes | Only browser print (CODE) | P3 |
| **G-03** | Online verification endpoint for digest | NOT FOUND | P2 |
| **G-04** | `DecisionReceiptCard` not on Award/Evaluation/Reveal pages | CODE import graph | P1 |
| **G-05** | Quote comparison A4 from live evaluation data | Model only | P2 |
| **G-06** | WO / milestone printable artifacts | NOT FOUND | P2 |
| **G-07** | Wallet statement export | RPC exists, export ABSENT | P2 |
| **G-08** | Three-ledger reconciliation report (GMV vs OTP revenue vs wallet) | Domain separation exists; combined report NOT FOUND | P1 |
| **G-09** | e-invoice / GSP integration | NOT FOUND | P2 (compliance) |
| **G-10** | `document_snapshots` / issuance registry | NOT FOUND | P0 (pairs with C-09) |

---

## Documentation vs code (LOCAL ONLY / INFERENCE)

| Claim location | Claim | Code reality |
|----------------|-------|--------------|
| `docs/09-MODULE-FEATURE-SPECIFICATIONS.md` | Step 11 signed contract PDF snapshot | `procurement_contracts` + hashes; PDF snapshot **NOT FOUND** |
| `OTP Golden Reconstruction/R2-31-32-Issue-Root-Cause-Remediation-Report.md` | PO + report A4 fixed; decision receipt print deferred | Still accurate at c444df6 |
| F5 target architecture | “Generates immutable, signed DecisionReceipt PDF snapshot” | INFERENCE — **not implemented** as persisted snapshot |

---

**No remediation in this pass.**
