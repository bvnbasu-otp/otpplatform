# Feature catalog

Each row uses the status in [CAPABILITY_STATUS.md](../13-truth/CAPABILITY_STATUS.md). Detail lives in the linked page. This catalog does not add features.

| Feature | Status | Where to read |
| --- | --- | --- |
| Public marketing site | IMPLEMENTED | [SCREEN_INVENTORY.md](../02-design/SCREEN_INVENTORY.md), [PUBLIC_PILOT_TRUTH.md](../13-truth/PUBLIC_PILOT_TRUTH.md). COPY-01–COPY-03 corrected in `PricingPage.tsx`. Deployed page NOT RE-VERIFIED. |
| Commercial model | IMPLEMENTED in domain policy | [BUSINESS_MODEL.md](../01-product/BUSINESS_MODEL.md). Fee calculator implemented, pilot-waived, live collection `UNKNOWN`. No supplier cashback. |
| Signup for Individual, RWA, MSME, supplier | IMPLEMENTED | [CUSTOMER_TYPES.md](../01-product/CUSTOMER_TYPES.md) |
| Enterprise signup | NOT-IMPLEMENTED | Fail closed. `SUBSCRIPTION_TIERS.ENTERPRISE` is an internal compatibility artifact, not a customer type. |
| Requirement intake | IMPLEMENTED | [PROCUREMENT.md](../03-domains/PROCUREMENT.md) |
| Identity-protected evaluation | IMPLEMENTED | [AWARDS_AND_REVEAL.md](../03-domains/AWARDS_AND_REVEAL.md) |
| RWA committee vote | IMPLEMENTED | [GOVERNANCE.md](../03-domains/GOVERNANCE.md) |
| Estate manager operations without a vote | IMPLEMENTED | [GOVERNANCE.md](../03-domains/GOVERNANCE.md) |
| MSME approval route | IMPLEMENTED | `00237`, `00242` |
| Direct supplier quote link | IMPLEMENTED | `/q/:token` |
| WhatsApp or SMS delivery | CONFIG-GATED | [WHATSAPP.md](../09-integrations/WHATSAPP.md), [SMS.md](../09-integrations/SMS.md) |
| ONDC discovery | CONFIG-GATED | [ONDC.md](../09-integrations/ONDC.md) |
| Google Places | CONFIG-GATED | [GOOGLE_PLACES.md](../09-integrations/GOOGLE_PLACES.md) |
| Entitlements, 3 + quarterly bonus | IMPLEMENTED | [PRICING_AND_ENTITLEMENTS.md](../01-product/PRICING_AND_ENTITLEMENTS.md) |
| Pilot zero charge | IMPLEMENTED | [PILOT_SCOPE.md](../01-product/PILOT_SCOPE.md) |
| PO payment structures | IMPLEMENTED | [PURCHASE_ORDERS.md](../03-domains/PURCHASE_ORDERS.md) |
| PO GST from the awarded quote | IMPLEMENTED in `00245` | [PURCHASE_ORDERS.md](../03-domains/PURCHASE_ORDERS.md) |
| Supplier platform fee calculator and pilot waiver | IMPLEMENTED | [PAYMENTS.md](../03-domains/PAYMENTS.md) |
| Live fee collection | UNKNOWN | [PAYMENTS.md](../03-domains/PAYMENTS.md) |
| Supplier cashback | NOT-IMPLEMENTED | [SUPPLIER_NETWORK.md](../03-domains/SUPPLIER_NETWORK.md) |
| Supplier referral and success reward | IMPLEMENTED | `supplier-wallet.ts` |
| Buyer non-cash rewards including cashback | IMPLEMENTED | `buyer-reward.ts` |
| Subscription webhook | CONFIG-GATED | [PAYMENTS.md](../09-integrations/PAYMENTS.md) |
| Founder metrics | IMPLEMENTED | `00244`, route `/founder` |
| Admin console | IMPLEMENTED as a route | `/admin`. Behaviour of each tab was not re-tested. |
| Demo mode | CONFIG-GATED | `VITE_DEMO_MODE` |
| Native mobile app | NOT-IMPLEMENTED | [MOBILE_PRODUCT_CONTRACT.md](../14-mobile-contract/MOBILE_PRODUCT_CONTRACT.md) |

P0–P4 remediations are closed historical work. They are not features to reopen.
