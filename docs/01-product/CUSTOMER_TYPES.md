# Customer types

Canonical buyer personas are `INDIVIDUAL`, `RWA`, and `MSME` (`packages/domain/src/types/buyer-persona.ts`). Suppliers are participants, not a fourth buyer type.

Status: `IMPLEMENTED`. Enterprise as a customer type: `NOT-IMPLEMENTED`.

## Buyers

| Persona | How it is chosen | Governance weight |
| --- | --- | --- |
| Individual | Signup value `INDIVIDUAL`. `resolveBuyerPersona` also accepts `PERSONAL`, `SOLO`, `BUYER`. | No committee. The buyer decides. |
| RWA | Signup value `COMMUNITY` (“Residential Welfare Association (RWA) / Society”). Resolver accepts `RWA`, `COMMUNITY`, `RESIDENTIAL_RWA`, `HOUSING_SOCIETY`, `SOCIETY`. Org type used by the vote trigger is `COMMUNITY`. | Committee offices vote. Estate / facility manager operates and does not vote. |
| MSME | Signup value `MSME`. Resolver accepts `MSME`, `BUSINESS`, `PROPRIETORSHIP`, `PARTNERSHIP`, `PVT_LTD`. | Organisation membership and approval route. See [GOVERNANCE.md](../03-domains/GOVERNANCE.md). |

Public audiences in `site-content.ts` are Individual, MSME, and Community / RWA. `PricingPage.tsx` renders those three cards.

`BuyerRegisterForm.tsx` is dirty in the working tree. The buyer-type list read from disk has those three values and no Enterprise option.

## Suppliers

Suppliers quote under an alias until reveal. Their wallet events are referral bonus and a one-time success reward. Supplier cashback is not a wallet type (`supplier-wallet.ts`).

## Enterprise

`resolveBuyerPersona` throws `UnsupportedPersonaError` when the org type is or contains `ENTERPRISE`. `canonical-auth.ts` sets `isEnterprise` and returns `allowed: false` with a fail-closed reason. Do not offer Enterprise on a customer page.

`SUBSCRIPTION_TIERS.ENTERPRISE` still exists. `resolveTierForOrgType` returns it for `ENTERPRISE`, `INSTITUTION`, `TRUST`, `GOVERNMENT`, and `CORPORATION`. Internal compatibility artifact; not a customer-facing OTP product type. Do not remove the object to tidy the docs.

`submit_signup_request` in `00212` casts `p_request->>'buyer_type'` to `org_type`. The `00001` enum includes `ENTERPRISE` and `INSTITUTION`. The public form does not send those values. A crafted RPC body can. That residual is a DEFECT. Proposed later fix: reject those buyer types in the RPC. Not applied.

`private.subscription_wallet_credit_inr` in local migration `00250` uses the same yearly and monthly figures as `SUBSCRIPTION_TIERS`, including `TIER_2_ENTERPRISE` at the RWA price. `00216` had yearly figures 9 rupees lower and priced that alias with Enterprise. Hosted apply of `00250`: NOT APPLIED. It is not a fourth customer price.

`brand.ts` exports `BUYER_TYPES` including `Institution` and `Local business`. A page render of that array was not found. Do not treat it as the signup list. The signup list is `BuyerRegisterForm`.
