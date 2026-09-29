# OTP Security Regression 00216–00219 — 2026-09-29

**Migrations:** `00216`, `00217`, `00218`, `00219` — **preserved, not modified**  
**00220 created:** **NO**

---

## 18. Control status

| Control | Classification |
| --- | --- |
| Anon privileged RPC deny (post-00217) | **VERIFIED — STATIC** (+ local DB tests in 00216 suite) |
| Anon allowlist (11 functions) | **UNCHANGED — NOT WEAKENED** |
| PUBLIC execute revocation | **UNCHANGED** |
| RFQ status direct-update guard (00218) | **UNCHANGED** |
| Approval-stage direct-write guard (00219) | **UNCHANGED** |
| Wallet / reward SQL economics (00216) | **UNCHANGED — NOT REOPENED** |
| App-layer persona fixes | **OUT OF SCOPE for SQL** — no grant/RLS impact |

---

## A. Scope

Post-remediation security regression for persona/notification fixes that must not weaken 00216–00219.

## B. Tests executed

```
node node_modules/vitest/vitest.mjs run tests/security/verified-remediation-00216-database.test.ts tests/security/verified-remediation-00216-redteam.test.ts
```

Included in 55-test bundle: **PASS**.

## C. Diff review

No edits under `supabase/migrations/00216*`–`00219*`. No new migration files.

## D. Anon allowlist

Still exactly **11** per 00217 design — no app change to RPC exposure.

## E. Production hosted DB

**PRODUCTION VERIFICATION REQUIRED** — deploy blocked; live grant catalog not re-queried this pass.

## F. Red team

Static redteam tests: **PASS** (same run).

## G. Statement

Security baseline **maintained in repository**. Hosted parity **not re-certified** on 2026-09-29 due to deploy/tooling block.
