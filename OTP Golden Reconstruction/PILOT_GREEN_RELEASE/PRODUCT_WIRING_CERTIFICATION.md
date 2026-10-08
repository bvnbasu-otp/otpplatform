# Product wiring certification

Customers in product copy and on `PricingPage.tsx` are Individual, RWA (stored `COMMUNITY`), and MSME. Enterprise is not a pricing card. `SUBSCRIPTION_TIERS.ENTERPRISE` remains an internal compatibility object in the live bundle. That is the known legacy object, not a fourth public plan on the pricing page source.

| Persona | What was checked | Result |
| --- | --- | --- |
| Individual, RWA, MSME | Pricing page source renders three cards. Live chunk `index-C-tWaO3v.js` contains `3 requests a month`. | Source and that public sentence match. Click-through signup was not done. |
| Supplier | Public channels for the OTP registry and direct invite are marked available. Supplier platform fee text in the live bundle states 0.50% defined and not charged in the pilot. | Copy present. A supplier quote was not submitted in the browser. |
| Operator / Admin | Deployed admin verification still writes `subscription_status` from the client. Working tree calls `platform_admin_set_organization_subscription_status`. Unit test passed. Not deployed. | NOT CERTIFIED on the hosted site. |
| SuperAdmin | Location coverage discovery without a bearer is HTTP 401. A SuperAdmin session was not used. | NOT CERTIFIED. |
| Allowance | Working-tree gate reads the stored plan. Local `00248` is the insert rule. Hosted insert rule was not read. | LOCAL ONLY. |

Buyer acceptance of a quote was not executed. Supplier submission was not treated as payment.

## Decision

Wiring is **not certified** for the hosted pilot. The public three-customer pricing sentence is present. Admin entitlement wiring on the deployed SHA is still the client update.
