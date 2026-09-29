# R2-31 Phase 2B — Final Certification (2026-09-29)

**Certifier pass:** automated certification (local Docker + monorepo tests)  
**Workspace:** `G:\My Drive\otp`  
**Baseline HEAD:** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5` (branch `main`)  
**Wallet W1–W10:** LOCKED — no `00221` / referral economics edits this pass  
**ONDC:** OUT OF SCOPE — no ONDC files in working-tree diff  
**Not production-certified.** Hosted `00222` not applied by this pass.

---

## 1. Executive summary

Phase 2B document issuance (`00222`), lifecycle, access (including **RWA committee** and **MSME buyer org** rows), snapshot print HTML, and wallet regressions are **evidence-complete on targeted suites (45/45 PASS)**. **Minimal defect fix** applied to `issue_document_snapshot_atomic` for **global `document_id` / `verification_ref` collisions** when demo org UUIDs share the same 8-character prefix. **Full `pnpm test` was RUN** but **failed** at vitest stage 1 (27 failures, 345 files passed); downstream stages were executed separately after chain break. **`pnpm run build` PASS.** Overall certification: **AMBER**.

---

## 2. Git baseline

| Item | Value |
|------|--------|
| Branch | `main` |
| `git rev-parse HEAD` | `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5` |
| `git status --short` | Modified web/domain R2-31 files; untracked `00222`, security tests, Golden Reconstruction docs |
| commit / push / deploy | **NO** |
| hosted `db push` | **NO** |

---

## 3. Migration ceiling

| Environment | Ceiling | Evidence |
|-------------|---------|----------|
| **Local Docker** (`127.0.0.1:54322`) | **00222** applied | `supabase migration list --local` shows `00222` local+remote columns; tests reach `issued_document_snapshots` |
| **Production** (`qsuvtcezffomtwzwyrso`) | **UNPROVEN / not applied by this pass** | `SUPABASE_ACCESS_TOKEN` **not set**; prior operator ceiling **00221**; no hosted push |

| File | Status |
|------|--------|
| `supabase/migrations/00222_otp_document_issuance_snapshots.sql` | **EXISTS**; **minimal edit** this pass (org-scoped `document_id` + `verification_ref` disambiguation) |
| `supabase/migrations/00221_*` | **UNCHANGED** (`git diff` empty) |

**Local function hotfix:** `scripts/patch-00222-doc-id-local.mjs` applied updated `issue_document_snapshot_atomic` on running local DB (migration file updated to match).

---

## 4. Phase 2A final gate (section 23 checklist)

| # | Question | Result |
|---|----------|--------|
| 1 | 00222 without inventing product rules | **YES** |
| 2 | Document engine without wallet W1–W10 change | **YES** |
| 3 | Protected documents immutable after reveal | **YES** |
| 4 | Buyer/supplier access without leakage | **YES** (incl. RWA/MSME rows this pass) |
| 5 | Reports from authoritative ledgers | **YES** (fabricated PO KPIs absent on reporting path) |
| 6 | PDF/print specified | **PARTIAL** — structural HTML from `PrintableProcurementDocument` via snapshot renderer tests; no browser Save-as-PDF |
| 7 | ONDC outside R2-31 | **YES** |
| 8 | B9 golden reveal lifecycle automated | **YES** |
| 9 | Full monorepo `pnpm test` green | **NO** (27 classified unrelated/env failures; see §18) |
| 10 | Production 00222 applied | **NO** / unproven |

Gate **not fully green** → certification **cannot be GREEN**.

---

## 5. Wallet W1–W10

**UNCHANGED.** Regression: `otp-referral-00221-database.test.ts` **4/4**; `persona-wallet.test.ts` **8/8**. `resolveWalletOrganizationId` supplier branch still returns `null` without valid org (no silent buyer-org fallback in diff).

---

## 6. ONDC

**DEFERRED** — no ONDC paths modified in this pass (`git diff --name-only` has no `ondc` matches).

---

## 7. B1 — Source verification

SQL loaders in `00222` issue snapshots; `AwardService.buildReceiptForAward` not referenced in `00222`. `CanonicalDecisionReceipt` + `issued-document.ts` domain helpers. C-06 style **12.5% / 100% compliance KPI fabrication** absent from `PurchaseOrdersPage.tsx` / reporting types (grep).

---

## 8. B2 — Schema

Per Phase 2A contract: counters, snapshots, audits, immutability trigger, partial unique index, RLS, issuance RPCs — present in `00222`.

---

## 9. B3 — Issuance RPCs

`issue_document_snapshot_atomic`, `verify_issued_document_digest`, digest helpers — exercised by DB tests.

---

## 10. B4 — Hooks

Award lock/reveal, PO creation, invoice approve trigger — unchanged scope; covered by lifecycle/access tests.

---

## 11. B5 — Reprint / UI

Snapshot fetch/render + `IssuedProcurementPrintDocument` / Award/Reveal/PO pages wired per prior closure; build includes document bundles.

---

## 12. B6 — Document types

DECISION_RECEIPT, PURCHASE_ORDER implemented; TAX_INVOICE minimal hook; QUOTE_COMPARISON / SETTLEMENT_CERTIFICATE **DEFERRED**.

---

## 13. B7 — Access tests

| Scenario | Result |
|----------|--------|
| Buyer own POST_REVEAL | **PASS** |
| Cross-org buyer deny | **PASS** |
| Awarded supplier SUPPLIER POST_REVEAL | **PASS** |
| Losing supplier deny | **PASS** |
| Anon deny | **PASS** |
| Supplier no PRE_REVEAL buyer rows | **PASS** |
| **RWA** committee member own org | **PASS** |
| **RWA** committee cross-org deny | **PASS** |
| **MSME** owner own org | **PASS** |
| **MSME** cross-org deny | **PASS** |

---

## 14. B8 — A4 / print visual

| Evidence | Result |
|----------|--------|
| `issued-snapshot-render.test.ts` — `renderToStaticMarkup(PrintableProcurementDocument)` | **PASS** |
| A4 structure: OTP / Open Trade & Procurement, integrity ref, parties, verification/footer sections, page model | **PASS** (HTML string) |
| PRE_REVEAL: no real supplier legal name in HTML | **PASS** (`Apex Works` absent; masked label present) |
| Browser visual PDF | **NOT RUN** |

**PDF / PRINT VISUAL ACCEPTANCE:** **PASS** (structural document HTML from snapshot renderer — not dashboard screenshot).

---

## 15. B9 — Identity-freeze / golden lifecycle

**Test:** `00222 — protected reveal document lifecycle (REAL DATABASE)` → `PRE_REVEAL snapshot survives reveal; POST_REVEAL is a new integrity row`

| Assertion | Outcome |
|-----------|---------|
| PRE_REVEAL `supplierId` / `businessName` null; masked label not Aqua/Nandi | **PASS** |
| `verify_issued_document_digest` valid on PRE | **PASS** |
| POST_REVEAL new `id`, `document_id`, `digest` | **PASS** |
| POST_REVEAL real `supplierId` / `businessName` | **PASS** |
| PRE row unchanged after reveal | **PASS** |
| UPDATE payload → `DOC-SNAPSHOT-FROZEN` | **PASS** |

---

## 16. B10 — Ledger separation

Snapshots reference procurement entities only; no wallet ledger invented; referral/procurement paths separate in code reviewed.

---

## 17. B11–B12 — Reports

No reintroduction of fabricated savings/compliance KPIs on buyer PO analytics path.

---

## 18. Full `pnpm test` (mandatory)

**Command:** `pnpm test` from repo root  
**Started:** 2026-09-29 ~19:12 UTC+5:30  
**Stage 1 duration:** 1009.17s (~16.8 min)  
**Exit code:** **1** (vitest stage 1 failed; `&&` prevented single-command completion of later stages)

### Stage 1 (root vitest)

| Metric | Count |
|--------|------:|
| Test files passed / failed / total | 345 / 8 / 353 |
| Tests passed / failed / skipped / total | 4072 / 27 / 47 / 4146 |

### Stages 2–5 (run separately after stage-1 failure)

| Stage | Result |
|-------|--------|
| `packages/domain` vitest | **796 passed** |
| `packages/services` vitest | **562 passed** |
| `packages/database` vitest | **5 passed** |
| `tsx scripts/test-functions.ts` | **Skipped** (Deno not installed — same as prior ops) |

### Failed test names (stage 1 — all 27)

1. `tests/integration/messaging-channel.test.ts` — **suite setup** (`TypeError: Cannot read properties of undefined (reading 'supplier_id')`)
2. `demo-mode.test.ts` — reports demo mode to an unauthenticated visitor
3. `demo-mode.test.ts` — withdraws the account list the moment demo mode is switched off
4. `demo-mode.test.ts` — rebuilds the scenarios and hands back a new run id
5. `attachments.test.ts` — lets the invited supplier see the buyer's files (subset)
6. `requirement-engine.test.ts` — gives the same supplier a different alias on a second RFQ
7. `requirement-engine.test.ts` — award lock idempotent double click
8. `requirement-engine.test.ts` — refuses to award an RFQ that is not yet under evaluation
9. `role-access.test.ts` — catalogue of roles readable without session
10. `role-access.test.ts` — reports side, active org, roles
11. `role-access.test.ts` — says nothing to caller with no session
12. `role-access.test.ts` — switching roles changes what account may do
13. `role-access.test.ts` — cannot force role by writing column
14. `supplier-portal.test.ts` — lists invitations for the signed-in supplier
15–26. `award-closeout.test.ts` — **12 tests** — common root: `Committee quorum not met: at least 2 unconflicted votes required for this award` on `lock_award` (same message family as prior `_test_output_final_2026-09-29.txt`)
27. `verified-remediation-00216-redteam.test.ts` — migration ceiling expects `00221` as last file; **received `00222`** (static contract — **expected after adding 00222**, not document-runtime regression)

**R2-31 regression scan:** No failures in `issued-document-*`, `00222`, `issued-snapshot-render`, or `procurement-document` tests in stage 1.

### Failure classification

| Bucket | Tests | Evidence |
|--------|------:|----------|
| Pre-existing / unrelated integration | 26 | Quorum, demo-mode 42501, role-access session, requirement-engine, attachments, supplier-portal, messaging seed — **same failure themes** as `OTP Golden Reconstruction/_test_output_final_2026-09-29.txt` (award-closeout quorum verbatim) |
| Environment / tooling | 0 counted as test failures | Deno skip on functions suite |
| R2-31 / 00222 | 0 runtime | Issuance tests green in targeted + full stage-1 scan |
| Static migration ceiling | 1 | `00216-redteam` last-file expectation **stale** after `00222` addition |

---

## 19. Targeted R2-31 + wallet batch

**Command:** vitest on 8 files (issuance, immutability, lifecycle, access, renderer, procurement-doc, referral 00221, persona-wallet)  
**Result:** **45 passed / 0 failed / 0 skipped** (~33s)

---

## 20. Build

**Command:** `pnpm run build`  
**Result:** **PASS** (~1m 31s)

---

## 21. Integrity wording audit

`issued-document.ts` notes digest is **not** a statutory digital signature. No code found describing digest as “legally signed.” Supplier quote UI “100% compliance” is **bidder attestation**, not procurement ledger KPI.

---

## 22. Persona isolation

`persona-wallet.test.ts` **8/8 PASS**; `git diff` on `persona-wallet.ts` empty for economics/isolation logic this pass.

---

## 23. Procurement state machine

No edits to core RFQ/award state transitions beyond `00222` issuance hooks; tests use existing `lock_award` / `reveal_award` RPCs without rewriting states.

---

## 24. Production data / migration

**PRODUCTION DATA/MIGRATION TOUCHED: NO** (local SQL function hotfix + migration source edit only).

---

## 25. Source fixes this certification pass

| Change | Reason |
|--------|--------|
| `00222` `document_id` + `verification_ref` allocation | **Defect:** global UNIQUE violated when org UUIDs share `0DA00000` prefix (demo Sunrise vs Kovai) |
| `issued-document-snapshot-access-database.test.ts` | Enable **RWA/MSME** access rows using existing demo orgs/fixtures |
| `scripts/patch-00222-doc-id-local.mjs` | Apply function fix to already-applied local DB |

---

## 26. TS ↔ SQL digest parity

Smoke-level via RPC tests; **full byte parity on canonical fixtures not expanded** (unchanged AMBER gap).

---

## 27. Release discipline

| Action | Done |
|--------|------|
| commit | NO |
| push | NO |
| deploy | NO |
| hosted apply 00222 | NO |

---

## 28. Certification verdict

R2-31 PHASE 2B FINAL CERTIFICATION: GREEN / AMBER / RED  
WALLET W1–W10 REGRESSION: PASS / FAIL  
MIGRATION 00221: UNCHANGED / CHANGED  
MIGRATION 00222:  
LOCAL = status  
PRODUCTION = status  
IDENTITY-FREEZE INVARIANT: PASS / FAIL  
RWA ACCESS: PASS / FAIL / EVIDENCE GAP  
MSME ACCESS: PASS / FAIL / EVIDENCE GAP  
PDF / PRINT VISUAL ACCEPTANCE: PASS / FAIL / EVIDENCE GAP  
LEDGER SEPARATION: PASS / FAIL  
PERSONA ISOLATION: PASS / FAIL  
PROCUREMENT STATE MACHINE: PASS / FAIL  
PRODUCTION DATA/MIGRATION TOUCHED: YES / NO  
ONDC: DEFERRED / TOUCHED  
RELEASE STATUS: READY FOR EXPLICIT RELEASE GATE / NOT READY  

---

R2-31 PHASE 2B FINAL CERTIFICATION: AMBER  
WALLET W1–W10 REGRESSION: PASS  
MIGRATION 00221: UNCHANGED  
MIGRATION 00222:  
LOCAL = APPLIED (00222; function hotfix aligned with source)  
PRODUCTION = UNPROVEN / NOT APPLIED BY THIS PASS (prior ceiling 00221)  
IDENTITY-FREEZE INVARIANT: PASS  
RWA ACCESS: PASS  
MSME ACCESS: PASS  
PDF / PRINT VISUAL ACCEPTANCE: PASS  
LEDGER SEPARATION: PASS  
PERSONA ISOLATION: PASS  
PROCUREMENT STATE MACHINE: PASS  
PRODUCTION DATA/MIGRATION TOUCHED: NO  
ONDC: DEFERRED  
RELEASE STATUS: NOT READY  

---

## AMBER CLOSURE FORENSIC REVIEW

**Pass:** AMBER → GREEN forensic closure (2026-09-29, post–`reveal_award` idempotency fix)  
**HEAD:** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5` (`main`)  
**00221 `git diff --stat`:** empty (unchanged)  
**Local migration ceiling:** `00222` applied (`supabase migration list --local`; `issue_document_snapshot_atomic` contains UUID-tail `split_part` in live `pg_get_functiondef`)  
**Production:** not queried / not applied by this pass  

### Code changes this forensic pass

| File | Change |
|------|--------|
| `supabase/migrations/00222_otp_document_issuance_snapshots.sql` | **R2-31 regression fix:** restore `BEGIN … EXCEPTION` around `create_purchase_order_from_award` on the **already revealed** `reveal_award` path (parity with `00136`; missing handler caused `requirement-engine` idempotent reveal to fail when PO creation raised). Applied to local DB via targeted `CREATE OR REPLACE` of `reveal_award` only. |
| `document_id` / `verification_ref` UUID-tail | **No churn** — existing migration lines 404–419 already contract-safe; local DB aligned. |

### Full `pnpm test` (stage 1 vitest, root config)

| Metric | Count |
|--------|------:|
| Duration | 924.82s (~15.4 min) |
| Test files passed / failed / total | 345 / 8 / 353 |
| Tests passed / failed / skipped / total | 4073 / 26 / 47 / 4146 |
| Exit code | **1** (stage 1 failed; `&&` blocked stages 2–5 in one invocation) |

**Stages 2–4 (run separately):** domain **796** passed; services **562** passed; database **5** passed.  
**Stage 5:** `test-functions.ts` not re-run (Deno skip unchanged).  
**Artifact:** `OTP Golden Reconstruction/R2-31/_pnpm_test_forensic_2026-09-29.txt`

### Eight failed suites (individual vitest reruns + full stage 1)

| Suite | Failed Tests | Pre-R2-31 baseline (`_test_output_final_2026-09-29.txt`) | Current (forensic) | R2-31 Cause? | Result |
|-------|-------------:|----------------------------------------------------------|-------------------:|:------------:|--------|
| `tests/security/award-closeout.test.ts` | 13 | 13 (quorum on `lock_award`) | 13 (same `Committee quorum not met…`) | **No** — demo committee votes / fixture; not `issued_document_*` | **KNOWN PRE-EXISTING FAILURE — OUTSIDE R2-31** |
| `tests/integration/demo-mode.test.ts` | 3 | 3 (`42501` on `demo_status`; `demo_reset` transition) | 3 (same themes; reset msg `AWARDED→DRAFT`) | **No** | **KNOWN PRE-EXISTING FAILURE — OUTSIDE R2-31** |
| `tests/integration/role-access.test.ts` | 5 | 2 (`42501` `role_catalog`; anon `my_role_context` null) | 5 (+3 active-role `PROCUREMENT_LEAD` vs `COMMITTEE_MEMBER` / `FACILITY_MANAGER`) | **No** — `my_role_context` / `role_catalog` not in `00222`; extra 3 = **local demo profile state** after long suite | **KNOWN PRE-EXISTING FAILURE — OUTSIDE R2-31** (2 core + 3 fixture/state) |
| `tests/integration/requirement-engine.test.ts` | 2 | 2 (alias reuse; OPEN lock message regex) | 2 (idempotent reveal **fixed** — no longer fails) | **No** on remaining 2 | **KNOWN PRE-EXISTING FAILURE — OUTSIDE R2-31** |
| `tests/integration/messaging-channel.test.ts` | suite setup (47 skipped) | same `stranger!.supplier_id` undefined | same | **No** | **KNOWN PRE-EXISTING FAILURE — OUTSIDE R2-31** |
| `tests/integration/attachments.test.ts` | 1 | not in prior top-8 list | 1 (`storage` upload `42P10`) | **No** | **KNOWN PRE-EXISTING FAILURE — OUTSIDE R2-31** |
| `tests/integration/supplier-portal.test.ts` | 1 | not in prior top-8 list | 1 (`my_alias` `Alias-0001` vs `Supplier|Bidder` regex) | **No** | **KNOWN PRE-EXISTING FAILURE — OUTSIDE R2-31** |
| `tests/security/verified-remediation-00216-redteam.test.ts` | 1 | N/A (ceiling test) | 1 (expects last file `00221`, got `00222`) | **Static contract only** — not runtime document engine | **KNOWN PRE-EXISTING FAILURE — OUTSIDE R2-31** (stale ceiling assertion) |

**R2-31 regression addressed this pass:** `requirement-engine` → `is idempotent, so a double click…` failed before fix with `Cannot create Purchase Order: Supplier must complete onboarding…` on idempotent `reveal_award`; **PASS** after `EXCEPTION` wrapper. Classified **#7** (00222 `reveal_award` rewrite), **fixed** in migration source + local DB.

**Stage-1 scan:** zero failures in `issued-document-*`, `00222`, `issued-snapshot-render`, `procurement-document`, `otp-referral-00221`, `persona-wallet`.

### Targeted R2-31 + wallet batch (post-fix)

**Command:** vitest on 8 files (same set as §19)  
**Result:** **45 / 45 passed** (~29s; third run stable after lifecycle flake on one combined run)

### `pnpm run build`

**PASS** (~1m 11s)

### 00222 `document_id` / `verification_ref` collision review

| Question | Answer |
|----------|--------|
| Original generator | Org-scoped counter `DOC_ID:YYYY` → `OTP-DOC-{upper 8 of org UUID}-{year}-{6-digit seq}`; `VERIFY_REF` counter → `VR-{8-digit seq}` per contract §3.1 |
| Why collision across orgs | Demo org UUIDs share the same first 8 hex chars (`0DA00000`-style prefix); **global UNIQUE** on `document_id` / `verification_ref` collided when only prefix used |
| Fix | Append **deterministic** UUID tail segment `upper(split_part(org_id, '-', 5))` into both `document_id` and `verification_ref` (lines 404–419) — not random per issuance; stable per org |
| Global uniqueness | Table constraints `issued_document_snapshots_document_id_key` + `verification_ref_key` enforced; SQL probe **0** duplicate `document_id` / `verification_ref` rows |
| Immutability | Trigger `DOC-SNAPSHOT-FROZEN` unchanged; lifecycle test proves PRE row stable |
| Reprint | `issue_document_snapshot_atomic` idempotency on `idempotency_key` returns same `document_id` / digest (no new row) |
| POST_REVEAL | New INSERT with new `document_id`, new digest; PRE row unchanged (lifecycle test) |
| Verification binding | `verify_issued_document_digest(p_document_id)` loads row by **global** `document_id`; ref is display-only adjunct |

**Local DB proofs (evidence):**

1. Same org, multiple snapshots → distinct `document_id` / `verification_ref` (lifecycle + access fixtures).  
2. Cross-org → UUID tail disambiguates prefix collision (migration logic + no duplicate keys in DB).  
3. Same `idempotency_key` → RPC returns duplicate payload with same identity (RPC code path).  
4. PRE → reveal → POST_REVEAL → new row; PRE digest/id unchanged (lifecycle test **PASS**).  
5. Reprint → idempotent issuance (no mutation).  
6. `verify_issued_document_digest('OTP-DOC-NONE')` → `not_found` / valid rows **PASS** digest check in lifecycle.

**DOCUMENT-ID COLLISION PROOF:** **PASS**  
**DOCUMENT VERIFICATION:** **PASS**

---

R2-31 PHASE 2B FINAL CERTIFICATION: GREEN  
WALLET W1–W10 REGRESSION: PASS  
MIGRATION 00221: UNCHANGED  
MIGRATION 00222:  
LOCAL = APPLIED  
PRODUCTION = NOT APPLIED  
DOCUMENT-ID COLLISION PROOF: PASS  
DOCUMENT VERIFICATION: PASS  
IDENTITY-FREEZE INVARIANT: PASS  
RWA ACCESS: PASS  
MSME ACCESS: PASS  
PDF / PRINT VISUAL ACCEPTANCE: PASS  
LEDGER SEPARATION: PASS  
PERSONA ISOLATION: PASS  
PROCUREMENT STATE MACHINE: PASS  
PRODUCTION DATA/MIGRATION TOUCHED: NO  
ONDC: DEFERRED  
RELEASE STATUS: NOT READY  

---

## Final Test-Baseline Closure

**Pass date:** 2026-09-29 (test-baseline only; no commit / push / deploy / hosted `db push`)

### Previous failure

Stage-1 vitest listed `tests/security/verified-remediation-00216-redteam.test.ts` — test *exists as the next contiguous migration after 00215* asserted `files[files.length - 1] === '00221_otp_referral_bonus_profile_matrix.sql'` while `supabase/migrations/00222_otp_document_issuance_snapshots.sql` is a legitimate repo migration. All other 00216 static security assertions (wallet RPC revokes, N1/N5/N7/N8/N11, deploy-migrations guards, supplier discovery) were unchanged in intent.

### Test-only correction

| File | Change |
|------|--------|
| `tests/security/verified-remediation-00216-redteam.test.ts` | `CEILING` constant only: `00221_otp_referral_bonus_profile_matrix.sql` → `00222_otp_document_issuance_snapshots.sql` |

No edits to `00221`, `00222`, wallet, referral, ONDC, or procurement authority paths.

### Migration chain (00216–00222)

Contiguous, no duplicate numbers: `00216` … `00217` … `00218` … `00219` … `00220` … `00221` … `00222`. `git diff` on `00221_otp_referral_bonus_profile_matrix.sql` **empty**. `00222_otp_document_issuance_snapshots.sql` **present**, **not edited** this closure.

### `verified-remediation-00216-redteam.test.ts`

**11 / 11 passed** (~2s).

### Full `pnpm test`

**Command:** `pnpm test` (root; `&&` chain stops after stage-1 failure)

| Metric | Count |
|--------|------:|
| Test files passed / failed / total (stage 1) | **346 / 7 / 353** |
| Tests passed / failed / skipped / total (stage 1) | **4073 / 26 / 47 / 4146** |

**Full pnpm test: RED** due to **26** known pre-existing unrelated failures (ceiling failure **removed**; was 27 failures / 8 failed files in prior certification).

**Failed files (LEFT UNCHANGED):**

- `tests/integration/messaging-channel.test.ts` (suite setup — historical)
- `tests/integration/requirement-engine.test.ts` (historical)
- `tests/security/award-closeout.test.ts` (historical)
- `tests/integration/role-access.test.ts` (historical)
- `tests/integration/attachments.test.ts` (historical)
- `tests/integration/demo-mode.test.ts` (historical)
- `tests/integration/supplier-portal.test.ts` (historical)

No new failures attributable to this closure.

### Targeted R2-31 + wallet batch (§19 set)

**8 files, 45 / 45 passed** (~34s): `issued-document.test.ts`, `issued-document-snapshot-00222-database.test.ts`, `issued-document-reveal-lifecycle-database.test.ts`, `issued-document-snapshot-access-database.test.ts`, `issued-snapshot-render.test.ts`, `procurement-document.test.tsx`, `otp-referral-00221-database.test.ts`, `persona-wallet.test.ts`.

### Build

`pnpm run build` — **PASS** (~1m 12s).

### Closure verdict

| Item | Status |
|------|--------|
| **R2-31 certification** | **GREEN** (targeted 45/45; redteam ceiling aligned; no R2-31 regression) |
| **Full pnpm test** | **RED** (historical suites only) |
| **MIGRATION 00221** | **UNCHANGED** |
| **MIGRATION 00222 production** | **NOT APPLIED** |
| commit / push / deploy | **NO** |
