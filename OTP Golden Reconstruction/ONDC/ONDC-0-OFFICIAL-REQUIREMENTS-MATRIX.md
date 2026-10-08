# ONDC-0 — Official Requirements Matrix

Sources restricted to **ONDC-Official** GitHub, **ondc.org** portal references, and **ONDC Protocol Specs** as cited. Non-official blogs excluded from authority.

**Matrix columns:** Requirement | Official source (title + URL) | Date (if on page) | Evidence (quote/summary) | Applicability | Confidence

---

## A. Onboarding, registry, environments

| Requirement | Official source | Date | Evidence | Applicability | Confidence |
|-------------|-----------------|------|----------|---------------|------------|
| NP must register in ONDC registry (staging / pre-prod / prod) | [Onboarding of Participants](https://github.com/ONDC-Official/developer-docs/blob/main/registry/Onboarding%20of%20Participants.md) | Not dated on page | “To join the ONDC network, Network Participants (NPs) must be registered in the ONDC registry.” | **YES** | **HIGH** |
| Valid FQDN becomes **subscriber_id** | Same | — | “Ensure your NP has a valid Fully Qualified Domain Name (FQDN/DNS) that will be included in your subscriber ID (subscriber_id). e.g., prod.ondcapp.com” | **YES** | **HIGH** |
| Valid SSL + OCSP for registry | Same | — | “Obtain a valid SSL certificate… used for OCSP validation.” | **YES** | **HIGH** |
| Whitelist via NP Portal before subscribe | Same | — | Whitelisting via [portal.ondc.org](https://portal.ondc.org), “environment access request”, 6–48h | **YES** | **HIGH** |
| Ed25519 signing key pair | Same | — | “Generate Signing Key Pair… Ed25519 Algorithm… signing_public_key and signing_private_key” | **YES** (if registering) | **HIGH** |
| X25519 encryption key pair | Same | — | “Generate Encryption Key Pair… X25519 Algorithm” | **YES** (if registering) | **HIGH** |
| Site verification file | Same | — | Host `https://<subscriber_id>/ondc-site-verification.html` with meta `ondc-site-verification` = signed request_id | **YES** | **HIGH** |
| `/on_subscribe` POST | Same | — | `https://<subscriber_id>/<callback_url>/on_subscribe`; decrypt challenge; sync JSON `{ "answer": "decrypted_challange_string" }` | **YES** | **HIGH** |
| Subscribe success shape | Same | — | ACK in `message.ack.status` (not assumed HTTP 200 alone) | **YES** | **HIGH** |
| Pre-prod subscribe URL | Same | — | `https://preprod.registry.ondc.org/ondc/subscribe` | **YES** | **HIGH** |
| Prod subscribe URL | Same | — | `https://prod.registry.ondc.org/subscribe` | **YES** (prod only) | **HIGH** |
| Staging registry retired | Same | — | “DECOMMISSIONED — staging environment has been retired” for staging URLs | **YES** | **HIGH** |
| ops_no buyer app = 1 | Same | — | “ops_no : 1 - Buyer App Registration” | **YES** (BAP role) | **HIGH** |
| Pre-prod: whitelist + demo approval per org profile | [ONDC-Official/.github profile README](https://github.com/ONDC-Official/.github/blob/main/profile/README.md) | — | Staging/Pre-Prod: “Obtain whitelisting”; production adds DNS TXT | **YES** | **MEDIUM** |
| Prod: DNS TXT record | Same | — | Production steps: generate/host DNS TXT; portal admin subscription API | **YES** (prod) | **HIGH** |
| Registry lookup v2.0 | [Onboarding of Participants](https://github.com/ONDC-Official/developer-docs/blob/main/registry/Onboarding%20of%20Participants.md) | — | `https://preprod.registry.ondc.org/v2.0/lookup` with Authorization signature | **YES** | **HIGH** |
| Rate limits on subscribe | Same | — | `/subscribe` 10 RPM table | **YES** | **HIGH** |

---

## B. Protocol — search / on_search (discovery)

| Requirement | Official source | Date | Evidence | Applicability | Confidence |
|-------------|-----------------|------|----------|---------------|------------|
| Buyer issues `search` | [ONDC-Protocol-Specs core.yaml](https://github.com/ONDC-Official/ONDC-Protocol-Specs/blob/master/protocol-specifications/core/v0/api/core.yaml) | — | `POST /search` — “Buyer searches for products and services” | **YES** (BAP discovery) | **HIGH** |
| Seller/BPP responds via `on_search` to buyer app | Same | — | `POST /on_search` — “Sellers provide their catalog in response to buyer search”; tags include ONDC Buyer App | **YES** | **HIGH** |
| Beckn context actions enumerated | Same | — | `action` enum includes `search`, `on_search`, `select`, `on_select`, … | **YES** | **HIGH** |
| HTTP signing on requests/callbacks | [signing-verification.md](https://github.com/ONDC-Official/developer-docs/blob/main/registry/signing-verification.md) (linked from onboarding) | — | Profile README: “every request/callback… digitally signed” | **YES** | **MEDIUM** |

---

## C. Domain & B2B / RFQ use case

| Requirement | Official source | Date | Evidence | Applicability | Confidence |
|-------------|-----------------|------|----------|---------------|------------|
| B2B retail specs include RFQ flows | [ONDC-RET-Specifications release-2.0.2](https://github.com/ONDC-Official/ONDC-RET-Specifications/tree/release-2.0.2) | 2023-11-22 (release table) | “RFQ, Non-RFQ… API specifications with examples” | **UNCERTAIN** — OTP must pick **which** ONDC domain code(s) to register | **MEDIUM** |
| Enabled domain list for subscribe | [ONDC-Official/.github — Enabled Domains](https://github.com/ONDC-Official/.github/blob/main/profile/README.md) | — | Section exists; OTP must align subscribe `domain` field to an enabled domain | **UNCERTAIN** until product selects domain | **MEDIUM** |
| OTP heuristic domains (`ONDC:B2B10`, `ONDC:SRV11`, …) | OTP code only | — | `mapCategoryToOndcDomain` in `ondc-network-service.ts` | **NOT ESTABLISHED BY CURRENT OFFICIAL SOURCE** as correct registry domain for OTP | **LOW** for registry |

---

## D. Buyer app policy (ranking, disclosure, privacy, fees)

| Requirement | Official source | Date | Evidence | Applicability | Confidence |
|-------------|-----------------|------|----------|---------------|------------|
| Ranking / disclosure obligations for buyer apps | — | — | Not retrieved in ONDC-0 fetch from prioritized onboarding + core spec | **NOT ESTABLISHED BY CURRENT OFFICIAL SOURCE** in this pass | **LOW** |
| Privacy / DPDP obligations | — | — | Not quoted from official ONDC policy pages in this pass | **NOT ESTABLISHED BY CURRENT OFFICIAL SOURCE** | **LOW** |
| Network fees / GST | — | — | Not stated in onboarding doc | **NOT ESTABLISHED BY CURRENT OFFICIAL SOURCE** | **LOW** |

---

## E. Reference apps & pilot feasibility

| Requirement | Official source | Date | Evidence | Applicability | Confidence |
|-------------|-----------------|------|----------|---------------|------------|
| E2E testing with ONDC reference applications | [ONDC-Official/.github profile](https://github.com/ONDC-Official/.github/blob/main/profile/README.md) | — | “complete the end-to-end testing with ONDC reference applications”; links to reference buyer/seller apps | **YES** | **HIGH** |
| Pre-prod reference buyer/seller apps | Same | — | Reference apps section under Pre-Production Environment | **YES** | **HIGH** |
| Real pre-prod pilot without fake subscribers | Onboarding + reference apps | — | Whitelist + subscribe + real gateway; **no** permission to fabricate registry entries | **YES** — OTP must use ONDC-controlled network | **HIGH** |

---

## F. OTP-specific applicability summary

| Area | Applicability to OTP ONDC-0 |
|------|-----------------------------|
| Buyer App (BAP) registration | **YES** — matches buyer-led discovery + `search` in code |
| Seller NP registration | **NO** for primary OTP persona (supplier uses OTP portal, not ONDC seller app in current design) |
| Gateway / TSP | **NO** as OTP role |
| Registry crypto & endpoints | **YES** before any live `search` to pre-prod/prod |
| B2B procurement RFQ via ONDC | **UNCERTAIN** — specs exist for B2B retail RFQ, but **registry domain string for OTP not decided** |

---

## G. Pilot feasibility (official path only)

| Assessment | **PARTIAL** |
|------------|-------------|
| **REAL** elements | Pre-prod registry URL, reference apps, documented subscribe/lookup path |
| **Blocking** | OTP lacks whitelisted subscriber_id, hosted verification + `on_subscribe`, deployed signed BAP URI, and chosen ONDC domain in subscribe payload |
| **NOT** | Staging registry (retired) |
| **Fake data** | Success must **not** rely on stub adapters or mock network rows for ONDC-labelled suppliers |
