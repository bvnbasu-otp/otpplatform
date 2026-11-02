import { describe, expect, it } from 'vitest';
import { SIGNED_OUT_CONTEXT, type RoleContext } from '@/features/roles/api/roles';
import { getIntakeDraftStorageKey } from '../lib/intake-storage';
import { resolveIntakeDraftStorageScope } from '../lib/intake-draft-scope';

function buyerContext(overrides: Partial<RoleContext> = {}): RoleContext {
  return {
    ...SIGNED_OUT_CONTEXT,
    signedIn: true,
    side: 'BUYER',
    profileId: 'profile-1',
    organizationId: 'org-1',
    buyerType: 'RWA',
    ...overrides,
  };
}

describe('intake draft storage identity', () => {
  it('requires both the authenticated user and buyer profile identity', () => {
    expect(resolveIntakeDraftStorageScope(null, buyerContext())).toBeNull();
    expect(resolveIntakeDraftStorageScope('auth-1', buyerContext({ signedIn: false }))).toBeNull();
    expect(resolveIntakeDraftStorageScope('auth-1', buyerContext({ side: 'SUPPLIER' }))).toBeNull();
  });

  it('fails closed when the buyer profile identity is missing', () => {
    expect(resolveIntakeDraftStorageScope('auth-1', buyerContext({ profileId: null }))).toBeNull();
  });

  it('keeps Individual drafts profile-scoped without an organization', () => {
    const scope = resolveIntakeDraftStorageScope(
      'auth-individual',
      buyerContext({
        organizationId: null,
        buyerType: 'INDIVIDUAL',
      }),
    );

    expect(scope).toEqual({
      authUserId: 'auth-individual',
      profileId: 'profile-1',
      organizationId: null,
      persona: 'INDIVIDUAL',
    });
  });

  it('includes organization and persona when resolving RWA and MSME contexts', () => {
    const rwaScope = resolveIntakeDraftStorageScope('auth-1', buyerContext());
    const msmeScope = resolveIntakeDraftStorageScope(
      'auth-1',
      buyerContext({
        organizationId: 'org-2',
        buyerType: 'MSME',
      }),
    );

    expect(rwaScope?.persona).toBe('RWA');
    expect(msmeScope?.persona).toBe('MSME');
    expect(getIntakeDraftStorageKey(rwaScope)).not.toBe(getIntakeDraftStorageKey(msmeScope));
  });

  it('fails closed if a non-individual buyer context has no organization', () => {
    expect(resolveIntakeDraftStorageScope(
      'auth-1',
      buyerContext({ organizationId: null, buyerType: 'RWA' }),
    )).toBeNull();
    expect(resolveIntakeDraftStorageScope(
      'auth-1',
      buyerContext({ organizationId: null, buyerType: 'MSME' }),
    )).toBeNull();
  });
});
