# OTP Pilot Readiness

**Authority:** Level 4 — release truth  
**Baseline date:** 28 September 2026  
**Repository HEAD:** `7b1afc12ac7761efc206c70db80486612a34d146`

There is no single score. A gate fails if the evidence says a real pilot would rely on something untrue, unsafe, or undecided.

## SECURITY GATE — PRODUCTION VERIFICATION REQUIRED

Repository migrations `00199`–`00215` contain fixes for the always-true admin guards, award caller check, signup self-approval, and OTP-code return. The live database was not queried. `PROD_CONTAINMENT/README.md` describes a catastrophic failure mode if production is still at or before `00195`.

The wallet credit RPC is an open finding in the current files even if `00215` is fully applied (`OTP_SECURITY_BASELINE.md`, AUD-SEC-001).

**Cannot PASS** until the live grants are read and AUD-SEC-001 is closed or explicitly accepted for a pilot that never redeems balances.

## DATA INTEGRITY GATE — FAIL

Discovery cards set GST verified, distance, and availability without stored facts (`OTP_SUPPLIER_NETWORK_TRUTH.md`). Signup tells some PIN prefixes that suppliers are already ready. Those are false records shown to a buyer before any quote exists.

GSTIN checksum exists and is not used by `submit_signup_request`.

## MONEY GATE — PRODUCT DECISION REQUIRED

Settlement records an off-platform UTR and says OTP does not hold funds. Pricing and `SUPPLIER_FEE_POLICY` say 0.50% is deducted from disbursement. About says OTP does not take a commission, with no time limit. The FAQ limits the waiver to the pilot.

Pilot flags in code set commercial fee and real payment to false. That is not a decision about the sentences on the site. See FIN-1 through FIN-4.

## LEGAL GATE — LEGAL DECISION REQUIRED

Terms, privacy, and disclaimer pages on the live site say they are not final and include a placeholder address. Buyers and suppliers are asked to accept agreements during signup.

## CORE BUYER JOURNEY GATE — PRODUCTION VERIFICATION REQUIRED

The states, masked comparison, award guard, PO, invoice, and UTR record exist in the repository and have tests of varying strength (many static). No signed-in buyer completed TELL → REVIEW → DECIDE → TRACK on the live site in the 28 Sep review. Public landing copy for that journey was seen and matches the intended principle.

## SUPPLIER GATE — PARTIALLY VERIFIED

Public supplier signup was seen. It does not claim ONDC is live. Alias quotes and reveal rules are in SQL. Live quote submission was not done. The buyer-side discovery card overclaims verification. WhatsApp quote-without-account is advertised and not verified live.

## GOVERNANCE GATE — PARTIALLY VERIFIED

Domain rules separate individual, RWA committee, and estate manager. The RWA first-RFQ gate is not called from the publish page (search in this baseline). Award UI still says committee consensus for every award. Database enforcement of quorum on production: NOT VERIFIED.

## OPERATIONS GATE — PRODUCTION VERIFICATION REQUIRED

Admin force-transition, approval bypass, and purge functions exist. After `00199` they require platform admin **in the migration text**. Live grants UNKNOWN. Pending signup “no account” message was reported by the pre-login pass and not re-run. A pilot of 20 buyers needs an approval queue that does not depend on the SQL editor. That queue’s live behaviour was not opened.

## UX / TRUST GATE — FAIL

Evidenced on the live public site or in customer components:

- draft legal banners
- conflicting money sentences
- LaTeX on pricing
- Desktop/Mobile preview controls
- `/register` falls through to home
- fabricated supplier evidence in discovery code
- `canVote: false` and PA-09 in customer agreements

## What would move a gate

Only evidence, not a document edit. Production verification means a recorded query or a recorded signed-in session. Product and legal gates move when an owner writes the decision, not when an agent picks a sentence.
