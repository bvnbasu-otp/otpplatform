# OTP documentation

Canonical pilot-freeze source for this repository. Status labels live only in [13-truth/CAPABILITY_STATUS.md](./13-truth/CAPABILITY_STATUS.md).

The numbered canonical tree under `docs/00-governance` through `docs/15-change-management`, indexed on this page, is the authority. `docs/00-DOCUMENTATION-INDEX.md` and `docs/01-PLATFORM-OVERVIEW.md` through `docs/15-PRODUCTION-READINESS-AND-CTO-CLEARANCE-REPORT.md` are superseded historical narrative. `OTP Golden Reconstruction/` is historical evidence. Neither overrides this tree or [CAPABILITY_STATUS.md](./13-truth/CAPABILITY_STATUS.md). See [00-governance/DOCUMENTATION_STATUS.md](./00-governance/DOCUMENTATION_STATUS.md).

## Baseline

| Item | Value |
| --- | --- |
| Branch | `main` |
| SHA inspected | `b7fbcea22273f6045ac0fdd562a278107dcf34b1` |
| Local migrations | `00001`–`00247`, 247 files, contiguous. `00246` and `00247` not applied to hosted. |
| Hosted database | HOSTED DATABASE CEILING NOT RE-VERIFIED. Prior manual verification was `00245`. |
| Public URL named in repo | `https://otpplatform-theta.vercel.app` |
| Deployed SHA | DEPLOYED REVISION NOT RE-VERIFIED |
| Node | `>=22` (`package.json` engines; CI `22`) |
| pnpm | `9.15.0` |
| TypeScript | `5.6.3` |
| React | `^19.0.0` |
| React Router | `^7.1.1` |
| Vite | `^6.0.6` (override `>=6.4.3`) |
| Supabase JS | `^2.49.1` |
| Supabase CLI pin in CI | `2.118.0` |
| Product version | `0.1.0` |

Nothing in this tree is `LIVE-VERIFIED`.

## Integration statuses

| Integration | Status |
| --- | --- |
| OTP registry and direct invite | IMPLEMENTED |
| Google Places | CONFIG-GATED, EXTERNAL-DEPENDENCY |
| WhatsApp | CONFIG-GATED, default mock |
| SMS | CONFIG-GATED, default mock |
| Email | CONFIG-GATED |
| ONDC | CONFIG-GATED (`CREDENTIAL_GATED`) |
| BNI | PLANNED |
| Razorpay / Stripe | CONFIG-GATED |
| Supplier cashback | NOT-IMPLEMENTED |
| Enterprise buyer | NOT-IMPLEMENTED |

## Map

| Section | Documents |
| --- | --- |
| Governance | [DOCUMENTATION_PRINCIPLES.md](./00-governance/DOCUMENTATION_PRINCIPLES.md), [SOURCE_OF_TRUTH_POLICY.md](./00-governance/SOURCE_OF_TRUTH_POLICY.md), [DOCUMENTATION_STATUS.md](./00-governance/DOCUMENTATION_STATUS.md) |
| Product | [PRODUCT_OVERVIEW.md](./01-product/PRODUCT_OVERVIEW.md), [PILOT_SCOPE.md](./01-product/PILOT_SCOPE.md), [CUSTOMER_TYPES.md](./01-product/CUSTOMER_TYPES.md), [CUSTOMER_JOURNEYS.md](./01-product/CUSTOMER_JOURNEYS.md), [PRICING_AND_ENTITLEMENTS.md](./01-product/PRICING_AND_ENTITLEMENTS.md), [BUSINESS_MODEL.md](./01-product/BUSINESS_MODEL.md) |
| Screens | [SCREEN_INVENTORY.md](./02-design/SCREEN_INVENTORY.md) |
| Domains | [PROCUREMENT.md](./03-domains/PROCUREMENT.md), [GOVERNANCE.md](./03-domains/GOVERNANCE.md), [AWARDS_AND_REVEAL.md](./03-domains/AWARDS_AND_REVEAL.md), [PURCHASE_ORDERS.md](./03-domains/PURCHASE_ORDERS.md), [SUPPLIER_NETWORK.md](./03-domains/SUPPLIER_NETWORK.md), [PAYMENTS.md](./03-domains/PAYMENTS.md) |
| Features | [FEATURE_CATALOG.md](./04-features/FEATURE_CATALOG.md) |
| Architecture | [SYSTEM_ARCHITECTURE.md](./05-architecture/SYSTEM_ARCHITECTURE.md), [SECURITY_ARCHITECTURE.md](./05-architecture/SECURITY_ARCHITECTURE.md) |
| Wiring | [END_TO_END_WIRING.md](./06-wiring/END_TO_END_WIRING.md), [RPC_CATALOG.md](./06-wiring/RPC_CATALOG.md) |
| Database | [DATABASE_OVERVIEW.md](./07-database/DATABASE_OVERVIEW.md), [MIGRATION_HISTORY.md](./07-database/MIGRATION_HISTORY.md) |
| Security | [ROLE_PERMISSION_MATRIX.md](./08-security/ROLE_PERMISSION_MATRIX.md), [WRITE_BOUNDARIES.md](./08-security/WRITE_BOUNDARIES.md) |
| Integrations | [INTEGRATION_CATALOG.md](./09-integrations/INTEGRATION_CATALOG.md), [GOOGLE_PLACES.md](./09-integrations/GOOGLE_PLACES.md), [ONDC.md](./09-integrations/ONDC.md), [WHATSAPP.md](./09-integrations/WHATSAPP.md), [SMS.md](./09-integrations/SMS.md), [EMAIL.md](./09-integrations/EMAIL.md), [PAYMENTS.md](./09-integrations/PAYMENTS.md) |
| Platform | [TECHNOLOGY_STACK.md](./10-platform/TECHNOLOGY_STACK.md), [CI_CD.md](./10-platform/CI_CD.md), [SUPABASE.md](./10-platform/SUPABASE.md), [VERCEL.md](./10-platform/VERCEL.md), [ENVIRONMENTS.md](./10-platform/ENVIRONMENTS.md), [GIT_AND_GITHUB.md](./10-platform/GIT_AND_GITHUB.md) |
| Testing | [TEST_STRATEGY.md](./11-testing/TEST_STRATEGY.md), [COVERAGE_POLICY.md](./11-testing/COVERAGE_POLICY.md), [PRODUCTION_GATES.md](./11-testing/PRODUCTION_GATES.md), [BLACK_BOX_TESTING.md](./11-testing/BLACK_BOX_TESTING.md) |
| Operations | [DEPLOYMENT_RUNBOOK.md](./12-operations/DEPLOYMENT_RUNBOOK.md), [PILOT_RUNBOOK.md](./12-operations/PILOT_RUNBOOK.md), [RELEASE_RUNBOOK.md](./12-operations/RELEASE_RUNBOOK.md), [INCIDENT_RESPONSE.md](./12-operations/INCIDENT_RESPONSE.md), [ROLLBACK.md](./12-operations/ROLLBACK.md) |
| Truth | [CAPABILITY_STATUS.md](./13-truth/CAPABILITY_STATUS.md), [PUBLIC_PILOT_TRUTH.md](./13-truth/PUBLIC_PILOT_TRUTH.md), [KNOWN_LIMITATIONS.md](./13-truth/KNOWN_LIMITATIONS.md), [LIVE_VS_PLANNED.md](./13-truth/LIVE_VS_PLANNED.md), [DOCUMENTATION_DISCOVERED_DEFECTS.md](./13-truth/DOCUMENTATION_DISCOVERED_DEFECTS.md) |
| Mobile | [MOBILE_PRODUCT_CONTRACT.md](./14-mobile-contract/MOBILE_PRODUCT_CONTRACT.md) |
| Change management | [RELEASE_DOCUMENTATION_PROTOCOL.md](./15-change-management/RELEASE_DOCUMENTATION_PROTOCOL.md) |

## Open gaps

- HOSTED DATABASE CEILING NOT RE-VERIFIED. Prior manual verification was `00245`. Local files now include `00246`, which was not applied to hosted.
- DEPLOYED REVISION NOT RE-VERIFIED.
- Vercel production database target (`VITE_SUPABASE_URL` in the Vercel project): `UNKNOWN`.
- Whether `payment-webhook` and `ondc-on-search` are deployed on the hosted project.
- The RPC name that consumes the monthly RFQ count.
- Live collection of the 0.5 percent supplier fee in SQL.
- Hosted values of Google, ONDC, messaging, SMTP, and payment secrets (names only; values must not be copied).
