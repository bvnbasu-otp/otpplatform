# Known findings

This register records leftovers, defects, and the payment-webhook security defect. It is not a capability-status table. Capability labels live only in [CAPABILITY_STATUS.md](./CAPABILITY_STATUS.md).

Phase 3 changed source for the rows marked remediated below. Nothing in this file is LIVE-VERIFIED. Hosted database ceiling: NOT RE-VERIFIED. Deployed revision: NOT RE-VERIFIED. Hosted migration `00246` was not applied. `payment-webhook` was not redeployed.

| ID | Finding | Classification | Current state | Remediation |
| --- | --- | --- | --- | --- |
| DOC-LEGACY-01 | `WHY_5_RFQS_EXPLANATION` said 5 RFQs a month and a response rate above 90 percent. `evaluateRfqEntitlement` uses 3 a calendar month plus one non-carrying quarterly bonus on a yearly plan. | LEGACY | Removed from source | The constant, its re-export, and the test that locked the old title are gone. Entitlement math was not changed. Not a production measurement. |
| DOC-LEGACY-02 | `SUBSCRIPTION_TIERS.ENTERPRISE` and `resolveTierForOrgType` remain. Signup, pricing cards, and `resolveBuyerPersona` do not offer Enterprise. `canonical-auth.ts` fail-closes the persona. | LEGACY | Documented | Internal compatibility artifact. Not deleted. Not a customer-facing OTP product type. |
| DEFECT-01 | `submit_signup_request` in `00212` casts `buyer_type` to `org_type`. The `00001` enum includes `ENTERPRISE` and `INSTITUTION`. | DEFECT | Remediated in local SQL `00246`. Hosted NOT applied. | `00246_buyer_signup_allowlist_and_reveal_po_guard.sql` replaces the function. Buyer types must be `INDIVIDUAL`, `COMMUNITY`, or `MSME` before any insert. Enum values were not dropped. |
| DEFECT-02 | `scripts/deploy-prod.ps1` applies SQL with `docker exec otp-prod-db` and defaults the site URL to `https://otpplatform-theta.vercel.app`. CI runs `supabase db push --linked` against project ref `qsuvtcezffomtwzwyrso`. | DEFECT | Labelled. Script runtime behavior unchanged. | Header and banner now say LOCAL DOCKER ONLY and name hosted project `qsuvtcezffomtwzwyrso` as a target this script must not be used for. The script still writes Docker `otp-prod-db`. It was not run. |
| SECURITY-01 | `verifyAndExtractWebhook` used compiled fallback literals when `RAZORPAY_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`, or `PAYMENT_WEBHOOK_SECRET` was absent. | SECURITY DEFECT | Remediated in source. Edge function NOT redeployed. | The verifier reads only a non-empty configured secret. A missing secret fails verification. A configured secret still reaches `record_verified_payment`. Secret values are not copied here. |
| DOC-LEGACY-03 | `maxMonthly` 50000 is an in-memory GIS guard. `monthlyRequestLimit` 45000 is a budget field `evaluateQuota` does not read. The production coverage counter is daily only (application limit 1500). A `50000` in the Places adapter is a search radius in metres. | LEGACY | Documented | Not an OTP monthly limit. Monthly limit remains NOT AUTHORITATIVELY CONFIGURED. Code not changed. |
| DOC-LEGACY-04 | `GooglePlacesDiscoveryAdapter.discoveryCache` is an in-memory `Map` whose `sourceType` string is `DATABASE_CACHE`. The buyer edge path uses `00224` Postgres tables. | LEGACY | Documented | Terminology only on the library path. Do not call the map a database. |
| DOC-LEGACY-05 | `BANGALORE_560048_ELECTRICAL_STATIC_DIRECTORY` serves PIN `560048` and rewritten `560*` / Bengaluru copies. `normalizeCandidate` sets `SELF_DECLARED` or `UNVERIFIED`. The edge path does not call this function. `discover()` drops `sourceType`. | LEGACY | Documented | Leave the fixtures. They are not live Google, not `OTP_REGISTERED`, and not `GST_VERIFIED`. |
| DEFECT-03 | `lock_and_reveal_award_atomic` (`00222`) could return supplier identity on auto-reveal without the null `po_id` failure that `reveal_award` has in `00244`. Web callers: `AwardPage` uses `lock_award` then `reveal_award`. `EvaluationDecisionCockpit` calls `lockAndRevealAwardAtomic` with auto-reveal true. | DEFECT | Remediated in local SQL `00246`. Hosted NOT applied. Function retained. | The replaced function raises `Reveal failed: Purchase Order was not created` before identity is returned. The auto-reveal false path remains a lock without reveal. `lock_award` still depends on this function. |

Earlier notes called SECURITY-01 “DOC-01”, DEFECT-02 “DOC-07”, DOC-LEGACY-01 “DOC-03”, and DOC-LEGACY-02 “DOC-04”. Those old numbers are the same findings. Use the IDs in the table above.

## Public-copy findings

These sentences were in `PricingPage.tsx`. Phase 3 edited that file. The deployed website is NOT RE-VERIFIED.

| ID | Where | Previous claim | Source now |
| --- | --- | --- | --- |
| COPY-01 | `PricingPage.tsx` MSME card | “GST split, Tally / Zoho ERP export & double-entry ledger” | “The purchase order records the GST split from the awarded quote.” Format exporters remain in code and are not described as a connected books product. |
| COPY-02 | `PricingPage.tsx` supplier banner | Heading “Verified Supplier Network” and a 0.50% fee “only on confirmed Purchase Order awards.” | Heading “OTP supplier registry.” The 0.50% fee is defined on a confirmed purchase order. The sentence says this pilot does not charge that fee. |
| COPY-03 | `PricingPage.tsx` buyer wallet and referral card | “Buyers earn Success Cashback” and “Earn a non-cash wallet credit” during the pilot. | Buyer credits are non-cash. The page says this pilot does not pay Success Cashback or referral cash. Amount labels Individual ₹10, RWA ₹25, MSME ₹50, and Supplier ₹100 remain as defined amounts. This is not supplier cashback. |

`site-content.ts` states that WhatsApp and SMS are not yet live, that ONDC is not connected, and that OTP does not file ITC. Those sentences match the capability table. About page speech input matches `VoiceRequirementDictation.tsx` (browser speech recognition when the browser provides it).
