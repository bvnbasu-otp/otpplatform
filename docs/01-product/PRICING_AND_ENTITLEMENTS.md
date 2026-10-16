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
- Consumption (local migrations `00286` and `00289`, isolated database only): publishing or inserting an RFQ does not consume an allowance. Consumption occurs when the first comparison-eligible supplier quote is persisted, and it consumes exactly one entitlement, in order: an included monthly allowance, then the yearly quarterly bonus, then one unexpired purchased extra-RFQ credit. No qualifying supplier response means no consumption. Revisions, retries, duplicate events, and further eligible quotes for that same RFQ do not consume another entitlement. Cancellation before a qualifying quote consumes none. Cancellation after consumption does not refund. Purchased credits expire with the subscription and are not transferred on renewal. A quote outside the RFQ's UTC month raises `PILOT_ALLOWANCE_PERIOD_UNDECIDED` and does not charge; no cross-month charging rule is defined. `get_buyer_pilot_allowance` is the buyer display and publish-gate read. It is informational. The database remains authoritative. Migration `00248` is not the current consumption implementation.
- Buyer display follows `get_buyer_pilot_allowance`. A confirmed usable purchased credit is not blocked by the subscription date or by the included-count field before that result. If the result is missing or malformed, publishing stays closed. The database trigger remains the authority.
- Hosted enforcement of this consumption rule: NOT VERIFIED. A local migration file, or CI for the unchanged base commit, does not establish that the hosted database applies it.
- GST review of the published prices and of the Buyer and Supplier agreements is pending. `DEFAULT_GST_RATE_PERCENT = 18` is a calculation constant, not an approval.
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
