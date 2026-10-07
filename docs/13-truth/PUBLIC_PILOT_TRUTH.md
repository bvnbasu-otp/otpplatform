# Public pilot truth

What a customer can be told from this repository. Capability labels: [CAPABILITY_STATUS.md](./CAPABILITY_STATUS.md). This page is the public story. It does not edit `site-content.ts` or any page component.

Nothing here is `LIVE-VERIFIED`. HOSTED DATABASE CEILING NOT RE-VERIFIED IN THIS PHASE. Prior manual verification was `00245`. DEPLOYED REVISION NOT RE-VERIFIED.

## Positioning

Identity-Protected Competitive Sourcing (`PRODUCT_TAGLINE` in `apps/web/src/lib/brand.ts`).

OTP does the procurement work. The customer makes the decision.

Internal journey: TELL → REVIEW → DECIDE → TRACK.

Public words on the site: Request → Compare → Decide → Purchase → Track (`PUBLIC_JOURNEY_STEPS`). Both are the same product. The public list is the wording. The internal list is the operating shorthand.

## Available in the pilot (implemented in this repository)

- Buyer types Individual, RWA / society, and MSME. Suppliers register or accept a direct quote link (`/q/:token`).
- A buyer describes a requirement, reviews it, compares quotes without legal names, decides, and tracks the order.
- RWA votes require an active qualifying appointment, a seat on that RFQ, and no `DECLARED_CONFLICT`. An estate or facility manager does not vote.
- MSME approval stages are persisted. Award fails closed when a required route has no stage.
- Allowances: 3 RFQs in the calendar month. A yearly plan adds 1 RFQ in the current quarter. Unused monthly allowance does not roll. The bonus does not carry.
- Published plan prices are in the product. Pilot policy does not charge the subscription and does not charge the 0.5% supplier platform fee. Live fee collection is `UNKNOWN`.
- The purchase order total is base + GST + transport. Transport is not taxed again. Migration `00245` does not rewrite older purchase orders.
- Payment structures the server knows: single, 30/50/20, 4×25, and custom with no invented schedule.
- OTP supplier registry and direct invitation are the channels whose public status is “Available now”.
- The buyer pays the supplier. OTP does not file the buyer’s ITC. The order can record the quote’s GST.

## Limitations (do not claim these as live)

- No integration is `LIVE-VERIFIED`.
- Google Places on the buyer path is the edge function `location-pin-coverage`: durable `00224` cache, then `places:searchText`, or `PROVIDER_UNAVAILABLE`. Daily application limit 1500 is not measured usage. Monthly limit: NOT AUTHORITATIVELY CONFIGURED. Discovery results are `DISCOVERED_IN_AREA`, not `OTP_REGISTERED` and not `GST_VERIFIED`.
- The library Places ladder (in-memory map labeled `DATABASE_CACHE`, then Bengaluru `560*` fixtures) is not the buyer edge path. Fixtures are not live Google.
- WhatsApp and SMS default to `MOCK`. Public copy says they are not yet live.
- Email delivery is `UNKNOWN`.
- ONDC is `CREDENTIAL_GATED`. The `on_search` ingress NACKs production hosts.
- BNI is planned. The stub adapter is not a BNI network.
- Razorpay and Stripe are config-gated. SECURITY-01 compiled fallback literals are removed in source. The edge function was not redeployed. Local migration `00247` leaves `record_verified_payment` executable by `service_role` only. Hosted apply of `00246` and `00247`, and the function deploy, are NOT RE-VERIFIED. Live collection remains `UNKNOWN`.
- Enterprise is not a customer type.
- Supplier cashback is not a product capability.
- Allowance copy is 3 RFQs a calendar month. The old 5-RFQ constant was removed. That is not a measured response rate.
- Hosted migration ceiling and the deployed web revision were not re-verified. Local files reach `00247`. Hosted `00246` and `00247` were not applied.

## Planned / roadmap

Public channel status `PLANNED` in `SUPPLIER_CHANNELS`: WhatsApp and SMS, ONDC, BNI and referrals, local business associations.

A native mobile app is not implemented. The contract is [MOBILE_PRODUCT_CONTRACT.md](../14-mobile-contract/MOBILE_PRODUCT_CONTRACT.md). `/mobile` is a web showcase page.

## Public copy corrected in source

COPY-01, COPY-02, and COPY-03 in [DOCUMENTATION_DISCOVERED_DEFECTS.md](./DOCUMENTATION_DISCOVERED_DEFECTS.md) were edited in `PricingPage.tsx`. The deployed website is NOT RE-VERIFIED.
