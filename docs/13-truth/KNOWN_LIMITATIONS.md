# Known limitations

Statuses are defined in [CAPABILITY_STATUS.md](./CAPABILITY_STATUS.md). This page is the limit, not a second verdict.

## Not observed

- The hosted Supabase project was not queried. HOSTED DATABASE CEILING NOT RE-VERIFIED. Prior manual verification was `00245`. Local files `00001`–`00247` do not prove those migrations are applied. `00246` and `00247` were not applied to hosted.
- DEPLOYED REVISION NOT RE-VERIFIED. `https://otpplatform-theta.vercel.app` was not read from a Vercel deployment record.
- Phase 2 executed no tests. Phase 1 ran 5 files / 78 tests (pricing entitlement, ONDC foundation, ONDC environment, Google GIS quota, Google Places pilot activation). That does not certify the hosted project.
- Google Cloud billing usage is not instrumented in this repository. The Postgres counter `google_places_daily_budget` is a daily reservation counter. 1500 is the application daily limit, not usage. An OTP monthly Google limit is NOT AUTHORITATIVELY CONFIGURED.

## Product limits that are in the code

- Buyer personas that resolve are Individual, RWA, and MSME. Enterprise claims fail closed.
- Monthly RFQ allowance does not roll. The annual quarterly bonus does not carry into the next quarter. Top-up credits are a separate balance in `evaluateRfqEntitlement`.
- Default billing mode is `PILOT_FREE` unless the caller passes `LIVE`. The web app was not found calling `resolveBillingMode`.
- A committee vote in a `COMMUNITY` organisation needs both an active qualifying appointment and a seat on that RFQ. A seat alone is not enough, because clarification close auto-seats `MANAGER` / `BUYER`. An estate or facility manager does not vote. `DECLARED_CONFLICT` recuses the voter on every org type covered by the `00238` trigger.
- `reveal_award` (`00244`) will not return identity or keep a reveal if purchase-order creation fails. `lock_and_reveal_award_atomic` can lock an award as `PENDING_REVEAL` without a purchase order when the supplier is not verified. Local `00246` also raises when auto-reveal does not receive a purchase-order id. Hosted NOT applied.
- `00245` does not rewrite purchase orders that already exist. Statutory GST split is `UNAVAILABLE` when the snapshot has no `isInterState` and both state codes are missing. Components stay 0 in that case. Transport stays inside the total and is not taxed again.
- Custom payment terms persist as `CUSTOM_TERMS` and do not invent a milestone split.
- WhatsApp and SMS are not a live supplier channel. The messaging resolver defaults to `MOCK` and fails closed if Twilio or Meta is selected without credentials.
- ONDC foundation status is `CREDENTIAL_GATED`. The `on_search` ingress NACKs unless a complete pre-production slot is present and the hosts are not production hosts. That is not a live network.
- Static Bengaluru electrical fixtures live in the library adapter. The buyer coverage edge path does not call them. They are not Google, OTP-registered, or GST-verified suppliers.
- Entitlement arithmetic is 3 RFQs a calendar month, plus one non-carrying quarterly bonus on a yearly plan. The old `WHY_5_RFQS_EXPLANATION` constant was removed.
- `scripts/deploy-prod.ps1` writes Docker `otp-prod-db` and is labelled LOCAL DOCKER ONLY. It must not be used for hosted Supabase `qsuvtcezffomtwzwyrso`. Runtime behavior of the script is unchanged.

## Operational limits

- Git commit and git push are done by a person. This repository’s application does not commit or push.
- GitHub Actions does not publish the web bundle. Its production “deploy” step is a log message. It does contain `supabase db push` and a deploy of the `location-pin-coverage` function. Those steps were not executed here.
- DEFECT-01 and DEFECT-03 are in local SQL `00246` (hosted NOT applied). SECURITY-01 is remediated in source (function not redeployed). DEFECT-02 is labelled; the script still writes Docker. DOC-LEGACY-01 was removed. DOC-LEGACY-02 through DOC-LEGACY-05 remain. COPY-01 through COPY-03 were corrected in source. None are LIVE-VERIFIED. See [DOCUMENTATION_DISCOVERED_DEFECTS.md](./DOCUMENTATION_DISCOVERED_DEFECTS.md).
- `scripts/deploy-prod.ps1` writes Docker `otp-prod-db` and is labelled LOCAL DOCKER ONLY (DEFECT-02). CI writes hosted project ref `qsuvtcezffomtwzwyrso`. Vercel’s database is whatever `VITE_SUPABASE_URL` is set to in the Vercel project, which is not in this repo (`UNKNOWN`). The user owns git commit, git push, and hosted `supabase db push`.
