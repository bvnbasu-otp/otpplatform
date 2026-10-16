# Pilot scope

Status: the pilot commercial policy is `IMPLEMENTED` in domain code. A live pilot cohort on the hosted project was not counted. Cohort size, dates, and geography of real customers are `UNKNOWN`.

## Current working-tree readiness (16 October 2026)

This is not a green-pilot certificate. Local implementation, CI of the committed base, hosted runtime, and legal approval are separate.

| Area | Current fact |
| --- | --- |
| Allowance consumption | Local migrations `00286` and `00289` consume one entitlement on the first comparison-eligible supplier quote. Publishing consumes none. Duplicate quotes, revisions, retries, and a second eligible quote on the same RFQ do not consume another. |
| Purchased credit | One extra RFQ or one calendar month can be simulated. No money is collected. The credit expires with the subscription and is not transferred on renewal. A quote outside the RFQ's UTC month fails closed with `PILOT_ALLOWANCE_PERIOD_UNDECIDED`. |
| Buyer display | The page reads `get_buyer_pilot_allowance`. A confirmed usable credit is not blocked before that result. If the result is missing or malformed, publishing stays closed. The database trigger remains the authority. |
| Migration ceiling | Repository files in this working tree run through `00290`. That file ceiling is local. Hosted application of `00286`–`00290` was not queried and is not certified. |
| Checkout | The simulator stays disabled. Published prices are reconciliation evidence. Payment collection is not activated. |
| EULA | Buyer and Supplier rows exist and are separate types. Both are `PENDING_LEGAL_APPROVAL`. Enforcement is off. No rollout timestamp is recorded. Legal review and GST review are pending. |
| Personas | Local checks cover an Individual (`organization_id` null), an RWA organization, an MSME organization, a supplier quote, and the service-role legal activation path. Those checks do not certify a hosted cohort. |

## Commercial policy in code

`PILOT_COMMERCIAL_MODE_POLICY` in `packages/domain/src/types/pricing-entitlement.ts`:

| Flag | Value in code |
| --- | --- |
| `isControlledPilot` | `true` |
| `pilotDurationMonths` | `3` |
| `realPaymentCharged` | `false` |
| `supplierPlatformFeeCharged` | `false` |
| `buyerPlatformFeeRewardRecognized` | `false` |
| `referralMonetaryRewardRecognized` | `false` |
| `commercialRevenueRecognized` | `false` |
| `displayCommercialPricing` | `true` |
| `reportingClassification` | `PILOT_SANDBOX` |

`resolveBillingMode` returns `PILOT_FREE` when the argument is missing, `PILOT`, or anything other than `LIVE`. The web package was not found calling `resolveBillingMode`. `calculateSupplierPlatformFeeWithPilotMode` waives the supplier fee when the mode is pilot.

The pricing page in the working tree says published prices are shown and activating a plan is not charged during the pilot. That file is dirty relative to HEAD. This reconstruction did not extend that hunk.

## Buyer scope

Individual, RWA, and MSME. Same engine, different governance. See [CUSTOMER_TYPES.md](./CUSTOMER_TYPES.md) and [GOVERNANCE.md](../03-domains/GOVERNANCE.md).

## Supplier scope

Suppliers register on OTP or are invited directly. WhatsApp, SMS, ONDC, and BNI are not in-pilot live channels. See [LIVE_VS_PLANNED.md](../13-truth/LIVE_VS_PLANNED.md).

## Geography

`PILOT_LOCATION` in `brand.ts` is the string `Bengaluru`. That constant is a label, not a measured service area. The Places static directory is a Bengaluru fixture (`STUB/MOCK`), not a coverage proof.

## Out of pilot claims

Do not publish supplier counts, response rates, or “suppliers ready in your area” from this page. None were measured here.
