import { describe, it, expect } from 'vitest';
import {
  normalizePhoneNumber,
  normalizeEmailAddress,
  normalizeGstin,
  normalizeBusinessName,
  checkSupplierDuplicateIdentity,
  checkBuyerDuplicateIdentity,
  type ExistingSupplierIdentity,
  type ExistingBuyerIdentity,
  type SupplierIdentityCandidate,
  type BuyerIdentityCandidate,
} from './duplicate-identity-safeguards';

describe('Duplicate Identity Safeguards — Requirements 13 & 14', () => {
  describe('Identity Normalizers', () => {
    it('normalizes various Indian phone formats to standard E.164 (+91)', () => {
      expect(normalizePhoneNumber('9876543210')).toBe('+919876543210');
      expect(normalizePhoneNumber('09876543210')).toBe('+919876543210');
      expect(normalizePhoneNumber('+91 98765 43210')).toBe('+919876543210');
      expect(normalizePhoneNumber('919876543210')).toBe('+919876543210');
      expect(normalizePhoneNumber('+1 415 555 2671')).toBe('+14155552671');
    });

    it('normalizes email addresses safely', () => {
      expect(normalizeEmailAddress('  Vendor.Ops@Domain.CO.IN ')).toBe('vendor.ops@domain.co.in');
      expect(normalizeEmailAddress(null)).toBe('');
    });

    it('normalizes GSTIN strings by uppercase and stripping hyphens/whitespace', () => {
      expect(normalizeGstin(' 33aabcs1429b1zx ')).toBe('33AABCS1429B1ZX');
      expect(normalizeGstin('33-AABCS-1429B-1ZX')).toBe('33AABCS1429B1ZX');
    });

    it('normalizes business names by stripping corporate suffixes and punctuation', () => {
      expect(normalizeBusinessName('Sri Murugan Electricals Pvt. Ltd.')).toBe('sri murugan electricals');
      expect(normalizeBusinessName('Apex Engineering & Solutions Private Limited')).toBe('apex engineering and');
      expect(normalizeBusinessName('Kavitha Motors - Proprietorship')).toBe('kavitha motors');
    });
  });

  describe('Supplier Duplicate Prevention (Requirement 13)', () => {
    // Valid whitelisted demo GSTIN: 33AABCS1429B1ZX
    const mockExistingSuppliers: ExistingSupplierIdentity[] = [
      {
        supplierId: 'supp-101',
        businessName: 'Sri Murugan Electricals Pvt Ltd',
        gstin: '33AABCS1429B1ZX',
        phone: '+919876543210',
        email: 'murugan@example.com',
        city: 'Coimbatore',
        isVerified: true,
      },
      {
        supplierId: 'supp-102',
        businessName: 'Kaveri Borewell Works',
        phone: '+919842100000',
        email: 'kaveri@example.com',
        city: 'Erode',
        isVerified: false,
      },
    ];

    it('detects exact collision on registered GSTIN in the same city', () => {
      const candidate: SupplierIdentityCandidate = {
        businessName: 'Sri Murugan Traders',
        gstin: '33AABCS1429B1ZX',
        phone: '+919800000000',
        email: 'other_email@example.com',
        city: 'Coimbatore',
      };

      const result = checkSupplierDuplicateIdentity(candidate, mockExistingSuppliers);
      expect(result.isDuplicate).toBe(true);
      expect(result.matchLevel).toBe('EXACT_PROHIBITED');
      expect(result.suggestedAction).toBe('REJECT');
      expect(result.userMessage).toContain('This GSTIN is already registered');
      // Must not leak other supplier details to unverified candidate
      expect(result.userMessage).not.toContain('supp-101');
      expect(result.userMessage).not.toContain('murugan@example.com');
    });

    it('suggests branch addition if the same GSTIN registers from a different city', () => {
      const candidate: SupplierIdentityCandidate = {
        businessName: 'Sri Murugan Electricals Chennai Branch',
        gstin: '33AABCS1429B1ZX',
        phone: '+919800000000',
        email: 'chennai_branch@example.com',
        city: 'Chennai',
      };

      const result = checkSupplierDuplicateIdentity(candidate, mockExistingSuppliers);
      expect(result.isDuplicate).toBe(true);
      expect(result.matchLevel).toBe('POSSIBLE_BRANCH');
      expect(result.isBranchAdditionEligible).toBe(true);
      expect(result.suggestedAction).toBe('SUGGEST_BRANCH_ADDITION');
      expect(result.userMessage).toContain('operational location');
    });

    it('rejects malformed or invalid checksum GSTINs', () => {
      const candidate: SupplierIdentityCandidate = {
        businessName: 'Bogus GSTIN Vendor',
        gstin: '33AABCS1429B1ZZ', // Invalid checksum (last char should be X)
        phone: '+919811111111',
        email: 'bogus@example.com',
      };

      const result = checkSupplierDuplicateIdentity(candidate, mockExistingSuppliers);
      expect(result.suggestedAction).toBe('REJECT');
      expect(result.reasons[0]).toContain('Invalid GSTIN checksum');
    });

    it('detects duplicate non-GST micro-contractors by matching phone and normalized business name', () => {
      const candidate: SupplierIdentityCandidate = {
        businessName: 'Kaveri Borewell Works Prop.',
        phone: '09842100000', // Matches +919842100000 after normalization
        email: 'newemail@example.com',
        city: 'Erode',
      };

      const result = checkSupplierDuplicateIdentity(candidate, mockExistingSuppliers);
      expect(result.isDuplicate).toBe(true);
      expect(result.matchLevel).toBe('EXACT_PROHIBITED');
      expect(result.suggestedAction).toBe('REJECT');
      expect(result.userMessage).toContain('mobile number already exists');
    });

    it('routes shared phone number with a completely different business name to review without blocking', () => {
      const candidate: SupplierIdentityCandidate = {
        businessName: 'Lakshmi Textiles Machine Jobwork',
        phone: '+919842100000', // Same phone, but completely different entity
        email: 'lakshmi@example.com',
        city: 'Bhavani',
      };

      const result = checkSupplierDuplicateIdentity(candidate, mockExistingSuppliers);
      expect(result.isDuplicate).toBe(false);
      expect(result.matchLevel).toBe('LIKELY_DUPLICATE');
      expect(result.suggestedAction).toBe('ROUTE_TO_REVIEW');
      expect(result.userMessage).toContain('manual review');
    });

    it('allows a brand new supplier with fresh credentials to proceed cleanly', () => {
      const candidate: SupplierIdentityCandidate = {
        businessName: 'Kongu Industrial Spares',
        gstin: '29ABCDE1234F1Z5', // Valid whitelisted GSTIN
        phone: '+919876599999',
        email: 'kongu@example.com',
        city: 'Bengaluru',
      };

      const result = checkSupplierDuplicateIdentity(candidate, mockExistingSuppliers);
      expect(result.isDuplicate).toBe(false);
      expect(result.matchLevel).toBe('NO_DUPLICATE');
      expect(result.suggestedAction).toBe('PROCEED');
    });
  });

  describe('Buyer Duplicate Prevention (Requirement 14)', () => {
    const mockExistingBuyers: ExistingBuyerIdentity[] = [
      {
        userId: 'buyer-user-01',
        email: 'secretary@greenacres-rwa.org',
        phone: '+919876500001',
        buyerType: 'RWA',
      },
      {
        userId: 'buyer-user-02',
        email: 'procurement@texmills.com',
        phone: '+919876500002',
        buyerType: 'MSME',
      },
    ];

    it('detects existing buyer by email and guides to sign in', () => {
      const candidate: BuyerIdentityCandidate = {
        email: 'Secretary@Greenacres-RWA.org ',
        phone: '+919800000000',
        buyerType: 'RWA',
      };

      const result = checkBuyerDuplicateIdentity(candidate, mockExistingBuyers);
      expect(result.isDuplicate).toBe(true);
      expect(result.matchLevel).toBe('EXACT_PROHIBITED');
      expect(result.suggestedAction).toBe('SUGGEST_SIGN_IN');
      expect(result.userMessage).toContain('Please sign in with your password');
    });

    it('detects existing buyer by mobile number and guides to sign in', () => {
      const candidate: BuyerIdentityCandidate = {
        email: 'different_email@gmail.com',
        phone: '9876500001', // Normalizes to +919876500001
        buyerType: 'INDIVIDUAL',
      };

      const result = checkBuyerDuplicateIdentity(candidate, mockExistingBuyers);
      expect(result.isDuplicate).toBe(true);
      expect(result.matchLevel).toBe('EXACT_PROHIBITED');
      expect(result.suggestedAction).toBe('SUGGEST_SIGN_IN');
      expect(result.userMessage).toContain('mobile number is already associated');
    });

    it('allows fresh buyer registration to proceed', () => {
      const candidate: BuyerIdentityCandidate = {
        email: 'resident@homemail.in',
        phone: '+919812345678',
        buyerType: 'INDIVIDUAL',
      };

      const result = checkBuyerDuplicateIdentity(candidate, mockExistingBuyers);
      expect(result.isDuplicate).toBe(false);
      expect(result.matchLevel).toBe('NO_DUPLICATE');
      expect(result.suggestedAction).toBe('PROCEED');
    });
  });
});
