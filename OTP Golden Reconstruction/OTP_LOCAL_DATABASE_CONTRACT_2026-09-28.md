# OTP Local Database Contract — 28 September 2026

**Purpose:** Runtime evidence against **local Docker Postgres only** (`127.0.0.1:54322`, API `127.0.0.1:54321`). This document is the authoritative **DATABASE_RUNTIME** contract for remediation **`00216` + `00217` + `00218` + `00219`**. It does not replace `OTP_REMEDIATION_CERTIFICATION_2026-09-28.md`; that file must stay aligned with the statuses here.

### P0 gap closure matrix (local Docker only)

Evidence: `OTP Golden Reconstruction/_p0_gaps_evidence.json` (`node scripts/p0-gaps-contract-run.mjs`). **PRODUCTION_VERIFIED = 0.**

| Contract | Runtime Result | Evidence | Remaining Gap |
| --- | --- | --- | --- |
| P0-GAP-1 Wallet real fee/replay | **PASS** | `GAP1-AUTH-OK` (fee-derived reward 100, caller `p_base_amount` ignored), `GAP1-REPLAY-SAME-FEE`, null/fake/wrong-org fee, anon deny — **DATABASE_RUNTIME** | Hosted fee-row + replay audit not done |
| P0-GAP-2 Award/reveal/PO | **PASS** | Ephemeral `is_demo` RFQ: DRAFT→OPEN→EVALUATING (`discover_and_invite` + `seed_simulated_quotes_for_rfq` + `advance_rfq_phases`), `complete_supplier_onboarding_atomic` on winning demo supplier, committee quorum (2× RECOMMEND), `lock_and_reveal_award_atomic` (`p_auto_reveal: false`), `reveal_award`, `create_purchase_order_from_award`; anon pre-reveal/PO denied — **DATABASE_RUNTIME** | Non-demo RFQ quote path not certified here; extra PO deny matrix (wrong org/supplier) not in runner |
| P0-GAP-3 Approval/delegation | **PASS** | Primary approver, member/outsider deny, active delegation A→B, expired delegation, REJECT path, `get_profile_id` mapping note, direct `UPDATE rfq_approval_stages` blocked (`00219`) — **DATABASE_RUNTIME** | Cross-org delegation fixture only if org `…099` exists |

**LOCAL P0 READY**

### Approval stage direct-write remediation (`00219`)

| Step | Detail |
| --- | --- |
| **Fix** | `trg_guard_rfq_approval_stage_write` blocks authenticated direct INSERT/UPDATE on `rfq_approval_stages` unless `service_role`, `is_platform_admin()`, `postgres`, or internal flag set by `submit_rfq_tier_approval_atomic`. |
| **Migration** | `supabase/migrations/00219_guard_rfq_approval_stage_direct_write.sql` (local Docker only). |
| **Runtime** | `GAP3-DIRECT-WRITE` — manager `UPDATE status=APPROVED` → `APPROVAL-STAGE-DIRECT-WRITE` (**PASS**). |

### RFQ direct-write remediation summary (`00218`)

| # | Item |
| --- | --- |
| 1 **Root cause** | RLS policy `rfqs_update` (`00004`) grants any org **OWNER/MANAGER/BUYER** a broad `UPDATE` with no column guard. `00216` trigger `trg_guard_rfq_status` only blocked **AWARDED→*** regressions and **OPEN→AWARDED**; it did **not** block **EVALUATING→OPEN** or other backward jumps. Lifecycle moves are intended via **SECURITY DEFINER** RPCs (`advance_rfq_phases`, `lock_and_reveal_award_atomic`, `process_rfq_cancellation`, demo/admin tools), not ad-hoc PostgREST patches. |
| 2 **Fix** | `00218` replaces `private.guard_rfq_status_transition()` with a **canonical whitelist** (`private.rfq_status_transition_allowed`) plus **immutable** `organization_id` / `requirement_id` / `created_by` on direct JWT sessions. Bypass: `service_role`, `private.is_platform_admin()`, nested trigger depth. |
| 3 **Migration** | `supabase/migrations/00218_rfq_status_transition_whitelist.sql` (applied **local Docker only** in this session). |
| 4–8 **RFQ tests A–F** | See Phase 4 table (`SM-RFQ-A` … `SM-RFQ-F-ORG`, `SM-AWARD-PROBE`). |
| 9 **Full regression** | `node scripts/local-db-contract-run.mjs` — **0 FAIL**; `verified-remediation-00216-database.test.ts` — **9/9 PASS** (2026-09-28 session). |
| 10 **NOT TESTED** | Full RPC lifecycle matrix, PO guards, cancellation E2E, award success with 2 votes, wallet fee-row replay, etc. (unchanged). |
| 11 **NOT CERTIFIED** | Production hosted DB, GST DB truth, admin MFA, approval delegation runtime. |
| 12 **Production blockers** | Hosted apply of `00216`–`00218`, live grant audit, remaining NOT TESTED P0 paths. **PRODUCTION_VERIFIED = 0.** |

**LOCAL READY** (RFQ bypass closed + P0 contracts pass) ≠ **PRODUCTION CERTIFIED**.

**Evidence artifacts**

| Artifact | Path |
| --- | --- |
| Machine-readable run | `OTP Golden Reconstruction/_local_contract_evidence.json` |
| Regenerate | `node scripts/local-db-contract-run.mjs` |
| Vitest (subset) | `node node_modules/vitest/vitest.mjs run tests/security/verified-remediation-00216-database.test.ts` |

**Status vocabulary:** PASS, FAIL, NOT TESTED, NOT CERTIFIED, UNKNOWN only.  
**PASS (database certification)** requires **DATABASE_RUNTIME** proof, not SQL inspection alone.

**Production:** NOT touched. **PRODUCTION_VERIFIED** count = **0**.

**Independent auditor re-run (28 Sep 2026, same day):** Local DB and both contract runners re-executed by a separate auditor pass; results aligned with this file (**27 PASS / 0 FAIL / 1 NOT TESTED**; P0 gaps **23/23 PASS**). Decision and deploy-ledger caveat: see **§ Independent local pre-production security audit** in [`OTP_REMEDIATION_CERTIFICATION_2026-09-28.md`](./OTP_REMEDIATION_CERTIFICATION_2026-09-28.md). **LOCAL PRE-PRODUCTION CERTIFIED** (not production).

---

## Phase 1 — Baseline

| Item | Value |
| --- | --- |
| Git HEAD (unchanged, no commit) | `7b1afc12ac7761efc206c70db80486612a34d146` |
| Migrations on disk (ceiling) | `00216` … `00219_guard_rfq_approval_stage_direct_write.sql` |
| Applied on `127.0.0.1:54322` | Through **`00219`** (`supabase_migrations.schema_migrations`) |
| PostgreSQL | **17.6** |
| Connection | `postgresql://postgres:***@127.0.0.1:54322/postgres` (container `supabase_db_otp-local`) |

### RLS on sensitive tables (DATABASE_RUNTIME)

All **enabled** (`relrowsecurity = true`): `organization_wallets`, `wallet_transactions`, `awards`, `invoices`, `rfqs`, `purchase_orders`, `quotes`.

### Anonymous EXECUTE allowlist (DATABASE_RUNTIME)

Query: `information_schema.routine_privileges` where `routine_schema = 'public'`, `grantee = 'anon'`, `privilege_type = 'EXECUTE'`.

**Exactly six routines:**

1. `platform_heartbeat`
2. `served_cities`
3. `service_categories`
4. `submit_signup_request`
5. `verify_profile_verification_otp`
6. `verify_whatsapp_password_reset`

**PUBLIC EXECUTE on `get_organization_wallet`:** catalog count **0** for grantee `PUBLIC` (post-`00217`). Anon RPC probe: **permission denied** — PASS.

### EXECUTE grants on routines touched by `00216` / `00217` (DATABASE_RUNTIME)

Privileged financial/governance RPCs (`credit_buyer_settlement_reward_atomic`, `lock_and_reveal_award_atomic`, `reveal_award`, `create_purchase_order_from_award`, `apply_wallet_credits_to_subscription_atomic`, `appoint_org_role_atomic`, `cast_committee_vote`, `approve_milestone_inspection_atomic`, `record_invoice_payment_atomic`, `get_organization_wallet`): **`authenticated`**, **`postgres`**, **`service_role`** only — **not** `anon` or `PUBLIC`.

---

## Phase 2 — Negative contracts (exploit re-runs)

Each row: actor → call → expected → actual → DB before/after → status. Full JSON in `_local_contract_evidence.json`.

### A — Wallet

| ID | Actor | Call | Expected | Actual | Before → After | Status |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | anon | `credit_buyer_settlement_reward_atomic` (null fee, ₹99999) | Denied; balance/ledger unchanged | `permission denied for function …` | balance `0.00`, ledger `0` → unchanged | **PASS** |
| A2 | `manager@greenview.test` | same RPC, null fee | Error; no credit | `platform_fee_tx_id is required (WALLET-REWARD-FEE-REQUIRED)` | `0.00` → `0.00` | **PASS** |
| A3 | manager | fake `platform_fee_tx_id` | Not found / not belong | Error (not found / not belong) | balance unchanged | **PASS** |
| A4 | anon | `get_organization_wallet` | Denied | `permission denied` | — | **PASS** |
| — | — | Valid credit from real `platform_fee_transactions` row + replay | Idempotent credit | No seed fee row for Greenview | — | **NOT TESTED** (fixture: payable `platform_fee_transactions` linked to buyer org) |

*Vitest also covers anon wallet/award/PO/appoint/subscription denial and auth fake-fee (DATABASE_RUNTIME).*

### B — Subscription

| ID | Actor | Call | Expected | Actual | Status |
| --- | --- | --- | --- | --- | --- |
| B1 | anon | `apply_wallet_credits_to_subscription_atomic` (₹1) | Denied | permission denied | **PASS** |
| B2 | manager | same, ₹1 vs catalog | Catalog amount rejection | `Wallet redemption must equal catalog amount …199.00…` | **PASS** |
| — | anon/auth | arbitrary tier/redeem via `process_subscription_payment` | Rejected | Covered in vitest anon deny set | **PASS** (vitest) |

### C — Award reveal

| ID | Actor | Call | Expected | Actual | Status |
| --- | --- | --- | --- | --- | --- |
| C1 | anon | `lock_and_reveal_award_atomic` | Denied | permission denied | **PASS** |
| C2 | anon | `reveal_award(p_rfq_id)` | Denied | permission denied / not in schema for anon | **PASS** |
| C3 | `supplier-a@borewell.test` | `reveal_award` on awarded RFQ | Denied or no buyer legal PII | Error (unauthorized) | **PASS** |
| — | manager | Authorized reveal with VERIFIED supplier + committee quorum | Legal reveal path | Seed suppliers `QUOTE_PARTICIPANT` / `NOT_PROVIDED`; borewell RFQ not awarded end-to-end | **NOT TESTED** |

### D — Purchase order

| ID | Actor | Call | Expected | Actual | Status |
| --- | --- | --- | --- | --- | --- |
| D1 | anon | `create_purchase_order_from_award` | Denied | permission denied | **PASS** |
| — | manager | PO from seeded award `b7000001…` | Success | Not re-run this session (fulfillment PO exists) | **NOT TESTED** |

### E — Org appointment

| ID | Actor | Call | Expected | Actual | Status |
| --- | --- | --- | --- | --- | --- |
| E1 | anon | `appoint_org_role_atomic` | Denied | permission denied | **PASS** |
| E2 | manager | appoint outsider as PRESIDENT | Rejected | `Only an Organization Owner or Platform Admin can appoint executive governance roles.` | **PASS** |
| — | owner | Legitimate owner appointment | Success | No dedicated runtime case (manager is not owner for president path) | **NOT TESTED** |
| — | — | Demote owner / outsider self-appoint | Fail | Not executed | **NOT TESTED** |

### F — Invoice

| ID | Actor | Call | Expected | Actual | Before → After | Status |
| --- | --- | --- | --- | --- | --- | --- |
| F-INV-SUP | `supplier-b@borewell.test` | `UPDATE invoices SET status='APPROVED'` on SUBMITTED contract row | Blocked | `Suppliers cannot mark invoices as approved or paid (INV-SUPPLIER-STATUS)` | SUBMITTED → SUBMITTED | **PASS** |
| — | buyer | Legitimate SUBMITTED → APPROVED → PAID progression | RPC/trigger path | Only PAID seed invoice; no fresh buyer progression run | **NOT TESTED** |

### G — Milestone

| ID | Actor | Call | Expected | Actual | Status |
| --- | --- | --- | --- | --- | --- |
| G1 | anon | `approve_milestone_inspection_atomic` | Denied | permission denied | **PASS** |
| — | buyer | Authorized approval with valid digest | Success | No inspection fixture exercised | **NOT TESTED** |
| — | — | Arbitrary hash / unauthorized approver | Rejected | Not executed | **NOT TESTED** |

---

## Phase 3 — Governance

| ID | Actor | Call | Expected | Actual | Status |
| --- | --- | --- | --- | --- | --- |
| G-COI-VOTE | `committee1@greenview.test` + `DECLARED_CONFLICT` | `cast_committee_vote` | COI recusal | `Voter has declared a Conflict of Interest (COI) and is recused…` | **PASS** |
| G-COI-QUORUM | manager after committee1 COI + committee2 single RECOMMEND | `lock_and_reveal_award_atomic` | Quorum not met; COI vote excluded from count | `Committee quorum not met: at least 2 unconflicted votes required…` | **PASS** |

**COI quorum exclusion:** **PASS (DATABASE_RUNTIME)** — award RPC counts only **unconflicted** `RECOMMEND` votes; with one COI member and one clean vote, award correctly fails. Not the same as full “waived COI” or excess-vote award E2E.

| Area | Status | Notes |
| --- | --- | --- |
| Non-member vote | **NOT TESTED** | |
| Wrong role vote | **NOT TESTED** | |
| Expired org role vote | **NOT TESTED** | No expiry fixture |
| Delegation / approval profile-id mismatch (`get_profile_id`) | **NOT CERTIFIED** | `00216` patch is **SOURCE_STATIC**; no dedicated approval-chain runtime matrix |
| Quorum: zero / insufficient / exactly sufficient / excess (award succeeds) | **NOT TESTED** (success path) | Negative quorum + COI exclusion proven |
| RFQ approval stages pending | **NOT TESTED** | |

---

## Phase 4 — State machine (DATABASE_RUNTIME)

### Canonical `rfq_status` enum (existing)

`DRAFT`, `OPEN`, `CLARIFICATION`, `CLOSED`, `EVALUATING`, `AWARDED`, `CANCELLED` — not invented here.

### Valid transitions (existing product/SQL — **whitelist in `00218`**)

| From | To (allowed) | Typical actor / path |
| --- | --- | --- |
| DRAFT | OPEN, CANCELLED | Demo staging (`00034`), direct update where staging allows |
| OPEN | CLARIFICATION, EVALUATING, CLOSED, CANCELLED | `advance_rfq_phases()` (`00041`/`00177`), cancellation RPC |
| CLARIFICATION | EVALUATING, CLOSED, CANCELLED | `advance_rfq_phases()`, cancellation |
| EVALUATING | AWARDED, CANCELLED | `lock_and_reveal_award_atomic`, `process_rfq_cancellation` |
| AWARDED | CANCELLED, CLOSED | Cancellation / closeout |
| CLOSED | CANCELLED | Cancellation |

**Invalid (must fail on direct PostgREST UPDATE):** e.g. **EVALUATING→OPEN**, **AWARDED→EVALUATING**, **OPEN→AWARDED** (also blocked in `00216`).

### Runtime probes (post-`00218`)

| ID | Actor | Call | Expected | Status |
| --- | --- | --- | --- | --- |
| SM-RFQ-A | manager | EVALUATING→OPEN | Denied (`RFQ-STATUS-TRANSITION`); unchanged | **PASS** |
| SM-RFQ-B | manager | AWARDED→EVALUATING | Denied | **PASS** |
| SM-RFQ-C | manager | DRAFT→OPEN (ephemeral fixture) | Allowed | **PASS** |
| SM-RFQ-D | supplier-a | status change on buyer RFQ | No mutation (RLS / 0 rows) | **PASS** |
| SM-RFQ-E | anon | status change | Denied | **PASS** |
| SM-RFQ-F-ORG | manager | `organization_id` swap | Denied (`RFQ-IMMUTABLE`) | **PASS** |
| SM-AWARD-PROBE | manager | `UPDATE awards.quote_id` | Error or blocked | **PASS** (error returned) |
| SM-RFQ-DIRECT-UPDATE | manager | alias of SM-RFQ-A | Denied | **PASS** |

| Transition | Status | Notes |
| --- | --- | --- |
| DRAFT→…→AWARDED via RPC only (full chain) | **NOT TESTED** | |
| Invalid transitions via RPC (not direct UPDATE) | **NOT TESTED** | |
| PO status invalid writes | **NOT TESTED** | `guard_po_status_transition` in **SOURCE_STATIC** |
| Cancellation before/after reveal | **NOT TESTED** | |
| `reveal_status` direct tamper | **NOT TESTED** | `rfqs_no_rehide` trigger exists (**SOURCE_STATIC**) |

---

## Phase 5 — Payment (off-platform UTR)

| ID | Actor | Call | Expected | Actual | Before → After | Status |
| --- | --- | --- | --- | --- | --- | --- |
| P-OVERLOAD | catalog | `record_invoice_payment_atomic` overload count | Exactly **1** | `1` | — | **PASS** |
| P-AUTH-ANON | anon | `record_invoice_payment_atomic` | Denied | permission denied | — | **PASS** |
| P-BUYER-OK | manager | `record_invoice_payment_atomic` ₹100 on APPROVED contract invoice | `ok`; `balance_due` 500→400 | JSON `ok:true`, `PARTIALLY_PAID`, `balance_due:400` | 500.00 → 400.00 | **PASS** |
| — | unauthorized buyer | Fabricated payment on another org’s invoice | Rejected | Not executed | **NOT TESTED** |

No **PGRST203** observed (single function signature). Payment row + allocation created; invoice `balance_due` updated at runtime.

---

## Phase 6 — Discovery

| ID | Actor | Call | Expected | Actual | Status |
| --- | --- | --- | --- | --- | --- |
| F-DISC | manager | `SELECT … FROM rfq_invitations_manager` incl. `decline_reason` | Column exists; empty vs error distinct | `rows=1`, no error | **PASS** |

No fabricated GST, distance, or supplier network inserted for this test.

---

## Phase 7 — GST

| Control | Evidence | Local runtime status |
| --- | --- | --- |
| Checksum-valid GSTIN must not imply GST-verified or invent legal name/address | App/domain validation (`packages/domain/src/gst/gstin-lookup.ts`) + UI copy | **NOT CERTIFIED** (no DB RPC proving supplier cannot self-assert verified GST) |
| External GST API | N/A | **NOT TESTED** (by design: no integration) |

---

## Phase 8 — Admin email allowlist

| Item | Detail |
| --- | --- |
| Function | `private.is_platform_admin()` (`00179`, used in RLS and privileged paths) |
| JWT | Trusts `request.jwt.claims` email for allowlisted addresses; also `auth.users` / `profiles` email lists and `profiles.is_platform_admin` |
| Allowlist | **Unchanged** — e.g. `admin@otp.test`, `bvnbasu@gmail.com`, `ops@otp.test`, … (see `00179`) |
| MFA for admin | **UNKNOWN** (not proven locally) |
| Product stance | **REMEDIATION DEFERRED — REPLACEMENT REQUIRED BEFORE REMOVAL** |

---

## Phase 9 — PASS classification (DATABASE_RUNTIME only)

| PASS control | Evidence type |
| --- | --- |
| Anon six-function allowlist | DATABASE_RUNTIME |
| Anon deny wallet / subscription / award lock / PO / appoint / milestone / payment / wallet read | DATABASE_RUNTIME |
| Auth wallet null-fee, fake-fee, catalog subscription amount | DATABASE_RUNTIME |
| COI vote recusal | DATABASE_RUNTIME |
| COI-aware quorum denial (1 unconflicted vote) | DATABASE_RUNTIME |
| Supplier cannot APPROVE invoice | DATABASE_RUNTIME |
| Buyer `record_invoice_payment_atomic` + `balance_due` | DATABASE_RUNTIME |
| Single `record_invoice_payment_atomic` signature | DATABASE_RUNTIME |
| `decline_reason` on discovery view | DATABASE_RUNTIME |
| Migration SQL text / deploy dry-run / UI discovery mocks | **SOURCE_STATIC** / **UI_BLACKBOX** — **not** database certification |
| RFQ status whitelist + immutable keys (`00218`) | DATABASE_RUNTIME |
| Approval stage direct-write guard (`00219`) | DATABASE_RUNTIME |
| P0-GAP-1/2/3 (`p0-gaps-contract-run.mjs`) | DATABASE_RUNTIME |

---

## Phase 10 — Control matrix

| ID | Control | Evidence type | Local runtime | Source only | Production | Severity | Remaining risk | Required next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-ANON-ALLOWLIST | Anon EXECUTE exactly 6 public RPCs | DATABASE_RUNTIME | **PASS** | PASS | **NOT CERTIFIED** | P0 | Drift on hosted grants | Apply `00217` on staging; re-query `routine_privileges` |
| SEC-PUBLIC-EXECUTE | Revoke PUBLIC execute hole (`00217`) | DATABASE_RUNTIME | **PASS** | PASS | **NOT CERTIFIED** | P0 | Pre-00217 anon wallet read | Hosted grant audit |
| WALLET-ANON | Anon wallet credit | DATABASE_RUNTIME | **PASS** | PASS | **NOT CERTIFIED** | P0 | — | Fee-row idempotency test |
| WALLET-AUTH-FEE | Null/fake fee credit + real fee replay | DATABASE_RUNTIME | **PASS** (`P0-GAP-1`) | PASS | **NOT CERTIFIED** | P0 | Hosted replay | Staging fee-row test |
| SUB-CATALOG | Wallet subscription catalog amount | DATABASE_RUNTIME | **PASS** | PASS | **NOT CERTIFIED** | P0 | — | — |
| AWARD-ANON | Anon award lock / reveal | DATABASE_RUNTIME | **PASS** | PASS | **NOT CERTIFIED** | P0 | — | — |
| PO-ANON | Anon PO create | DATABASE_RUNTIME | **PASS** | PASS | **NOT CERTIFIED** | P0 | — | — |
| AWARD-REVEAL-PO-E2E | Authorised award → reveal → PO | DATABASE_RUNTIME | **PASS** (`P0-GAP-2`) | PASS | **NOT CERTIFIED** | P0 | Non-demo RFQ path | Staging E2E |
| ORG-APPOINT | Anon / manager outsider appoint | DATABASE_RUNTIME | **PASS** | PASS | **NOT CERTIFIED** | P0 | Owner demote not tested | Owner-path test |
| INV-SUPPLIER | Supplier APPROVED/PAID | DATABASE_RUNTIME | **PASS** | PASS | **NOT CERTIFIED** | P0 | PAID path not re-tested | Buyer progression test |
| MILESTONE-ANON | Anon milestone approve | DATABASE_RUNTIME | **PASS** | PASS | **NOT CERTIFIED** | P0 | Authorized path | Inspection fixture |
| GOV-COI-VOTE | COI recusal on vote | DATABASE_RUNTIME | **PASS** | PASS | **NOT CERTIFIED** | P1 | Waived COI | Edge-case fixtures |
| GOV-COI-QUORUM | COI excluded from award vote count | DATABASE_RUNTIME | **PASS** | PASS | **NOT CERTIFIED** | P1 | Success quorum | 2+ clean votes award test |
| PAY-RPC | Payment record + balance_due | DATABASE_RUNTIME | **PASS** | PASS | **NOT CERTIFIED** | P0 | Cross-org pay | Unauthorized buyer test |
| PAY-OVERLOAD | Single payment RPC | DATABASE_RUNTIME | **PASS** | PASS | **NOT CERTIFIED** | P1 | — | — |
| DISC-DECLINE | `decline_reason` column | DATABASE_RUNTIME | **PASS** | PASS | **NOT CERTIFIED** | P2 | — | — |
| SM-RFQ-UPDATE | RFQ status direct UPDATE | DATABASE_RUNTIME | **PASS** (`00218`) | PASS | **NOT CERTIFIED** | High | Pre-00218 bypass on hosted | Apply `00218` + rerun contract on staging |
| GST-TRUTH | No false GST verification in DB | SOURCE_STATIC | **NOT CERTIFIED** | PASS | **NOT CERTIFIED** | P2 | Self-assert | DB policy test if required |
| ADMIN-ALLOWLIST | Email allowlist admin | SOURCE_STATIC | **NOT CERTIFIED** | PASS | **NOT CERTIFIED** | P1 | JWT trust | Replacement before removal |
| APPROVAL-PROFILE | Approval + delegation identity matrix | DATABASE_RUNTIME | **PASS** (`P0-GAP-3`, `00219`) | PASS | **NOT CERTIFIED** | P0 | Hosted delegation | Staging approval matrix |

**PRODUCTION_VERIFIED:** **0** rows.

---

## Session commands (local only)

```text
node scripts/p0-gaps-contract-run.mjs
node scripts/local-db-contract-run.mjs
node node_modules/vitest/vitest.mjs run tests/security/verified-remediation-00216-database.test.ts
```

**Regression (this session):** `local-db-contract-run.mjs` — **27 PASS**, **0 FAIL**, **1 NOT TESTED** (`SM-AWARD-PROBE`); vitest `verified-remediation-00216-database.test.ts` — **9 passed**, 0 failed.

**Generated:** 2026-09-28 (evidence in `_local_contract_evidence.json`, `_p0_gaps_evidence.json`).
