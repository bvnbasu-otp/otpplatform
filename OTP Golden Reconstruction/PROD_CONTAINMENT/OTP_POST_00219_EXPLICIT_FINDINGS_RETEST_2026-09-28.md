# OTP POST-00219 Explicit Findings Retest — 2026-09-28

**Environment:** Production web + Supabase Auth/API (black-box).  
**QA label:** QA-AUDIT-2026-09  
**UI coverage this pass:** Playwright — **all 7** identities on `/dashboard`; subset routes and `/org/members`.

---

## Finding 1 — Password / email verification

| Step | Result | Evidence |
|------|--------|----------|
| A — Signup re-run | **NOT RUN** (pre-provisioned accounts) | — |
| B — Email delivery | **BLOCKED** | Gmail plus-address inbox not available |
| C — Email verification | **INFERRED** via password login only | Not inbox proof |
| D — Password login | **PASS (7/7)** | Auth HTTP **200** all QA emails |
| E — First session | **PASS (7/7 UI)** | All reach `/dashboard` after sign-in |

**Classification:** Password path **ready**; email inbox proof **BLOCKED** (not FAIL).

---

## Finding 2 — WhatsApp UI

| Check | Result |
|-------|--------|
| Exact error strings “WhatsApp delivery failed” / “Could not send WhatsApp” | **NOT OBSERVED** on dashboard (all **7**) |
| WhatsApp-related UI | Referral **Share on WhatsApp** may appear; not onboarding OTP channel retest |
| Handset delivery | **BLOCKED** |

**Classification:** **NOT REPRODUCED** for prior error strings; delivery **not inferred**.

---

## Finding 3 — Workspace pane error

| Surface | All 7 identities |
|---------|------------------|
| Post-login `/dashboard` | No workspace pane error co-occurrence in body text |
| Refresh `/dashboard` | Same |

**Classification:** **NOT REPRODUCED** (this pass, all seven).

---

## Finding 4 — Buyer vs supplier separation (`/supplier/quotes`)

| Actor | Navigation | Observed behaviour | Data leak? |
|-------|------------|-------------------|------------|
| IND-A | `/supplier/quotes` | Redirect **`/dashboard`** (buyer) | **No** supplier-private rows |
| IND-B | `/supplier/quotes` | Redirect **`/dashboard`** | **No** |
| SUPPLIER-A | `/supplier/quotes` | Redirect **`/dashboard`** (buyer cockpit) | **No** quote workspace |
| SUPPLIER-B | `/supplier/quotes` | Redirect **`/dashboard`** | **No** |
| API cross-supplier read | REST | HTTP **400** both directions (foreign supplier id) | **No leak demonstrated** |

**Classification:** **PRODUCT ISSUE — NOT SECURITY** (persona/routing); no demonstrated read leak on exercised paths.

---

## Finding 5 — Wallet / rewards

| Observation | Detail |
|-------------|--------|
| Wallet RPC | IND-A `get_organization_wallet` → **ok: true**, ACTIVE, **0.0** credits |
| Supplier settlement / 0.5% offset | **Not implemented / not testable** in UI |
| Real money movement | **NOT PERFORMED** |

**Classification:** **PRODUCT DECISION REQUIRED** for reward/settlement behaviour; wallet shell read-only.

---

## Paired denial retest (high-signal)

| Control | Authorized leg | Unauthorized leg | Pair closed? |
|---------|----------------|------------------|--------------|
| `demo_status` | Not run | anon **401** | **NO** → INSUFFICIENT EVIDENCE |
| Reward / award RPCs | Not run | anon **404** | **NO** |
| `admin_review_signup_request` | Not run | SUPPLIER-A **400** | **NO** |
| Approval stage direct write | RPC path not run | direct POST **400** `APPROVAL-STAGE-DIRECT-WRITE` | **NO** |
| Cross-org RFQ read | Own org empty list | Filter other org empty | **YES** → BEHAVIOURALLY VERIFIED |
| Cross-supplier read | Own row not isolated | Foreign id **400** both ways | **YES** → BEHAVIOURALLY VERIFIED |
