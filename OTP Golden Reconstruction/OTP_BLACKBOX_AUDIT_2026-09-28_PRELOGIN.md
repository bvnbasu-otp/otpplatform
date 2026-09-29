# OTP — Independent Black-Box Production Audit (Pre-Login Phase)

Target: https://otpplatform-theta.vercel.app (production, as deployed on 27–28 Sep 2026)
Auditor: independent browser agent, no source/issue-list/prior-report access.
Scope reached: registration, sign-in, public pages, trust wording, mobile layout, logged-out access control.
Everything behind sign-in is BLOCKED in this phase (see G).

---

# A. Audit Identity

| Item | Value |
|---|---|
| Target | https://otpplatform-theta.vercel.app (production), Desktop and Mobile |
| Method | Black-box, human-style; browser devtools used only to confirm things a user can see |
| Not used | Source code, GitHub, Vercel, source maps, web search, prior reports |
| Date | 27–28 Sep 2026 |

At the start, the browser was already signed in as `qa-audit-buyer-otp@mailinator.com`. The auditor didn't create that account, signed out, and never used it.

**Accounts created.** None has a password, because the signup flow never asks for one. All are PENDING.

| Persona | Email | Name / Organisation | PIN, city | Phone given | Code channel | Reference | State |
|---|---|---|---|---|---|---|---|
| A Individual buyer | qa.audit.buyer.202609280131@example.com | QA Audit Individual Buyer / "Self" | 560038, Bengaluru | +91 55555 01310 | Email | REG-7F9C7CB9 | PENDING |
| B RWA resident owner | qa.audit.rwa.resident.202609280131@example.com | QA Audit RWA Resident / QA Audit Lakeview Residents Welfare Association | 560102 | +91 55555 01311 | Email | REG-B367E9FB | PENDING |
| C RWA committee member | qa.audit.rwa.committee.202609280131@example.com | QA Audit RWA Committee (Secretary), same RWA | 560102 | +91 55555 01312 | Email | REG-CC24ED36 | PENDING |
| D RWA manager | qa.audit.rwa.manager.202609280131@example.com | QA Audit RWA Facility Manager, same RWA | 560102 | +91 55555 01313 | Email | REG-8A395D6D | PENDING |
| E MSME primary | qa.audit.msme.primary.202609280131@example.com | QA Audit MSME Primary (Director) / QA Audit Traders Pvt Ltd, Private Limited | 560058 | +91 55555 01314 | Email | REG-3DC2D3AF | PENDING |
| G Supplier | qa.audit.supplier.202609280131@example.com | QA Audit Supplier Owner / QA Audit Facility Services Pvt Ltd; Property & Facility Management, Water & Environmental | 560037 | +91 55555 01315 | Email | REG-E727E5B0 | PENDING |

- All six receive codes by Email; example.com addresses can't receive mail. No code was sent to a phone.
- One password reset was requested for the supplier address; nothing was delivered.
- These six registrations remain in production; operators may want to reject them.

# B. Coverage Matrix

| Area | A | B | C | D | E | F | G | H | I/J |
|---|---|---|---|---|---|---|---|---|---|
| Registration | Done | Done | Done | Done | Done | BLOCKED | Done | – | BLOCKED |
| Sign-in | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | Done | BLOCKED |
| TELL, REVIEW, DECIDE, TRACK | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | – | BLOCKED |
| Role rules as shown at signup | Done | Done | Done | Done | Done | – | Done | – | – |
| Access control (logged out) | – | – | – | – | – | – | – | Done | – |

| Audit area | Status |
|---|---|
| Identity protection | Signup and FAQ claims reviewed; live quote comparison BLOCKED |
| Registration and profile | Done |
| Address | Signup only (city and PIN); profile editing BLOCKED |
| Financial trust | Done: Pricing, FAQ, agreements, Terms, Disclaimer, Get Started pop-up |
| Market intelligence | Signup "active suppliers" banner only |
| Notifications | NOT VERIFIABLE — external delivery unavailable |
| Mobile 360/390/430px and desktop | Done: signup (buyer and supplier), Pricing, landing |
| Visual and UX | Done |
| Error recovery | Done: validation, duplicates, unknown URLs, sign-in errors, password reset |
| State machine | Registration only reaches PENDING; everything after BLOCKED |
| Security observations | Done, without exploitation |

# C. Human Experience

**Arriving and registering.**
- Landing page is clear. The example quote card is labelled "EXAMPLE" and "Names hidden", and says the lowest price doesn't automatically win.
- Registration is quick and role hints are good (e.g. Committee: "compares quotes side by side, votes on the shortlist, signs off purchase orders. Does not raise enquiries.").
- RWA and MSME agreements are mandatory and actually block submission until accepted.

**Where it gets confusing.**
- Every registration ends at "PENDING — you can sign in once it is approved", with no timeline and no password step.
- "Email me a code" then says it "could not find an account", pointing the user to register again.
- Confirmation always says "No WhatsApp registration confirmation was sent", even when Email was chosen.
- An individual buying for themselves is asked to "Register your organisation" with a "Work email", pending "verification of the organisation you buy for".

**Trust wobble.**
- The pitch says "₹0 charged" and "OTP does not collect, hold or settle payments".
- Agreements, Pricing and the Get Started pop-up describe a 0.50% fee plus GST "deducted from supplier disbursements" and "instant bank settlements".
- Legal pages say they are unreviewed drafts.

**Jargon and developer leftovers in user-facing text:** `canVote = false` (RWA agreement), "PA-09" (MSME agreement, Pricing), raw LaTeX `($\ge 2$)` (Pricing), "Institutional Procurement OS", "sovereign spend authority", agreement downloads offered as `.md` files.

# D. Defect Register

| ID | Severity | Persona | Route | Title |
|---|---|---|---|---|
| D-01 | P1 | A–G | /, /pricing, /faqs, /signup (MSME agreement), Get Started pop-up, /legal/terms | Contradictory statements about fees and money handling |
| D-02 | P1 | All | /legal/terms, /legal/disclaimer | Production legal pages marked "NOT final legal text" |
| D-03 | P2 | A–G | /login, "Email me a code" | Pending registrants are told no account exists |
| D-04 | P3 | A–G | /signup confirmation | Confirmation says WhatsApp wasn't sent when Email was chosen |
| D-05 | P3 | H | /pricing | Raw LaTeX `($\ge 2$)` on the RWA plan card |
| D-06 | P3 | E | /signup (MSME) | Invalid GSTIN accepted |
| D-07 | P3 | A–G | /signup | Malformed email / short phone not caught on the form; errors one at a time, away from the field |
| D-08 | P3 | A | /signup | Old error messages stay visible after fields are fixed |
| D-09 | P3 | All | Desktop shell | Floating "+" button covers content and buttons on desktop |
| D-10 | P3 | H | Any unknown URL | Unknown URLs silently redirect home, no "not found" message |
| D-11 | P3 | A–G | /login | After switching to "Email me a code", switcher still highlights "Use a password" |

**D-01 Contradictory money claims (P1).**
- Steps: read the landing page, FAQ "Does OTP handle the money?", Pricing, the MSME agreement pop-up at signup, and the "+" / Get Started pop-up.
- Observed: landing "OTP does not collect, hold or settle payments"; FAQ "no payment passes through us"; Pricing "Suppliers quote 100% free forever with zero listing fees"; Get Started "Zero commissions, zero lead fees" and also "instant bank settlements"; MSME agreement "0.50% (+18% GST) on settled purchase orders, deducted from supplier disbursements"; Pricing "0.50% Platform Fulfillment Fee … on confirmed PO awards"; Terms don't mention a supplier fee.
- Expected: one consistent statement of the fee, when it applies, and who handles funds.
- Frequency: every time (static content). Impact: users accept agreements with conflicting financial terms — trust and legal risk.
- Evidence: E-09, E-15, E-16, E-18.

**D-02 Draft legal text in production (P1).**
- Observed: /legal/terms "⚠️ Legal Review Required … must be reviewed and approved by legal counsel before production deployment" and "this is NOT final legal text"; /legal/disclaimer same; Terms "Last updated: 2026-09-01" vs footer "26 September 2026".
- Expected: final legal text before users accept agreements. Frequency: every time.
- Evidence: E-20, E-21.

**D-03 "No account" for pending registrations (P2).**
- Steps: register (REG-7F9C7CB9), go to /login, "Email me a code", enter the same email.
- Observed: "We could not find an account for that email. Register your organisation first."
- Expected: a message that the account is pending approval. Frequency: 1/1. Evidence: E-03.

**D-04 Wrong confirmation channel (P3).** "Not sent: No WhatsApp registration confirmation was sent" after choosing Email. 6/6. Evidence: E-02, E-07, E-10.

**D-05 Raw LaTeX on Pricing (P3).** RWA card: "Voting Room: … quorum meters ($\ge 2$)", monthly and yearly tabs. Evidence: E-15.

**D-06 Invalid GSTIN accepted (P3).** Input `INVALIDGST12` (12 chars); field only said "3 characters remaining"; registration REG-3DC2D3AF created. Expected a format error, since the field promises a "verified badge". Evidence: E-10.

**D-07 Weak field validation (P3).** `qa.audit.buyer@@example` and phone `12345` not rejected by the form; server returned one error at a time above the Register button. Evidence: E-01.

**D-08 Stale errors (P3).** "Choose who you are buying for" and "Organisation name is required" stayed after fields were filled; cleared only on resubmit (Individual form).

**D-09 Floating "+" on desktop (P3).** Covers the "Furniture, Fixtures & Interiors" chip and intercepted clicks on Register and other buttons. Evidence: E-11, E-19.

**D-10 No "not found" page (P3).** `/this-page-does-not-exist-qa` silently lands on home; server returns 200 for every path. Evidence: E-14.

**D-11 Sign-in switcher highlight (P3).** Evidence: E-03.

# E. Security and Trust Observations

- **Account enumeration.** Signup with an existing email returns "We already have this registration" with its REG reference and status; "Email me a code" says no account exists. Password reset ("requested … delivery is not confirmed") and password sign-in ("Invalid login credentials") are neutral.
- **Role self-selection.** Anyone can pick "Managing Committee Member / Director" at signup; three people registered the same society name with no "already registered" notice. Whether operator approval checks roles is BLOCKED.
- **Unsupported "suppliers ready" banner.** "✓ OTP already has active suppliers discovered and ready in your area" appears for every PIN tried (560038, 560102, 560058).
- **Suppliers can skip registration.** FAQ says suppliers can quote over WhatsApp without registering, which sits uneasily with "Verified suppliers".
- **Pre-existing session.** Browser started signed in as an account the auditor didn't create.
- **Sign-out header (observation, seen once).** After sign-out the header still showed Dashboard and avatar until reload.
- **Framing.** Pages couldn't be framed from the same site — consistent with clickjacking protection.

# F. Visual and Mobile

- **360/390/430px:** no horizontal overflow on signup (buyer and supplier), Pricing, landing; bottom nav doesn't cover the footer (360px: disclaimer ends 687px, nav starts 723px).
- **Touch targets below ~44px:** "Log In" 24px, buyer/supplier tabs 28px, "Sign in" link 20px.
- **Loading:** "Your role" field appears late (layout shift); "Loading Categories…" briefly; header logo briefly renders as a thin bar.
- **Inconsistencies:** frame "© 2025" vs footer "© 2026"; "Get Started" tab renamed "Add Capabilities" on the supplier side; Email/WhatsApp card highlight out of sync once.

# G. Blocked

| Item | What the UI asked for or showed |
|---|---|
| All sign-ins (A–G) | "pending verification … You can sign in once it is approved"; no password ever set; codes go to example.com |
| Golden journey TELL/REVIEW/DECIDE/TRACK | Needs an approved account |
| F MSME delegate | No delegate option at signup; agreement says the Primary grants delegation after sign-in |
| I Admin/Ops, J Founder/Superadmin | BLOCKED — no authorized production admin credentials available; /admin redirects to sign-in |
| Notifications | NOT VERIFIABLE — external delivery unavailable |
| Identity masking, voting, state changes, address/profile editing, wallet, referrals | Need a signed-in, approved account |

# H. Expected Behaviour and False Positives

- Logged out, `/dashboard` and `/admin` redirect to `/login?redirect=…`.
- Empty form gives clear field errors; PIN field accepts digits only.
- Duplicate registration handled cleanly ("No new account was created").
- RWA and MSME agreements enforced ("Review and accept the agreement above to continue.").
- Yearly savings correct: ₹389, ₹2,989, ₹3,989 (~17%). Pilot Mode ₹0 consistent for buyers.
- Example quote card clearly marked as demonstration data.
- Not defects: `/direct-settlement` goes home because it isn't a real link (footer "Direct-Settlement" points to `/legal/disclaimer`, which works); "Your role" just loads late.

# I. Evidence Index

Files in `C:\Users\bloganat\AppData\Local\Temp\cursor\screenshots\`, named `page-2026-09-27T<time>Z.png`.

| ID | Time | Shows |
|---|---|---|
| E-01 | 20-04-33-764 | Phone/email validation error (D-07) |
| E-02 | 20-05-20-639 | Individual registration PENDING; wrong-channel confirmation (D-04) |
| E-03 | 20-05-54-361 | "Could not find an account" for pending email (D-03, D-11) |
| E-04 | 20-06-37-445 | Duplicate registration handled (H) |
| E-05 | 20-07-47-067 | RWA agreement showing `canVote = false` |
| E-06 | 20-09-15-214 | RWA agreement enforced (H) |
| E-07 | 20-09-32-439 | Committee member REG-CC24ED36 |
| E-08 | 20-10-18-149 | Facility manager REG-8A395D6D |
| E-09 | 20-11-02-327 | MSME agreement: 0.50% fee, "PA-09" (D-01) |
| E-10 | 20-11-22-238 | MSME REG-3DC2D3AF with invalid GSTIN (D-06) |
| E-11 | 20-12-04-997 | Supplier REG-E727E5B0 |
| E-12 | 20-12-24-552 | Generic "Invalid login credentials" (H) |
| E-13 | 20-17-16-635 | Neutral password-reset reply (H) |
| E-14 | Landing after unknown URL | Silent redirect home (D-10) |
| E-15 | 20-18-11-574, 20-18-27-556 | Pricing: LaTeX (D-05), "100% free forever", 0.50% fee (D-01) |
| E-16 | 20-19-07-023 | FAQ page |
| E-17 | 20-19-33-867, 20-19-44-747, 20-20-12-868, 20-20-40-173, 20-20-55-258 | Mobile 360/390/430px |
| E-18 | 20-20-23-596 | Get Started pop-up: "Zero commissions", "instant bank settlements" (D-01) |
| E-19 | 20-21-05-172 | "+" covering a category chip on desktop (D-09) |
| E-20 | 20-21-28-360 | Disclaimer: "NOT final legal text" (D-02) |
| E-21 | 20-21-41-065 | Terms: "Legal Review Required" (D-02) |

Note: screenshots live in a temp folder and may be cleared; copy them if they need to be kept.

# Addendum — Second registration pass (Mailinator inboxes, 28 Sep 2026 ~01:18–01:23 UTC)

| Persona | Email | Name / Organisation | PIN | Reference | State |
|---|---|---|---|---|---|
| A Individual buyer | qa-audit-a-2609@mailinator.com | QA Audit Individual Buyer (organisation left as form default) | 560038 | REG-06553933 | PENDING |
| B RWA resident owner | qa-audit-b-2609@mailinator.com | QA Audit RWA Resident, Flat Owner B-1204 / QA Audit Prestige Lakeside Residents Welfare Association | 560103 | REG-9B84838A | PENDING |
| C RWA committee member | qa-audit-c-2609@mailinator.com | QA Audit RWA Committee, Secretary / same RWA | 560103 | REG-CF0BE00A | PENDING |
| D RWA facility manager | qa-audit-d-2609@mailinator.com | QA Audit RWA Facility Manager / same RWA | 560103 | REG-09226619 | PENDING |
| E MSME primary | qa-audit-e-2609@mailinator.com | QA Audit MSME Primary / QA Audit Traders Pvt Ltd, no GSTIN | 560058 | REG-1939B15A | PENDING |
| G Supplier | qa-audit-g-2609@mailinator.com | QA Audit Supplier Owner / QA Audit Facility Services Pvt Ltd | 560037 | REG-3BE65240 | PENDING |

Phones +91 55555 02601–02606 in persona order; Email chosen as channel; no passwords set. Mailinator inboxes are public.

- **N-01 (P2, reproducible):** no confirmation/notification email reached any of the six inboxes (checked 2–5 minutes after registering). Confirmation screen only says "Not sent: No WhatsApp registration confirmation was sent." Evidence: `page-2026-09-28T01-23-27-926Z.png`, `page-2026-09-28T01-23-42-198Z.png`.
- **D-04 reproduced** 6/6 (e.g. `page-2026-09-28T01-18-45-355Z.png`, `page-2026-09-28T01-21-31-303Z.png`).
- **D-03 reproduced** with a readable inbox: "Email me a code" for A says no account exists, and no code arrived (`page-2026-09-28T01-23-09-707Z.png`).
- **D-11 did not recur** (1 of 2 tries) — intermittent.
- **O-A (observation):** Individual buyer's organisation name is set silently without the user seeing or confirming it.
- **O-B (observation):** supplier marked "GST Registered" accepted with no GSTIN.
- **O-C (observation):** "Your role" field still appears ~2 s after buyer type is chosen.

Next step: owner approves the six references above; auditor then rechecks inboxes and runs the signed-in journeys.

# J. Conclusion

- Pre-login surfaces mostly hold up: registration, agreement enforcement, duplicate handling, logged-out access control, and mobile layout.
- Two P1 trust problems: contradictory fee/money-handling statements (D-01) and draft legal text in production (D-02).
- Main new-user frustration: "no account" while a registration is pending (D-03).
- The core product (request, masked quote comparison, committee voting, award, tracking) is untested pending approved accounts with receivable sign-in.
