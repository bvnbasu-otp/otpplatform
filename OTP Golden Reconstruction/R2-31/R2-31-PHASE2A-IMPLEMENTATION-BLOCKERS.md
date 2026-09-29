# R2-31 Phase 2A — Implementation Blockers (Remaining Only)

**Baseline:** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5`  
**Purpose:** Items still blocking **execution** after Phase 2A contract freeze. Product/schema rules for 00222 are closed in Phase 2A docs; this list is **engineering** residue only.

---

## Blockers

| ID | Blocker | Owner | Unblocks |
|----|---------|-------|----------|
| B-01 | **Production canonical receipt loader** — TypeScript assembly from Supabase (same joins as PO/award paths), explicitly **not** `AwardService.buildReceiptForAward` | Phase A web + services | Award hook can pass real `payload_json` into issuance RPC |
| B-02 | **SQL digest port** — `compute_decision_receipt_digest_v1` must match `computeDecisionReceiptHash` + `OTP_PROCUREMENT_A4_V1` helper in domain | Migration 00222 author | `issue_document_snapshot_atomic` digest validation |
| B-03 | **Hook implementation inside existing RPCs** — modify `lock_and_reveal_award_atomic`, `reveal_award`, `create_purchase_order_from_award`, invoice approve path (touches migrations **after** 00221 — operator discipline) | Migration author | C-09 persistence live |
| B-04 | **Invoice print bridge** — `invoice-document.ts` (planned) + approve-time loader with address joins | Phase A/B app | `TAX_INVOICE` snapshot quality |
| B-05 | **Phase A prerequisite for honest UX** — wire `DecisionReceiptCard`, demote reputation receipt, remove C-06 KPIs before claiming integrity UX | Phase A app | User-facing honesty before snapshot cert |
| B-06 | **Security tests** — snapshot RLS redteam (supplier cross-tenant, buyer org isolation) per Phase 1 test strategy | QA / migration PR | Production deploy confidence |
| B-07 | **Dirty working tree** at baseline (`AwardPage`, `DecisionReceiptCard`, `SiteHeader`, `SiteLayout`) — reconcile before cert | Team process | Clean certification runs |

---

## Non-blockers (explicitly not listed above)

- ONDC — out of scope  
- Wallet W1–W10 / `00221` — no change  
- C-10 platform-fee wallet debit — deferred copy  
- Historical backfill — optional product program; default **no backfill**  
- `QUOTE_COMPARISON` / `SETTLEMENT_CERTIFICATE` snapshots — P2  
- `DocumentPolicy` helper — Phase A; improves live path pre-00222  

---

## Resolved by Phase 2A (no longer block 00222 authoring)

Partial unique index DDL, `document_id` counter mechanism, issuance RPC contract, POST_REVEAL = new INSERT, supplier RLS shape, idempotency keys, immutability triggers, audit table for supersede, `lock_award` → single hook, receipt placeholder prohibition in contract.

---

**End blockers — design only.**
