# OTP Wallet W4 / W6 — Deployed Browser Closure

**Date:** 2026-09-29  
**Production URL (required for W4):** https://otpplatform-theta.vercel.app  
**Scope:** Evidence-only browser certification; no code, migration, config, commit, push, or deploy changes.

---

## 1 Immutable baseline

| Item | Value |
| --- | --- |
| Certified commit (unchanged) | `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5` |
| Hosted migration ceiling | **`00221` applied** (operator-asserted; not re-verified this pass) |
| `db push` / `00222` / schema change | **NO** |
| Source / tests / config / env / migrations edited | **NO** |
| Git commit / push / deploy / stage | **NO** |
| Production wallet credits / manual ledger INSERT | **NO** |
| Hosted DB queried with service role | **NO** |

**Allowed write this pass:** this report file only.

**QA identifiers (passwords not recorded):**

| Persona | Email |
| --- | --- |
| IND-A Buyer (primary) | `bvnbasu+otp.qa.inda@gmail.com` |
| IND-B Buyer (fallback) | `bvnbasu+otp.qa.indb@gmail.com` |
| SUPPLIER-A (primary) | `bvnbasu+otp.qa.suppliera@gmail.com` |
| SUPPLIER-B (fallback) | `bvnbasu+otp.qa.supplierb@gmail.com` |
| RWA-A-ADMIN | `bvnbasu+otp.qa.rwaa.admin@gmail.com` |

---

## 2 Browser tooling gate (blocks W4 and W6 UI proof)

| Step | Tool | Result |
| --- | --- | --- |
| List tabs | `browser_tabs` `action=list` | Empty tab list |
| Navigate (multiple attempts) | `browser_navigate` → `https://otpplatform-theta.vercel.app`, `/login`, `newTab:true`, `position:active` / `side` | **Error:** `No browser tab available. Please navigate to a page first.` |
| Lock | `browser_lock` `action=lock` | Same error |
| Screenshot | `browser_take_screenshot` | Same error |

**Deployed site reachability (non-browser):** `WebFetch` on `https://otpplatform-theta.vercel.app/login` returned HTML shell with title context **OTP — Identity-Protected Competitive Sourcing**. This does **not** satisfy W4/W6 login or wallet requirements.

**Screenshots:** None saved (no browser tab).

**Password entry:** Not performed (no interactive browser session).

---

## 3 W4 — Persona isolation (deployed browser)

**Gate result: NOT PROVEN**

| Leg | Requirement | Result |
| --- | --- | --- |
| **W4-A** | Login IND-A; record URL, title, persona, nav, wallet categories (Success Cashback + Referral Bonus; no supplier reward/cashback/workspace) | **NOT EXECUTED** — browser MCP unavailable |
| **W4-B** | Explicit logout; confirm session ended | **NOT EXECUTED** |
| **W4-C** | Login SUPPLIER-A; supplier workspace/wallet (Referral Bonus + ₹100 Success Reward; no Buyer Success Cashback / Supplier Cashback) | **NOT EXECUTED** |
| **W4-D** | Buyer refresh/nav; buyer hits `/supplier/quotes` (or supplier dashboard path); supplier hits buyer wallet/dashboard; record URLs and renders | **NOT EXECUTED** — planned routes from committed `App.tsx` at baseline: buyer home `/dashboard`, wallet UI on `/profile`, supplier quotes `/supplier/quotes`, supplier dashboard alias `/supplier/dashboard` → `/dashboard` |
| **W4-E** | Silent persona switch on route/refresh | **NOT OBSERVED** (no session) |

**Blocker:** Cursor `cursor-ide-browser` MCP could not open or attach to any tab; no authenticated observations on production.

---

## 4 W6 — Buyer referral idempotency (deployed)

**Gate result: NOT PROVEN**

**Goal:** One buyer referral credit; replay of the same logical event does not add a second ledger row; amount server-derived (Individual ₹10 when referred profile is Individual).

| Evidence type | Result |
| --- | --- |
| Logged-in buyer triggers real credit on production | **NOT ATTEMPTED** — browser MCP blocked login and wallet UI |
| First credit balance/ledger on hosted DB | **NONE** — no service-role session; no in-app credit action invoked |
| Replay same idempotency key / same parties | **NOT ATTEMPTED** |
| Ledger row count proof | **NONE** |

**Read-only product constraints (baseline `c444df6`, not re-audited as PASS):**

- `public.credit_otp_referral_bonus_atomic` is granted for **service_role** only; Vitest asserts **anon cannot execute** (`tests/security/otp-referral-00221-database.test.ts`).
- No `apps/web` or edge-function call site for `credit_otp_referral_bonus_atomic` was found in the repo at certification scope (credit path is migration/RPC + service orchestration).
- Registration copy (`registration-outcome.ts`): referral attribution note states **controlled pilot referral credit is ₹0** — UI does not expose a buyer “qualify referral credit” action that would post a ledger credit without privileged backend.

**W6 blocker summary:** Cannot trigger a safe QA buyer referral credit and replay on **deployed** production without (a) a working browser session plus an in-app server-backed credit action callable as the logged-in user, or (b) service-role RPC/SQL — explicitly disallowed this pass.

**Referral UI copy (unauthenticated / no wallet):** Not recorded beyond public pricing charter text carried in prior W5 certification.

**Client-amount override:** Not exercised; prior W5 documents server rejection of client override in local DB tests.

---

## 5 Carried forward (not re-audited this pass)

Per `OTP_WALLET_E2E_AND_5FILE_FINAL_CLOSURE_2026-09-29.md` and prior wallet certification artifacts at `c444df6`:

| Gate | Status carried forward |
| --- | --- |
| W1 | **PASS** |
| W2 | **PASS** |
| W3 | **PASS** |
| W5 | **PASS** |
| W7 | **PASS** |
| W8 | **PASS** |
| W9 | **PASS** (local Docker audit chain; not re-run this pass) |
| W10 | **PASS** (five-file golden scope; dirty working-tree hunks excluded from certified content) |

**Five-file closure:** Remains valid on committed content at `c444df6` only; this pass did not re-audit file diffs.

---

## 6 Final gate table

| Gate | Status this pass |
| --- | --- |
| W1 | PASS (carried forward) |
| W2 | PASS (carried forward) |
| W3 | PASS (carried forward) |
| **W4** | **NOT PROVEN** |
| W5 | PASS (carried forward) |
| **W6** | **NOT PROVEN** |
| W7 | PASS (carried forward) |
| W8 | PASS (carried forward) |
| W9 | PASS (carried forward) |
| W10 | PASS (carried forward) |

---

## 7 Status (exactly one)

**AMBER — EVIDENCE GAP REMAINS**

Rationale: W4 and W6 both require deployed browser evidence; browser MCP failed to provide a tab. W6 additionally has no callable buyer credit path as a normal authenticated user on production without service role.

---

## 8 Self-check

- [x] No source, test, config, env, or migration edits
- [x] No `db push`, no `00222`, no schema change
- [x] No git commit, push, deploy, or checkout used to modify the tree
- [x] No passwords, tokens, or service-role keys written to this report
- [x] W4 not marked PASS without live login wallet evidence
- [x] W6 not marked PASS from local Docker or code inspection alone
- [x] No fabricated screenshots or wallet labels
- [x] Git status not used to edit files (report-only write)

---

## 9 Process attestation

**NO CODE / MIGRATION / COMMIT / DEPLOY CHANGES MADE**
