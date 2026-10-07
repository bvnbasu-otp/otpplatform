# Live versus planned

Read [CAPABILITY_STATUS.md](./CAPABILITY_STATUS.md) before this page. “Live” on the public site (`CHANNEL_STATUS_LABEL.LIVE` = “Available now”) is a copy status for two in-product channels. It is not `LIVE-VERIFIED` production telemetry.

## In the product now

| What a customer can do in the repository | Status |
| --- | --- |
| Register as Individual, RWA / society, or MSME, or as a supplier | IMPLEMENTED |
| Describe a requirement, review it, compare quotes without legal names, decide, track | IMPLEMENTED |
| Invite a known supplier with a link (`/q/:token`) | IMPLEMENTED |
| Use suppliers who registered on OTP | IMPLEMENTED |
| See published plan prices while the pilot policy charges ₹0 | IMPLEMENTED |
| Committee vote only with appointment, seat, and no declared conflict (RWA) | IMPLEMENTED in SQL `00238` |
| Receive a purchase order whose tax fields follow the awarded quote after `00245` | IMPLEMENTED in SQL. Hosted apply `UNKNOWN` |

## Present in code, not a live integration

| Integration | Status | What not to say |
| --- | --- | --- |
| Google Places | CONFIG-GATED, EXTERNAL-DEPENDENCY | Do not say the live site is calling Google. 1,500 is the application daily limit, not usage. Monthly limit is NOT AUTHORITATIVELY CONFIGURED. |
| WhatsApp | CONFIG-GATED, default `MOCK` | Do not say suppliers receive RFQs on WhatsApp. Public copy: planned, not yet live. |
| SMS | CONFIG-GATED, default `MOCK` | Same. |
| Email SMTP | CONFIG-GATED | Do not say a mailbox was verified. |
| ONDC | CONFIG-GATED (`CREDENTIAL_GATED`) | Do not say OTP is on the ONDC network. Public copy: not connected. |
| Razorpay / Stripe | CONFIG-GATED | Pilot policy: no real charge. Do not say checkout is live. |

## Not built

| Item | Status |
| --- | --- |
| Enterprise buyer persona | NOT-IMPLEMENTED (fail closed) |
| Supplier cashback | NOT-IMPLEMENTED (removed) |
| BNI network connector | PLANNED in public copy. `BniNetworkAdapter` is a stub that returns a synthetic row if called. The web client does not import it. |
| Native mobile app | NOT-IMPLEMENTED |
| `FALLBACK_ACTIVE` as a status name | NOT-IMPLEMENTED (the ladder exists under other names) |
| Historical GST backfill of old purchase orders in `00245` | NOT-IMPLEMENTED in that migration |

## Public copy versus this table

`SUPPLIER_CHANNELS` in `site-content.ts`:

| Channel | Public status | Canonical status |
| --- | --- | --- |
| OTP supplier registry | Available now | IMPLEMENTED |
| Direct suppliers | Available now | IMPLEMENTED |
| WhatsApp and SMS | Planned | CONFIG-GATED, default mock. Not live. |
| ONDC | Planned | CONFIG-GATED foundation. Not live. |
| BNI and referrals | Planned | PLANNED |
| Local business associations | Planned | PLANNED |
