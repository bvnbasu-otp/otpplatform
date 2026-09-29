PRODUCTION DATABASE MODIFIED: NO
MIGRATIONS APPLIED: NO
DEPLOYMENT PERFORMED: NO
HOSTED APPLY PERFORMED: NO

# OTP Hosted Read-Only Verification — 28 September 2026

**Agent role:** Independent hosted PostgreSQL verification (read-only; no mutations).  
**Expected hosted project ref (documentation):** `qsuvtcezffomtwzwyrso` (`otpplatform`).  
**Verification timestamp (local):** 2026-09-28 (UTC+5:30).

---

## Decision

**HOSTED VERIFICATION BLOCKED**

Credentials were loaded from the mandated file only (`G:\My Drive\otp\.env.auth`) via Node `fs.readFileSync` and in-memory dotenv parsing. That file exists but contains **only local GoTrue / SMTP configuration** (`GOTRUE_*`, `API_EXTERNAL_URL`). There is **no** `DATABASE_URL`, `SUPABASE_DB_URL`, `SUPABASE_DB_PASSWORD`, `PGHOST`/`PGPASSWORD`, or other hosted Supabase pooler connection material.

The sole postgres-shaped key is **`GOTRUE_DB_DATABASE_URL`**, which resolves to host **`supabase_db_otp-local`** (Docker-internal auth database), not `pooler.supabase.com` and not project ref `qsuvtcezffomtwzwyrso`. Per task rules, local Docker was **not** connected or treated as production.

**Read-only gate:** `SET default_transaction_read_only = on` / `SHOW transaction_read_only` / `SELECT current_setting('transaction_read_only')` were **not executed** (no hosted session).

---

## Attestations (connection / secrets)

| Statement | Value |
| --- | --- |
| DATABASE CREDENTIAL SOURCE | `.env.auth` |
| PASSWORD PRINTED | **NO** |
| CREDENTIAL PERSISTED | **NO** (no secrets written to repo, report body, git, or auxiliary env files) |
| READ-ONLY SESSION CONFIRMED | **NO** (no hosted connection) |

**Client:** `pg` from `node_modules/pg` (present; not used for a successful hosted session). **psql:** not used. **npm install:** not performed.

**Key names present in `.env.auth` (names only):** `API_EXTERNAL_URL`; full `GOTRUE_*` set including `GOTRUE_DB_DATABASE_URL`, `GOTRUE_SITE_URL`, `GOTRUE_API_HOST`, `GOTRUE_API_PORT`, JWT/mailer/SMTP keys. **Absent:** `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_DB_URL`, `SUPABASE_DB_PASSWORD`, `DIRECT_URL`, `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `POSTGRES_*`.

**Postgres URL key scan (values not logged):** `GOTRUE_DB_DATABASE_URL` only → non-pooler host `supabase_db_otp-local`, not loopback IP but **local stack**, not hosted OTP Postgres.

**Agent shell environment:** not used for connection (task: do not assume shell env).

**Git `HEAD` (baseline, non-secret):** `7b1afc12ac7761efc206c70db80486612a34d146` (if unchanged since local certification).

---

## Connection proof

| Step | Result |
| --- | --- |
| Load `.env.auth` in Node memory only | **OK** — file read; keys parsed |
| Build hosted `pg` config | **FAILED** — no hosted URL/password fields |
| Connect to `pooler.supabase.com` / project ref | **No** |
| `SET default_transaction_read_only = on` | **Not run** |
| `SHOW transaction_read_only` | **Not run** |
| `SELECT current_setting('transaction_read_only')` | **Not run** |
| `SELECT current_database(), current_user` | **Not run** |
| `SELECT version()` | **Not run** |

If read-only had not been exactly `on`, the task requires stop with **HOSTED VERIFICATION BLOCKED — READ-ONLY MODE NOT CONFIRMED**. That branch was not reached.

---

## Identity (hosted)

**NOT VERIFIED** — no session. Hosted OTP identity (`qsuvtcezffomtwzwyrso` on Supabase pooler) was **not** confirmed from `current_database()` / server metadata.

---

## Migration ledger

**Hosted:** **NOT QUERIED.**

Planned read-only SQL (not executed):

- `supabase_migrations.schema_migrations`
- `public.otp_schema_migrations` (if present)

### 00212–00219 (hosted)

| Migration | Local repo file | Hosted ledger |
| --- | --- | --- |
| 00212 | `00212_reconcile_supplier_verification_buyer_addresses_and_self_service_signup.sql` | **NOT VERIFIED** |
| 00213 | `00213_fix_invite_direct_supplier_email_channel.sql` | **NOT VERIFIED** |
| 00214 | `00214_demo_reset_reanchors_demo_rfq_deadlines.sql` | **NOT VERIFIED** |
| 00215 | `00215_withhold_direct_invite_link_for_existing_suppliers.sql` | **NOT VERIFIED** |
| 00216 | `00216_verified_remediation_p0_p1_security_integrity.sql` | **NOT VERIFIED** |
| 00217 | `00217_revoke_public_execute_default_privileges.sql` | **NOT VERIFIED** |
| 00218 | `00218_rfq_status_transition_whitelist.sql` | **NOT VERIFIED** |
| 00219 | `00219_guard_rfq_approval_stage_direct_write.sql` | **NOT VERIFIED** |

Numeric vs filename vs timestamp representation on hosted: **unknown**.

---

## Functions / triggers / policies (hosted catalog)

**NOT QUERIED.** No `pg_get_functiondef`, trigger, or policy introspection on hosted.

**Local certification baseline (for reconciliation only):** wallet credit (`credit_buyer_settlement_reward_atomic`, `WALLET-REWARD-FEE-REQUIRED`), subscription catalog (`private.subscription_wallet_credit_inr` / `apply_wallet_credits_to_subscription_atomic`), award/reveal/PO RPCs, `appoint_org_role_atomic`, milestone approve/reject, `record_invoice_payment_atomic`, `cast_committee_vote` + COI/`DECLARED_CONFLICT`/`unconflicted` quorum language, RFQ guards (`guard_rfq_status_transition`, `rfq_status_transition_allowed`, `RFQ-STATUS-TRANSITION`, `RFQ-IMMUTABLE`), invoice supplier guard (`INV-SUPPLIER-STATUS`), approval-stage direct-write guard (`00219`), `private.get_profile_id` in approval path, `private.is_platform_admin` allowlist — all **NOT VERIFIED** on hosted.

---

## Anon / PUBLIC EXECUTE (hosted)

**NOT QUERIED.**

| Metric | Hosted |
| --- | --- |
| HOSTED PUBLIC EXECUTE COUNT | **NOT VERIFIED** |
| HOSTED ANON EXECUTE COUNT | **NOT VERIFIED** |
| Anon/PUBLIC routine list | **NOT VERIFIED** |

Local expectation after `00217`: six anon-executable public helpers only (`platform_heartbeat`, `served_cities`, `service_categories`, `submit_signup_request`, `verify_profile_verification_otp`, `verify_whatsapp_password_reset`).

---

## RFQ status machine (hosted)

**NOT VERIFIED.**

Expected from local `00218`: `EVALUATING`→`OPEN` and `AWARDED`→`EVALUATING` rejected in guard text; `organization_id`, `requirement_id`, `created_by` immutable on direct UPDATE. No UPDATE probes were run (blocked).

---

## Approval stages (`00219`)

**NOT VERIFIED.**

`private.guard_rfq_approval_stage_direct_write` + trigger on `rfq_approval_stages`: **unknown** on hosted.

---

## Wallet (8-point checklist, definition + grants)

**NOT VERIFIED** on hosted. Local `00216` checklist items (fee required marker, null-fee reject, org membership, idempotency/fee-row replay paths, `SECURITY DEFINER`, anon/PUBLIC deny, `authenticated` grant) were **not** read from hosted catalog.

---

## Award / purchase order

**NOT VERIFIED.**

`reveal_award` and `create_purchase_order_from_award` anon `EXECUTE`: **not queried**. Local expectation: **denied** for `anon`.

---

## Quorum / conflict of interest

**NOT VERIFIED.**

`cast_committee_vote` / `lock_and_reveal_award_atomic` text for `DECLARED_CONFLICT`, COI tables, and unconflicted quorum: **not read** on hosted. No RPCs executed.

---

## Invoice / payment

**NOT VERIFIED.**

Supplier cannot set `APPROVED`/`PAID` (trigger text): **unknown**.  
`record_invoice_payment_atomic` overload count: **unknown** (local `00216` targets single signature).

---

## Subscription

**NOT VERIFIED.**

Arbitrary wallet/subscription amount rejection via catalog function: **unknown** on hosted.

---

## Org role appointment

**NOT VERIFIED.**

`appoint_org_role_atomic` owner gate in definition: **unknown** on hosted.

---

## `is_platform_admin`

**NOT VERIFIED.**

Whether hosted `private.is_platform_admin` still contains JWT email allowlist logic (outside `00216`–`00219`): **unknown**. No emails reproduced in this report.

---

## READ-ONLY PRODUCTION COUNTS

**NOT COLLECTED** — no hosted session.

Tables planned: `rfqs`, `awards`, `purchase_orders`, `invoices`, `wallet_transactions`.

---

## Reconciliation vs local `00216`–`00219` certification

| Control area | Local (certified) | Hosted | Classification |
| --- | --- | --- | --- |
| Migration ledger 00212–00219 | Present on Docker `127.0.0.1:54322` | Not inspected | **NOT VERIFIED** |
| Wallet fee / replay guards | PASS (local runtime) | Not inspected | **NOT VERIFIED** |
| Subscription catalog amounts | PASS (local) | Not inspected | **NOT VERIFIED** |
| Award / reveal / PO | PASS (local demo path) | Not inspected | **NOT VERIFIED** |
| PUBLIC/anon EXECUTE (`00217`) | PASS (local) | Not inspected | **NOT VERIFIED** |
| RFQ whitelist + immutables (`00218`) | PASS (local) | Not inspected | **NOT VERIFIED** |
| Approval direct-write guard (`00219`) | PASS (local) | Not inspected | **NOT VERIFIED** |
| COI / quorum / invoice / appoint / admin | Mixed local PASS / UNVERIFIED | Not inspected | **NOT VERIFIED** |

No **MATCH**, **HOSTED OLDER**, or **HOSTED DIFFERENT** label assigned — insufficient hosted evidence.

---

## Unknowns and blockers

1. **Primary blocker:** `.env.auth` does not contain hosted Postgres credentials (`DATABASE_URL`, `SUPABASE_DB_PASSWORD`, or pooler host + password). Only `GOTRUE_DB_DATABASE_URL` → local Docker auth DB (`supabase_db_otp-local`).
2. Whether hosted migration ledger includes **00216–00219**: unknown.
3. Whether hosted anon/PUBLIC execute surface matches local six-function allowlist: unknown.
4. Whether production `is_platform_admin` matches local allowlist policy: unknown.
5. Production row counts: not collected.

**Operator action for re-run (not performed here):** Add hosted read-only or standard pooler connection fields to `.env.auth` (or a dedicated operator-only secret store copied into that file for verification runs) without committing secrets; re-run read-only gate before catalog `SELECT`s.

---

## Final status

| Field | Value |
| --- | --- |
| **Decision** | **HOSTED VERIFICATION BLOCKED** |
| **00212–00219 on hosted** | **NOT VERIFIED** (ledger not queried) |
| **HOSTED PUBLIC EXECUTE COUNT** | **NOT VERIFIED** |
| **HOSTED ANON EXECUTE COUNT** | **NOT VERIFIED** |
| **READ-ONLY SESSION CONFIRMED** | **NO** |
| PRODUCTION DATABASE MODIFIED | **NO** |
| MIGRATIONS APPLIED | **NO** |
| DEPLOYMENT PERFORMED | **NO** |
| HOSTED APPLY PERFORMED | **NO** |

**Evidence artifact (no secret values):** `OTP Golden Reconstruction/_hosted_readonly_evidence.json` from `node scripts/hosted-readonly-verify-run.mjs`.
