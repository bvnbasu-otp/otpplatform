# OTP Production Pre-Apply Verification — Migrations 00216–00219

**Date:** 28 September 2026 (UTC+5:30)  
**Mode:** STRICTLY READ-ONLY — no production mutations, no fixes, no commit/push  
**Hosted project:** `otpplatform` / ref `qsuvtcezffomtwzwyrso`  
**Repository HEAD:** `7b1afc12ac7761efc206c70db80486612a34d146`  
**Supabase CLI:** `2.118.0`

---

## Evidence legend

| Label | Meaning |
| --- | --- |
| **REMOTE CATALOG EVIDENCE** | Observed on hosted Postgres in this pass (read-only SQL or authenticated CLI list) |
| **LOCAL TEST EVIDENCE** | Observed on local Docker only (`127.0.0.1:54322`) — not production |
| **INFERENCE** | Deduced from migration absent on remote (user claim) + repo SQL at ceiling ≤00215 |
| **USER CLAIM** | Operator-reported; not re-confirmed in this pass |
| **UNKNOWN** | Not queried; do not treat as fact |

---

## PHASE 1 — Baseline

### Git working tree (summary)

- **Branch:** `main` tracking `origin/main` at HEAD above.
- **Tracked modifications:** app, docs, `scripts/deploy-migrations.ts`, etc. (engineering work in progress).
- **Untracked (relevant):** `supabase/migrations/00216_*.sql` through `00219_*.sql`, security tests, Golden Reconstruction artifacts, local verification scripts.
- **Secrets:** Not read from `.env.auth` for connection; prior pass documented that file is GoTrue/local DB only.

### Migration ceilings

| Ceiling | Value | Classification |
| --- | --- | --- |
| **LOCAL migration ceiling (files on disk)** | **00219** (`219` files `00001`…`00219`) | **LOCAL TEST EVIDENCE** (filesystem) |
| **REMOTE migration ceiling** | **UNKNOWN** (this pass) | CLI list **not obtained** |

### `supabase migration list` (read-only) — this pass

Command attempted:

```text
supabase migration list --project-ref qsuvtcezffomtwzwyrso
supabase migration list --linked
```

Result:

```text
AccessTokenRequiredError: Access token not provided.
SUPABASE_ACCESS_TOKEN: absent in agent shell
```

- **REMOTE CATALOG EVIDENCE:** **none** for migration ledger.
- **USER CLAIM (not confirmed here):** local column matches remote for `00215`; `00216`–`00219` show `[remote missing]`.
- **Follow-up (same date):** parent shell retried `supabase migration list --project-ref qsuvtcezffomtwzwyrso`. Same `AccessTokenRequiredError`. `SUPABASE_ACCESS_TOKEN` absent. `C:\Users\bloganat\.supabase` contains `traces` and `telemetry.json` only — no persisted access-token file. AppData Supabase directories are absent.

Until a session that actually holds a Supabase access token re-runs that list (or read-only SQL on `supabase_migrations.schema_migrations` with `transaction_read_only = on`), **REMOTE=00215 is not proven**.

### Hosted read-only SQL

| Step | Result |
| --- | --- |
| Credential source `.env.auth` | No hosted pooler URL (prior hosted verification JSON) |
| `SHOW transaction_read_only = on` | **Not run** |
| Catalog `SELECT` | **Not run** |

---

## PHASE 2 — Per-migration file analysis (not executed)

Predecessor assumption for apply safety: **00215** and all prior migrations through `00215` are already applied on remote. Objects below are created or altered in earlier migrations (e.g. `00181` wallet, `00192` approval RPCs, `00194` grants, `00197` appoint, `00199` partial RPC hardening).

### 00216 — `00216_verified_remediation_p0_p1_security_integrity.sql`

**Objects touched (representative):**

| Kind | Object |
| --- | --- |
| Function (create/replace) | `private.subscription_wallet_credit_inr(text, text)` |
| Function (create/replace) | `public.credit_buyer_settlement_reward_atomic(uuid, uuid, uuid, numeric, numeric, numeric, text)` |
| Function (create/replace) | `public.apply_wallet_credits_to_subscription_atomic(...)`, `public.process_subscription_payment(...)` |
| Function (create/replace) | `public.submit_rfq_tier_approval_atomic` (two overloads) |
| Function (create/replace) | `public.appoint_org_role_atomic(...)` |
| View | `public.rfq_invitations_manager` (**DROP** then CREATE) |
| Trigger functions + triggers | `private.init_invoice_balance_due` + `trg_init_invoice_balance_due` on `invoices` |
| Trigger functions + triggers | `private.guard_invoice_supplier_status` + `trg_guard_invoice_supplier_status` on `invoices` |
| Trigger functions + triggers | `private.guard_rfq_status_transition` + `trg_guard_rfq_status` on `rfqs` (v1 guard) |
| Trigger functions + triggers | `private.guard_po_status_transition` + `trg_guard_po_status` on `purchase_orders` |
| Function (create/replace) | `public.submit_milestone_inspection_atomic`, `public.approve_milestone_inspection_atomic` |
| Function (**DROP** overloads) | `public.record_invoice_payment_atomic` — drops two legacy signatures, single replacement |
| Function (create/replace) | `public.lock_and_reveal_award_atomic`, grant changes on `create_purchase_order_from_award`, `reveal_award` |
| Function (create/replace) | `public.cast_committee_vote(...)` |
| Grants | Per-function `REVOKE`/`GRANT`; `REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM anon`; anon allowlist (6 functions) |

**Preconditions (must exist by 00215):** Tables/RPCs including `platform_fee_transactions`, `organization_wallets`, `wallet_transactions`, `buyer_reward_allocations`, `rfqs`, `rfq_approval_stages`, `organization_delegations`, `invoices`, `purchase_orders`, `work_orders`, `work_order_milestones`, `work_order_inspections`, helpers `private.get_profile_id`, `private.is_platform_admin`, `private.is_org_member`, `private.notify_bidders_of_outcome`, etc.

**Destructive / high-impact DDL:**

- `DROP VIEW IF EXISTS public.rfq_invitations_manager CASCADE`
- `DROP FUNCTION IF EXISTS public.record_invoice_payment_atomic` (two signatures)
- `DROP TRIGGER IF EXISTS` (recreated)
- No `DELETE`/`TRUNCATE` on data

**Idempotency if re-run:** `BEGIN`/`COMMIT` transaction; `CREATE OR REPLACE`, `DROP … IF EXISTS` — generally safe to re-apply as a whole. Partial failure mid-transaction would roll back. Re-run after success is mostly no-op except view/trigger replace.

**Note:** RFQ status guard in 00216 is **superseded** by 00218; applying 00216 without 00218 leaves weaker transition rules.

---

### 00217 — `00217_revoke_public_execute_default_privileges.sql`

**Objects touched:**

- `REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC`
- `REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM anon`
- `GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO authenticated, service_role`
- Re-grant anon allowlist: `submit_signup_request`, `verify_profile_verification_otp`, `verify_whatsapp_password_reset`, `platform_heartbeat`, `service_categories`, `served_cities`

**Preconditions:** **00216** should be applied first so sensitive RPC bodies and per-function revokes are current; closes `00194` blanket `PUBLIC`/`anon` EXECUTE.

**Destructive:** Broad `REVOKE` (privilege-only, not data). Within one transaction, immediate re-`GRANT` limits exposure.

**Idempotency:** Re-run is safe (same revokes/grants).

**Risk:** Skipping 00217 after 00216 leaves **INFERENCE:** widespread `PUBLIC` EXECUTE from `00194` on production.

---

### 00218 — `00218_rfq_status_transition_whitelist.sql`

**Objects touched:**

- `private.rfq_status_transition_allowed(rfq_status, rfq_status)` (new)
- Replaces `private.guard_rfq_status_transition()` (whitelist + immutable `organization_id`, `requirement_id`, `created_by`)
- `DROP TRIGGER IF EXISTS trg_guard_rfq_status`; recreate `BEFORE UPDATE ON public.rfqs` (full row update, not only `status`)

**Preconditions:** `00216` trigger name `trg_guard_rfq_status` (or compatible).

**Destructive:** Replaces trigger function logic only.

**Idempotency:** `CREATE OR REPLACE` + `DROP TRIGGER IF EXISTS` — safe to re-run.

**Bypass (by design):** `service_role`, empty role, `pg_trigger_depth() > 1`, `private.is_platform_admin()`.

---

### 00219 — `00219_guard_rfq_approval_stage_direct_write.sql`

**Objects touched:**

- `private.guard_rfq_approval_stage_direct_write()` + `trg_guard_rfq_approval_stage_write` on `rfq_approval_stages` (`BEFORE INSERT OR UPDATE`)
- Replaces `public.submit_rfq_tier_approval_atomic` (both overloads) to `set_config('otp.approval_stage_internal', '1', true)` before stage `UPDATE`

**Preconditions:** `rfq_approval_stages`, `submit_rfq_tier_approval_atomic` from ≤00216/00192.

**Destructive:** None on data; RPC body replace.

**Idempotency:** Safe to re-run.

**Risk:** Applying 00219 without 00216 approval fixes = partial protection only (trigger + flag path still helps direct writes).

---

## PHASE 3–5 — Remote catalog

**Status:** **UNKNOWN** — no read-only hosted session in this pass.

Planned checks (not executed): `pg_proc` / `pg_trigger` / `pg_policies`, `information_schema.routine_privileges` for `PUBLIC`/`anon` EXECUTE, RLS on `rfqs`, `invoices`, `rfq_approval_stages`, `organization_wallets`, both migration tables `supabase_migrations.schema_migrations` and `public.otp_schema_migrations`.

---

## PHASE 6 — Dependency chain 00215 → 00216 → 00217 → 00218 → 00219

```text
00215 (invite_direct_supplier containment)
   ↓
00216 (P0/P1 RPC + triggers + anon revoke v1 + allowlist)
   ↓
00217 (mandatory PUBLIC/anon EXECUTE closure on all public routines)
   ↓
00218 (RFQ status whitelist + immutable keys; replaces 00216 RFQ guard)
   ↓
00219 (approval stage direct-write block + RPC session flag)
```

| Check | Result |
| --- | --- |
| Proven missing remote object required by SQL | **None** (catalog not queried) |
| Migration list gap unsafe to apply | **UNKNOWN** — if USER CLAIM holds (00215 synced, 00216–219 missing), chain is **sequential and intended** |
| **BLOCKER** | **None proven** from catalog; **conditional blocker:** if remote head ≠ 00215, stop and reconcile before apply |

---

## PHASE 7 — Migration ledger representation

| Ledger | Remote | Local (prior certification docs) |
| --- | --- | --- |
| `supabase_migrations.schema_migrations` | **UNKNOWN** | After local apply: rows `00216`–`00219` (**LOCAL TEST EVIDENCE**) |
| `public.otp_schema_migrations` | **UNKNOWN** | Filename row for `00216_….sql` only; **no** rows for `00217`–`00219` (**LOCAL TEST EVIDENCE** — split-brain) |

**Evidence this pass:** No `SELECT` on either ledger on hosted.

**Operator note (LOCAL TEST EVIDENCE):** `scripts/deploy-migrations.ts --status` may show `00217`–`00219` as `[PENDING]` while `schema_migrations` contains them — do not use that script’s pending count alone for production decisions.

**migration repair:** **Not performed** (forbidden).

---

## PHASE 8 — Ten protections on production (metadata)

If **USER CLAIM** is true (00216–219 remote-missing), production effective schema/grants ≈ repo at **00215**. Function bodies not read from live `pg_proc` in this pass — exposure below is **INFERENCE** unless noted.

| # | Protection | Expected after full 00216–219 | On production (this pass) |
| --- | --- | --- | --- |
| 1 | **Anon wallet mint** (`credit_buyer_settlement_reward_atomic`) | `SECURITY DEFINER`; fee row required; member/admin/service_role; no `anon`/`PUBLIC` EXECUTE | **INFERENCE: NOT PRESENT** — `00194` grants `EXECUTE ON ALL ROUTINES … TO anon` and `PUBLIC`; `00181` body lacks 00216 auth/fee gates |
| 2 | **Wallet read** (anon broad table/RPC access) | Wallet tables not anon-writable; financial RPCs not anon-executable | **INFERENCE: NOT PRESENT** — `00194` grants `SELECT ON ALL TABLES` to `anon`; wallet mint RPC callable via `PUBLIC` role |
| 3 | **Subscription redeem** (catalog amount enforcement) | `private.subscription_wallet_credit_inr` + strict match in `apply_wallet_credits_to_subscription_atomic` | **INFERENCE: NOT PRESENT** — pre-00216 wallet subscription RPC without catalog helper |
| 4 | **Award reveal** (`lock_and_reveal_award_atomic`, `reveal_award`) | Buyer manager+; revoked `anon`/`PUBLIC` on award/PO RPCs (00216) | **INFERENCE: PARTIAL** — `00199` revoked `anon` on `lock_and_reveal_award_atomic` but **INFERENCE:** `PUBLIC` EXECUTE remains until **00217** |
| 5 | **PO create** (`create_purchase_order_from_award`) | `authenticated`/`service_role` only after 00216 grants | **INFERENCE: NOT PRESENT** (PUBLIC execute path) until 00217 |
| 6 | **Org appoint** (`appoint_org_role_atomic` OWNER gate for exec roles) | OWNER/admin/service_role gates (00216) | **INFERENCE: NOT PRESENT** — weaker `00197` body; **INFERENCE:** callable via `PUBLIC` until 00217 |
| 7 | **Milestone approve** (`approve_milestone_inspection_atomic` buyer gate + digest) | Buyer org check + server digest (00216) | **INFERENCE: NOT PRESENT** — pre-00216 body; **INFERENCE:** `PUBLIC` execute until 00217 |
| 8 | **Supplier invoice self-approve** | Trigger `trg_guard_invoice_supplier_status` | **INFERENCE: NOT PRESENT** — trigger introduced in **00216** |
| 9 | **RFQ illegal transition** (e.g. `EVALUATING→OPEN`) | Whitelist `00218` + `RFQ-STATUS-TRANSITION` | **INFERENCE: NOT PRESENT** — no `00218`; at 00215 only broad RLS `UPDATE` on `rfqs` |
| 10 | **Approval-stage direct write** | Trigger `00219` + RPC `otp.approval_stage_internal` | **INFERENCE: NOT PRESENT** — stages mutable via PostgREST if RLS allows |

**Anon-executable routine count on production:** **UNKNOWN** (not queried). **LOCAL TEST EVIDENCE** after 00217: six anon functions on `public` schema.

---

## PHASE 9 — Apply readiness per migration

Assumes remote at **00215** per **USER CLAIM**; if remote differs, reassess.

| Migration | Status | Reasons |
| --- | --- | --- |
| **00216** | **SAFE WITH CONDITIONS** | Requires 00215 applied; drops payment RPC overloads (confirm no clients use dropped signatures); must be followed by **00217**; RFQ guard incomplete without **00218** |
| **00217** | **SAFE WITH CONDITIONS** | **Do not skip** after 00216; broad revoke in one transaction — run during low traffic; verify anon allowlist (6) post-apply |
| **00218** | **SAFE WITH CONDITIONS** | Requires 00216 trigger; admin/service_role bypass intentional; validate app relies on RPCs for lifecycle not illegal direct PATCH |
| **00219** | **SAFE WITH CONDITIONS** | Requires approval RPCs + stages table; patches same RPCs as 00216 — apply after 00216 (and ideally 00217–00218 in order) |

**Overall gate: NO-GO.** Per-migration labels above are file-level only and assume the unconfirmed USER CLAIM that remote head is `00215`. They are not a remote certification. Catalog predecessors are **UNKNOWN**, not proven present. Apply stays blocked until the migration list and a read-only catalog pass succeed.

---

## PHASE 10 — Summary table

| Field | Value |
| --- | --- |
| **REMOTE MIGRATION CEILING** | **UNKNOWN** (CLI auth missing). **USER CLAIM:** `00215` |
| **LOCAL MIGRATION CEILING** | **00219** |
| **PRODUCTION DATA MODIFIED** | **NO** |
| **PRODUCTION SCHEMA MODIFIED** | **NO** |
| **PRODUCTION MIGRATIONS APPLIED** | **NO** |
| **MIGRATION HISTORY MODIFIED** | **NO** |
| **SECRETS MODIFIED** | **NO** |
| **DEPLOYMENT PERFORMED** | **NO** |
| **PRE-APPLY STATUS** | **NO-GO** |

### Exact blocker

This environment cannot read the hosted project. `supabase migration list --project-ref qsuvtcezffomtwzwyrso` failed twice (`AccessTokenRequiredError`). No access token is in the process environment, and `C:\Users\bloganat\.supabase` has no stored login. Hosted catalog SQL was not run. `transaction_read_only` was not proven.

The success condition for this gate was a read-only answer to whether `00216` → `00217` → `00218` → `00219` are safe **given production is confirmed at `00215`**. Production is **not** confirmed at `00215` in this pass. The operator report of that pairing remains a **USER CLAIM**.

File review of the four SQL files (local only) shows an ordered chain that is **structurally coherent if** remote head is exactly `00215` and `00216`–`00219` are absent. That file review is **not** apply permission.

### What a later pass must show before any apply task

1. `supabase migration list --project-ref qsuvtcezffomtwzwyrso` from a logged-in session, with the pairing `00215 | 00215` and `00216`–`00219` remote missing.
2. Read-only hosted SQL with `transaction_read_only = on` first: `supabase_migrations.schema_migrations`, `public.otp_schema_migrations`, and `PUBLIC`/`anon` EXECUTE on the routines these migrations replace.
3. Only then, in a **separate** task, apply `00216` → `00217` → `00218` → `00219` in that order. Do not skip `00217`. Do not run `supabase migration repair` as part of that confirmation.

---

## Required certification table

Remote state for every row is **UNKNOWN** (migration list not obtained). Schema compatibility and security impact are **INFERENCE** from local SQL plus the unconfirmed claim that remote is at `00215`. They are not remote catalog facts.

| Migration | Remote State | Preconditions | Schema Compatible | Security Impact | Risk | Recommendation |
| --------- | ------------ | ------------- | ----------------- | --------------- | ---- | -------------- |
| 00216 | UNKNOWN (USER CLAIM: missing) | UNKNOWN on hosted; files require objects through 00215 | INFERENCE only | INFERENCE: closes mint/reveal/PO/org/milestone/invoice gaps if applied after 00215 | SAFE WITH CONDITIONS only if remote is exactly 00215 | Do not apply in this task |
| 00217 | UNKNOWN (USER CLAIM: missing) | Requires 00216 applied first | INFERENCE only | INFERENCE: closes leftover PUBLIC/anon EXECUTE | Broad REVOKE; must follow 00216 in one ordered apply | Do not apply in this task |
| 00218 | UNKNOWN (USER CLAIM: missing) | Requires 00216 RFQ guard objects | INFERENCE only | INFERENCE: blocks illegal RFQ status writes | Replaces 00216 guard; admin/service_role bypass remains | Do not apply in this task |
| 00219 | UNKNOWN (USER CLAIM: missing) | Requires approval RPCs and `rfq_approval_stages` | INFERENCE only | INFERENCE: blocks direct approval-stage writes | Must follow 00216 function replace | Do not apply in this task |

```text
REMOTE MIGRATION CEILING: UNKNOWN
LOCAL MIGRATION CEILING: 00219

PRODUCTION DATA MODIFIED: NO
PRODUCTION SCHEMA MODIFIED: NO
PRODUCTION MIGRATIONS APPLIED: NO
MIGRATION HISTORY MODIFIED: NO
SECRETS MODIFIED: NO
DEPLOYMENT PERFORMED: NO

PRE-APPLY STATUS: NO-GO
```

Blocker: hosted project was not readable from this environment (`AccessTokenRequiredError`; no stored CLI login). Production at `00215` was not confirmed, and no catalog, grant, RLS, or function-signature evidence was collected.

## Appendix — CLI transcript (this pass)

```text
$ supabase --version
2.118.0

$ supabase migration list --project-ref qsuvtcezffomtwzwyrso
AccessTokenRequiredError: Access token not provided.

$ supabase migration list --linked
AccessTokenRequiredError: Access token not provided.
```

---

*End of read-only pre-apply report.*
