# OTP Contradiction Register (current)

**Authority:** Level 1 index of conflicts  
**Baseline date:** 28 September 2026  
**Repository HEAD:** `7b1afc12ac7761efc206c70db80486612a34d146`

Business and legal rows are unresolved on purpose.

| ID | Statement A | Statement B | Source | Actual code truth | Decision owner | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| FIN-1 | OTP does not collect, hold, or settle buyer-supplier payments. | A 0.50% fee is deducted from supplier disbursements on settlement. | A: `site-content.ts`, `InvoicePaymentPanel.tsx`, `settlement-state.ts`, live landing. B: `SUPPLIER_FEE_POLICY` in `pricing-entitlement.ts`, live pricing. | Settlement UI records a UTR and does not move funds. Fee function can compute 0.50% and, in pilot mode, returns 0. | Product | OPEN — PRODUCT DECISION REQUIRED |
| FIN-2 | “OTP does not take a commission or handle your money.” | After the pilot a supplier fee applies; during the pilot it is waived. Pricing shows 0.50%. | A: `AboutPage.tsx`, seen live. B: FAQ, seen live; `PILOT_COMMERCIAL_MODE_POLICY`. | Pilot flags zero the commercial fee. The About sentence has no time limit. | Product | OPEN — PRODUCT DECISION REQUIRED |
| FIN-3 | “Zero commissions, zero lead fees.” | 0.50% platform fulfillment fee. | `QuickRegisterModal.tsx` vs pricing policy and pricing page. | Same as FIN-1. | Product | OPEN — PRODUCT DECISION REQUIRED |
| FIN-4 | 0.50% fee and 0.10% reward are certified live production behaviour. | Pilot policy: fee not charged, reward not commercially recognised. | `README.md` (before this baseline) and `docs/00`–`docs/15` vs `pricing-entitlement.ts`. | README is being corrected to stop claiming certification. Docs 00–15 remain historical. | Product, for the commercial design. Documentation, for the README. | README corrected in this phase. Commercial design OPEN. |
| LEG-1 | Users must accept terms to register. | Terms say they are not final legal text. | Live `/legal/terms`, `/legal/privacy`, `/legal/disclaimer`; `LegalPage.tsx`. | The banners are in the page component. | Legal | OPEN — LEGAL DECISION REQUIRED |
| LEG-2 | A postal address is shown for legal contact. | The address is `[Insert Registered Business Address]`. | `LegalPage.tsx`, seen live. | Placeholder string. | Legal | OPEN — LEGAL DECISION REQUIRED |
| SUP-1 | “GST verified” on a supplier card. | Verification is a supplier column set by a real check. | `rfq-lifecycle.ts` hard-codes `gstVerified: true`. `SupplierCard.tsx` renders it. | The badge does not read `gst_verified`. | Product (the card must follow the column). No decision needed to call the badge false. | OPEN as a bug. Not a terminology choice. |
| SUP-2 | “Active suppliers discovered and ready in your area.” | Discovery is an invitation query, and ONDC/BNI are not live. | `BuyerRegisterForm.tsx` PIN prefixes 560, 400, 110, 600. | Prefix check only. | Product | OPEN as a bug. |
| SUP-3 | ONDC / BNI suppliers can be matched. | FAQ: those networks are not live. | Adapter stubs vs FAQ. | Stubs return fabricated names. FAQ is the true public statement. | None for “are they live?” — they are not. | RESOLVED as documentation: not live. Do not enable the stubs. |
| SUP-4 | Distance 4/8/14 km and “Available this week”. | No distance or availability column is mapped from the invitation row. | `rfq-lifecycle.ts`. | Index-based constants. | None. | OPEN as a bug. |
| GOV-1 | Individual buyers have no committee. | Award screen says “Recorded Committee Consensus”. | `buyer-persona.ts` vs `AwardPage.tsx`. | Persona flag is false. The heading is unconditional. | Product copy. The domain rule is already “no vote”. | OPEN as a content bug. |
| GOV-2 | Estate managers do not vote. | The UI shows `canVote: false`. | Authorization chain vs `BuyerSourcingCockpitCard.tsx` and the RWA agreement. | The engine rejects the vote. The words on screen are an internal flag. | Content | OPEN as a content bug. |
| GOV-3 | An RWA cannot create the first RFQ without a President or Secretary and two active assignments. | Publish page search did not call `evaluateRwaCommitteeRfqGate`. | `rwa-governance.ts` vs call-site search. | Function exists and is tested. It is not on the publish path found in this pass. | Product, if the gate must be mandatory. Engineering, to wire it, only after that. | OPEN — do not assume the server blocks the RFQ. |
| REL-1 | `/register` is a way in. | Unknown paths redirect home. | Live browser, 28 Sep. `App.tsx` catch-all. | No `/register` route. | Content / routing bug. | OPEN as a bug. |
| REL-2 | Customer site. | Desktop and Mobile preview controls. | Live browser. `MobileSimulatorFrame` via `SiteLayout`. | Frame wraps public pages. | Content bug. | OPEN as a bug. |
| DOC-1 | Phase 7.1 certified, 185 migrations, pilot gate open. | Tree contains migrations through `00215`. Live DB unknown. Commit `7b1afc12` subject says 00213–00215 production readiness. | `docs/00`, old README, git subject, migration directory. | File ceiling is 215. Certification claims are historical or unproven. | Documentation | RESOLVED for navigation: golden index is current. Historical files kept. Live ceiling still UNKNOWN. |
| DOC-2 | “Cryptographically sealed” identities. | Comparison is a Postgres view that omits name columns until reveal. | Older docs and some in-app award copy vs `quotes_identity_protected`. | Withholding is an authorization view, not a client-side cipher described in the public FAQ. | Content, where the word is customer-facing. | OPEN as wording. Do not invent a crypto design in customer copy. |
| SEC-1 | Admin functions are safe because later migrations revoke anon. | Production may not have those migrations. | `00199` vs `PROD_CONTAINMENT/README.md`. | Both statements can be true of different databases. | Security verification | OPEN — PRODUCTION VERIFICATION REQUIRED |
| SEC-2 | Wallet credits are tied to a real platform-fee row. | Credit RPC accepts a null fee id and does not check the caller. | `00181`. | The function does what SEC-2 column B says. | Security | OPEN SECURITY FINDING. Not a product choice. |

## Resolved only as documentation

SUP-3 and DOC-1 are resolved as “what to believe when reading”. They are not code fixes.

No other row was closed.
