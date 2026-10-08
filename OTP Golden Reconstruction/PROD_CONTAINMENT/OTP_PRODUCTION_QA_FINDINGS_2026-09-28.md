# OTP Production QA Findings — 2026-09-28

**Production:** https://otpplatform-theta.vercel.app  
**Phase:** Controlled production QA identity establishment (Grok pass)  
**Migration ceiling:** `00219`  
**Behavioural security testing:** Not in scope for this phase.

---

## Execution environment notes

| Item | Observation |
|------|-------------|
| `cursor-ide-browser` MCP | **Unavailable** — every `browser_navigate` / `browser_cdp` call returned *"No browser tab available. Please navigate to a page first."* |
| Live UI evidence | Headless Chromium (Playwright Python) used **only** to reach production signup/login; no source changes. |
| Gmail (`bvnbasu@gmail.com` plus-address inbox) | **Not readable** — navigation to Gmail redirected to Google Account sign-in (`accounts.google.com`); no authenticated session in automation profile. |
| WhatsApp handset | **Not available** to observe device delivery. |

---

## Finding 1 — Password + email signup (verification email path)

**Scope:** IND-A (`bvnbasu+otp.qa.inda@gmail.com`) gate persona; password is set **after** registration via *Forgot password?* + activation code (live UI copy), not on the signup form.

| Stage | Result | Evidence |
|-------|--------|----------|
| Submit registration (buyer individual, Email channel selected in UI) | **Reached** | Live `/signup?side=buyer`; reference **REG-21D626A8**; server status shown **ONBOARDED**; headline *Account created*. |
| Post-submit UI (no send failure before inbox) | **Mixed** | Success narrative references activation code to **registered phone** even though **Email** channel was selected; separate confirmation line shows WhatsApp send failure (see Finding 2). No UI message that **email** verification failed to send. |
| Operator Gmail inbox opened | **NO** | Google sign-in wall; agent cannot read inbox or spam. |
| Verification link / code exercised | **NO** | Blocked by mailbox. |
| Login with configured password | **NO** | Password configured: **NO**; probe login with placeholder password returned *Invalid login credentials* (expected). |

**Classification:** **BLOCKED — TEST ENVIRONMENT** (mailbox not accessible).  
**Status:** **BLOCKED**  
**Note:** Inbox delivery is **not** classified as FAIL — EMAIL DELIVERY because the controlled inbox was never opened.

---

## Finding 2 — WhatsApp registration confirmation (live UI)

**Scope:** Same IND-A submission; Email selected for *How should we send your code?*

| Observation | Classification |
|-------------|----------------|
| Post-submit confirmation block included: **"Failed: We could not confirm that your WhatsApp registration confirmation was sent. Please try again or use another channel."** | **Application UI / notification path** — reproduced on production with Email channel selected. |
| Message delivery to a physical WhatsApp number | **Not verified** — no handset in test environment. |
| Exact string *"We could not reach the notification service. Please try again shortly."* | **NOT OBSERVED** on this submission. |

**Classification:** **REPRODUCED** (UI reports WhatsApp registration confirmation failure alongside Email-channel signup).  
**Status:** **REPRODUCED**

---

## Finding 3 — First-login workspace pane error

**Exact string:** *"Something went wrong - An unexpected error occurred in this workspace pane."*

| Account | First login reached? | Pane error |
|---------|----------------------|------------|
| IND-A | No | **BLOCKED** — no verified session |
| IND-B | Not attempted (gate) | **BLOCKED** |
| RWA-A-ADMIN | Not attempted | **BLOCKED** |
| RWA-A-MEMBER | Not attempted | **BLOCKED** |
| RWA-B-ADMIN | Not attempted | **BLOCKED** |
| SUPPLIER-A | Not attempted | **BLOCKED** |
| SUPPLIER-B | Not attempted | **BLOCKED** |

**Classification:** **BLOCKED** (no account completed verification + first login).  
**Status:** **BLOCKED**

---

## Finding 4 — Buyer vs supplier profile separation

**Scope:** UI visibility and route access per persona after sign-in.

No production session was established for any of the seven target identities. Registration UI exposes buyer vs supplier via *I need work to be done* / *I provide services* on `/signup` (live discovery).

**Classification:** **BLOCKED — TEST ENVIRONMENT** (identities not verified).  
**Status:** **BLOCKED**  
**Security note:** Menu hiding alone would not prove server authorization; no server-side separation testing performed.

---

## Finding 5 — Wallet / rewards (buyer vs supplier)

No signed-in buyer or supplier session. Wallet/rewards surfaces were not reachable.

**Classification:** **BLOCKED** — insufficient signed-in coverage.  
**Status:** **BLOCKED**  
Supplier reward economics: **PRODUCT DECISION REQUIRED** if product intent is undefined (not invented here).

---

## Additional observations (document only — not fixed)

| ID | Severity (informal) | Summary |
|----|---------------------|---------|
| OBS-01 | UX | Live signup success copy directs users to phone activation code path while Email verification channel was selected. |
| OBS-02 | UX | WhatsApp registration confirmation failure shown when Email channel selected (Finding 2). |
| OBS-03 | Env | Mandated `cursor-ide-browser` MCP could not attach a tab in this run. |

---

## Summary table

| # | Topic | Status |
|---|--------|--------|
| 1 | Password + email signup / verification | **BLOCKED** |
| 2 | WhatsApp registration confirmation | **REPRODUCED** |
| 3 | Workspace pane error on first login | **BLOCKED** |
| 4 | Buyer vs supplier separation | **BLOCKED** |
| 5 | Wallet / rewards | **BLOCKED** |
