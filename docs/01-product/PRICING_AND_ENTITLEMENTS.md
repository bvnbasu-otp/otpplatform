# Pricing and entitlements

Source: `packages/domain/src/types/pricing-entitlement.ts`, function `evaluateRfqEntitlement`, constant `SUBSCRIPTION_TIERS`. Status: `IMPLEMENTED` in domain code. Hosted enforcement: `UNKNOWN`.

## Allowances

| Plan | Monthly RFQs | Quarterly bonus |
| --- | --- | --- |
| Monthly | 3 | 0 |
| Yearly | 3 | 1 per calendar quarter |

Rules inside `evaluateRfqEntitlement`:

- The month window is the calendar month. Unused monthly allowance does not roll.
- The quarterly bonus is added only when the plan is `YEARLY`.
- Bonus remaining is `allowance - used this quarter`, floored at 0. It does not accumulate and does not carry. The caller passes `quarterlyBonusUsedInCurrentQuarter`; the function does not store that counter itself.
- Publish path (source, not hosted): `checkPilotAllowanceBeforePublish` reads `organizations.subscription_plan`, status, expiry, org type, and this quarter's published RFQs. It calls `evaluateRfqEntitlement` with `YEARLY` only when that stored row is an effective yearly plan for Individual, Community/RWA, or MSME. Consumption is the committed `rfqs` insert. Local migration `00248` replaces `private.enforce_pilot_rfq_allowance`. Hosted database: NOT APPLIED. The public pricing sentence is unchanged.
- Write authority (source, not hosted): local migration `00249` rejects an `anon` or `authenticated` change to those three organization columns, and rejects a client insert whose plan reads as `YEARLY`. Local migration `00250` replaces `process_subscription_payment` so a client cycle and payment reference do not write `subscription_plan`, `subscription_status`, or `subscription_expires_at`. A catalog-priced wallet debit can still write them. Hosted apply of `00249` and `00250`: NOT APPLIED.
- Purchased extra credits are added on top and are not cleared by the month or quarter boundary in this function.
- In `PILOT_FREE`, the subscription is treated as active without a payment check.
- If the subscription is expired and the mode is not pilot, only extra credits can publish an RFQ.

`WHY_5_RFQS_EXPLANATION` was removed in Phase 3. Entitlement arithmetic is unchanged: 3 RFQs a calendar month, plus one non-carrying quarterly bonus on a yearly plan. `SubscriptionPaymentModal.tsx` displays “3 RFQs/mo” and “3 RFQs/mo + 1 quarterly bonus”.

## Display prices (INR, before GST on the plan)

GST rate constant: `DEFAULT_GST_RATE_PERCENT = 18`.

| Tier | Monthly | Yearly | Extra RFQ base |
| --- | --- | --- | --- |
| Individual | 199 | 1999 | 149 |
| RWA | 1499 | 14999 | 999 |
| MSME | 1999 | 19999 | 1499 |

Yearly savings figures in the tier objects are `(monthly * 12) - yearly` as commented in the file. They are display arithmetic, not a measured discount ledger.

## Supplier fee

Configured commercial rate: `0.5` percent of PO gross (`DEFAULT_SUPPLIER_PLATFORM_FEE_RATE`). `calculateSupplierPlatformFeeWithGst` also applies 18 percent GST on the fee and subtracts fee-plus-GST from a disbursement figure. The PO gross flag `poGrossUntouched` stays true.

Pilot waiver: `calculateSupplierPlatformFeeWithPilotMode` sets the fee rate, fee, and GST on the fee to 0 when the billing mode resolves to pilot. `PILOT_COMMERCIAL_MODE_POLICY.supplierPlatformFeeCharged` is `false`. Local migration `00250` applies that same waiver in `apply_platform_fee_deduction_atomic`: charged fee is 0, and gross is the invoice amount or else the purchase-order total. The client gross argument is ignored. Hosted apply of `00250`: NOT APPLIED. The acknowledged snapshot rate stays disclosure. Historical fee rows are not rewritten.

## What the buyer pays the supplier

The public disclaimer says OTP does not collect, hold, settle, or guarantee buyer–seller payments. Record that as the customer-facing money rule. Do not describe OTP as the merchant of record for the purchase order.
