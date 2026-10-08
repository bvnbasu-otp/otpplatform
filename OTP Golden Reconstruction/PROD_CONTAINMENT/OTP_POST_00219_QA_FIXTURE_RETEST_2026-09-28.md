# OTP POST-00219 QA Fixture Retest — 2026-09-28

**Site:** https://otpplatform-theta.vercel.app  
**QA label:** QA-AUDIT-2026-09  
**Pass type:** Focused fixture correction attempt + paired behavioural retest (no DB/SQL/service-role).  
**Tooling:** `cursor-ide-browser` **unavailable** (no tab); Playwright headless + Supabase Auth/RPC with QA JWTs (anon key from public bundle only).

---

## Priority 1 — RWA same-org membership

| Step | Result |
|------|--------|
| Login RWA-A-ADMIN | **SUCCESS** (Auth 200; dashboard OWNER) |
| Org context (UI) | **RWA-A-ADMIN** workspace; `active_organization_id` **`92ea8a48-f6c0-48d5-9b4b-a22fb69eb856`** |
| Membership UI | **`/org/members`** — “Team Members, Invitations & Delegation Workbench”; **+ Invite**; role templates (Committee Member, Buyer/Procurement Lead, Approver/Finance, Manager, Viewer) |
| Invite submitted for RWA-A-MEMBER | **NOT COMPLETED** — acceptance path requires mailbox; Gmail not available |
| RWA-A-MEMBER `active_organization_id` after pass | **`a7f9bd7b-5d70-4e29-8598-6f848a6b4776`** (unchanged; **≠** admin org) |

**RWA MEMBERSHIP FIXTURE:** **BLOCKED** — operator must complete invitation acceptance for `bvnbasu+otp.qa.rwaa.member@gmail.com` (or equivalent UI join) before same-org admin/member tests can run. No DB repair performed.

---

## Priority 2 — Supplier persona

| Identity | API `active_role_code` | UI dashboard persona (Pilot chrome) | `/supplier/quotes` |
|----------|------------------------|--------------------------------------|---------------------|
| SUPPLIER-A | SUPPLIER_FOUNDER | **Buyer** cockpit (“Pilot Mode \| Buyer”) | Redirect **`/dashboard`** |
| SUPPLIER-B | SUPPLIER_FOUNDER | **Buyer** cockpit | Redirect **`/dashboard`** |

Onboarding URLs (`/supplier/onboarding`, etc.) load marketing/shell copy; they do **not** flip SUPPLIER-A to a supplier-only workspace in this pass.

**SUPPLIER PERSONA:** **PRODUCT/ONBOARDING DEFECT** — supplier API linkage exists; production UI does not establish a consistent supplier workspace for SUPPLIER-A (SUPPLIER-B also buyer chrome). **Supplier-side quote route test for SUPPLIER-A is BLOCKED** (persona not supplier in UI).

---

## Minimum QA RFQ / quote

| Item | Result |
|------|--------|
| Create RFQ labelled **QA-AUDIT-2026-09** via UI | **BLOCKED** — automation did not reach a submit-ready RFQ form (`+ Create Requirement` / 1-Tap paths not closed in this pass) |
| IND-A own RFQ vs IND-B isolation | **BLOCKED** — no QA RFQ exists (`rfqs` list count **0** for both) |
| Quote (SUPPLIER-A vs SUPPLIER-B) | **BLOCKED** — no RFQ |

---

## Login matrix

**7 / 7** password authentications **HTTP 200** on production Auth.

---

## Five findings (fixture pass touchpoints)

1. **Email verification:** Inbox not read — **BLOCKED** (not FAIL). Password login proves credentials only.  
2. **WhatsApp error strings:** **NOT REPRODUCED** on dashboard for all **7** identities; no handset delivery test.  
3. **Workspace pane error:** **NOT REPRODUCED** on dashboard for all **7**.  
4. **Buyer/supplier profile:** **HIGH** — supplier accounts still present as **buyer** UI; not silently corrected.  
5. **Wallet/rewards:** `get_organization_wallet` **ok** for IND-A (ACTIVE, 0.0 credits); supplier reward offset **PRODUCT DECISION REQUIRED**; no money movement.

---

## Safety attestation

| Check | Result |
|-------|--------|
| Production source/migrations/RLS modified | **NO** |
| Service-role / SQL / DB inserts | **NO** |
| Real payments / settlements | **NO** |
| Secrets in repo reports | **NO** |
| Ephemeral credential script | **Deleted** after run |

---

## Section 19 — Executive counts (this fixture retest)

| Metric | Count |
|--------|------:|
| **BEHAVIOURALLY VERIFIED** (control rows) | **8** |
| **BEHAVIOURALLY FAILED** | **0** |
| **BLOCKED** | **29** |
| **NOT APPLICABLE** | **1** |
| **PRODUCT ISSUE — NOT SECURITY** | **4** |
| **INSUFFICIENT EVIDENCE** | **5** |
| **NOT REPRODUCED** | **2** |
| **PRODUCT DECISION REQUIRED** | **1** |
| Confirmed **P0** security | **0** |
| Confirmed **P1** security | **0** |
| Confirmed **P2** / **P3** | **2** / **3** |
| New migration candidates | **0** |
| Production DB directly modified | **NO** |
| Security config modified | **NO** |
| Real financial settlement | **NO** |
| QA identities — login success | **7 / 7** |
| **Paired controls fully closed** (auth + unauth legs) | **2** |
| **Unauthorized-only verified denials** | **6** |
