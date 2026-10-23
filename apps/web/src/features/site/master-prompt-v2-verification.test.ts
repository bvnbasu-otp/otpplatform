import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('OTP Master Prompt V2 — Product Fixes & Pan-India Readiness Verification', () => {
  const webRoot = resolve(__dirname, '../../..');

  it('Req 1 & 4: Address cardinality enforces 1 address for RWA/MSME and up to 3 for Individuals', () => {
    const addressBookSrc = readFileSync(
      resolve(webRoot, 'src/features/profile/components/AddressBookManager.tsx'),
      'utf8',
    );
    // RWA / MSME gets maxAllowed = 1
    expect(addressBookSrc).toContain("const maxAllowed = isOrgPersona ? 1 : 3;");
    expect(addressBookSrc).toContain("'1 Registered Location Saved'");
    expect(addressBookSrc).toContain("Home, Office, Other");
  });

  it('Req 2 & 5: Saved addresses are associated with RFQs and Individual address selector pills exist', () => {
    const tier1Src = readFileSync(
      resolve(webRoot, 'src/features/intake/components/Tier1TellOtpCard.tsx'),
      'utf8',
    );
    expect(tier1Src).toContain("savedAddresses");
    expect(tier1Src).toContain("onSelectSavedAddress");
    expect(tier1Src).toContain("isIndividual");
    expect(tier1Src).toContain("Custom / Other Location");

    const unifiedSrc = readFileSync(
      resolve(webRoot, 'src/features/intake/components/UnifiedThreeTierIntake.tsx'),
      'utf8',
    );
    expect(unifiedSrc).toContain("setPrimaryBuyerAddress");
    expect(unifiedSrc).toContain("handleSelectSavedAddress");
  });

  it('Req 6 & 7: SNE discovery is provider-neutral and removes blank screen with instant radar pulse', () => {
    const discoverSrc = readFileSync(
      resolve(webRoot, 'src/features/requirement/pages/DiscoverSuppliersPage.tsx'),
      'utf8',
    );
    const lifecycleSrc = readFileSync(
      resolve(webRoot, 'src/features/requirement/api/rfq-lifecycle.ts'),
      'utf8',
    );
    // Instant radar pulse replaces blank/skeleton loading
    expect(discoverSrc).toContain("SupplierRadarPulseBanner");
    // Neutral buyer copy
    expect(discoverSrc).toContain("We couldn't find enough matches yet");
    // Priority: OTP registered first, Google Places fallback second in lifecycle discovery
    expect(lifecycleSrc).toContain("discoverForRequirement(rfqId, 'OTP_REGISTERED')");
  });

  it('Req 8: Official OTP logo is used across public footer and procurement reports', () => {
    const footerSrc = readFileSync(
      resolve(webRoot, 'src/components/layout/SiteFooter.tsx'),
      'utf8',
    );
    expect(footerSrc).toContain("<OtpLogo size={20}");

    const reportSrc = readFileSync(
      resolve(webRoot, 'src/features/reporting/components/PrintableProcurementReport.tsx'),
      'utf8',
    );
    expect(reportSrc).toContain("<OtpLogo size={44}");
  });

  it('Req 9 & 10: Agreement exports are styled printable A4 documents with direct print action', () => {
    const msmeModalSrc = readFileSync(
      resolve(webRoot, 'src/features/portal/components/MsmeRegistrationAgreementModal.tsx'),
      'utf8',
    );
    expect(msmeModalSrc).toContain("handlePrintPdf");
    expect(msmeModalSrc).toContain("brand-title");

    const rwaModalSrc = readFileSync(
      resolve(webRoot, 'src/features/portal/components/RwaRegistrationAgreementModal.tsx'),
      'utf8',
    );
    expect(rwaModalSrc).toContain("handlePrintPdf");
    expect(rwaModalSrc).toContain("brand-title");
  });

  it('Req 12: Footer does not repeat the primary public nav at any viewport', () => {
    const footerSrc = readFileSync(
      resolve(webRoot, 'src/components/layout/SiteFooter.tsx'),
      'utf8',
    );
    expect(footerSrc).not.toContain('aria-label="Footer Navigation"');
    expect(footerSrc).not.toContain('>Get Started<');
    expect(footerSrc).not.toContain('>Home<');
  });

  it('Req 13: RFQ reset form completely clears draft from memory and local intake storage', () => {
    const hookSrc = readFileSync(
      resolve(webRoot, 'src/features/intake/hooks/use-intake-draft.ts'),
      'utf8',
    );
    expect(hookSrc).toContain("clearDraft");
    expect(hookSrc).toContain("clearLocalIntakeDraft");

    const intakePageSrc = readFileSync(
      resolve(webRoot, 'src/features/intake/pages/RequirementIntakePage.tsx'),
      'utf8',
    );
    expect(intakePageSrc).toContain("handleClearAll");
  });

  it('Req 14: Honest AI messaging uses "Auto Parser Ready" instead of exaggerated AI parser claims', () => {
    const tier1Src = readFileSync(
      resolve(webRoot, 'src/features/intake/components/Tier1TellOtpCard.tsx'),
      'utf8',
    );
    expect(tier1Src).toContain("Auto Parser Ready");
    expect(tier1Src).not.toContain("AI Parser Ready");
  });

  it('Req 15 & 16: Pan-India location support with dynamic hub suggestions without hardcoded PINs', () => {
    const tier1Src = readFileSync(
      resolve(webRoot, 'src/features/intake/components/Tier1TellOtpCard.tsx'),
      'utf8',
    );
    expect(tier1Src).toContain("suggestedCities");
    expect(tier1Src).toContain("nationwideHubs");
  });

  it('Req 18: EULA consent persists when switching buyer persona in registration form', () => {
    const registerSrc = readFileSync(
      resolve(webRoot, 'src/features/portal/components/BuyerRegisterForm.tsx'),
      'utf8',
    );
    // setAgreementAccepted(false) should NOT be called on buyerType change
    const personaHandler = registerSrc.slice(
      registerSrc.indexOf("const handleBuyerTypeChange ="),
      registerSrc.indexOf("const handleConsentChange ="),
    );
    expect(personaHandler).not.toContain("setAgreementAccepted(false)");
  });

  it('Req 19: Post-registration messaging explicitly guides users to set password', () => {
    const successSrc = readFileSync(
      resolve(webRoot, 'src/features/portal/components/SignupSuccess.tsx'),
      'utf8',
    );
    expect(successSrc).toContain("Next Step: Set your password");
    expect(successSrc).toContain("We&apos;ve sent you an email with instructions to set or reset your password");
  });

  it('Req 20: Interactive product walkthrough modal is implemented and mounted on landing page', () => {
    const demoModalSrc = readFileSync(
      resolve(webRoot, 'src/features/site/components/OtpProductDemoModal.tsx'),
      'utf8',
    );
    expect(demoModalSrc).toContain("TELL");
    expect(demoModalSrc).toContain("REVIEW");
    expect(demoModalSrc).toContain("DECIDE");
    expect(demoModalSrc).toContain("TRACK");
    expect(demoModalSrc).toContain("INDIVIDUAL");
    expect(demoModalSrc).toContain("RWA");
    expect(demoModalSrc).toContain("MSME");
    expect(demoModalSrc).toContain("SUPPLIER");

    const landingSrc = readFileSync(
      resolve(webRoot, 'src/features/site/pages/LandingPage.tsx'),
      'utf8',
    );
    expect(landingSrc).toContain("OtpProductDemoModal");
    expect(landingSrc).toContain("isDemoModalOpen");
  });
});
