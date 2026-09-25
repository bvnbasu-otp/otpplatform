import { describe, expect, it } from 'vitest';
import {
  IndianStandardsClassifier,
  IndianStandardType,
  IndianStandardVerificationStatus,
} from './capability-evidence';

describe('Indian Standards Classification Intelligence & Anti-Masquerading', () => {
  it('classifies unverified BIS claim as SELF_DECLARED_CLAIM without certified status', () => {
    const res = IndianStandardsClassifier.evaluateStandardClaim({
      standardType: IndianStandardType.BIS,
      claimText: 'High quality BIS IS 694 copper wire',
      certificateNumber: null,
      isIndependentlyVerified: false,
    });

    expect(res.status).toBe(IndianStandardVerificationStatus.SELF_DECLARED_CLAIM);
    expect(res.isCertified).toBe(false);
    expect(res.confidenceScoreContribution).toBe(0);
    expect(res.badgeLabel).toBe('Self-Declared BIS Claim');
    expect(res.advisory).toContain('independent certificate verification required');
  });

  it('classifies unverified CPWD enlistment as SELF_DECLARED_CLAIM without merit boost', () => {
    const res = IndianStandardsClassifier.evaluateStandardClaim({
      standardType: IndianStandardType.CPWD,
      claimText: 'CPWD Class-1 approved contractor',
      certificateNumber: undefined,
      isIndependentlyVerified: false,
    });

    expect(res.status).toBe(IndianStandardVerificationStatus.SELF_DECLARED_CLAIM);
    expect(res.isCertified).toBe(false);
    expect(res.confidenceScoreContribution).toBe(0);
    expect(res.badgeLabel).toBe('Self-Declared CPWD Claim');
  });

  it('classifies independently verified FSSAI certification as INDEPENDENTLY_VERIFIED with badge', () => {
    const res = IndianStandardsClassifier.evaluateStandardClaim({
      standardType: IndianStandardType.FSSAI,
      claimText: 'FSSAI License holder for commercial catering',
      certificateNumber: '11223344556677',
      isIndependentlyVerified: true,
    });

    expect(res.status).toBe(IndianStandardVerificationStatus.INDEPENDENTLY_VERIFIED);
    expect(res.isCertified).toBe(true);
    expect(res.confidenceScoreContribution).toBe(10);
    expect(res.badgeLabel).toBe('Verified FSSAI Compliance');
    expect(res.advisory).toContain('Independently verified FSSAI accreditation');
  });

  it('classifies independently verified BEE 5-Star rating as INDEPENDENTLY_VERIFIED', () => {
    const res = IndianStandardsClassifier.evaluateStandardClaim({
      standardType: IndianStandardType.BEE,
      claimText: 'BEE 5-Star rated energy efficient transformers',
      certificateNumber: 'BEE-STAR-998822',
      isIndependentlyVerified: true,
    });

    expect(res.status).toBe(IndianStandardVerificationStatus.INDEPENDENTLY_VERIFIED);
    expect(res.isCertified).toBe(true);
    expect(res.badgeLabel).toBe('Verified BEE Compliance');
  });

  it('scans requirement text for Indian standards and detects self-declared vs verified mentions', () => {
    const text = 'Requirement for BIS certified electrical cables and CPWD grade switchgear with BEE 5 star rating';
    
    // Scan without verified certificates
    const unverifiedResults = IndianStandardsClassifier.scanAndClassifyStandards(text);
    expect(unverifiedResults.length).toBe(3);
    expect(unverifiedResults.every((r) => !r.isCertified)).toBe(true);
    expect(unverifiedResults.every((r) => r.status === IndianStandardVerificationStatus.SELF_DECLARED_CLAIM)).toBe(true);

    // Scan with verified BIS certificate
    const partiallyVerifiedResults = IndianStandardsClassifier.scanAndClassifyStandards(text, [
      { standardType: IndianStandardType.BIS, certificateNumber: 'CM/L-1234567' },
    ]);

    const bisResult = partiallyVerifiedResults.find((r) => r.standardType === IndianStandardType.BIS);
    const cpwdResult = partiallyVerifiedResults.find((r) => r.standardType === IndianStandardType.CPWD);

    expect(bisResult?.isCertified).toBe(true);
    expect(bisResult?.status).toBe(IndianStandardVerificationStatus.INDEPENDENTLY_VERIFIED);
    expect(cpwdResult?.isCertified).toBe(false);
    expect(cpwdResult?.status).toBe(IndianStandardVerificationStatus.SELF_DECLARED_CLAIM);
  });
});
