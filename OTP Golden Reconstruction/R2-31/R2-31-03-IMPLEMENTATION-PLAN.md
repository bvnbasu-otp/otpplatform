# R2-31 — Implementation Plan (Sequence Only)

**Explicit:** **NO CODE, MIGRATION, COMMIT, OR DEPLOY in the discovery pass.**  
This file is the ordered blueprint for a follow-up implementation phase.

**Baseline:** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5`  
**Production migration ceiling:** `00221` — do not `supabase db push` from this workstream.

---

## Phase 0 — Product decisions (blockers)

| Decision | Options | Default recommendation |
|----------|---------|------------------------|
| Single decision receipt | Canonical only vs dual | Canonical + optional reputation appendix (fix **C-01**) |
| Fabricated report metrics | Remove 12.5% savings | Remove until data-backed (**C-06**) |
| Wallet platform-fee spend | Implement RPC vs copy fix | Confirm with product; gap **C-10** |
| Tax invoice label | Statutory vs summary | “Bilateral tax summary — not e-invoice” until GSP exists |

---

## Phase 1 — Unify rendering (existing tables sufficient)

**Persistence:** Existing `awards`, `purchase_orders`, `invoices`, `tax_snapshot`, `wallet_transactions`, `platform_fee_transactions`, `journal_entries` are **sufficient for read models**. No migration required for basic wiring.

**Goal:** One A4 shell for all in-product templates; wire missing UI paths.

| Step | Files / routes (anticipated) | Work |
|------|------------------------------|------|
| 1.1 | `apps/web/src/features/reporting/lib/procurement-document.ts` | Extend `DocumentPolicy` helper: map `rfq_reveal_status` + `viewerRole` → party masking (align **C-07**) |
| 1.2 | `apps/web/src/features/reveal/components/DecisionReceiptCard.tsx`, `AwardPage.tsx`, `EvaluationDecisionCockpit.tsx`, `SupplierRevealPage.tsx` | Mount canonical receipt from `award-service` or new thin `fetch-canonical-decision-receipt.ts`; retire screen-only print for proof |
| 1.3 | `apps/web/src/features/reporting/lib/procurement-document.ts` | Bridge `CanonicalDecisionReceipt` → `ProcurementDocumentInput` (`DECISION_RECEIPT` + `verification` digest) |
| 1.4 | `apps/web/src/features/fulfillment/pages/` (invoice detail — locate canonical page) | Wire `TAX_INVOICE` print from frozen line items / `tax_snapshot` |
| 1.5 | `apps/web/src/features/evaluation/` | Quote comparison export using `QUOTE_COMPARISON` + `PRE_AWARD` |
| 1.6 | `apps/web/src/features/fulfillment/pages/PurchaseOrdersPage.tsx` | Remove hardcoded `estimatedSavings` / `complianceScorePercent` (**C-06**) |
| 1.7 | `apps/web/src/features/reporting/lib/pdf-generator.ts` | Deprecate user-facing `computeReceiptAuditHash` or redirect to canonical hash (**C-02**) |
| 1.8 | `packages/domain/src/types/persona-wallet.ts`, `referral-incentive.ts` | Document single referral authority; align comments with `00221` (**C-03**, **C-04**) |

**Routes:** No new top-level route required; optional `?print=1` query on existing PO/award/invoice pages. Dedicated `/reports` deferred to Phase 3.

**Services:** Prefer `packages/services/src/services/award-service.ts` for receipt assembly; avoid duplicating domain hash logic in web.

**Tests (extend):**

- `procurement-document.test.tsx` — decision receipt from canonical fixture  
- `decision-receipt-card.test.tsx` — integration with policy masking  
- New: invoice print input test mirroring `po-document.test.ts`  
- Regression: `decide-atomic-award-redteam.test.ts`, `financial-settlement-controls-redteam.test.ts`

---

## Phase 2 — Issued snapshots & verification (new persistence)

**Trigger:** Resolves **C-09**, **G-10** — historical PDF must not change on later reveal.

**Proposed migration (future only — do not create in discovery pass):** `00222_issued_document_snapshots.sql`

Suggested objects (proposal):

```sql
-- PROPOSAL ONLY — NOT CREATED
-- public.issued_document_snapshots (
--   id uuid PK,
--   organization_id uuid,
--   document_kind text,
--   source_entity_type text,
--   source_entity_id uuid,
--   identity_phase text, -- PRE_REVEAL | POST_REVEAL
--   payload jsonb NOT NULL,
--   verification_digest text NOT NULL,
--   verification_algorithm text NOT NULL,
--   issued_at timestamptz NOT NULL,
--   issued_by uuid,
--   UNIQUE (document_kind, source_entity_type, source_entity_id, identity_phase)
-- );
```

**RPC hooks (proposal):**

- Extend `lock_and_reveal_award_atomic` (or post-trigger) to insert snapshot for canonical decision receipt at award lock (**PRE_REVEAL** row) and optional **POST_REVEAL** row on reveal transition  
- `create_purchase_order_from_award` → PO snapshot  
- Invoice approve trigger → invoice snapshot  

**App:**

- `apps/web/src/features/reporting/api/fetch-issued-snapshot.ts`  
- Reprint always loads snapshot by id; live data only for preview before issuance  

**Tests:**

- `tests/security/` — persona cannot read other org snapshots  
- Snapshot immutability trigger (no UPDATE/DELETE)  

---

## Phase 3 — Statements, exports & three-ledger reports

| Deliverable | Code anchors |
|-------------|--------------|
| Wallet statement (buyer/supplier) | `get_wallet_transactions`, `OtpWalletCreditsWidget`, new `buildWalletStatementModel` |
| OTP revenue period report | Query `platform_fee_transactions` + RLS-safe RPC |
| GMV ledger extract | `get_ledger_balance_summary`, `journal_entries` |
| Cross-ledger reconciliation report | New domain function in `packages/domain/src/accounting/` — read-only checks only |
| Settlement A4 | Wrap `generatePoSettlementCertificate` / `buildAuthoritativeSettlementCertificate` with `PrintableProcurementDocument` or sibling component |
| ERP exports | Keep `payments.ts` export paths; register in `ReportDefinition` |

**Optional route:** `/org/:id/reports` with `PeriodFilterBar` reuse.

---

## Phase 4 — Hardening & certification

- Security: extend `privileged-rpc-hardening` patterns for any new read RPCs  
- Persona: supplier/buyer isolation tests on every new document loader  
- Hosted verification script: extend `scripts/local-db-contract-run.mjs` pattern for snapshot tables (when exist)  
- Golden Reconstruction cert doc update (separate pass)

---

## Migration summary

| Phase | Migration |
|-------|-----------|
| 1 | **None** — use existing schema |
| 2 | **Proposed `00222`** — `issued_document_snapshots` (+ optional `issued_document_verification_codes`) |
| 3 | **Deferred** — only if report materialized views needed for performance |
| 4 | None unless audit retention policy requires archive tables |

**Next migration number if persistence approved:** `00222` only as above — **not created in R2-31 discovery pass.**

---

## File touch list (consolidated)

**Web**

- `apps/web/src/features/reporting/*` (engine home)  
- `apps/web/src/features/reveal/*`, `award/*`, `evaluation/*`  
- `apps/web/src/features/fulfillment/pages/PurchaseOrderDetailPage.tsx`, invoice pages, `payments.ts`  
- `apps/web/src/features/subscription/components/OtpWalletCreditsWidget.tsx`  

**Domain / services**

- `packages/domain/src/types/decision-receipt.ts` (already canonical)  
- `packages/domain/src/types/financial-settlement-controls.ts`  
- `packages/domain/src/accounting/*`  
- `packages/services/src/services/award-service.ts`, `payment-service.ts`  

**Database (Phase 2 only)**

- `supabase/migrations/00222_*.sql` (proposal)  
- Patch `00216` award RPC body only with extreme care + redteam tests  

**Tests**

- `apps/web/src/features/reporting/procurement-document.test.tsx`  
- `tests/security/decide-atomic-award-redteam.test.ts`  
- `tests/security/financial-settlement-controls-redteam.test.ts`  
- New snapshot RLS tests  

---

## Certification criteria (preview)

Implementation complete when:

1. Every **template** kind in `ProcurementDocumentKind` has a wired, policy-correct print path or explicit “summary not statutory” label.  
2. Canonical decision receipt is user-visible and matches `verifyDecisionReceiptIntegrity` on screen.  
3. Reprint after reveal uses **snapshot** (Phase 2+) or documented limitation removed.  
4. Period procurement report contains **no fabricated** savings/compliance scores.  
5. Wallet / GMV / OTP revenue documents are visually and logically separated.  
6. Verification copy never claims legal digital signature.  

---

**End of implementation plan — await explicit implementation pass.**
