# Pilot scope

Status: the pilot commercial policy is `IMPLEMENTED` in domain code. A live pilot cohort on the hosted project was not counted. Cohort size, dates, and geography of real customers are `UNKNOWN`.

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
