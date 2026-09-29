# Supplier Discovery Provider Matrix — 2026-09-29

| Provider | Normalized kind | Strong IDs for dedup | Buyer label | Can claim OTP_VERIFIED? |
|----------|-----------------|----------------------|-------------|-------------------------|
| OTP registry | `OTP_SUPPLIER` | `otpSupplierId`, GSTIN, phone | OTP Verified | Only if registry verification = VERIFIED |
| ONDC Beckn | `ONDC_SELLER` | `ondcProviderId`, GSTIN when present | Network suppliers | **No** (`ONDC_DISCOVERED`) |
| Google Places | `GOOGLE_DISCOVERY` | `place_id`, phone, domain | Local businesses | **No** (`DISCOVERED_IN_AREA`) |

## Dedup policy

- Merge only on strong IDs.
- Similar names across sources → `POSSIBLE_MATCH` with explainable factor `similar_name`.
- No opaque AI score; match factors are explicit strings/codes.

## Quota / policy

- Google: existing 1500/day quota guard in `GooglePlacesDiscoveryAdapter` (unchanged).
- ONDC: no fixture `/ondc/search` responses in-repo.

## Invite boundary

Direct invite does **not** set `OTP_VERIFIED`; lifecycle evaluation unchanged in `supplier-lifecycle-tier.ts`.
