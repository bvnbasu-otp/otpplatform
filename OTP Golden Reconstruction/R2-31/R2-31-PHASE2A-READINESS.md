# R2-31 Phase 2A — Readiness Classification & Final Gate

**Gate date:** 2026-09-29  
**Baseline:** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5`  
**Phase 2A deliverables:** `R2-31-PHASE2A-00222-SCHEMA-CONTRACT.md`, `R2-31-PHASE2A-DOCUMENT-LIFECYCLE-MATRIX.md`, `R2-31-PHASE2A-REPORT-SOURCE-OF-TRUTH-MATRIX.md`, `R2-31-PHASE2A-RLS-ACCESS-MATRIX.md`, `R2-31-PHASE2A-IMPLEMENTATION-BLOCKERS.md`, this file.

**Method:** Phase 1 readiness gaps (partial unique index, document_id, issuance RPC, supplier RLS, POST_REVEAL INSERT policy, AwardService placeholders) closed in Phase 2A contract. Code spot-check at baseline.

---

## 1. Classification legend

| Class | Meaning |
|-------|---------|
| **FROZEN** | Implement 00222 / engine exactly as written |
| **READY FOR IMPLEMENTATION** | Spec complete; engineering can start |
| **NEEDS PRODUCT DECISION** | Blocks if required for initial 00222 scope |
| **DEFERRED** | Explicitly later phase |
| **OUT OF SCOPE** | Not R2-31 |

---

## 2. Major item register

| Item | Class | Notes |
|------|-------|-------|
| C-01 `CanonicalDecisionReceipt` single model | **FROZEN** | Reputation appendix only |
| C-02 / C-05 integrity wording | **FROZEN** | `computeDecisionReceiptHash`; not legal signature |
| C-09 `issued_document_snapshots` | **FROZEN** | DDL in Phase 2A contract |
| Partial unique index (one ISSUED per slice) | **FROZEN** | DDL in contract §3.3 |
| POST_REVEAL = new INSERT, never UPDATE payload | **FROZEN** | Lifecycle scenarios B/D |
| `document_id` counter table allocation | **FROZEN** | Not PG sequence |
| `issue_document_snapshot_atomic` signature + idempotency | **FROZEN** | Contract §7 |
| Supplier RLS via `source_supplier_id` | **FROZEN** | No buyer-org fallback |
| Award hooks (`lock_and_reveal_award_atomic`; `lock_award` wrapper) | **FROZEN** | Single SQL body |
| PO / invoice issuance hooks | **FROZEN** | POST_REVEAL bilateral |
| `AwardService.buildReceiptForAward` for production | **FROZEN** prohibition | Use SQL-backed loader |
| A4 engine (`procurement-document` + `PrintableProcurementDocument` + bridges) | **FROZEN** | One framework |
| PDF/print from frozen snapshot only | **FROZEN** | Contract + lifecycle |
| Three ledgers in reports | **FROZEN** | Phase 2A report matrix |
| C-06 remove 12.5% / 100% KPIs | **READY FOR IMPLEMENTATION** | Phase A app |
| C-08 tax invoice from `tax_snapshot` | **READY FOR IMPLEMENTATION** | Loader + hook |
| C-10 platform-fee wallet debit | **DEFERRED** | Copy clarification later |
| ONDC | **OUT OF SCOPE** | |
| Wallet W1–W10 / referral matrix / Supplier Success ₹100 | **FROZEN** unchanged | No 00221 edit |
| Supplier Cashback | **OUT OF SCOPE** | |
| Historical backfill of snapshots | **NEEDS PRODUCT DECISION** | Default **no backfill** (UNSAFE to rewrite history) — does **not** block 00222 forward issuance |
| SUPPLIER `PRE_REVEAL` decision receipt row | **DEFERRED** | Initial 00222: BUYER PRE_REVEAL + POST_REVEAL; supplier POST_REVEAL only (redacted payload) |
| `QUOTE_COMPARISON` snapshot | **DEFERRED** | P2 |
| `SETTLEMENT_CERTIFICATE` snapshot | **DEFERRED** | P2 |
| `verify_issued_document_digest` | **READY FOR IMPLEMENTATION** | Spec in contract |
| SQL HMAC port + `OTP_PROCUREMENT_A4_V1` domain helper | **READY FOR IMPLEMENTATION** | B-02 |
| Production canonical loader (web) | **READY FOR IMPLEMENTATION** | B-01 |
| `DocumentPolicy` helper | **READY FOR IMPLEMENTATION** | Phase A |
| Legacy `computeReceiptAuditHash` UX | **READY FOR IMPLEMENTATION** | Gate from user paths |

---

## 3. Phase 1 gate gap closure checklist

| Phase 1 gap | Phase 2A status |
|-------------|-----------------|
| Partial unique index | **Closed** — `uq_issued_doc_one_active_per_slice` |
| `document_id` generation | **Closed** — counter table + format |
| Issuance RPC contract | **Closed** — §7 |
| Supplier RLS | **Closed** — access matrix + policies |
| POST_REVEAL INSERT | **Closed** — lifecycle + contract |
| AwardService placeholders | **Closed** — prohibition + blockers |
| `lock_award` path | **Closed** — wrapper documented |
| Admin supersede audit | **Closed** — `issued_document_status_audits` |
| PO/invoice verification algorithms | **Closed** — `OTP_PROCUREMENT_A4_V1` |

---

## 4. FINAL GATE (00222 / R2-31 authorization)

Answer each **YES** or **NO**. Any **NO** → **implementation is NOT authorized** for the failed dimension.

| # | Question | Answer | Rationale |
|---|----------|--------|-----------|
| 1 | Can migration **00222** now be written **without inventing product rules**? | **YES** | DDL, indexes, RPCs, hooks, idempotency, identity rules, and deferrals are explicit; optional backfill is product-labeled and not required for forward issuance |
| 2 | Can the document engine be implemented **without changing wallet W1–W10**? | **YES** | No wallet DDL/RPC in 00222 contract |
| 3 | Can protected documents remain **immutable after identity reveal**? | **YES** | PRE_REVEAL rows never updated; POST_REVEAL is new INSERT |
| 4 | Can buyer and supplier access be enforced **without identity leakage**? | **YES** | RLS + redacted supplier payloads specified; supplier uses `source_supplier_id` only |
| 5 | Can reports derive facts from **authoritative ledgers**? | **YES** | Phase 2A report matrix; C-06 removal specified |
| 6 | Are **PDF/print requirements completely specified**? | **YES** | Frozen `payload_json` → `buildProcurementDocumentModel` → `PrintableProcurementDocument`; integrity label; no PDF byte hash |
| 7 | Is **ONDC** still cleanly outside R2-31? | **YES** | OUT OF SCOPE |

### Gate verdict

**All seven: YES** → **00222 SQL authoring and Phase B document engine implementation are authorized** subject to engineering blockers in `R2-31-PHASE2A-IMPLEMENTATION-BLOCKERS.md` (loaders, digest port, tests) — not subject to further product guessing.

Phase A app work may proceed in parallel per Phase 1 plan.

---

## 5. Self-audit

```
HEAD: c444df6a2b8ca268c5b5233bd3a61ec2c34181b5
Files written: R2-31-PHASE2A-*.md (6) under OTP Golden Reconstruction/R2-31/
Migration 00222 SQL: NOT CREATED
Application source: NOT MODIFIED
Existing migrations / 00221: NOT MODIFIED
Database: NO CHANGE
Wallet: NO CHANGE
Commit: NO
Push: NO
Deploy: NO
ONDC: NO
```

---

**R2-31 PHASE 2A: SCHEMA AND CONTRACT FREEZE COMPLETE (DESIGN ONLY)**
