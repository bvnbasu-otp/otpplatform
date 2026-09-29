# OTP Public Site Truth

**Authority:** Level 1 — what the public site says, classified  
**Baseline date:** 28 September 2026  
**Live URL reviewed:** `https://otpplatform-theta.vercel.app`  
**Repository HEAD:** `7b1afc12ac7761efc206c70db80486612a34d146`

The 28 Sep browser pass did not sign in and did not submit a registration. Quotes below are from that pass or from the source files named.

## Landing — `/`

Says OTP is identity-protected competitive sourcing. Journey: describe the need, compare quotes, you decide, names after the decision, pay the supplier directly. Pilot line: free, ₹0, payments go directly between buyer and supplier.

| Item | Class |
| --- | --- |
| Identity-protected comparison and “you decide” | Consistent with the quote view and the product principle. |
| “OTP does not collect, hold or settle payments.” | Consistent with the settlement screen. **PRODUCT DECISION** where it sits beside a deducted platform fee (FIN-1). |
| Example quote card labelled as an example | Acceptable sample. Not a live supplier. |

## About — `/about-us`

“OTP does not take a commission or handle your money. You agree terms and pay the supplier yourself.” (`AboutPage.tsx`)

| Item | Class |
| --- | --- |
| “does not take a commission” with no time limit | **PRODUCT DECISION** (FIN-2). The FAQ limits the waiver to the pilot. This sentence does not. |
| “Works from your phone” / suppliers can reply on WhatsApp | **OBSERVATION.** A messaging status exists in the schema. Live WhatsApp delivery was not verified. |

## FAQ — `/faqs`

The expanded pilot answer on 28 Sep: during the pilot no payments are processed through OTP and nothing is charged; plan prices show what applies after the pilot; the supplier fee is waived during the pilot and applies only to orders won after the pilot.

| Item | Class |
| --- | --- |
| Pilot versus post-pilot split | Clearest public money sentence. Still **PRODUCT DECISION** until it matches About, Pricing, and `SUPPLIER_FEE_POLICY`. |
| ONDC and BNI “not yet” | Matches the adapters. Keep. |
| Quote from WhatsApp without registering | **OBSERVATION.** Code has `DRAFT_FROM_MESSAGING`. Live channel not verified. |

## Pricing — `/pricing`

Shows Pilot Mode, ₹0 during the pilot, monthly and annual prices, and “0.50% Platform Fulfillment Fee” on confirmed PO awards. Also shows “Institutional Procurement OS” and “Voting Room: Sealed ballots, quorum meters ($\ge 2$), COI clearance”.

| Item | Class |
| --- | --- |
| 0.50% fee next to ₹0 pilot | **PRODUCT DECISION** if the fee line is not clearly “after the pilot”. The page also has a pilot banner. The fee sentence itself is not qualified in `SUPPLIER_FEE_POLICY.description`. |
| `($\ge 2$)` | **BUG.** Source markup rendered as text (`PricingPage.tsx`). |
| “Institutional Procurement OS” | **CONTENT UPDATE.** Internal product label on a customer page. |
| Individual, RWA, and MSME buttons all link to `/signup?side=buyer` | **OBSERVATION.** The form then asks the buyer type. The tier is not in the URL. Not a broken signup. |
| “PA-09” on the MSME card | **CONTENT UPDATE.** Internal control id. |

## Signup — `/signup`

Buyer types: Individual, MSME, RWA. Supplier side is `?side=supplier`. Organisation verification copy is shown before the first request. City can prefill Bengaluru.

| Item | Class |
| --- | --- |
| PIN prefix “suppliers already ready” for 560 / 400 / 110 / 600 | **BUG.** Not a supplier search (`BuyerRegisterForm.tsx`). |
| GSTIN help promises an instant verified badge | **BUG** relative to `submit_signup_request`, which does not call `validateGstin`. |
| `canVote = false` inside the RWA agreement | **CONTENT UPDATE.** |
| “sovereign spend authority” on MSME signup | **CONTENT UPDATE.** |
| Pending success with no stated wait time | **CONTENT UPDATE.** The earlier pre-login pass also saw “no account” on email-code login. Not re-run on the second 28 Sep pass. |

## Login — `/login`

Password and email-code modes. A fake password sign-in showed “Invalid login credentials” on 28 Sep.

| Item | Class |
| --- | --- |
| Neutral failure for a bad password | Consistent with not revealing whether the email exists. |
| Pending registrant copy | **PRODUCTION VERIFICATION** still open for the “no account” message. |

## Legal

`/legal/terms`, `/legal/privacy`, `/legal/disclaimer`.

| Item | Class |
| --- | --- |
| “Legal Review Required”, “NOT final legal text” | **LEGAL DECISION.** Do not rewrite the legal meaning in documentation or in a drive-by copy edit. |
| `[Insert Registered Business Address]` | **LEGAL DECISION.** |
| Footer disclaimer: subscription platform, parties settle directly, OTP does not hold buyer-seller payments | **PRODUCT DECISION** together with FIN-1. The sentence matches the settlement screen. |

## Routes and chrome

| Item | Class |
| --- | --- |
| `/register` ends on `/` | **BUG.** `App.tsx` has `/signup` and a catch-all `Navigate to="/"`. There is no `/register` route. Confirmed live on 28 Sep. |
| Unknown URLs become the homepage | **BUG.** Same catch-all. A visitor cannot tell a bad link from the home page. |
| “Desktop” / “Mobile” buttons | **BUG.** `SiteLayout` wraps public pages in `MobileSimulatorFrame`. Confirmed live. |
| Floating governance notice | **OBSERVATION.** It repeats the direct-settlement disclaimer. |

## Supplier public information

Supplier signup says what you do and where you work makes you findable, and that there are no lead fees. That matches the pilot referral and fee waiver. It does not match a card that later says every invited supplier is GST verified. The card bug is in the signed-in discovery UI, not on this public form.
