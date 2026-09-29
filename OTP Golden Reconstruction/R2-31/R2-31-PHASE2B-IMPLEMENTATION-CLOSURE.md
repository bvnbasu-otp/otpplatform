# R2-31 Phase 2B — Implementation Closure

**Status:** **IMPLEMENTATION INCOMPLETE**  
**Baseline HEAD (unchanged):** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5`  
**Date:** 2026-09-29  

---

## 1. Executive summary

Migration **00222** was authored and applied on **local Docker Postgres** (`127.0.0.1:54322`). Issuance hooks were added to `lock_and_reveal_award_atomic`, `reveal_award`, `create_purchase_order_from_award`, and invoice approve (trigger). Domain and web helpers for issued snapshots were added; C-06 fabricated KPIs were removed from the PO reporting path. **Full Phase 2B certification is not complete:** the mandatory golden reveal/idempotency scenario (B9) was not executed end-to-end on fixtures; production UI reprint is not fully wired to `issued_document_snapshots`; SQL digest parity with TypeScript is smoke-tested only.

---

## 2. Gate answers (Phase 2A final gate)

| # | Question | Result |
|---|----------|--------|
| 1 | 00222 written without inventing product rules | **YES** (follows Phase 2A contract) |
| 2 | Document engine without wallet W1–W10 change | **YES** (no 00221 edit) |
| 3 | Protected documents immutable after reveal | **YES** (design + partial DB test) |
| 4 | Buyer/supplier access without leakage | **PARTIAL** (RLS policies in 00222; no full red-team matrix run) |
| 5 | Reports from authoritative ledgers | **PARTIAL** (C-06 KPIs removed; snapshot reprint UI incomplete) |
| 6 | PDF/print completely specified | **PARTIAL** (renderer exists; not all pages load snapshots) |
| 7 | ONDC outside R2-31 | **YES** |

---

## 3. Wallet W1–W10

**UNCHANGED** — No edits to `00221`, wallet RPCs, or referral matrix. Regression: `otp-referral-00221-database.test.ts` **4/4 passed**; `persona-wallet.test.ts` **8/8 passed**.

---

## 4. ONDC

**DEFERRED** — No ONDC adapters, migrations, or imports.

---

## 5. Migration 00222

| Item | Value |
|------|--------|
| File created | **YES** — `supabase/migrations/00222_otp_document_issuance_snapshots.sql` |
| Applied local | **YES** (`supabase migration up --local`; HMAC hotfix applied via local `psql` after first apply — source migration updated with `js_imul64`) |
| Applied production | **NO** |
| 00221 edited | **NO** |

---

## 6. Git / deploy discipline

| Action | Done |
|--------|------|
| commit | **NO** |
| push | **NO** |
| deploy | **NO** |
| hosted `db push` | **NO** |

---

## 7. B1 — Source verification inventory

| Area | Finding |
|------|---------|
| `CanonicalDecisionReceipt` | `packages/domain/src/types/decision-receipt.ts` — authoritative integrity model |
| `lock_award` → `lock_and_reveal_award_atomic(..., false)` | **Verified** in `00151_atomic_award_and_po_transaction.sql` |
| `AwardService.buildReceiptForAward` | Placeholder buyer/GST/quorum — **not used** by 00222 SQL loaders |
| Decision receipt UIs | `DecisionReceipt.tsx` (reputation narrative); `DecisionReceiptCard.tsx` (canonical) |
| Hardcoded KPIs | **Removed** from `PurchaseOrdersPage.tsx`, `reporting.ts`, `AnalyticsCards.tsx` (12.5% / 100% compliance) |
| A4 engine | `procurement-document.ts`, `PrintableProcurementDocument.tsx`, `po-document.ts` |

---

## 8. B2 — Schema (00222)

Implemented per contract: `issued_document_id_counters`, `issued_document_snapshots`, `issued_document_status_audits`, immutability trigger, partial unique index `uq_issued_doc_one_active_per_slice`, RLS policies, counter-based `document_id`.

---

## 9. B3 — Issuance RPCs

| RPC | Status |
|-----|--------|
| `issue_document_snapshot_atomic` | Implemented (idempotency, digest validation, counter allocation) |
| `verify_issued_document_digest` | Implemented; GRANT to `authenticated`, `service_role` |
| `compute_decision_receipt_digest_v1` | Implemented (SQL HMAC port) |
| `compute_procurement_a4_digest_v1` | Implemented (jsonb minus `verification`) |

---

## 10. B4 — Award / PO / invoice hooks

| Hook | Status |
|------|--------|
| `lock_and_reveal_award_atomic` | PRE_REVEAL + conditional POST_REVEAL issuance |
| `lock_award` | Unchanged wrapper (delegation **proved** at 00151) |
| `reveal_award` | POST_REVEAL issuance + PO path |
| `create_purchase_order_from_award` | PURCHASE_ORDER bilateral snapshots |
| Invoice `APPROVED` | Trigger `trg_issue_tax_invoice_document_snapshots` |

---

## 11. B5 — Production rendering

| Item | Status |
|------|--------|
| `fetch-issued-document-snapshot.ts` | Added |
| `issued-snapshot-render.ts` | Loads frozen `payload_json` → `buildProcurementDocumentModel` |
| Award/Reveal pages wired to snapshots | **NOT DONE** (still live loaders where present) |

---

## 12. B6 — Document types

| Kind | Status |
|------|--------|
| DECISION_RECEIPT | **Implemented** (SQL loader + hooks) |
| PURCHASE_ORDER | **Implemented** (SQL loader + PO hook) |
| TAX_INVOICE | **Minimal** (summary line from invoice totals + `tax_snapshot` GSTIN fields) |
| WO / settlement / wallet statement / ledger report | **DEFERRED** (no authoritative snapshot hooks) |
| QUOTE_COMPARISON / SETTLEMENT_CERTIFICATE | **DEFERRED** (P2 per contract) |

---

## 13. B7 — Access tests

| Test | Result |
|------|--------|
| `issued-document-snapshot-00222-database.test.ts` | **3/3 passed** (digest RPC, verify RPC, immutability read when rows exist) |
| Full persona cross-org matrix | **NOT RUN** |

---

## 14. B8 — A4 renderer

Existing `PrintableProcurementDocument` unchanged structurally; integrity label supported via `verification` block. Issued docs should pass snapshot `procurementDocumentInput` only — helper added; page integration **incomplete**.

---

## 15. B9 — Mandatory golden reveal test

| Step | Status |
|------|--------|
| Lock award → PRE_REVEAL snapshot | **NOT EXECUTED** in automated test (no seeded award lock in test) |
| Reveal → POST_REVEAL new row | **NOT EXECUTED** |
| Version 1 reprint unchanged | Passive test passes **only if** PRE rows already exist |
| Version 2 new integrity ref | **NOT PROVEN** |

**Verdict:** **FAILED checklist item** for B9 automation.

---

## 16. B10 — Ledgers

No new wallet ledger. Snapshots reference procurement entities only. Three ledgers remain separate.

---

## 17. B11–B12 — Reports

C-06 fabricated savings/compliance removed from buyer PO analytics. No replacement KPIs invented. Period labels unchanged on existing report builder.

---

## 18. B13 — Test & build results

| Suite | Count |
|-------|-------|
| `issued-document.test.ts` | 2 passed |
| `issued-document-snapshot-00222-database.test.ts` | 3 passed |
| `otp-referral-00221-database.test.ts` | 4 passed |
| `persona-wallet.test.ts` | 8 passed |
| `decision-receipt.test.ts` + `procurement-document.test.tsx` | 18 passed (earlier run) |
| Full 18-minute suite | **SKIPPED** |
| `pnpm run build` | **PASS** |

---

## 19. B14 — Golden commercial scenario

Full RFQ→settlement golden run: **DEFERRED** (no safe automated commercial leg execution in this pass).

---

## 20. B15–B17 / self-audit

| Item | Result |
|------|--------|
| ONDC | **OUT OF SCOPE** |
| C-10 platform-fee wallet debit | **NOT ADDED** |
| `AwardService` production receipts | **NOT USED** for snapshots |
| Local `db reset` | **FAILED** at seed (`integer out of range` during seed — investigate separately; migrations including 00222 did apply before seed failure) |
| Digest TS↔SQL parity | **Smoke only** (single RPC call); not byte-matched to `computeDecisionReceiptHash` on full canonical fixtures |

---

## Files changed (source / migration / tests only)

- `supabase/migrations/00222_otp_document_issuance_snapshots.sql` (new)
- `packages/domain/src/index.ts`
- `packages/domain/src/types/issued-document.ts` (new)
- `packages/domain/src/types/procurement-document-input.ts` (new)
- `packages/domain/src/types/issued-document.test.ts` (new)
- `apps/web/src/features/documents/api/fetch-issued-document-snapshot.ts` (new)
- `apps/web/src/features/documents/lib/issued-snapshot-render.ts` (new)
- `apps/web/src/features/fulfillment/pages/PurchaseOrdersPage.tsx`
- `apps/web/src/features/reporting/types/reporting.ts`
- `apps/web/src/features/reporting/components/AnalyticsCards.tsx`
- `apps/web/src/features/reveal/components/DecisionReceiptCard.tsx`
- `tests/security/issued-document-snapshot-00222-database.test.ts` (new)

**Pre-existing dirty files not modified in this pass (still dirty in worktree):** `AwardPage.tsx`, `SiteHeader.tsx`, `SiteLayout.tsx`.

---

## Checklist summary (honest)

| ID | Complete |
|----|----------|
| B1 | YES |
| B2 | YES |
| B3 | YES (SQL) |
| B4 | YES |
| B5 | **NO** (UI reprint wiring) |
| B6 | **PARTIAL** |
| B7 | **PARTIAL** |
| B8 | **PARTIAL** |
| B9 | **NO** |
| B10 | YES |
| B11–B12 | YES (KPI removal) |
| B13 | **PARTIAL** |
| B14 | **NO** |
| B16 self-audit | YES |
| B17 declare complete | **NO** |

---

**R2-31 PHASE 2B: IMPLEMENTATION INCOMPLETE**
