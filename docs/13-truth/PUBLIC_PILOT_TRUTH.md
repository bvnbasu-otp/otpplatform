# Public pilot truth

What a customer can be told from this repository. Capability labels: [CAPABILITY_STATUS.md](./CAPABILITY_STATUS.md). This page is the public story. It does not edit `site-content.ts` or any page component.

Nothing here is a live payment, ONDC, or Share-in-Success certification. Hosted `schema_migrations` read after `00253` is count 253, ceiling `00253`, with `00251` still present. The deployed website revision is certified only when production serves this commit.

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
- Allowances: 3 RFQs in the calendar month. A cancelled RFQ does not use a monthly slot or the quarterly bonus. A yearly plan adds 1 RFQ in the current quarter. Unused monthly allowance does not roll. The bonus does not carry.
- Published plan prices are in the product. Pilot policy does not charge the subscription and does not charge the 0.5% supplier platform fee. Live fee collection is `UNKNOWN`.
- The purchase order total is base + GST + transport. Transport is not taxed again. Migration `00245` does not rewrite older purchase orders.
- Payment structures the server knows: single, 30/50/20, 4×25, and custom with no invented schedule.
- OTP supplier registry and direct invitation are the channels whose public status is “Available now”.
- The buyer pays the supplier. OTP does not file the buyer’s ITC. The order can record the quote’s GST.

## Limitations (do not claim these as live)

- No integration is `LIVE-VERIFIED`.
- Google Places on the buyer path is the edge function `location-pin-coverage`: durable `00224` cache, then `places:searchText`, or `PROVIDER_UNAVAILABLE`. Daily application limit 1500 is not measured usage. Monthly limit: NOT AUTHORITATIVELY CONFIGURED. A fresh pin with no addressable supplier can invite OTP-registered suppliers labeled `otp_registered` or `gst_verified` (`OTP_REGISTERED_FALLBACK`). Pin invitations stay `pin_coverage`. Non-fresh coverage does not use that fallback.
- The library Places ladder (in-memory map labeled `DATABASE_CACHE`, then Bengaluru `560*` fixtures) is not the buyer edge path. Fixtures are not live Google.
- Pilot messaging is WAHA through the operator's protected gateway. Hosted Edge and Vercel are not configured to call that gateway. Public pages do not name Twilio, Meta, or a hosted WhatsApp URL. SMS is not a pilot provider.
- Share-in-Success is NOT IMPLEMENTED. Public copy must not call it live.
- The buyer platform-fee reward is not credited in this pilot. The domain credit-lot helper, when a lot is constructed, sets `expiresAt` to 365 days after `creditedAt`. The pilot does not create those lots, so there is no separate live expiry to invent.
- The customer stage label for internal `EVALUATING` is Decide. The state value remains `EVALUATING`.
- Email delivery is `UNKNOWN`.
- ONDC is disabled (`ONDC_ENABLED=false`). It is not a live pilot network.
- BNI is planned. The stub adapter is not a BNI network.
- Razorpay and Stripe are config-gated. Local migration `00247` leaves `record_verified_payment` executable by `service_role` only. Live collection remains `UNKNOWN` until the payment webhook is deployed and a real event is verified. No settlement is claimed from a deploy alone.
- Enterprise is not a customer type.
- Supplier cashback is not a product capability.
- Allowance copy is 3 RFQs a calendar month. The old 5-RFQ constant was removed. That is not a measured response rate.
- Hosted `schema_migrations` ceiling read after this change is `00253`, with `00251` and `00252` still present. Intra-state Union Territory GST on a new purchase order and decision receipt is CGST + UTGST. Inter-state stays IGST. Supplier cashback is not an active mechanism. Historical migrations still reject a `SUPPLIER_CASHBACK` ledger event.

## Planned / roadmap

Public channel status `PLANNED` in `SUPPLIER_CHANNELS`: WhatsApp and SMS, ONDC, BNI and referrals, local business associations.

A native mobile app is not implemented. The contract is [MOBILE_PRODUCT_CONTRACT.md](../14-mobile-contract/MOBILE_PRODUCT_CONTRACT.md). `/mobile` is a web showcase page.

## Public copy corrected in source

COPY-01, COPY-02, and COPY-03 in [DOCUMENTATION_DISCOVERED_DEFECTS.md](./DOCUMENTATION_DISCOVERED_DEFECTS.md) were edited in `PricingPage.tsx`. The deployed website is NOT RE-VERIFIED.
