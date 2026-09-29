# R2-31 Phase 1 — File Impact Map

**Baseline:** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5`  
**Legend:** MUST CHANGE · SHOULD CHANGE · SAFE NO CHANGE · DELETE/RETIRE · NEW FILES

No stylistic-only edits. **Phase 1 created only the eight `R2-31-PHASE1-*.md` files.**

---

## MUST CHANGE (implementation)

| Path | Reason |
|------|--------|
| `apps/web/src/features/award/pages/AwardPage.tsx` | Wire canonical receipt + A4; copy C-05 |
| `apps/web/src/features/reveal/pages/SupplierRevealPage.tsx` | Same |
| `apps/web/src/features/evaluation/components/EvaluationDecisionCockpit.tsx` | Same |
| `apps/web/src/features/reveal/components/DecisionReceiptCard.tsx` | Integrity labels C-05 |
| `apps/web/src/features/reveal/components/DecisionReceipt.tsx` | Demote to appendix; copy |
| `apps/web/src/features/reporting/lib/procurement-document.ts` | Policy helper, footer wording, canonical bridge |
| `apps/web/src/features/reporting/components/PrintableProcurementDocument.tsx` | Footer Document ID / page labels if not in model |
| `apps/web/src/features/fulfillment/pages/PurchaseOrdersPage.tsx` | Remove C-06 fake KPIs |
| `apps/web/src/features/reporting/types/reporting.ts` | Remove or nullable savings/compliance types |
| `apps/web/src/features/reporting/components/AnalyticsCards.tsx` | Remove KPI cards |
| `apps/web/src/features/fulfillment/pages/PurchaseOrderDetailPage.tsx` | Optional: load snapshot for reprint (Phase B) |
| `apps/web/src/features/fulfillment/lib/po-document.ts` | Snapshot-aware input |
| **NEW** `apps/web/src/features/fulfillment/lib/invoice-document.ts` | Tax invoice → `ProcurementDocumentInput` |
| **NEW** `apps/web/src/features/reporting/lib/canonical-decision-receipt-document.ts` | Bridge domain → A4 |
| **NEW** `apps/web/src/features/reporting/api/fetch-issued-snapshot.ts` | Phase B |
| `packages/services/src/services/award-service.ts` | Stable receipt build at lock; snapshot hook |
| `supabase/migrations/00222_*.sql` | **Future operator release only** — not in Phase 1 |

---

## SHOULD CHANGE

| Path | Reason |
|------|--------|
| `apps/web/src/features/reporting/lib/pdf-generator.ts` | Deprecate user-facing legacy hash |
| `apps/web/src/features/subscription/components/OtpWalletCreditsWidget.tsx` | C-10 copy |
| `apps/web/src/features/governance/lib/organization-charter.ts` | C-10 platform fee wording |
| `packages/domain/src/types/referral-incentive.ts` | C-03 pilot header (no logic change to 00221) |
| `apps/web/src/pages/DashboardPage.tsx` | Remove stale 10% comment |
| `apps/web/src/pages/SupplierDashboardPage.tsx` | Remove stale 10% comment |
| `apps/web/src/features/reveal/types/decision-receipt.ts` | Document non-canonical |
| `apps/web/src/features/reporting/procurement-document.test.tsx` | New cases |
| `apps/web/src/features/fulfillment/po-document.test.ts` | Snapshot fixture |
| **NEW** `apps/web/src/features/fulfillment/invoice-document.test.ts` | C-08 |
| **NEW** `tests/security/issued-document-snapshot-rls.test.ts` | Phase B |

---

## SAFE NO CHANGE

| Path | Reason |
|------|--------|
| `supabase/migrations/00221_otp_referral_bonus_profile_matrix.sql` | Locked matrix |
| `supabase/migrations/00220_supplier_wallet_ledger_events.sql` | Supplier wallet rules |
| `packages/domain/src/types/persona-wallet.ts` | Already aligned to matrix |
| `apps/web/src/features/reporting/components/PrintableProcurementReport.tsx` | No fake KPIs |
| `packages/domain/src/accounting/*` | GMV ledger separate |
| `packages/domain/src/types/financial-settlement-controls.ts` | Settlement domain |
| ONDC / external adapter paths | Out of scope |
| `apps/web/src/lib/brand.ts` | Brand constants sufficient |

---

## DELETE / RETIRE

| Path | Reason |
|------|--------|
| None mandatory | Prefer deprecate over delete for `computeReceiptAuditHash` and web `buildDecisionReceipt` |

---

## NEW FILES (implementation — beyond Phase 1 docs)

| Path | Purpose |
|------|---------|
| `00222_issued_document_snapshots.sql` | Only when approved — design in SCHEMA doc |
| `fetch-issued-snapshot.ts` | Client loader |
| `invoice-document.ts` | Invoice print bridge |
| Wallet statement builder (TBD path under `reporting/`) | Phase C |

---

## Phase 1 artifacts (this pass only)

| Path | Status |
|------|--------|
| `OTP Golden Reconstruction/R2-31/R2-31-PHASE1-ARCHITECTURE.md` | **Created** |
| `OTP Golden Reconstruction/R2-31/R2-31-PHASE1-IMPLEMENTATION-PLAN.md` | **Created** |
| `OTP Golden Reconstruction/R2-31/R2-31-PHASE1-SCHEMA-DESIGN.md` | **Created** |
| `OTP Golden Reconstruction/R2-31/R2-31-PHASE1-DOCUMENT-TAXONOMY.md` | **Created** |
| `OTP Golden Reconstruction/R2-31/R2-31-PHASE1-VISIBILITY-MATRIX.md` | **Created** |
| `OTP Golden Reconstruction/R2-31/R2-31-PHASE1-TEST-STRATEGY.md` | **Created** |
| `OTP Golden Reconstruction/R2-31/R2-31-PHASE1-FILE-IMPACT.md` | **Created** |
| `OTP Golden Reconstruction/R2-31/R2-31-PHASE1-DECISIONS.md` | **Created** |

---

**End file impact map.**
