# OTP Supplier Network Truth

**Authority:** Level 1 — current product truth  
**Baseline date:** 28 September 2026  
**Repository HEAD:** `7b1afc12ac7761efc206c70db80486612a34d146`

OTP has a supplier directory, an invitation step, and alias quotes. It does not have a live external supplier network.

## ONDC and BNI

> **NOT CURRENTLY A LIVE VERIFIED NETWORK INTEGRATION**

Evidence:

- `packages/services/src/discovery/networks/ondc-network-adapter.ts` sets `isTruthfulLive = false`. When the adapter is enabled it can return a supplier named “ONDC Network Verified Supplier”.
- `packages/services/src/discovery/networks/supplier-network-adapters.ts` builds BNI, association, direct, and local-registry adapters with `stubAdapter`. Each returns one fabricated match. `isTruthfulLive` is false.
- Public FAQ copy states that ONDC, BNI, and association connections are planned and not live (`apps/web/src/features/site/content/site-content.ts`).

Google Places is a separate adapter (`GooglePlacesDiscoveryAdapter`). Whether a live key and quota are active on the deployment is UNKNOWN / REQUIRES VERIFICATION. A Places result is a discovered listing, not an OTP-verified supplier.

## Signal dictionary

| Signal | Meaning in this repository | Class |
| --- | --- | --- |
| OTP REGISTERED | A row exists from signup or from an invite that created a supplier shell. Status often starts PENDING. | Authoritative as “a registration was submitted”. Not proof of approval. |
| OTP APPROVED | An operator approved the signup (`admin_review_signup_request` and successors). | Authoritative only after that RPC succeeds. Live approval queue: UNKNOWN. |
| GST VERIFIED | `suppliers.gst_verified` / `verification_status` after a real check. | Column exists. The buyer discovery card does not read it. |
| OPERATOR VERIFIED | Admin action, including a force-verify control in the admin troubleshooter. | Operator assertion. Not an external registry check. |
| NETWORK VERIFIED | Would mean ONDC or another network attested the business. | **Not a current signal.** Do not display it. |
| DISCOVERED IN AREA | A supplier matched by category and location, or a Places candidate. | Derived. The signup banner that says suppliers are “already ready” for PIN prefixes 560, 400, 110, and 600 is **not** this signal. It is a static prefix check. |
| UNVERIFIED | No completed GST or operator check. | Honest empty state. Use this when the column is false or null. |

## What the buyer card actually shows

`fetchMatchedSuppliers` in `apps/web/src/features/requirement/api/rfq-lifecycle.ts`:

| Display | Source | Class |
| --- | --- | --- |
| Alias | `rfq_invitations_manager.anonymous_label`, or `Supplier #NN` | Authoritative label when the column is present; otherwise a fallback index. |
| Match score | `match_score`, or `max(70, 95 - index * 5)` when null | Score can be **synthetic**. |
| Match reasons | Row reasons, or `category_match`, `verified_active`, `location_match` when empty | Empty rows become **fabricated** reasons, including “verified”. |
| GST verified badge | Hard-coded `gstVerified: true` | **Synthetic.** Not the supplier’s GST column. |
| Distance 4 / 8 / 14 km | Chosen from the row index when the client treats the row as local | **Synthetic.** |
| “Available Immediately” / “Available this week” | Alternates by index | **Synthetic.** |
| Network label “ONDC Protocol” or “Local Registry” | String match on reasons or alias, or `index % 3 === 2` | **Synthetic** unless a real source flag exists. The index rule is not a network. |

`SupplierCard.tsx` renders the GST badge, the distance, and the availability text. Tests in `supplier-discovery.test.ts` currently expect `gstVerified: true`. A green test here protects the fabricated badge.

## Quote confidentiality

Before award, the buyer comparison view returns an alias and commercial numbers, not the legal name (`quotes_identity_protected`, migration `00136`). The reveal view returns name, GSTIN, phone, and email only when `reveal_status = REVEALED` and the quote status is `SELECTED` (migration `00178`). Both views are granted to `anon` as well as `authenticated`. The filter calls `can_access_rfq_as_buyer`, which requires membership, so an anonymous query should return no rows. That grant is wider than necessary. Live proof: NOT VERIFIED IN PRODUCTION.

## Direct invite

Migration `00215` withholds a shareable invite link when the supplier already has an account. That is repository SQL. Live behaviour: NOT VERIFIED IN PRODUCTION.

## Pilot implication

A pilot supplier network is the set of suppliers an operator has approved and invited. It is not “suppliers discovered and ready” for every Bengaluru, Mumbai, Delhi, or Chennai PIN.
