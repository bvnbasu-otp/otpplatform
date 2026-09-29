# OTP Production Read-Only Security Preflight — 28 September 2026

**Task:** Hosted catalog and security posture check before any explicit apply of migrations `00216`–`00219`.  
**Repository HEAD:** `7b1afc12ac7761efc206c70db80486612a34d146` (matches baseline; uncommitted remediation may exist — not committed in this pass).  
**Local certified migrations (engineering):** `00216`, `00217`, `00218`, `00219` on disk under `supabase/migrations/`.  
**Prior `PRODUCTION_VERIFIED`:** `0` / not certified in `OTP_PRODUCTION_VERIFICATION_STATE.md`.

---

## A. Decision

| Outcome | **PRE-FLIGHT BLOCKED — REQUIRED READ-ONLY ACCESS UNAVAILABLE** |
| --- | --- |
| Rationale | No hosted PostgreSQL connection string or `SUPABASE_PROJECT_ID` + `SUPABASE_DB_PASSWORD` (or read-only equivalent) was present in the workspace shell, repo env files, or `supabase/.temp`. Without an authorised read-only session, migration ledgers, grants, RLS, admin function bodies, and wallet/payment counts on production cannot be queried. **UNKNOWN is not GREEN.** |
| Implication | Do **not** treat local Docker certification as hosted safety. Do **not** run `scripts/deploy-migrations.ts --status` or `--deploy` against production: `--status` invokes `ensureTrackingTables()` (DDL/policy changes) before reading ledgers. |

---

## B. Scope and absolute constraints (observed)

| Allowed this pass | Forbidden (not performed) |
| --- | --- |
| Repo read, local Docker `SELECT` with `default_transaction_read_only = on` | `supabase db push`, migration apply, any mutating SQL/RPC |
| File analysis of `00216`–`00219` | `git commit`, `git push`, deploy, config/code changes |
| Local file-only `deploy-migrations.ts --dry-run` | Production `deploy-migrations.ts --status` (DDL side effects) |

---

## C. Repository and environment baseline

| Item | Value |
| --- | --- |
| Git HEAD | `7b1afc12ac7761efc206c70db80486612a34d146` |
| Migration files on disk | `219` contiguous (`00001` … `00219`) |
| Local Docker DB | `127.0.0.1:54322` (`supabase_db_otp-local`) — **not production** |
| Documented hosted project ref (containment notes only) | `qsuvtcezffomtwzwyrso` — **not confirmed from live config** (no hosted API URL with project ref in repo env files) |
| Public app URL (site smoke only; not DB evidence) | `https://otpplatform-theta.vercel.app` |
| Credential files searched | `.env.production.example`, `.env.auth`, `.env.smtp`, `apps/web/.env`, `apps/web/.env.demo`, `apps/web/.env.example` — no hosted `DATABASE_URL` / pooler URL |

---

## D. Connection attempt and credential discovery

| Source | Result |
| --- | --- |
| Process environment (`DATABASE_URL`, `DIRECT_URL`, `DATABASE_POOLER_URL`, `SUPABASE_DB_URL`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`) | **Not set** in agent shell |
| Repo root `.env.production` | **Absent** |
| `supabase/.temp` / linked project ref file | **Absent** |
| Synthesised URL from project ref + password | **Not possible** (no password in repo) |

**Hosted catalog reads:** **NOT PERFORMED.**

**Recommended unblock (operator):** Provide a **read-only** role URL (or session-limited `postgres`/`service_role` used only with `SET default_transaction_read_only = on` and verification via `SHOW transaction_read_only`) stored outside git (e.g. CI secret or local `.env.production` never committed). Re-run Sections E–L SQL in a single read-only session.

---

## E. Migration ledger (Requirement 1)

### E.1 Hosted

| Migration | Local repo file | Hosted `supabase_migrations.schema_migrations` | Hosted `public.otp_schema_migrations` | Conclusion |
| --- | --- | --- | --- | --- |
| `00216` | Present | **NOT QUERIED** | **NOT QUERIED** | **UNKNOWN** |
| `00217` | Present | **NOT QUERIED** | **NOT QUERIED** | **UNKNOWN** |
| `00218` | Present | **NOT QUERIED** | **NOT QUERIED** | **UNKNOWN** |
| `00219` | Present | **NOT QUERIED** | **NOT QUERIED** | **UNKNOWN** |

**Hosted migration head:** **UNKNOWN** (documentation prior to `00216` work cited disk ceiling `00215` and live ceiling **UNKNOWN** — not superseded by this pass).

**Documentation expectation (not verified on hosted):** If production last matched the `00213`–`00215` release commit subject only, `00216`–`00219` are **likely absent** until explicitly applied; **this is not evidence**.

### E.2 Local reference only (Docker `127.0.0.1:54322`, read-only SQL)

| Migration | Local repo | `schema_migrations` (short key) | `otp_schema_migrations` (filename key) | `deploy-migrations.ts --status` (local only) | Conclusion |
| --- | --- | --- | --- | --- | --- |
| `00216` | Present | `00216` | `00216_verified_remediation_p0_p1_security_integrity.sql` | `[APPLIED]` (filename match) | **FULLY PRESENT** (local) |
| `00217` | Present | `00217` | *(no row)* | `[PENDING]` **false negative** | **FULLY PRESENT** in `schema_migrations`; ledger **split-brain** |
| `00218` | Present | `00218` | *(no row)* | `[PENDING]` false negative | **FULLY PRESENT** (local) |
| `00219` | Present | `00219` | *(no row)* | `[PENDING]` false negative | **FULLY PRESENT** (local) |

**Finding (local, risk class UNKNOWN for hosted):** `deploy-migrations.ts` matches applied versions as either full `*.sql` filename or `filename` without `.sql`, while `supabase_migrations.schema_migrations` stores **five-digit-only** keys (`00217`). Unless `otp_schema_migrations` also records the filename, **CLI status over-reports pending migrations**. **Direct SQL on both ledgers is mandatory for hosted preflight** — not CLI `--status`.

---

## F. Object inventory for `00216`–`00219` (Requirement 2)

Objects to verify on hosted (definitions from local migration files). **Hosted column: NOT QUERIED.**

| Object | Kind | Introduced / replaced by | Expected attributes (post-apply) | Hosted | Risk if missing / stale |
| --- | --- | --- | --- | --- | --- |
| `public.credit_buyer_settlement_reward_atomic(...)` | `SECURITY DEFINER` RPC | `00216` | Fee-row required; org membership; idempotent allocation | **UNKNOWN** | **VERIFIED VULNERABLE** (wallet mint / replay) if pre-`00216` body |
| `public.lock_and_reveal_award_atomic` | RPC | `00216` | Quorum / gates; revoke `PUBLIC`/`anon` | **UNKNOWN** | **VERIFIED VULNERABLE** if anon/PUBLIC execute |
| `public.reveal_award` | RPC | `00216` grants | `authenticated`, `service_role` only | **UNKNOWN** | **VERIFIED VULNERABLE** if anon execute |
| `public.create_purchase_order_from_award` | RPC | `00216` grants | Same | **UNKNOWN** | **VERIFIED VULNERABLE** if anon execute |
| `public.apply_wallet_credits_to_subscription_atomic` | RPC | `00216` | Catalog amount enforcement | **UNKNOWN** | **VERIFIED VULNERABLE** |
| `public.submit_rfq_tier_approval_atomic` | RPC | `00216` + `00219` patch | Profile-id fix; internal flag for stage writes | **UNKNOWN** | **VERIFIED VULNERABLE** (approval bypass) |
| `public.appoint_org_role_atomic` | RPC | `00216` | Owner/admin gates | **UNKNOWN** | **VERIFIED VULNERABLE** |
| `public.approve_milestone_inspection_atomic` | RPC | `00216` | Buyer/admin gates | **UNKNOWN** | **VERIFIED VULNERABLE** |
| `public.record_invoice_payment_atomic` | RPC | `00216` | Single signature; balance_due | **UNKNOWN** | **VERIFIED VULNERABLE** |
| `private.guard_invoice_supplier_status` + `trg_guard_invoice_supplier_status` | trigger | `00216` | Supplier cannot APPROVE/PAID | **UNKNOWN** | **VERIFIED VULNERABLE** |
| `private.guard_rfq_status_transition` + `trg_guard_rfq_status` | trigger | `00216` then **`00218` replaces body** | Whitelist + immutable keys | **UNKNOWN** | **VERIFIED VULNERABLE** (`EVALUATING→OPEN` regression) if pre-`00218` |
| `private.rfq_status_transition_allowed` | function | `00218` | Immutable SQL whitelist | **UNKNOWN** | Partial if `00216` guard without `00218` |
| `private.guard_rfq_approval_stage_direct_write` + `trg_guard_rfq_approval_stage_write` | trigger | `00219` | Blocks direct JWT writes to stages | **UNKNOWN** | **VERIFIED VULNERABLE** (GAP3 direct-write) |
| `00217` bulk revoke | grants | `00217` | `REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon`; restore anon allowlist (6) | **UNKNOWN** | **VERIFIED VULNERABLE** if `PUBLIC` execute remains (anon inherits) |

**Local reference (Docker):** All listed `public` RPCs exist, `prosecdef = true`, owner `postgres`, `search_path` set (verified via `pg_proc` read-only query). Triggers present after local apply through `00219`.

**Verification SQL (hosted, read-only):** `pg_proc` + `pg_get_functiondef` / `md5(pg_get_functiondef(...))`, `pg_trigger`, `pg_policies`, `pg_proc.proconfig`.

---

## G. Effective EXECUTE privileges (Requirement 3)

**Hosted: NOT QUERIED.**

| Function | PUBLIC | anon | authenticated | Expected after `00216`–`00219` | Production state |
| --- | --- | --- | --- | --- | --- |
| `credit_buyer_settlement_reward_atomic` | deny | deny | allow | deny / deny / allow + `service_role` | **UNKNOWN** |
| `lock_and_reveal_award_atomic` | deny | deny | allow | same | **UNKNOWN** |
| `reveal_award` | deny | deny | allow | same | **UNKNOWN** |
| `create_purchase_order_from_award` | deny | deny | allow | same | **UNKNOWN** |
| `apply_wallet_credits_to_subscription_atomic` | deny | deny | allow | same | **UNKNOWN** |
| `appoint_org_role_atomic` | deny | deny | allow | same | **UNKNOWN** |
| `approve_milestone_inspection_atomic` | deny | deny | allow | same | **UNKNOWN** |
| `record_invoice_payment_atomic` | deny | deny | allow | same | **UNKNOWN** |
| `get_organization_wallet` | deny | deny | allow | deny / deny / allow (`00217`) | **UNKNOWN** — pre-`00217` **VERIFIED VULNERABLE** locally via PUBLIC grant |
| Anon allowlist (6 helpers) | n/a | allow only these | n/a | `submit_signup_request`, OTP verify fns, `platform_heartbeat`, `service_categories`, `served_cities` | **UNKNOWN** |

**Local reference:** Matches expected deny for privileged RPCs and exactly six anon routines (per `OTP_LOCAL_DATABASE_CONTRACT_2026-09-28.md`).

**Hosted queries:** `information_schema.routine_privileges` and `has_function_privilege('anon', oid, 'EXECUTE')` (and `PUBLIC`).

---

## H. RLS, policies, triggers (Requirement 4)

**Hosted: NOT QUERIED.**

| Table | `relrowsecurity` / `forcerowsecurity` expected | Policies / notes | Triggers of interest |
| --- | --- | --- | --- |
| `rfqs` | enabled | org-scoped policies (pre-existing) | `trg_guard_rfq_status` (`00218`) |
| `rfq_approval_stages` | enabled | tier approval | `trg_guard_rfq_approval_stage_write` (`00219`) |
| `purchase_orders` | enabled | buyer/supplier | `trg_guard_po_status` (`00216`) |
| `invoices` | enabled | buyer/supplier | `trg_guard_invoice_supplier_status`, `trg_init_invoice_balance_due` (`00216`) |
| `organization_wallets` | enabled + forced (wallet migration) | member read / controlled mutate | — |
| `wallet_transactions` | enabled + forced | append-only | immutability trigger |
| `organization_members` | enabled | membership gates | — |
| `quotes` | enabled | sealed quote rules | — |

**Risk:** Without hosted read, RLS enablement and policy drift remain **UNKNOWN** (not **VERIFIED SAFE**).

---

## I. Platform admin (Requirement 5)

**Hosted: NOT QUERIED.**

| Check | Expected from repo (`00179` + helpers, not altered by `00216`–`00219`) | Hosted |
| --- | --- | --- |
| `private.is_platform_admin()` body | Hard-coded email allowlist includes `*.test` / `*.ai` addresses (e.g. `admin@otp.test`, `ops@otp.test`, `superadmin@otp.test`, `admin@procureos.test`, `bvnbasu@gmail.com`, …) plus `profiles.is_platform_admin` and `auth.users` email list | **UNKNOWN** |
| Count `profiles.is_platform_admin = true` | Operational count only (no email dump in report) | **NOT QUERIED** |

**Risk class:** **UNKNOWN** until function source and profile flags are read on hosted. Hardcoded `.test` allowlist on production would be **VERIFIED VULNERABLE** if those auth users exist.

---

## J. Wallet impact — counts only (Requirement 6)

**Hosted: NOT QUERIED.**

Planned read-only queries (operator / next pass):

- Total `wallet_transactions` rows; `tx_type = 'REWARD_CREDIT'` count.
- `buyer_reward_allocations` with `platform_fee_tx_id` null or orphan fee id.
- Org mismatch between allocation and `platform_fee_transactions.organization_id`.
- Duplicate allocations per `platform_fee_tx_id`.
- `max(amount)` where `tx_type = 'REWARD_CREDIT'`.

**Local Docker sample (not production):** `wallet_transactions` count `13` (read-only `SELECT`).

---

## K. Subscription and payment — counts only (Requirement 7)

**Hosted: NOT QUERIED.**

Planned: subscription table row counts, wallet redemption rows (`SUBSCRIPTION_REDEMPTION`), scan for ₹100 / ₹1000 catalog amounts in subscription/payment columns if present.

**Local:** Not expanded (hosted blocker). Schema defines `private.subscription_wallet_credit_inr` in `00216` for catalog enforcement.

---

## L. Operational entity counts (Requirement 8)

**Hosted: NOT QUERIED.**

Planned counts: `rfqs`, `rfqs` where `status = 'AWARDED'`, `purchase_orders`, `invoices`, `rfq_approval_stages`, committee votes, `wallet_transactions`.

---

## M. Hosted compatibility — per migration (Requirement 9)

**Method:** Static diff vs objects in repo migrations; **no migration executed on hosted**.

| Migration | Classification (hosted) | Evidence | Compatibility notes (if absent) |
| --- | --- | --- | --- |
| `00216` | **UNKNOWN** | No hosted catalog | Requires prior migrations through `00215` objects (`platform_fee_transactions`, wallet tables, approval RPCs). `CREATE OR REPLACE` idempotent if run once. Re-run after partial apply risks inconsistent bodies vs grants. |
| `00217` | **UNKNOWN** | No hosted catalog | Safe only after `00216` function set stable. `REVOKE … ALL ROUTINES IN SCHEMA public` is broad — brief window if run without immediate re-grant (script applies in one transaction). **Must not skip** if `00216` applied. |
| `00218` | **UNKNOWN** | No hosted catalog | Requires `private.guard_rfq_status_transition` from `00216`. Replaces trigger function; idempotent `DROP TRIGGER IF EXISTS`. Partial state: `00216` guard without whitelist = **PARTIALLY PRESENT** / vulnerable to status regression. |
| `00219` | **UNKNOWN** | No hosted catalog | Requires `rfq_approval_stages`, `submit_rfq_tier_approval_atomic`. Patches RPC to set `otp.approval_stage_internal`. Applying without `00216` approval fixes = **PARTIALLY PRESENT**. |

**Rule:** Object existence without ledger row ≠ migration recorded. Ledger format split (`00217` vs `00217_….sql`) must be reconciled on hosted before trusting deploy scripts.

---

## N. Risk register (Requirement 10)

| ID | Finding | Risk class |
| --- | --- | --- |
| R1 | No hosted read-only DB credentials in workspace | **NOT APPLICABLE** (process) — blocks certification |
| R2 | Hosted migration head unknown; `00216`–`00219` not catalog-proven | **UNKNOWN** |
| R3 | Documented pre-`00217` PUBLIC execute hole | **VERIFIED VULNERABLE** on any DB still pre-`00217` (proven locally; hosted **UNKNOWN**) |
| R4 | Pre-`00218` RFQ status direct update | **VERIFIED VULNERABLE** locally pre-patch; hosted **UNKNOWN** |
| R5 | Pre-`00219` approval stage direct write | **VERIFIED VULNERABLE** locally pre-patch; hosted **UNKNOWN** |
| R6 | `deploy-migrations.ts --status` DDL + version-key mismatch | **UNKNOWN** for hosted ops — can mislead pending count |
| R7 | `is_platform_admin` hardcoded `.test` emails in repo | **UNKNOWN** on hosted until `pg_get_functiondef` read |
| R8 | Live Vercel frontend | **NOT APPLICABLE** as migration evidence |

---

## O. Plan-only apply sequence and post-apply verification

### O.1 Preconditions (operator)

1. Restore point / PITR confirmed.  
2. Read-only preflight session completes Sections E–L on hosted with `PRODUCTION_VERIFIED: YES`.  
3. Decision **PRE-FLIGHT GREEN** from that report only.

### O.2 Apply order (NOT EXECUTED — authorisation required)

1. `00216_verified_remediation_p0_p1_security_integrity.sql`  
2. `00217_revoke_public_execute_default_privileges.sql` (**do not skip**)  
3. `00218_rfq_status_transition_whitelist.sql`  
4. `00219_guard_rfq_approval_stage_direct_write.sql`  

Use a single-transaction deploy path that records **both** ledgers with consistent keys (`filename` in `otp_schema_migrations` and short key in `supabase_migrations.schema_migrations`, matching `deploy-migrations.ts` insert pattern).

### O.3 Post-apply verification (read-only + controlled RPC probes on staging first)

1. Re-query both migration ledgers for `00216`–`00219` without duplicates.  
2. Grant audit: `PUBLIC`/`anon` on privileged RPCs; anon allowlist = 6.  
3. `md5(pg_get_functiondef)` for wallet, award, approval, invoice payment functions vs local golden hashes.  
4. Triggers present: `trg_guard_rfq_status`, `trg_guard_rfq_approval_stage_write`, invoice supplier guard.  
5. Negative probes: anon denied on wallet/award/PO/appoint/payment; signup helpers allowed.  
6. Positive smoke on staging: fee-row wallet replay, approval RPC, `EVALUATING→OPEN` blocked, direct `UPDATE rfq_approval_stages` blocked.  
7. Wallet/payment count deltas vs pre-apply snapshot (no repair scripts).  
8. `NOTIFY pgrst, 'reload schema'` only as part of authorised deploy tooling.

### O.4 Rollback

Reference `OTP Golden Reconstruction/PROD_CONTAINMENT/` scripts as **documentation only** — do not execute in this pass.

---

## Attestations

| Statement | Value |
| --- | --- |
| Production database modified | **NO** |
| Migrations applied to production | **NO** |
| Deployment performed | **NO** |
| Production verified (hosted catalog read) | **NO** |
| Hosted apply authorised by this task | **NO** |

PRODUCTION DATABASE MODIFIED: NO  
MIGRATIONS APPLIED TO PRODUCTION: NO  
DEPLOYMENT PERFORMED: NO  
PRODUCTION VERIFIED: NO  
HOSTED APPLY AUTHORIZED BY THIS TASK: NO  
NO HOSTED APPLY WAS PERFORMED.
