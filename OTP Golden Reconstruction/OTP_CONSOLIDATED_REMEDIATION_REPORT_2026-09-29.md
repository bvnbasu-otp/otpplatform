# OTP Consolidated Remediation Report — 2026-09-29

**Role:** Senior remediation engineer  
**Workspace:** `G:\My Drive\otp`  
**Migration ceiling:** `00219` (00216–00219 preserved; **00220: NO**)

---

## 18. Status table

(Same as `OTP_CONSOLIDATED_REMAINING_BUG_REGISTER_2026-09-29.md` §18.)

| ID | Topic | Status |
| --- | --- | --- |
| F-1 | Email signup / verification path | **FIXED — NEEDS PRODUCTION VERIFICATION** |
| F-2 | WhatsApp confirmation false failure | **FIXED — NEEDS PRODUCTION VERIFICATION** |
| F-3 | Workspace pane error | **FIXED — NEEDS PRODUCTION VERIFICATION** |
| F-4 | Persona / supplier quotes route | **FIXED — NEEDS PRODUCTION VERIFICATION** |
| F-5 | Wallet rewards | **PRODUCT DECISION — DEFER** |

---

## A. Executive summary

Four actionable defects were repaired in application code with regression tests. Local security suite **00216** remained green. Production deploy was **BLOCKED** (no Vercel/gh on PATH); live retest **not completed**.

## B. Root-cause fixes

1. **F-1 — Account email:** `submitSignupRequest` now calls `supabase.auth.signInWithOtp` when `verificationChannel === 'EMAIL'`, with `resolveSupabaseEmailDispatch` for honest SUBMITTED vs FAILED status. **PRODUCTION DELIVERY NOT YET OBSERVABLE** without inbox access.

2. **F-2 — WhatsApp false failure:** `invokeEdgeFunction` reads JSON bodies on non-2xx invoke errors; EMAIL-channel UI uses email status as primary and shows optional phone acknowledgement separately. Messaging-not-configured returns **FAILED** with `outcomeUnknown: false`, not “could not confirm” network ambiguity when body is present.

3. **F-3 — Workspace pane:** `normalizeRolePermissions` + optional chaining in `PermissionChips` / `RoleWorkspaceCard` prevent render throws when RPC omits permissions.

4. **F-4 — Persona:** `reconcilePortalSide` in `roles.ts`, used by `toContext`, `ProtectedRoute.evaluateRouteAccess`, and `resolvePortalRole` stale BUYER side override for supplier-only accounts.

## C. Files touched (remediation core)

- `apps/web/src/features/portal/api/signup.ts`
- `apps/web/src/features/portal/lib/registration-outcome.ts`
- `apps/web/src/features/portal/components/SignupSuccess.tsx`
- `apps/web/src/features/notifications/lib/edge-dispatch.ts`
- `apps/web/src/features/roles/api/roles.ts`
- `apps/web/src/features/auth/ProtectedRoute.tsx`
- `apps/web/src/features/auth/user-role.ts`
- `apps/web/src/features/roles/components/PermissionChips.tsx`
- Regression: `portal-side-reconciliation.test.ts`, `edge-dispatch.test.ts`, `protected-route.test.ts`, `registration-outcome.test.tsx`

## D. Security posture

RLS, anon allowlist (11), PUBLIC execute closure, RFQ status guard, approval-stage direct-write guard — **not weakened**. No **00220**.

## E. Deploy

| Item | Value |
| --- | --- |
| Attempted | Vercel CLI / `npx` / `gh` |
| Result | **BLOCKED** |
| Production SHA | **N/A** (still prior deploy on theta) |

## F. Deferred

F-5 wallet economics; FIN/LEG product copy; admin allowlist; hosted DB certification.

## G. Certification statement

Local engineering certification for the four fixes and **00216–00219** static/runtime tests documented in companion files. **Not** a global “production fixed” claim until deploy + behavioural retest.
