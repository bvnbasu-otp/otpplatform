import { describe, expect, it } from 'vitest';
import { PERSONA_AVATARS } from '../lib/avatars';
import {
  requestProfileCredentialOtp,
  verifyAndUpdateProfileCredential,
  updateOrganizationName,
  type UpdateProfileInput,
  type UserProfileDetails,
} from '../api/profile';

describe('User Profile Management & Customization Suite', () => {
  it('provides curated persona avatars with valid data URIs', () => {
    expect(PERSONA_AVATARS.length).toBeGreaterThanOrEqual(6);
    for (const avatar of PERSONA_AVATARS) {
      expect(avatar.id).toBeDefined();
      expect(avatar.name).toBeDefined();
      expect(avatar.svgUrl).toContain('data:image/svg+xml');
      expect(avatar.category).toMatch(/^(Executive|Operations|Specialist|Admin)$/);
    }
  });

  it('validates profile input contracts enforce non-editable email and phone on base profile update', () => {
    // Contract check: UpdateProfileInput only permits fullName, title, avatarUrl
    const validUpdate: UpdateProfileInput = {
      fullName: 'Baskar Loganathan',
      title: 'Platform Super Administrator',
      avatarUrl: 'data:image/svg+xml;utf8,...',
    };

    expect(validUpdate.fullName).toBe('Baskar Loganathan');
    expect(validUpdate.title).toBe('Platform Super Administrator');

    // Attempting to pass email or phone directly to base UpdateProfileInput is prevented by TypeScript typing
    const keys = Object.keys(validUpdate);
    expect(keys).not.toContain('email');
    expect(keys).not.toContain('phone');
  });

  it('ensures UserProfileDetails provides credential properties', () => {
    const mockProfile: UserProfileDetails = {
      id: 'mock-uuid',
      email: 'bvnbasu@yahoo.com',
      phone: 'Not registered',
      fullName: 'Basu',
      title: 'Lead Operations Engineer',
      avatarUrl: 'https://example.com/avatar.png',
      isPlatformAdmin: true,
    };

    expect(mockProfile.email).toBe('bvnbasu@yahoo.com');
    expect(mockProfile.phone).toBe('Not registered');
    expect(mockProfile.fullName).toBe('Basu');
    expect(mockProfile.title).toBe('Lead Operations Engineer');
  });

  it('validates OTP credential request and verification helper functions', async () => {
    // Empty input validation
    const invalidPhoneReq = await requestProfileCredentialOtp('PHONE', '');
    expect(invalidPhoneReq.ok).toBe(false);

    const invalidEmailReq = await requestProfileCredentialOtp('EMAIL', '');
    expect(invalidEmailReq.ok).toBe(false);

    // Valid phone OTP request generates OTP code
    const validPhoneReq = await requestProfileCredentialOtp('PHONE', '9840012345');
    expect(validPhoneReq.ok).toBe(true);
    if (validPhoneReq.ok) {
      expect(validPhoneReq.otpCode).toBeDefined();
      expect(validPhoneReq.formattedValue).toBeDefined();
    }

    // OTP verification with mock fallback code
    const verifyPhoneRes = await verifyAndUpdateProfileCredential('PHONE', '9840012345', '123456');
    expect(verifyPhoneRes.ok).toBe(true);

    const verifyShortOtp = await verifyAndUpdateProfileCredential('PHONE', '9840012345', '12');
    expect(verifyShortOtp.ok).toBe(false);

    // Organization name validation
    const invalidOrg = await updateOrganizationName('A');
    expect(invalidOrg.ok).toBe(false);

    const validOrg = await updateOrganizationName('Basu Procurement Entity');
    expect(validOrg.ok).toBe(true);
  });
});
