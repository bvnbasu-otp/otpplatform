# Business model

Status words: [CAPABILITY_STATUS.md](../13-truth/CAPABILITY_STATUS.md). Prices and allowances: [PRICING_AND_ENTITLEMENTS.md](./PRICING_AND_ENTITLEMENTS.md).

## Who pays whom

The buyer pays the supplier directly. `PLATFORM_DISCLAIMER_LINES` in `apps/web/src/lib/brand.ts` is the public money rule. OTP records procurement, including invoices and payment references where those screens exist. OTP does not hold the supplier’s invoice proceeds.

## What the repository prices

Display prices in `SUBSCRIPTION_TIERS` (INR, before GST on the plan; `DEFAULT_GST_RATE_PERCENT = 18`):

| Customer | Monthly | Yearly |
| --- | --- | --- |
| Individual | 199 | 1999 |
| RWA | 1499 | 14999 |
| MSME | 1999 | 19999 |

Extra RFQ base prices: Individual 149, RWA 999, MSME 1499. Customer types are Individual, RWA, and MSME. Enterprise is not a priced customer offer (DOC-LEGACY-02).

## Supplier platform fee

| Layer | Fact |
| --- | --- |
| Implemented | `DEFAULT_SUPPLIER_PLATFORM_FEE_RATE = 0.5` (percent of PO gross). `calculateSupplierPlatformFeeWithGst` adds 18 percent GST on the fee and leaves `poGrossUntouched` true. |
| Pilot-waived | `calculateSupplierPlatformFeeWithPilotMode` sets the fee, the rate, and GST on the fee to 0 when billing mode is pilot. `PILOT_COMMERCIAL_MODE_POLICY.supplierPlatformFeeCharged` is `false`. `resolveBillingMode` defaults to `PILOT_FREE`. |
| Production runtime | `UNKNOWN`. This page does not claim the fee is collected on the hosted project. |

## Pilot commercial flags

`PILOT_COMMERCIAL_MODE_POLICY`: controlled pilot, `pilotDurationMonths` 3, `realPaymentCharged` false, supplier fee not charged, buyer platform-fee reward not recognized, referral monetary reward not recognized, commercial revenue not recognized, display prices true, reporting class `PILOT_SANDBOX`.

Subscription activation in the working-tree payment modal tells the user the charge is ₹0. Gateway checkout is CONFIG-GATED. See [PAYMENTS.md](../09-integrations/PAYMENTS.md).

## Wallets

Supplier wallet events in `supplier-wallet.ts` are a referral bonus (`SUPPLIER_REFERRAL_BONUS_INR = 100`) and a one-time success reward (`SUPPLIER_SUCCESS_REWARD_INR = 100`). Supplier cashback is not a capability. The removed ledger type name is `SUPPLIER_CASHBACK`. Do not put it on a roadmap as a supplier-wallet feature.

Buyer credits in `buyer-reward.ts` include cashback, referral, and share-in-success amounts. The module describes them as non-cash. Pilot flags above do not recognize the buyer platform-fee reward or a referral monetary reward. Hosted credit of those amounts is `UNKNOWN`.

## What is not revenue in this repository

ONDC, BNI, WhatsApp, and SMS are not live commercial channels. Google Places is a discovery dependency with an application daily limit of 1500, not a billed usage figure in this repo.
