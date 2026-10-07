# Product overview

OTP (Open Trade & Procurement) is identity-protected competitive sourcing.

The customer describes the need. Suppliers quote under an alias. The customer, or the customer’s committee when that model applies, chooses. The supplier’s legal name is released with the decision rules in [AWARDS_AND_REVEAL.md](../03-domains/AWARDS_AND_REVEAL.md). The public money line is that the buyer pays the supplier directly and OTP does not collect, hold, or settle that payment (`PLATFORM_DISCLAIMER_LINES` in `apps/web/src/lib/brand.ts`).

**OTP does the procurement work. The customer makes the decision.**

Status of the product shell: `IMPLEMENTED` in this repository. Whether the public site is serving SHA `b7fbcea22273f6045ac0fdd562a278107dcf34b1` is `UNKNOWN`. DEPLOYED REVISION NOT RE-VERIFIED. See [CAPABILITY_STATUS.md](../13-truth/CAPABILITY_STATUS.md) and [PUBLIC_PILOT_TRUTH.md](../13-truth/PUBLIC_PILOT_TRUTH.md). Money and fees: [BUSINESS_MODEL.md](./BUSINESS_MODEL.md).

## Who it is for

Individual, RWA / housing society, and MSME buyers, plus suppliers who quote. Enterprise is not a customer type. Detail: [CUSTOMER_TYPES.md](./CUSTOMER_TYPES.md).

## What the repository contains

| Area | Role |
| --- | --- |
| `apps/web` | The only application client. React 19, Vite, React Router 7 (`apps/web/package.json`). |
| `packages/domain` | Personas, entitlement, tax, governance templates, payment-plan definitions. |
| `packages/services` | Places adapter, email dispatcher, service layer. |
| `packages/database` | Database access package. |
| `supabase/migrations` | `00001`–`00247` on disk. Hosted apply of `00246` and `00247` was not done. Prior manual hosted verification was `00245`. |
| `supabase/functions` | Edge functions listed in [SUPABASE.md](../10-platform/SUPABASE.md). |

## What this overview will not claim

ONDC, BNI, WhatsApp, and SMS are not live supplier networks. Google Places is implemented and credential-gated. A green test run was not produced for this page.
