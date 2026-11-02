import { describe, expect, it, vi } from 'vitest';
import { applyIntakeDraftResultForCurrentScope } from '../lib/intake-draft-scope-guard';
import { getIntakeDraftStorageKey, type IntakeDraftStorageScope } from '../lib/intake-storage';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function scope(authUserId: string): IntakeDraftStorageScope {
  return {
    authUserId,
    profileId: `profile-${authUserId}`,
    organizationId: 'org-a',
    persona: 'RWA',
  };
}

describe('intake draft async identity guard', () => {
  it('does not apply a fetch result after the account changes while the request is pending', async () => {
    const request = deferred<{ account: string }>();
    const originalScopeKey = getIntakeDraftStorageKey(scope('account-a'));
    const scopeKeyRef = { current: originalScopeKey };
    const apply = vi.fn();
    const completion = applyIntakeDraftResultForCurrentScope(
      request.promise,
      scopeKeyRef,
      originalScopeKey,
      apply,
    );

    scopeKeyRef.current = getIntakeDraftStorageKey(scope('account-b'));
    request.resolve({ account: 'account-a' });

    await expect(completion).resolves.toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });

  it('does not apply a save result after the account changes while the request is pending', async () => {
    const request = deferred<{ savedFor: string }>();
    const originalScopeKey = getIntakeDraftStorageKey(scope('account-a'));
    const scopeKeyRef = { current: originalScopeKey };
    const apply = vi.fn();
    const completion = applyIntakeDraftResultForCurrentScope(
      request.promise,
      scopeKeyRef,
      originalScopeKey,
      apply,
    );

    scopeKeyRef.current = getIntakeDraftStorageKey(scope('account-b'));
    request.resolve({ savedFor: 'account-a' });

    await expect(completion).resolves.toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });
});
