# Capability status

This is the only status table. Other documents must use these labels. Nothing below is `LIVE-VERIFIED`: the hosted database and the Vercel deployment were not observed.

Baseline at the start of Phase 3: branch `main`, `HEAD` `b7fbcea22273f6045ac0fdd562a278107dcf34b1`. Phase 3.1 adds local migration `00247`. Local migrations on disk: `00001`–`00247` contiguous. HOSTED DATABASE CEILING NOT RE-VERIFIED. Prior manual verification was `00245`. This phase did not query the hosted database and did not apply `00246` or `00247`. DEPLOYED REVISION NOT RE-VERIFIED.

| Capability | Status | Evidence |
| --- | --- | --- |
| Positioning: identity-protected competitive sourcing | IMPLEMENTED | `PRODUCT_TAGLINE` in `apps/web/src/lib/brand.ts`. Principle text is the product README and site trust copy. |
| Principle: OTP prepares the procurement; the customer decides | IMPLEMENTED | Site trust principle “You decide” in `site-content.ts`. No code path was found that awards a supplier without a buyer or committee action. |
| Internal journey TELL → REVIEW → DECIDE → TRACK | IMPLEMENTED | Intake, review, evaluation, and track routes in `apps/web/src/App.tsx`. |
| Public journey labels Request → Compare → Decide → Purchase → Track | IMPLEMENTED | `PUBLIC_JOURNEY_STEPS` in `brand.ts`. These are the words on the public site, not a second engine. |
| Customer types Individual, RWA, MSME | IMPLEMENTED | `BuyerPersona` in `packages/domain/src/types/buyer-persona.ts`. Signup options in `BuyerRegisterForm.tsx`. Public audiences in `site-content.ts`. Pricing page renders three cards. |
| Enterprise as a customer type | NOT-IMPLEMENTED | Signup, pricing cards, and `resolveBuyerPersona` do not offer it. `canonical-auth.ts` fail-closes. `SUBSCRIPTION_TIERS.ENTERPRISE` is an internal compatibility artifact, not a customer-facing OTP product type. See Phase 1 findings. |
| Monthly allowance 3 RFQs, calendar month, no rollover | IMPLEMENTED | `INDIVIDUAL_MONTHLY_RFQ_ALLOWANCE` and `evaluateRfqEntitlement`. Whether the hosted database enforces the same count is `UNKNOWN`. |
| Annual plan: same 3 per month plus 1 non-carrying quarterly bonus | IMPLEMENTED | `quarterlyBonusRfqs: 1` on yearly evaluation. Unused bonus does not carry (`quarterlyBonusRemaining` resets with the quarter inputs). |
| Extra RFQ prices (domain) | IMPLEMENTED | Individual 149, RWA 999, MSME 1499, before GST. `PERSONA_EXTRA_RFQ_PRICES`. |
| Display prices Individual 199/1999, RWA 1499/14999, MSME 1999/19999 | IMPLEMENTED | `SUBSCRIPTION_TIERS` in `pricing-entitlement.ts`. |
| Pilot: subscription not charged; supplier platform fee not charged | IMPLEMENTED | `PILOT_COMMERCIAL_MODE_POLICY` (`realPaymentCharged: false`, `supplierPlatformFeeCharged: false`). `resolveBillingMode` defaults to `PILOT_FREE`. `calculateSupplierPlatformFeeWithPilotMode` returns a 0 fee in that mode. |
| Commercial supplier platform fee 0.5% of PO gross, PO gross unchanged | IMPLEMENTED | `DEFAULT_SUPPLIER_PLATFORM_FEE_RATE = 0.5` and `calculateSupplierPlatformFeeWithGst`. Live collection of that fee: `UNKNOWN`. |
| Buyer pays the supplier directly; OTP does not hold the payment | IMPLEMENTED | `PLATFORM_DISCLAIMER_LINES` in `brand.ts`. This is the public money rule. It sits beside the fee calculator above. See [PAYMENTS.md](../03-domains/PAYMENTS.md). |
| Supplier cashback | NOT-IMPLEMENTED | Removed. `packages/domain/src/types/supplier-wallet.ts`. |
| Supplier wallet: referral bonus and one-time success reward | PARTIAL | `SUPPLIER_REFERRAL_BONUS_INR = 100`, `SUPPLIER_SUCCESS_REWARD_INR = 100`. These are not cashback. The success-reward RPC requires a SETTLED platform fee and `service_role`. The pilot does not charge that fee, and the web app does not call the credit RPC. |
| Buyer wallet credits (cashback, referral, share in success) | PARTIAL | `credit_buyer_settlement_reward_atomic` can credit from a platform-fee row. No web or edge caller invokes it. Pilot policy `buyerPlatformFeeRewardRecognized` and `referralMonetaryRewardRecognized` are false. The profile widget shows the wallet balance and subscription renewal, and says this pilot does not credit Success Cashback or a referral wallet amount. |
| Identity-protected comparison, reveal after decision | IMPLEMENTED | Routes `/rfq/:rfqId/evaluation` and `/rfq/:rfqId/reveal`. Reveal RPC: `public.reveal_award` in `00244`. |
| `reveal_award` requires a verified supplier and a purchase order in the same transaction | IMPLEMENTED | `supabase/migrations/00244_f07_reveal_award_verified_atomic_and_f08_founder_truth.sql`. Hosted apply: `UNKNOWN`. |
| Award lock without reveal when the supplier is not verified | IMPLEMENTED | `public.lock_and_reveal_award_atomic` latest body is `00246`. `00244` does not replace it. `00246` does. Auto-reveal raises `Reveal failed: Purchase Order was not created` before identity is returned when `po_id` is null. Reveal is not the same event as the PO unless auto-reveal runs. Hosted apply of `00246`: NOT RE-VERIFIED. |
| Payment structures: single, 30/50/20, 4×25, custom | IMPLEMENTED | `DECLARED_PAYMENT_PLANS` and `public.resolve_declared_payment_structure` / `declared_payment_splits` (`00240`, still called from `00245`). Custom creates no invented schedule. |
| PO tax: total = base + GST + transport; transport not taxed again; no historical backfill in `00245` | IMPLEMENTED | `00245_f13_po_gst_tax_accuracy.sql` replaces functions only. No `UPDATE` of existing purchase orders. Split can be `UNAVAILABLE`. |
| RWA estate/facility manager cannot vote | IMPLEMENTED | `private.enforce_committee_vote_authority` in `00238`. |
| RWA vote requires an active appointment and an RFQ seat, and no `DECLARED_CONFLICT` | IMPLEMENTED | Same trigger. `DECLARED_CONFLICT` applies to every org type in that trigger. Appointment-and-seat applies when `org_type = COMMUNITY`. |
| Approval route persisted, award fails closed when the route applies and no stage exists | IMPLEMENTED | `evaluate_and_stamp_approval_route_atomic` (`00237`). Award guard (`00242`). |
| Direct supplier invitation and quote-by-link | IMPLEMENTED | Route `/q/:token` in `App.tsx`. Public channel status `LIVE` (“Available now”) for direct suppliers and the OTP registry in `SUPPLIER_CHANNELS`. |
| OTP supplier registry | IMPLEMENTED | Signup and supplier routes. Public channel status `LIVE`. |
| Google Places buyer and admin coverage | IMPLEMENTED, CONFIG-GATED, EXTERNAL-DEPENDENCY | Edge `location-pin-coverage` calls `runAuthoritativeLocationPinCoverage`. Fresh rows are the `00224` tables. A configured key calls `discoverManagedCoverage` (`places:searchText`). No key returns `PROVIDER_UNAVAILABLE`. This path does not read the static directory. Hosted key and call success: `UNKNOWN`. |
| Google Places library fallback ladder | IMPLEMENTED, not on the web or edge request path | `GooglePlacesDiscoveryAdapter.discoverWithFallbackLadder`. Live tier runs only when `managedOrchestratorAuthorized` is passed (tests). The next tier is an in-memory `Map` whose `sourceType` string is `DATABASE_CACHE`. Then static fixtures, then `UNAVAILABLE`. `discover()` returns candidates and drops `sourceType`. |
| Google Places application daily limit 1500 | IMPLEMENTED as a configured limit | Edge `DAILY_LIMIT = 1500`, SQL `location_pin_coverage_reserve_google_calls` default `p_daily_limit` 1500, founder card fallback 1500. Not measured usage. |
| Google Places monthly limit | NOT AUTHORITATIVELY CONFIGURED | The production counter table has no monthly column. `maxMonthly` 50000 is the in-memory GIS guard. `monthlyRequestLimit` 45000 is a budget field `evaluateQuota` does not read. A `50000` in the adapter is a search radius in metres. |
| Google Places reservation counter | IMPLEMENTED | `google_places_daily_budget` (`00224`), read by `get_founder_google_places_budget_today` (`00244`). Hosted rows: `UNKNOWN`. Billing-console usage: `NOT INSTRUMENTED`. |
| Named status `FALLBACK_ACTIVE` | NOT-IMPLEMENTED | That string was not found under `packages/`. |
| Static Bengaluru directory | STUB/MOCK | `BANGALORE_560048_ELECTRICAL_STATIC_DIRECTORY` inside the library adapter. Not called by `apps/web` or the coverage edge function. |
| WhatsApp supplier RFQ delivery | CONFIG-GATED | Edge `messaging-outbound` and `resolveProvider`. Default provider id is `MOCK`. Public copy status `PLANNED`. Not a live supplier channel. |
| SMS supplier RFQ delivery | CONFIG-GATED | Same resolver (`TWILIO`). Default `MOCK`. Public copy `PLANNED`. |
| Registration notices by phone | CONFIG-GATED | `supabase/functions/onboarding-notify` uses the same resolver. Default `MOCK`. |
| Email dispatcher | CONFIG-GATED | `packages/services/src/notifications/email-dispatcher.ts` (`SMTP_HOST` and related). Delivery `UNKNOWN`. |
| ONDC search / on_search foundation | CONFIG-GATED | `ondcIntegrationStatus()` is `CREDENTIAL_GATED`. Module does not call the network. Public channel `PLANNED`. Not live. |
| BNI and trade-association networks | PLANNED | Public channel copy is planned. `BniNetworkAdapter` is `stubAdapter` and returns a synthetic “BNI match” if `discover` runs. `createOtpServices` registers it with `isLive: false`. The web client does not import it. |
| Razorpay and Stripe webhook verification | CONFIG-GATED | Function `payment-webhook` fails verification when the matching secret is absent. Compiled fallback literals are not in source. A valid signature is what reaches `record_verified_payment`. Pilot policy does not charge. Live gateway configuration: `UNKNOWN`. CI deploys `location-pin-coverage` only. Hosted deployment of this function: NOT RE-VERIFIED. |
| `record_verified_payment` execute boundary | IMPLEMENTED | Local migration `00247` revokes EXECUTE from PUBLIC, `anon`, and `authenticated`, and grants `service_role`. The function remains SECURITY DEFINER with no caller-role check. The only application caller is `payment-webhook`, using the service-role key. Hosted apply of `00247`: NOT RE-VERIFIED. |
| Web application | IMPLEMENTED | `apps/web`, `vercel.json` build. |
| Native mobile application | NOT-IMPLEMENTED | No app package besides `apps/web`. Contract: [MOBILE_PRODUCT_CONTRACT.md](../14-mobile-contract/MOBILE_PRODUCT_CONTRACT.md). |
| Production web deploy inside GitHub Actions | NOT-IMPLEMENTED | The workflow step “Deploy Direct to Production” only prints text. |
| Production `supabase db push` inside GitHub Actions | IMPLEMENTED in the workflow file | `.github/workflows/ci-cd.yml` production job. A successful run against the hosted project was not observed. |
| Docker script `scripts/deploy-prod.ps1` | IMPLEMENTED | LOCAL DOCKER ONLY. Writes container `otp-prod-db`. Success text says local Docker only and does not claim a hosted production deploy. The default display URL remains `https://otpplatform-theta.vercel.app`. CI migrations target hosted project ref `qsuvtcezffomtwzwyrso`. Those are different databases. Release-blocking if the script is used as the hosted migration. |
| Hosted database at migration `00245`, `00246`, or `00247` | UNKNOWN | HOSTED DATABASE CEILING NOT RE-VERIFIED. Local files reach `00247`. The production workflow string `EXPECTED_CEILING` is `00247`. That string was not observed against the hosted database. Prior manual verification was `00245`. `00246` and `00247` were not applied to hosted. |
| Deployed site matches SHA `b7fbcea` | UNKNOWN | DEPLOYED REVISION NOT RE-VERIFIED. No authoritative Vercel deployment record was read. |

## Findings

Finding IDs, and whether they are open, live only in [DOCUMENTATION_DISCOVERED_DEFECTS.md](./DOCUMENTATION_DISCOVERED_DEFECTS.md). That file is not a second capability table.

Phase 3 source remediation, not LIVE-VERIFIED: DEFECT-01 and DEFECT-03 are in local migration `00246` (hosted NOT applied). SECURITY-01 compiled fallback literals are removed in source (edge function NOT redeployed). Phase 3.1 local migration `00247` revokes client EXECUTE on `record_verified_payment` (hosted NOT applied). DEFECT-02 success text says LOCAL DOCKER ONLY; the script still writes Docker `otp-prod-db`. DOC-LEGACY-01 (`WHY_5_RFQS_EXPLANATION`) was removed. COPY-01, COPY-02, and COPY-03 were corrected in `PricingPage.tsx`. Deployed website: NOT RE-VERIFIED.

Legacy, code unchanged: DOC-LEGACY-02 through DOC-LEGACY-05 (Enterprise tier object, unused monthly Google figures, `DATABASE_CACHE` naming, Bengaluru fixtures).

`SUBSCRIPTION_TIERS.ENTERPRISE` is an internal compatibility artifact; not a customer-facing OTP product type.

Public pilot wording: [PUBLIC_PILOT_TRUTH.md](./PUBLIC_PILOT_TRUTH.md).

Integration evidence (implementation, configuration, runtime verification, production status, dependency, limitation) is on each page under `docs/09-integrations/` and in [INTEGRATION_CATALOG.md](../09-integrations/INTEGRATION_CATALOG.md). Those pages point here for the status word.

P0–P4 remediations are closed. This table does not reopen them. Later migrations (`00216` onward, including `00237`–`00245`) are repository facts, not a new severity scale.
