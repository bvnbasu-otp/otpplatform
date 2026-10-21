import { describe, expect, it } from 'vitest';
import { canonicalAuthService } from './canonical-authorization-service';
import type { ActorContext } from '../types/actor-context';

const founder: ActorContext = {
  profileId: 'person-founder',
  isPlatformAdmin: true,
  isFounder: true,
  persona: 'PLATFORM_ADMIN',
  email: 'founder@otp.example',
};

describe('canonical service refuses internal customer procurement', () => {
  it('denies requirement creation and purchase-order issuance for an internal operator', () => {
    expect(canonicalAuthService.canCreateRequirementOrRfq(founder, null).allowed).toBe(false);
    expect(canonicalAuthService.canIssuePurchaseOrder(founder, null, 1000).allowed).toBe(false);
  });

  it('still allows an individual buyer to create a requirement', () => {
    const buyer: ActorContext = {
      profileId: 'person-buyer',
      persona: 'INDIVIDUAL',
    };
    expect(canonicalAuthService.canCreateRequirementOrRfq(buyer, null).allowed).toBe(true);
  });
});
