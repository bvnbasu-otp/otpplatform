# Product overview

OTP (Open Trade & Procurement Platform) is identity-protected competitive sourcing.

The customer describes the need. Suppliers quote under an alias. The customer, or the customer’s committee when that model applies, chooses. The supplier’s legal name is released with the decision rules in [AWARDS_AND_REVEAL.md](../03-domains/AWARDS_AND_REVEAL.md). The public money line is that the buyer pays the supplier directly and OTP does not collect, hold, or settle that payment (`PLATFORM_DISCLAIMER_LINES` in `apps/web/src/lib/brand.ts`).

**OTP does the procurement work. The customer makes the decision.**

Status of the product shell: `IMPLEMENTED` in this repository. Whether the public site is serving SHA `b7fbcea22273f6045ac0fdd562a278107dcf34b1` is `UNKNOWN`. DEPLOYED REVISION NOT RE-VERIFIED. See [CAPABILITY_STATUS.md](../13-truth/CAPABILITY_STATUS.md) and [PUBLIC_PILOT_TRUTH.md](../13-truth/PUBLIC_PILOT_TRUTH.md). Money and fees: [BUSINESS_MODEL.md](./BUSINESS_MODEL.md).

## Journey

Internal operating journey: **TELL → REVIEW → DECIDE → TRACK**. The customer tells OTP the need, reviews the prepared requirement, decides among identity-protected quotes, and tracks the order. The public site words for the same journey are Request → Compare → Decide → Purchase → Track (`PUBLIC_JOURNEY_STEPS` in `apps/web/src/lib/brand.ts`). Status: [CAPABILITY_STATUS.md](../13-truth/CAPABILITY_STATUS.md).

## Who it is for

Customer-facing account types are **Individual**, **RWA** (resident welfare association / housing society), and **MSME** (`BuyerPersona` in `packages/domain/src/types/buyer-persona.ts`), plus suppliers who quote. Enterprise is not a customer type. Detail: [CUSTOMER_TYPES.md](./CUSTOMER_TYPES.md).

## Public site and support

Source reviewed 23 October 2026, uncommitted working tree. Status words: [CAPABILITY_STATUS.md](../13-truth/CAPABILITY_STATUS.md).

### Language selection

- The public website has **no language selector**. `LanguageSwitcher` was removed from the shared public header `apps/web/src/features/site/components/SiteHeader.tsx`, which every public page uses on desktop and mobile.
- Signed-in users still choose a language in four places: the profile page (`ProfilePage.tsx`), the workspace header (`WorkspaceHeader.tsx`), the workspace header menu (`WorkspaceHeaderMenu.tsx`), and the mobile account sheet (`MobileBottomNav.tsx`).
- A choice made without signing in lasts only for the browser session (`apps/web/src/lib/i18n/language-account.ts`).
- The language chips in voice intake set the speech-recognition language. They are unchanged.
- Tests: `public-language-selector-removal.test.tsx`, `site-header-requirement-access.test.tsx`, `public-site-positioning.test.tsx`.

### Contact Us

- **Where:** a public page at `/contact-us`. `/contact` redirects to it. It is linked from the site footer and the footer drawer. Code: `apps/web/src/features/contact/`.
- **Contact details:** support email bvnbasu+otp.demo.otp.support@gmail.com, and WhatsApp +91 9972967530 through `https://wa.me/919972967530`. The WhatsApp link opens in a new tab (`noopener noreferrer`). It is a direct user action in the visitor's own WhatsApp. It is not OTP's WAHA integration ([WHATSAPP.md](../09-integrations/WHATSAPP.md)).
- **Enquiry categories:** Buyer enquiry (Individual, RWA or MSME), Supplier onboarding, Business or partnership enquiry, Technical support, Other.
- **Form behaviour:**
  - field validation with accessible error messages;
  - a loading state;
  - a hidden honeypot field to catch bots;
  - only one submission in flight at a time;
  - a submission id, so a retried submission returns the first record instead of creating a second;
  - a privacy notice linking to `/legal/privacy`. There is no consent checkbox; see [KNOWN_LIMITATIONS.md](../13-truth/KNOWN_LIMITATIONS.md).
- **Saving an enquiry:**
  - The page calls the edge function `contact-enquiry`. It validates the enquiry and ignores forwarded network-identity headers because no trusted-hop contract is established. The server issues an HMAC-signed opaque client credential; proposal `00322` atomically enforces 5 requests/hour for that server-derived identity plus a distinct 200 requests/hour endpoint emergency ceiling before storing through `submit_contact_enquiry`.
  - Success says *"Thank you — your enquiry has been recorded."* and gives a reference number.
  - **Until 00322 is applied and the function is deployed, no enquiry can be saved.** The visitor sees *"We could not record your enquiry, so nothing has been sent."* plus the email and WhatsApp alternatives.
- **Email:** none is sent. No server-side email transport is wired, so each enquiry's notification status is recorded as `NOT_CONFIGURED`.
- **Not built yet:** an admin screen to read enquiries, and a retention period.

### A4 print / PDF

The Contact Us page has a print button. It opens the browser's print dialog through the existing `triggerPrintDialog` and prints an A4 portrait sheet (`ContactUsPrintSheet.tsx`, with the existing `OtpLogo`). The sheet uses a print-only stylesheet, `contact-us-print.css`, which relies on CSS `:has()`. The PDF is whatever the browser's "Save as PDF" produces. The printed or PDF output has **not been checked visually**.

## What the repository contains

| Area | Role |
| --- | --- |
| `apps/web` | The only application client. React 19, Vite, React Router 7 (`apps/web/package.json`). |
| `packages/domain` | Personas, entitlement, tax, governance templates, payment-plan definitions. |
| `packages/services` | Places adapter, email dispatcher, service layer. |
| `packages/database` | Database access package. |
| `supabase/migrations` | `00001`–`00250` on disk. Local applied ceiling is `00245`. Hosted applied ceiling is NOT YET VERIFIED. `00246` through `00250` are pending migration, not applied, not deployed, not production. |
| `supabase/functions` | Edge functions listed in [SUPABASE.md](../10-platform/SUPABASE.md). |

## What this overview will not claim

ONDC, BNI, WhatsApp, and SMS are not live supplier networks. WhatsApp messages go through WAHA, the owner-confirmed demo provider ([WHATSAPP.md](../09-integrations/WHATSAPP.md)). SMS is not available for the pilot. Google Places is implemented and credential-gated. A green test run was not produced for this page.
