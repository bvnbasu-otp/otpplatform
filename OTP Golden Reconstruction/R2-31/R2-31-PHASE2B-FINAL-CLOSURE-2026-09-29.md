# R2-31 Phase 2B — Final Closure (2026-09-29)

**Closure decision:** **AMBER — NON-BLOCKING GAP**  
**Baseline HEAD (unchanged):** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5`  
**Not production-certified.**

---

## 1. Executive summary

Phase 2B implementation is aligned with the frozen Phase 2A contract: migration **00222** on local Docker, issuance hooks, snapshot fetch/render helpers, Award/Reveal/PO **reprint wired to `issued_document_snapshots`**, B9 golden lifecycle **automated and passing**, RLS access matrix **partially exercised** (RWA/MSME rows skipped). Targeted tests **33 passed / 2 skipped**; **`pnpm run build` PASS**. Full monorepo `pnpm test` (~20 min) **SKIPPED**. Visual browser PDF certification **NOT RUN** (HTML/model renderer tests **PASS**).

---

## 2. Phase 2A final gate

| # | Question | Result |
|---|----------|--------|
| 1 | 00222 without inventing product rules | **YES** |
| 2 | Document engine without wallet W1–W10 change | **YES** |
| 3 | Protected documents immutable after reveal | **YES** (DB trigger + lifecycle test) |
| 4 | Buyer/supplier access without leakage | **PARTIAL** (6 access tests PASS; RWA/MSME **NOT RUN**) |
| 5 | Reports from authoritative ledgers | **YES** (C-06 fabricated KPIs absent on PO path; reprint from snapshots) |
| 6 | PDF/print specified | **PARTIAL** (renderer unit tests; no visual browser PDF) |
| 7 | ONDC outside R2-31 | **YES** |

---

## 3. Wallet W1–W10

**UNCHANGED** — No edits to `00221`, wallet RPCs, or referral matrix. Regression: `otp-referral-00221-database.test.ts` **4/4**; `persona-wallet.test.ts` **8/8**.

---

## 4. ONDC

**DEFERRED** — No ONDC code touched.

---

## 5. Migration 00222

| Item | Value |
|------|--------|
| File | `supabase/migrations/00222_otp_document_issuance_snapshots.sql` (local only; **not rewritten** this pass) |
| Applied local | **YES** (reachable via tests) |
| Applied production | **NO** |
| 00221 / earlier edited | **NO** |
| Objects verified via tests | `issued_document_snapshots`, RLS, immutability trigger, `issue_document_snapshot_atomic`, `verify_issued_document_digest`, digest functions |

---

## 6. Git / deploy discipline

| Action | Done |
|--------|------|
| commit | **NO** |
| push | **NO** |
| deploy | **NO** |
| hosted `db push` | **NO** |

---

## 7. B1 — Source verification

Unchanged from Phase 2B interim: SQL loaders authoritative; `AwardService.buildReceiptForAward` not used for snapshots; `CanonicalDecisionReceipt` + `issued-document.ts` domain helpers; C-06 **12.5% / compliance fabrication removed** from buyer PO analytics path (confirmed absent in `PurchaseOrdersPage.tsx` / reporting types).

---

## 8. B2 — Schema

Per Phase 2A contract: counters, snapshots, status audits, immutability trigger, partial unique index, RLS, counter-based `document_id`.

---

## 9. B3 — Issuance RPCs

`issue_document_snapshot_atomic`, `verify_issued_document_digest`, `compute_decision_receipt_digest_v1`, `compute_procurement_a4_digest_v1` — implemented; digest smoke + lifecycle verify **PASS**.

---

## 10. B4 — Award / PO / invoice hooks

`lock_and_reveal_award_atomic` (PRE_REVEAL + conditional POST_REVEAL), `reveal_award` (POST_REVEAL), `create_purchase_order_from_award` (PO snapshots), invoice approve trigger — **wired** (no change this pass).

---

## 11. B5 — Production rendering / reprint

| Item | Status |
|------|--------|
| `fetch-issued-document-snapshot.ts` | **YES** |
| `issued-snapshot-render.ts` | **YES** |
| `IssuedProcurementPrintDocument` | **NEW** — snapshot-first print layer |
| `IssuedDecisionReceiptFromSnapshot` | **NEW** — canonical card from frozen payload |
| `AwardPage` | Print + institutional receipt from snapshot |
| `SupplierRevealPage` | Print + institutional receipt from snapshot (+ PO print when PO exists) |
| `PurchaseOrderDetailPage` | `IssuedProcurementPrintDocument` with live `fallbackModel` for legacy POs |

---

## 12. B6 — Document types

| Kind | Status |
|------|--------|
| DECISION_RECEIPT | **Implemented** + UI reprint |
| PURCHASE_ORDER | **Implemented** + UI reprint |
| TAX_INVOICE | **Minimal SQL hook** (no new UI this pass) |
| QUOTE_COMPARISON / SETTLEMENT_CERTIFICATE | **DEFERRED** (Phase 2A P2) |

---

## 13. B7 — Access tests

| Test | Result |
|------|--------|
| Buyer org reads own POST_REVEAL BUYER row | **PASS** |
| Cross-org buyer deny | **PASS** |
| Awarded supplier SUPPLIER POST_REVEAL only | **PASS** |
| Losing supplier deny | **PASS** |
| Anon deny (permission denied) | **PASS** |
| Supplier cannot read PRE_REVEAL buyer rows | **PASS** |
| RWA committee issued snapshot access | **NOT RUN** (skipped — needs committee fixture) |
| MSME tier issued snapshot access | **NOT RUN** (skipped — needs approval fixture) |

---

## 14. B8 — A4 renderer / PDF evidence

| Evidence | Result |
|----------|--------|
| `issued-snapshot-render.test.ts` (protected From/To, integrity ref, OTP brand, page sections) | **PASS** |
| `procurement-document.test.tsx` (PO page uses `IssuedProcurementPrintDocument`) | **PASS** |
| Visual browser “Save as PDF” | **NOT RUN** |
| Statutory digital signature | **Not claimed** — disclaimer text in model notes |

---

## 15. B9 — Mandatory golden reveal test

| Step | Result |
|------|--------|
| Lock award → PRE_REVEAL snapshot (masked supplier, digest valid) | **PASS** (`issued-document-reveal-lifecycle-database.test.ts`) |
| Reveal → POST_REVEAL new row (new id, new digest, real supplier in canonical) | **PASS** |
| PRE_REVEAL row unchanged after reveal | **PASS** |
| Payload tamper via UPDATE | **DENIED** (`DOC-SNAPSHOT-FROZEN`) |

---

## 16. B10 — Ledgers

No wallet ledger invented. Snapshots reference procurement entities only. Wallets/referrals/procurement reporting remain separate.

---

## 17. B11–B12 — Reports

Fabricated **12.5%** savings / **100%** compliance KPIs remain **removed** from buyer PO analytics path. Approver-role cards still show static **100%** quorum/COI display copy (not procurement ledger claims).

---

## 18. Test & build results

| Suite | Result |
|-------|--------|
| Targeted batch (00222, issued-domain, reveal lifecycle, access, renderer, procurement-doc, wallet 00221, persona-wallet) | **33 passed, 2 skipped** |
| Full `pnpm test` (~20 min) | **SKIPPED** |
| `pnpm run build` | **PASS** |

---

## 19. Files changed (this closure pass)

**New**

- `apps/web/src/features/documents/components/IssuedProcurementPrintDocument.tsx`
- `apps/web/src/features/documents/components/IssuedDecisionReceiptFromSnapshot.tsx`
- `apps/web/src/features/documents/issued-snapshot-render.test.ts`
- `tests/security/issued-document-reveal-lifecycle-database.test.ts`
- `tests/security/issued-document-snapshot-access-database.test.ts`
- `OTP Golden Reconstruction/R2-31/R2-31-PHASE2B-FINAL-CLOSURE-2026-09-29.md`

**Modified**

- `apps/web/src/features/award/pages/AwardPage.tsx`
- `apps/web/src/features/reveal/pages/SupplierRevealPage.tsx`
- `apps/web/src/features/fulfillment/pages/PurchaseOrderDetailPage.tsx`
- `apps/web/src/features/reporting/procurement-document.test.tsx`

**Unchanged from prior 2B pass (still in tree):** `00222`, domain `issued-document*`, `fetch-issued-document-snapshot.ts`, `issued-snapshot-render.ts`, KPI removals, `issued-document-snapshot-00222-database.test.ts`.

---

## AMBER gaps (exact)

1. Full `pnpm test` suite not executed.  
2. Visual browser PDF not executed.  
3. RWA / MSME issued-snapshot access rows **NOT RUN** (2 skipped tests).  
4. TS↔SQL canonical digest **byte parity** on full fixtures remains smoke-level (not expanded this pass).  
5. Local `db reset` / seed fragility not re-validated (tests use demo seed + ephemeral RFQs).

---

**R2-31 PHASE 2B: AMBER**
