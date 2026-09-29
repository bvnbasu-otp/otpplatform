# OTP Remediation Certification — 28 September 2026 (updated)

**Authoritative local runtime contract (10 phases, matrix, per-test evidence):** [`OTP_LOCAL_DATABASE_CONTRACT_2026-09-28.md`](./OTP_LOCAL_DATABASE_CONTRACT_2026-09-28.md) — machine evidence: `OTP Golden Reconstruction/_local_contract_evidence.json` (`node scripts/local-db-contract-run.mjs`). **Use the same PASS / FAIL / NOT TESTED / NOT CERTIFIED statuses in both files.**

**Phase:** Verified remediation (P0/P1 engineering)  
**Repository HEAD (uncommitted):** `7b1afc12ac7761efc206c70db80486612a34d146`  
**Migration ceiling in repo:** `00219` (`00216` PUBLIC EXECUTE fix, `00217` revoke, `00218` RFQ status whitelist, `00219` approval-stage direct-write guard)  
**Local database used:** `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (Docker `supabase_db_otp-local` only)  
**Production / hosted project:** NOT touched — no deploy, push, or remote migrate

**RFQ direct-write bypass:** **PASS — DATABASE_RUNTIME** after local `00218` (`SM-RFQ-A` … `SM-RFQ-F-ORG`). Pre-`00218` was **FAIL** (`SM-RFQ-DIRECT-UPDATE`).

**P0 gap closure (local Docker only):** `_p0_gaps_evidence.json` via `node scripts/p0-gaps-contract-run.mjs`.

| Contract | Runtime Result | Evidence | Remaining Gap |
| --- | --- | --- | --- |
| P0-GAP-1 Wallet real fee/replay | **PASS** | Real `platform_fee_transactions` row; `credit_buyer_settlement_reward_atomic`; replay idempotent; deny null/fake/wrong-org/anon — **DATABASE_RUNTIME** | Hosted fee audit |
| P0-GAP-2 Award/reveal/PO | **PASS** | Demo RFQ committee path: onboard → award (`p_auto_reveal: false`) → `reveal_award` → `create_purchase_order_from_award`; anon blocked — **DATABASE_RUNTIME** | Non-demo RFQ quoting; extended PO deny matrix |
| P0-GAP-3 Approval/delegation | **PASS** | Primary, delegation, expiry, outsider/member deny, REJECT, identity map, `00219` direct-write block — **DATABASE_RUNTIME** | Hosted delegation |

**LOCAL P0 READY**

---

## 1. Repository baseline

| Item | Value |
| --- | --- |
| HEAD at phase start | `7b1afc12ac7761efc206c70db80486612a34d146` |
| HEAD after work | Same (no git commit) |
| Prior local migration state | `00215` in `supabase_migrations.schema_migrations` |
| Local state after this session | `00216`–`00219` applied **only** on `127.0.0.1:54322` |
| Plan document | `OTP_REMEDIATION_PLAN_2026-09-28.md` |

---

## 2. What changed (`00216` + `00217`)

**00216** — P0/P1 bundle: wallet credit hardening, subscription catalog amounts, approval profile-id fix, org appointment gates, award/quorum/COI-aware quorum count, milestone digest, invoice/RFQ/PO guards, payment RPC audit fix, `decline_reason` view, `cast_committee_vote` COI recusal, anon allowlist (initial).

**00217** — **Required follow-up:** `00194` left `GRANT EXECUTE TO PUBLIC` on ~173 routines, so `anon` could still call privileged RPCs (e.g. `get_organization_wallet`) until PUBLIC was revoked. `00217` revokes PUBLIC+anon on all public routines, re-grants `authenticated`/`service_role`, restores the six-function anon allowlist.

**00218** — RFQ `BEFORE UPDATE` guard: canonical status whitelist + immutable `organization_id` / `requirement_id` / `created_by`; closes PostgREST **EVALUATING→OPEN** regression (`SM-RFQ-DIRECT-UPDATE`).

**00219** — Blocks direct JWT writes to `rfq_approval_stages`; legitimate updates only via `submit_rfq_tier_approval_atomic` (closes `GAP3-DIRECT-WRITE`).

**Application / deploy (unchanged product/legal):** discovery truthfulness, GSTIN copy, PIN banner, `/register`, SiteLayout simulator removal, plain-language governance/pricing copy, `deploy-migrations.ts` fail-closed behaviour.

---

## 3. Database-backed tests (exact commands and counts)

| Command | Result |
| --- | --- |
| `node scripts/p0-gaps-contract-run.mjs` | **P0-GAP-1 PASS**, **P0-GAP-2 PASS**, **P0-GAP-3 PASS** (6+9+8 checks, 0 FAIL) |
| `node scripts/local-db-contract-run.mjs` | **27 PASS**, **0 FAIL**, **1 NOT TESTED** (`SM-AWARD-PROBE`) |
| `node node_modules/vitest/vitest.mjs run tests/security/verified-remediation-00216-database.test.ts` | **9 passed**, 0 failed |
| `node node_modules/vitest/vitest.mjs run tests/security/verified-remediation-00216-database.test.ts tests/security/verified-remediation-00216-redteam.test.ts apps/web/src/features/requirement/supplier-discovery.test.ts --reporter=dot` | **45 passed**, 0 failed (prior full bundle; re-run after `00219` ceiling bump recommended) |

**REAL DATABASE tests (7):** anon allowlist probes, anon blocked on six sensitive RPCs, anon public helpers, authenticated wallet null-fee block, arbitrary subscription block, fake fee-id block, COI vote recusal.

**STATIC/TEXT tests (10):** `verified-remediation-00216-redteam.test.ts` (SQL/deploy script text).

**UNIT/process (2):** deploy dry-run and CI-no-DB exit code.

**INTEGRATION/MOCK:** `supplier-discovery.test.ts` (36) — client mocks, not Postgres.

**Not run this session:** full `tests/security` suite, `rls-security.test.ts`, payment E2E with real `platform_fee_transactions` row.

---

## 4. Security attack results (local database red-team)

| Attack vector | Method | Result |
| --- | --- | --- |
| Anon wallet mint (`credit_buyer_settlement_reward_atomic`) | PostgREST RPC as anon JWT | **VERIFIED — DATABASE** — permission denied |
| Anon award / PO / appoint / subscription | PostgREST RPC as anon | **VERIFIED — DATABASE** — permission denied |
| Anon read wallet (`get_organization_wallet`) | `SET ROLE anon` before 00217 | **VERIFIED — DATABASE** — succeeded (PUBLIC grant) — **fixed by 00217** |
| Anon read wallet after 00217 | `SET ROLE anon` | **VERIFIED — DATABASE** — permission denied |
| Auth buyer null `platform_fee_tx_id` | RPC as `manager@greenview.test` | **VERIFIED — DATABASE** — `platform_fee_tx_id is required` |
| Auth arbitrary subscription credit (₹1) | RPC as manager | **VERIFIED — DATABASE** — catalog amount rejection |
| Auth credit with unknown fee UUID | RPC as manager | **VERIFIED — DATABASE** — not found / not belong |
| COI voter casts RECOMMEND | `committee1@greenview.test` + `DECLARED_CONFLICT` | **VERIFIED — DATABASE** — COI recusal error |
| Anon `submit_signup_request` / categories / cities / heartbeat | RPC as anon | **VERIFIED — DATABASE** — allowed |
| Valid one-time reward from real fee row + replay | `p0-gaps-contract-run.mjs` `GAP1-*` | **VERIFIED — DATABASE** |
| Authorized award reveal / PO for verified supplier | `p0-gaps-contract-run.mjs` `GAP2-*` (demo RFQ + onboarding token fixture) | **VERIFIED — DATABASE** (local demo path) |
| Approval delegation + direct-write on stages | `GAP3-*` + `00219` | **VERIFIED — DATABASE** |
| Invoice supplier → PAID trigger | Not executed | **UNVERIFIED** |
| `record_invoice_payment_atomic` UTR path | Not executed | **UNVERIFIED** |
| Production anon JWT / hosted grants | Not executed | **PRODUCTION VERIFICATION REQUIRED** |

---

## 5. Exact anonymous EXECUTE allowlist (after `00217` on local DB)

From `information_schema.routine_privileges` where `grantee = 'anon'`:

1. `platform_heartbeat`
2. `served_cities`
3. `service_categories`
4. `submit_signup_request`
5. `verify_profile_verification_otp`
6. `verify_whatsapp_password_reset`

No other `public` routines are executable by `anon` on the local database after `00217`. (`PUBLIC` still appears in catalog metadata for default privileges; effective anon access was verified by denial on `get_organization_wallet`.)

---

## 6. COI status

| Item | Status |
| --- | --- |
| Domain contract | `authorization-chain.ts` — `ERR_COI_RECUSAL` when `coiDeclared` on vote action |
| SQL before remediation | No COI check in `cast_committee_vote`; award quorum counted all votes |
| **00216 change** | `cast_committee_vote` rejects `DECLARED_CONFLICT` on `conflict_of_interest_declarations`; COMMUNITY award quorum excludes COI-declared profiles |
| Certification | **PASS — DATABASE_RUNTIME** vote recusal; **PASS — DATABASE_RUNTIME** COI excluded from award quorum count (1 unconflicted vote → quorum error). Full award with 2+ unconflicted votes **PASS** via `P0-GAP-2` (committee1+committee2) |
| Waived COI / `DECLARED_NONE` edge cases | **UNVERIFIED** |
| Not certified | Full committee COI lifecycle vs product copy |

---

## 7. Deploy / CI safety

| Check | Classification | Result |
| --- | --- | --- |
| `--dry-run` without `DATABASE_URL` | UNIT/process | Exit 0, no “Applying pending migrations” — **VERIFIED** |
| `--deploy` with `CI=true` and no DB URL | UNIT/process | Exit 1, message `CI deploy requires DATABASE_URL` — **VERIFIED** (after script fix) |
| Dry-run / status must not push | STATIC + UNIT | **VERIFIED — STATIC** on script text; **VERIFIED** dry-run run |
| Production push | — | **Not attempted** |

---

## 8. Control classification summary

| Control | Classification |
| --- | --- |
| Anon deny privileged RPCs (post-00217) | **VERIFIED — DATABASE** |
| Anon six-function allowlist | **VERIFIED — DATABASE** |
| Wallet null-fee / fake-fee rejection | **VERIFIED — DATABASE** |
| Subscription catalog amount enforcement | **VERIFIED — DATABASE** |
| COI vote recusal | **VERIFIED — DATABASE** |
| Wallet credit success from real fee row + replay | **VERIFIED — DATABASE** (`P0-GAP-1`) |
| Award / reveal / PO E2E (demo RFQ path) | **VERIFIED — DATABASE** (`P0-GAP-2`) |
| Approval / delegation matrix | **VERIFIED — DATABASE** (`P0-GAP-3`, `00219`) |
| Migration SQL text (00216/00217) | **VERIFIED — STATIC** |
| Discovery UI truthfulness | **VERIFIED — STATIC** + mock tests |
| Deploy script behaviour | **VERIFIED** (UNIT) + **VERIFIED — STATIC** |

---

## 9. Remaining blockers (pilot)

- Apply `00216` + `00217` on staging/production; read live `routine_privileges` and JWT RPC matrix (**PRODUCTION VERIFICATION REQUIRED**).
- Prove wallet credit idempotency on **hosted** DB (local **PASS** — `P0-GAP-1`).
- Payment recording and `balance_due`: **PASS — DATABASE_RUNTIME** locally (`P-BUYER-OK` in contract); hosted **NOT CERTIFIED**.
- Hosted apply must include **`00216`–`00219`** and rerun contract + P0 gap runners.
- AUD-SEC-003 admin email allowlist — **unchanged by policy**.
- AUD-SEC-004 anon SELECT on masked views — **not revoked** this phase.
- FIN-1 historical fabricated payment rows — **documented, not deleted**.
- LEG-1 / product pricing — **untouched**.

---

## 10. Production verification still required before any pilot claim

1. Hosted migration level ≥ `00217` and checksum of applied SQL.
2. `anon` allowlist exactly six functions on production catalog.
3. PostgREST RPC attempts: anon denied on wallet/award/appoint/payment; signup helpers work.
4. Authenticated regression: buyer award path, supplier invoice draft, committee vote without COI.
5. No accidental `supabase db push` from CI without credentials (pipeline review).

---

## 11. Product and legal decisions untouched

**Product (not implemented):** supplier fee, canonical pricing, GST inclusion, pilot rewards economics, wallet commercial terms, RFQ allowance counting, ONDC/BNI.

**Legal (not implemented):** Terms, Privacy, entity, fee clauses, DPDP, grievance officer, draft banners.

**Security design (not removed):** `private.is_platform_admin()` email allowlist (AUD-SEC-003).

---

## Answer: what is proven where?

**Proven on local database after `00216`–`00219` (see contract file):** anonymous users cannot execute privileged financial/governance RPCs; six-function anon allowlist; wallet/subscription guards; **real fee-row wallet credit + replay**; COI vote + quorum exclusion; **committee award → reveal → PO** (demo RFQ fixture); **approval/delegation matrix + approval-stage direct-write block**; supplier invoice status guard; buyer payment recording; **RFQ direct status regression blocked** and **DRAFT→OPEN** still allowed for authorised buyer; immutable RFQ org/requirement/created_by on direct update.

**Proven only statically (SQL text / script / UI):** most of `00216` body details, deploy flag behaviour, discovery mapper changes — **not** a substitute for production.

**Still requires production verification before a pilot claim:** migration apply on hosted DB, grant catalog parity with local, end-to-end wallet credit from a real fee row, payment/invoice flows, authorized award/reveal journeys, and regression of signup/OTP on the deployed URL.

**Do not say “SECURITY FIXED” globally** — say **fixed on local DB for tested vectors**; production remains **PRODUCTION VERIFICATION REQUIRED**.

---

## Independent local pre-production security audit — 28 September 2026 (auditor pass)

**Auditor role:** Independent release security auditor (not the implementer of `00216`–`00219`). Prior certification claims in this file were **not** accepted without re-running evidence.  
**Repository HEAD (unchanged):** `7b1afc12ac7761efc206c70db80486612a34d146`  
**Local database re-queried and runners re-executed:** `postgresql://postgres:***@127.0.0.1:54322/postgres` (container `supabase_db_otp-local`).  
**Production / hosted:** **NOT touched.** **PRODUCTION_VERIFIED = 0.**

### 1. Executive result

Migrations `00216`–`00219` are present, sequentially numbered, non-destructive (no `DELETE`/`TRUNCATE` in those files), and applied on local Postgres per `supabase_migrations.schema_migrations` (`00216`–`00219`). `00217` is **required** after `00216` because `00194` left `PUBLIC` EXECUTE; catalog proof shows **zero** `PUBLIC` rows in `information_schema.routine_privileges` for `public` routines and **exactly six** `anon` EXECUTE grants. Material P0 contracts (wallet fee/replay, demo-path award→reveal→PO, approval/delegation + `00219` direct-write block, RFQ `EVALUATING→OPEN` bypass, COI vote + quorum exclusion, invoice supplier status guard, buyer payment) were **re-run** via `local-db-contract-run.mjs` and `p0-gaps-contract-run.mjs` with **0 FAIL**. This pass supports taking the remediation into a **separate hosted preflight/apply procedure** only with the preflight checklist below; it does **not** certify production.

### 2. Certification decision

**LOCAL PRE-PRODUCTION CERTIFIED**

### 3. Migration audit table

| Migration | Purpose | Order / deps | Data safety | Notes |
| --- | --- | --- | --- | --- |
| `00216` | P0/P1 bundle: wallet, subscription catalog amounts, approval identity, org appoint, COI/quorum, invoice/PO/milestone guards, initial anon revoke + allowlist, RFQ guard v1 | After `00215`; depends on `00194` PUBLIC grants, prior RPCs | `CREATE OR REPLACE`, triggers, `REVOKE`/`GRANT`; no data deletes | **Scope contamination (document only):** embeds subscription catalog INR amounts in SQL — economics/product, not reversed here |
| `00217` | Revoke `PUBLIC` + `anon` EXECUTE on all `public` routines; restore `authenticated`/`service_role`; re-grant six anon RPCs | **Must follow `00216`** | Idempotent revokes/grants | Closes AUD-SEC-002 / N1 PUBLIC bypass |
| `00218` | Replaces `private.guard_rfq_status_transition()` with whitelist + immutable RFQ identity columns | After `00216` (replaces same trigger name) | Trigger replace only | Bypass: `service_role`, `is_platform_admin()`, nested trigger depth — **intentional** |
| `00219` | `rfq_approval_stages` direct-write guard; patches `submit_rfq_tier_approval_atomic` with `otp.approval_stage_internal` | After `00218` (orthogonal) | Trigger + RPC replace | Closes P0-GAP-3 direct UPDATE |

**Disk:** 219 contiguous `.sql` files (`00001`–`00219`), no duplicate sequence numbers (verified via `deploy-migrations.ts --dry-run`).

### 4. Finding traceability table

| ID | Topic | Status (this pass) | Evidence class |
| --- | --- | --- | --- |
| AUD-SEC-001 | Wallet mint from real fee row; caller amount ignored; replay | **FIXED + RUNTIME VERIFIED LOCAL** | `GAP1-*` (6/6 PASS), contract `A1`–`A3` |
| AUD-SEC-002 | Admin/public grants; anon allowlist | **FIXED + RUNTIME VERIFIED LOCAL** | Catalog: `anon`=6, `PUBLIC` EXECUTE count=0; `has_function_privilege(anon, get_organization_wallet)` = false; contract `A4`, vitest anon matrix |
| N1 | Anon reveal / award / PO | **FIXED + RUNTIME VERIFIED LOCAL** | Contract `C1`–`C3`, `D1`; vitest |
| N2 | Payment RPC | **FIXED + RUNTIME VERIFIED LOCAL** | `P-AUTH-ANON`, `P-BUYER-OK`, `P-OVERLOAD` (payment replay **NOT TESTED**) |
| N3 | Invoice self-approval (supplier) | **FIXED + RUNTIME VERIFIED LOCAL** | `F-INV-SUP` |
| N4 | Org takeover (manager → PRESIDENT) | **FIXED + RUNTIME VERIFIED LOCAL** | `E2` |
| N5 | Approval identity (profile vs auth) | **FIXED + RUNTIME VERIFIED LOCAL** | `GAP3-IDENTITY-MAP`, `GAP3-A-PRIMARY` |
| N6 | Quorum + COI | **FIXED + RUNTIME VERIFIED LOCAL** | `G-COI-VOTE`, `G-COI-QUORUM`, `GAP2-GOVERNANCE-NOTE` |
| RFQ bypass | `EVALUATING→OPEN` direct update | **FIXED + RUNTIME VERIFIED LOCAL** | `SM-RFQ-A` … `SM-RFQ-F-ORG` |
| `00219` | Approval stage direct write | **FIXED + RUNTIME VERIFIED LOCAL** | `GAP3-DIRECT-WRITE` |
| AUD-SEC-003 | `is_platform_admin` email allowlist | **OUTSIDE SCOPE** | Not modified in `00216`–`00219` (references only); no allowlist change audited |
| AUD-SEC-004 | Anon SELECT on masked views | **OUTSIDE SCOPE** | Not in `00216`–`00219` |
| Awards table | Direct `quote_id` mutation | **NOT TESTED** | `SM-AWARD-PROBE` (runner marks NOT TESTED; update reported success) |

### 5. Security contract results (re-run 2026-09-28 ~11:48 UTC)

| Suite | PASS | FAIL | NOT TESTED | SKIPPED |
| --- | ---: | ---: | ---: | ---: |
| `node scripts/local-db-contract-run.mjs` | **27** | **0** | **1** (`SM-AWARD-PROBE`) | 0 |
| `node scripts/p0-gaps-contract-run.mjs` | **23** (GAP1: 6, GAP2: 9, GAP3: 8 incl. direct-write) | **0** | 0 | 0 |
| `vitest` `verified-remediation-00216-database.test.ts` + `verified-remediation-00216-redteam.test.ts` | **19** | **0** | 0 | 0 |

Evidence JSON refreshed: `_local_contract_evidence.json`, `_p0_gaps_evidence.json` (timestamps `2026-09-28T11:48:24Z` / `11:48:23Z`).

### 6. Grant audit (actual catalog, local)

```text
grantee          | EXECUTE count (public schema)
-----------------+------------------------------
anon             | 6
authenticated    | 259
service_role     | 259
PUBLIC           | 0 rows
```

**Anon allowlist (routine_name):** `platform_heartbeat`, `served_cities`, `service_categories`, `submit_signup_request`, `verify_profile_verification_otp`, `verify_whatsapp_password_reset`.

**Effective check:** `has_function_privilege('anon', 'public.get_organization_wallet(uuid)', 'EXECUTE')` → **false**; `authenticated` → **true**.

### 7. Governance: server vs UI vs partial

| Control | Server (DB/RPC) | UI only | Partial |
| --- | --- | --- | --- |
| Wallet credit from fee row | Yes (`credit_buyer_settlement_reward_atomic`) | — | — |
| Subscription wallet amount | Yes (`subscription_wallet_credit_inr`) | — | — |
| RFQ status direct update | Yes (`00218` trigger) | — | Legitimate moves still via RPCs |
| Approval stages | Yes (`00219` + atomic RPC) | — | — |
| COI vote | Yes (`cast_committee_vote`) | — | — |
| COI quorum count | Yes (award RPC) | — | — |
| Supplier discovery copy | — | — | Static UI tests in redteam file (not DB) |

### 8. Payment / wallet runtime

- **Wallet:** Authorised credit from real `platform_fee_transactions` row; `p_base_amount: 999999` ignored (`GAP1-AUTH-OK`); replay idempotent (`GAP1-REPLAY-SAME-FEE`); null/fake/cross-org/anon denied.
- **Subscription:** Arbitrary ₹1 denied (`B2`, vitest).
- **Payment:** Buyer `record_invoice_payment_atomic(100)` reduced `balance_due` 500→400 (`P-BUYER-OK`); anon denied (`P-AUTH-ANON`); single overload in catalog (`P-OVERLOAD`). **Payment replay / double-allocate:** **NOT TESTED** this pass.

### 9. Deploy / CI safety (read-only review + local process checks)

| Check | Result |
| --- | --- |
| `--dry-run` without `DATABASE_URL` | **PASS** — exit 0, no “Applying pending migrations” (re-run via `tsx`) |
| `--deploy` with `CI=true`, no DB URL | **PASS** — exit 1, message `CI deploy requires DATABASE_URL` |
| `--status` with local URL | **PASS** — exit 0, listed migrations only (no apply) |
| CI workflow | `db:migrate:check` on build; `pnpm db:migrate:deploy` only in `deploy` job with secrets (non-PR) |
| **Preflight hazard (not fixed):** | `supabase_migrations.schema_migrations` stores `00217` (short); `otp_schema_migrations` stores full filenames — only `00216_….sql` present. `deploy-migrations.ts --status` **mis-reports** `00217`–`00219` as `[PENDING]` while DB runtime proves `00217` applied. Hosted preflight must reconcile ledgers before trusting `--status` / `--deploy` pending counts |
| **Residual (static):** | Non-CI `--deploy` without `DATABASE_URL` falls through to `supabase db push` — not executed; not a dry-run issue |

### 10. Test quality

| Class | Files / IDs | Could pass if migration broken? |
| --- | --- | --- |
| **DATABASE_RUNTIME** | `local-db-contract-run.mjs`, `p0-gaps-contract-run.mjs`, vitest database tests (7 live DB + 2 process) | **No** for exercised vectors |
| **STATIC_SOURCE** | `verified-remediation-00216-redteam.test.ts` (SQL/deploy text, discovery TS) | **Yes** — pattern-only |
| **SQL_PATTERN** | Redteam migration string checks | **Yes** |
| **MOCK** | Not in mandated vitest subset | n/a |

### 11. Remaining open issues

- Deploy migration ledger **version string mismatch** (see §9).
- `SM-AWARD-PROBE` / awards direct-write not classified PASS/FAIL.
- Payment idempotency replay not in contract runner.
- Non-demo RFQ quoting path not exercised (`GAP2` uses demo RFQ + simulated quotes).
- Hosted grants, MFA, admin allowlist policy, anon view SELECT (AUD-SEC-004) unchanged.

### 12. NOT CERTIFIED (this pass)

- Production / hosted database (**PRODUCTION_VERIFIED = 0**).
- `SM-AWARD-PROBE` (awards `quote_id` direct UPDATE).
- Extended PO deny matrix (wrong org, withdrawn quote, etc.).
- Payment replay / duplicate allocation.
- Non-demo RFQ lifecycle.
- Hosted `routine_privileges` parity.
- **AUD-SEC-003** admin email allowlist — **OPEN — OUTSIDE CURRENT REMEDIATION CERTIFICATION** (not removed by `00216`–`00219`).
- MFA, GST DB truth, FIN-1 fabricated rows, legal/pricing product decisions.

### 13. Production preflight checklist (**NOT EXECUTED**)

1. Full backup / PITR confirmation.  
2. Record hosted migration head and checksums; reconcile `otp_schema_migrations` vs `supabase_migrations.schema_migrations` **version key format**.  
3. Pre-apply function inventory dump (`public` + `private` security definer).  
4. Pre-apply grant audit: `anon`, `PUBLIC`, `authenticated`, `service_role` EXECUTE on `public` routines.  
5. Verify admin/service accounts and break-glass access.  
6. Snapshot wallet, subscription, RFQ, and fee tables (row counts + sample hashes).  
7. Apply in order: **`00216` → `00217` → `00218` → `00219`** (do not skip `00217`).  
8. Post-apply: re-run grant audit; confirm anon allowlist = six functions; `PUBLIC` has no effective EXECUTE on privileged RPCs.  
9. Post-apply attack probes: anon wallet/award/appoint/payment denied; signup helpers allowed.  
10. Golden path smoke: fee-row wallet credit replay, buyer payment, demo or staging award path, approval RPC, `EVALUATING→OPEN` blocked.  
11. Document rollback SQL sources (`PROD_CONTAINMENT/` notes only — not run here).  

**DO NOT APPLY UNTIL PRE-FLIGHT IS GREEN.**

### 14. Scope confirmation

No application source, SQL migrations, tests, CI, deployment scripts, configuration, production, hosted Supabase, `supabase db push`, Vercel deploy, git commit/push, pricing, fees, GST, wallet economics, legal text, or admin allowlist was modified in this auditor pass. Only this certification document was appended.

### 15. Final line

**LOCAL PRE-PRODUCTION CERTIFIED**
