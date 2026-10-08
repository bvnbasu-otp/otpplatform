# OTP Wallet E2E — Final Closure

## 1 Immutable Baseline (code changes NONE, migration NONE, commit NONE, deploy NONE)

| Constraint | Status |
| --- | --- |
| Source / tests / config / migrations modified | **NO** |
| `supabase db push` / new `00222` / schema changes (local or hosted) | **NO** |
| Git commit / push / deploy / checkout / restore / reset / stash / stage | **NO** |
| Production wallet credits or account creation | **NO** |
| Hosted production DB queried for credits | **NO** |

| Baseline item | Value |
| --- | --- |
| Certified commit | `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5` on `main` |
| `git rev-parse HEAD` | `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5` (**matches baseline**) |
| Production URL | https://otpplatform-theta.vercel.app |
| Hosted migration ceiling | **`00221` applied** (operator-asserted; not re-verified this pass) |
| pnpm | `C:\Users\bloganat\AppData\Local\pnpm\pnpm.exe` |
| Local Supabase Docker | `supabase_db_otp-local` — **Up (healthy)**, port `127.0.0.1:54322` |
| Working tree (five-file scope) | **Dirty:** `AwardPage.tsx`, `DecisionReceiptCard.tsx`, `SiteLayout.tsx` — **Clean:** `organization-charter.ts`, `PricingPage.tsx` (also dirty `SiteHeader.tsx` outside five-file scope) |

**Allowed write this pass:** this report file only.

---

## 2 Remaining gates table W4 W6 W9

| Gate | Scope | Result this pass |
| --- | --- | --- |
| **W4** | Persona isolation (authenticated Buyer↔Supplier, wallet categories) | **NOT PROVEN** |
| **W6** | Full referral idempotency (buyer + supplier replay) | **PARTIAL — NOT FULLY PROVEN** |
| **W9** | End-to-end auditability chain (real field values) | **PASS** (local Docker rows from Vitest fixtures) |

---

## 3 W4 evidence

### Credential / browser gate

- Checked process environment for common E2E variables (`E2E_BUYER_*`, `E2E_SUPPLIER_*`, `PLAYWRIGHT_*`, `VITE_TEST_BUYER_*`): **all unset**.
- **No browser login attempted** (rule: login only when credentials already in environment; not from chat or transcripts).
- **Refresh and direct-route persona tests:** **not executed** (require authenticated session).

### Required evidence (not obtained)

| Required | Status |
| --- | --- |
| Buyer session → wallet UI with buyer categories (e.g. Success Cashback + Referral) | **NOT OBSERVED** |
| Supplier session → wallet UI with supplier categories (Referral + Success Reward; no buyer cashback) | **NOT OBSERVED** |
| Logout / switch persona without cross-persona wallet context | **NOT OBSERVED** |

### Supporting context (code only — does not satisfy W4)

Committed paths at `c444df6` include `use-wallet-entitlement.ts`, `persona-wallet.ts`, and `OtpWalletCreditsWidget.tsx` persona branches. **W4 gate result remains NOT PROVEN** without live login evidence.

---

## 4 W6 evidence (event, key, first, replay, ledger)

### Tests executed this pass

```text
pnpm exec vitest run tests/security/otp-referral-00221-database.test.ts tests/security/supplier-wallet-00220-database.test.ts --reporter=verbose
```

| Outcome | Detail |
| --- | --- |
| **Result** | **7 passed**, 0 failed, 0 skipped (local DB reachable) |
| **Files** | 2 passed |

### Supplier referral replay — **PROVEN (this pass)**

| Field | Evidence |
| --- | --- |
| **Event / RPC** | `credit_supplier_wallet_event_atomic` — `SUPPLIER_REFERRAL_BONUS` |
| **Idempotency key** | Dynamic per run, e.g. `sw-test-<timestamp>`; persisted example `sw-test-1790644849907` |
| **First call** | Vitest: `amount` **100**, `okErr` null |
| **Replay** | Same key + same `p_source_entity_id` → `replayed: true`, `replayErr` null |
| **Ledger count** | Local read: `COUNT(*)` for `idempotency_key = 'sw-test-1790644849907'` → **1** |
| **Ledger row** | `source_entity_type` **SUPPLIER_REFERRAL_BONUS**, `tx_type` **REWARD_CREDIT**, `amount` **100.00**, org `a0000000-0000-4000-8000-0000000000aa` |

### Buyer referral replay (`credit_otp_referral_bonus_atomic`, persona BUYER) — **NOT PROVEN (this pass)**

| Field | Evidence |
| --- | --- |
| **First credit** | Vitest `otp-referral-00221-database.test.ts`: BUYER referrer, MSME referred org → `amount` **50** |
| **Replay** | **No test case** replays the same `p_idempotency_key` for buyer referral in `otp-referral-00221-database.test.ts` |
| **Replay run** | **Not executed** this pass for buyer path |
| **SQL note** | Migration `00221` defines idempotency replay for `credit_otp_referral_bonus_atomic` (code path); **not demonstrated by a run this pass** |

### W6 gate verdict

**PARTIAL / NOT FULLY PROVEN** — supplier replay proven; **buyer referral replay not concretely proven** in this pass.

---

## 5 W9 evidence chain

**Source:** local Docker PostgreSQL rows created/updated by Vitest security DB tests (not hosted production).

### Chain A — Buyer referral credit (`credit_otp_referral_bonus_atomic`)

| Step | Real values (local DB) |
| --- | --- |
| **Qualifying context** | Referred org `e0000000-0000-4000-8000-0000000000cc` (`org_type` MSME); beneficiary org `a0000000-0000-4000-8000-0000000000cc` |
| **Reward decision** | RPC `credit_otp_referral_bonus_atomic` with `p_referrer_persona` **BUYER**, authoritative profile **MSME** → amount **50** (Vitest assertion + ledger) |
| **Ledger credit** | `wallet_transactions`: `idempotency_key` **`ref-msme-1790655733193`**, `tx_type` **REWARD_CREDIT**, `source_entity_type` **OTP_REFERRAL_BONUS**, `source_entity_id` **`f0000000-0000-4000-8000-0000000000cc`**, `amount` **50.00** |
| **Balance** | `organization_wallets` for `a0000000-0000-4000-8000-0000000000cc`: **balance_credits 100.00**, `status` **ACTIVE** (accumulated from test history on fixture org) |
| **Audit / event** | `audit_events.event_type` **`referral_wallet.credited`**, `entity_type` **organization_wallet**, payload includes **`referrer_persona`: BUYER**, **`referred_profile_kind`: MSME**, **`amount`: 50.00**, **`source_entity_id`**, **`transaction_id`**, **`organization_id`** |

### Chain B — Supplier wallet referral event (corroborating)

| Step | Real values (local DB) |
| --- | --- |
| **Event** | `SUPPLIER_REFERRAL_BONUS` via `credit_supplier_wallet_event_atomic` |
| **Ledger** | `idempotency_key` **`sw-test-1790644849907`**, amount **100.00**, `source_entity_id` **`c0000000-0000-4000-8000-0000000000aa`** |
| **Balance** | Org `a0000000-0000-4000-8000-0000000000aa` → **100.00** ACTIVE |
| **Audit** | `supplier_wallet.credited` with `event_type` **SUPPLIER_REFERRAL_BONUS**, `occurred_at` **2026-09-29 01:20:49.93429+00** |

**W9 verdict:** **PASS** — at least one full chain with non-synthetic column-level field values from local test-backed rows.

---

## 6 Five files table

Certified content: `git show c444df6a2b8ca268c5b5233bd3a61ec2c34181b5:<path>`.  
All five paths are in commit `c444df6` (`feat(wallet): finalize buyer supplier wallet and referral model`).

| File | In release commit? | Working-tree vs `c444df6` | Golden check (committed only) | Status |
| --- | --- | --- | --- | --- |
| `apps/web/src/features/award/pages/AwardPage.tsx` | Yes | **Dirty** — award label toggles “Recorded committee consensus” vs “Buyer award justification” by `rfqOrgId` | No wallet/persona/referral logic; award justification copy only | **SAFE — NO CHANGE REQUIRED** (certify committed; dirty hunk **not** certified) |
| `apps/web/src/features/governance/lib/organization-charter.ts` | Yes | **Clean** | Wallet matrix ₹10/25/50/100, buyer Success Cashback, supplier referral + ₹100 success reward, spend limits; no supplier cashback product | **SAFE — NO CHANGE REQUIRED** |
| `apps/web/src/features/reveal/components/DecisionReceiptCard.tsx` | Yes | **Dirty** — MSME governance heading de-capitalized; “(PA-09)” removed from title | Display copy only; no wallet entitlement changes | **SAFE — NO CHANGE REQUIRED** (committed; dirty **not** certified) |
| `apps/web/src/features/site/components/SiteLayout.tsx` | Yes | **Dirty** — removes `MobileSimulatorFrame` wrapper | Layout shell only; no persona/wallet routing | **SAFE — NO CHANGE REQUIRED** (committed; dirty **not** certified) |
| `apps/web/src/features/site/pages/PricingPage.tsx` | Yes | **Clean** | Public copy: buyer Success Cashback + referral matrix; supplier transaction gate + ₹100 success reward; no withdrawable/cash claims | **SAFE — NO CHANGE REQUIRED** |

---

## 7 Findings

| ID | Severity | Finding | Action |
| --- | --- | --- | --- |
| W4-GAP | Evidence | No QA credentials in environment; no authenticated browser wallet/persona observation | Document only — **NOT PROVEN** |
| W6-GAP | Evidence | Buyer `credit_otp_referral_bonus_atomic` replay not exercised in executed tests | Document only — **PARTIAL** |
| WT-1 | Process | Three of five forensic files have **uncommitted** UX/layout hunks unrelated to wallet golden rules | Document only — do not certify dirty hunks as release content |
| — | — | No new P0/P1 golden-rule defect found in **committed** five-file content at `c444df6` | None |

---

## 8 Final gate table:

| Gate | Status |
| --- | --- |
| W1 PASS — prior certification | PASS |
| W2 PASS — prior certification | PASS |
| W3 PASS — prior certification | PASS |
| W4 CURRENT | **NOT PROVEN** |
| W5 PASS — prior certification | PASS |
| W6 CURRENT | **PARTIAL — NOT FULLY PROVEN** (supplier replay yes; buyer replay no) |
| W7 PASS — prior certification | PASS |
| W8 PASS — prior certification | PASS |
| W9 CURRENT | **PASS** (local audit + ledger chain) |
| W10 CURRENT (five files individually) | **AwardPage** SAFE (committed) · **organization-charter** SAFE · **DecisionReceiptCard** SAFE (committed) · **SiteLayout** SAFE (committed) · **PricingPage** SAFE |

---

## 9 Status exactly one:

**AMBER — NON-BLOCKING EVIDENCE GAP**

Rationale: W4 and W6 are not fully proven by direct evidence this pass; no golden-rule **FINDING** in committed five-file scope; W9 proven locally.

---

### Self-check (honest)

- [x] No source, test, config, or migration edits
- [x] No `db push`, no `00222`, no production schema/balance mutations
- [x] No git commit/push/deploy/checkout/restore/reset/stash/stage
- [x] No QA passwords invented or taken from transcripts
- [x] No secrets printed in this report
- [x] W4 not marked PASS from code inspection alone
- [x] W6 not marked full PASS without buyer replay proof
- [x] W9 not marked PASS from schema/column existence only
- [x] Five files certified at `c444df6` only; dirty hunks described, not certified
- [x] Vitest limited to two security DB files for W6/W9 (7 tests, all passed)
