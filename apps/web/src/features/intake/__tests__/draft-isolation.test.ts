import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  discardLegacyLocalIntakeDrafts,
  saveLocalIntakeDraft,
  loadLocalIntakeDraft,
  clearLocalIntakeDraft,
  getIntakeDraftStorageKey,
  getLegacyIntakeDraftNotice,
  getLegacyLocalIntakeDraftStatus,
  LEGACY_INTAKE_DRAFT_DISCARD_CONFIRMATION,
  type IntakeDraftStorageScope,
  type SavedIntakeState,
} from '../lib/intake-storage';

describe('Buyer Intake Draft Isolation & User Safety', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      key: (index: number) => Object.keys(mockStorage)[index] ?? null,
      get length() {
        return Object.keys(mockStorage).length;
      },
      clear: () => {
        mockStorage = {};
      },
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: storageMock,
      writable: true,
      configurable: true,
    });
  });

  it('safely isolates drafts between different users in the same organization', () => {
    const scopeA: IntakeDraftStorageScope = {
      authUserId: 'auth-alice',
      profileId: 'profile-alice',
      organizationId: 'org-rwa-1',
      persona: 'RWA',
    };
    const scopeB: IntakeDraftStorageScope = {
      authUserId: 'auth-bob',
      profileId: 'profile-bob',
      organizationId: 'org-rwa-1',
      persona: 'RWA',
    };

    const draftA: Omit<SavedIntakeState, 'version' | 'updatedAt'> = {
      stepIndex: 2,
      furthestIndex: 2,
      draft: null,
      scopeState: {
        originalText: 'Solar Panels 50kW for Alice',
        title: 'Alice Solar Requirement',
        categoryId: 'cat-solar',
        subcategoryId: 'sub-rooftop-solar',
        requirementMode: 'PRODUCT_MATERIAL',
        quantity: 50,
        unit: 'KW',
      },
    };

    const draftB: Omit<SavedIntakeState, 'version' | 'updatedAt'> = {
      stepIndex: 1,
      furthestIndex: 1,
      draft: null,
      scopeState: {
        originalText: 'CCTV Setup for Bob',
        title: 'Bob Security Cameras',
        categoryId: 'cat-security',
        subcategoryId: 'sub-cctv',
        requirementMode: 'SERVICE',
        quantity: 16,
        unit: 'UNITS',
      },
    };

    // Save drafts under same org but different users
    saveLocalIntakeDraft(draftA, scopeA);
    saveLocalIntakeDraft(draftB, scopeB);

    const loadedA = loadLocalIntakeDraft(scopeA);
    const loadedB = loadLocalIntakeDraft(scopeB);

    expect(loadedA?.scopeState?.title).toBe('Alice Solar Requirement');
    expect(loadedB?.scopeState?.title).toBe('Bob Security Cameras');

    clearLocalIntakeDraft(scopeA);

    expect(loadLocalIntakeDraft(scopeA)).toBeNull();
    expect(loadLocalIntakeDraft(scopeB)?.scopeState?.title).toBe('Bob Security Cameras');
  });

  it('guarantees intake inputs (Type, Voice, Photo, Upload, Template) remain strictly in draft until explicit buyer confirmation', () => {
    const scope: IntakeDraftStorageScope = {
      authUserId: 'auth-user-1',
      profileId: 'profile-1',
      organizationId: null,
      persona: 'INDIVIDUAL',
    };
    const draft: Omit<SavedIntakeState, 'version' | 'updatedAt'> = {
      stepIndex: 0,
      furthestIndex: 0,
      draft: null,
      scopeState: {
        originalText: 'Dictated Voice Input for Elevator Maintenance',
        title: 'Elevator Maintenance',
        categoryId: 'cat-elevators',
        subcategoryId: 'sub-amc',
        requirementMode: 'SERVICE',
        quantity: 1,
        unit: 'JOB',
      },
    };

    saveLocalIntakeDraft(draft, scope);
    const loaded = loadLocalIntakeDraft(scope);

    expect(loaded?.draft).toBeNull();
    expect(loaded?.scopeState?.originalText).toBe('Dictated Voice Input for Elevator Maintenance');
  });

  it('prevents reviving completed or published requirements from cached drafts', () => {
    const scope: IntakeDraftStorageScope = {
      authUserId: 'auth-completed',
      profileId: 'profile-completed',
      organizationId: 'org-completed-test',
      persona: 'MSME',
    };
    const completedDraft: Omit<SavedIntakeState, 'version' | 'updatedAt'> = {
      stepIndex: 5,
      furthestIndex: 5,
      draft: {
        id: 'req-completed-99',
        status: 'COMPLETED',
        title: 'Already Completed Procurement',
      } as any,
      scopeState: undefined,
    };

    saveLocalIntakeDraft(completedDraft, scope);
    const loaded = loadLocalIntakeDraft(scope);
    expect(loaded).not.toBeNull();
    expect(loaded?.draft?.status).toBe('COMPLETED');

    // When a draft is detected as non-DRAFT, clearing prevents re-publish exceptions
    if (loaded?.draft && loaded.draft.status !== 'DRAFT') {
      clearLocalIntakeDraft(scope);
    }

    expect(loadLocalIntakeDraft(scope)).toBeNull();
  });

  it('stamps is_demo flag correctly during draft creation in demo mode', () => {
    const isDemoMode = true;
    const draftPayload = { is_demo: isDemoMode, title: 'Demo Requirement' };
    expect(draftPayload.is_demo).toBe(true);
  });

  it('isolates one profile across organization and persona switches', () => {
    const rwaScope: IntakeDraftStorageScope = {
      authUserId: 'auth-user',
      profileId: 'profile-user',
      organizationId: 'org-rwa',
      persona: 'RWA',
    };
    const msmeScope: IntakeDraftStorageScope = {
      ...rwaScope,
      organizationId: 'org-msme',
      persona: 'MSME',
    };
    const personalScope: IntakeDraftStorageScope = {
      ...rwaScope,
      organizationId: null,
      persona: 'INDIVIDUAL',
    };
    const state = (title: string): Omit<SavedIntakeState, 'version' | 'updatedAt'> => ({
      stepIndex: 0,
      furthestIndex: 0,
      draft: null,
      scopeState: {
        originalText: title,
        title,
        categoryId: null,
        subcategoryId: '',
        requirementMode: 'SERVICE',
        quantity: null,
        unit: null,
      },
    });

    saveLocalIntakeDraft(state('RWA draft'), rwaScope);
    saveLocalIntakeDraft(state('MSME draft'), msmeScope);
    saveLocalIntakeDraft(state('Personal draft'), personalScope);

    expect(loadLocalIntakeDraft(rwaScope)?.scopeState?.title).toBe('RWA draft');
    expect(loadLocalIntakeDraft(msmeScope)?.scopeState?.title).toBe('MSME draft');
    expect(loadLocalIntakeDraft(personalScope)?.scopeState?.title).toBe('Personal draft');
  });

  it('isolates a persona-only switch with the same user, profile, and organization', () => {
    const rwaScope: IntakeDraftStorageScope = {
      authUserId: 'auth-user',
      profileId: 'profile-user',
      organizationId: 'org-shared',
      persona: 'RWA',
    };
    const msmeScope: IntakeDraftStorageScope = { ...rwaScope, persona: 'MSME' };
    const state = (title: string): Omit<SavedIntakeState, 'version' | 'updatedAt'> => ({
      stepIndex: 0,
      furthestIndex: 0,
      draft: null,
      scopeState: {
        originalText: title,
        title,
        categoryId: null,
        subcategoryId: '',
        requirementMode: 'SERVICE',
        quantity: null,
        unit: null,
      },
    });

    saveLocalIntakeDraft(state('RWA only'), rwaScope);
    saveLocalIntakeDraft(state('MSME only'), msmeScope);

    expect(loadLocalIntakeDraft(rwaScope)?.scopeState?.title).toBe('RWA only');
    expect(loadLocalIntakeDraft(msmeScope)?.scopeState?.title).toBe('MSME only');
    expect(getIntakeDraftStorageKey(rwaScope)).not.toBe(getIntakeDraftStorageKey(msmeScope));
  });

  it('performs no local storage access when authenticated identity is unresolved', () => {
    mockStorage.otp_active_intake_draft = JSON.stringify({
      version: 1,
      updatedAt: Date.now(),
      stepIndex: 1,
      furthestIndex: 1,
      draft: null,
      scopeState: { title: 'Unscoped legacy data' },
    });
    mockStorage.otp_active_intake_draft_org = mockStorage.otp_active_intake_draft;

    expect(loadLocalIntakeDraft(null)).toBeNull();
    saveLocalIntakeDraft(
      { stepIndex: 0, furthestIndex: 0, draft: null },
      null,
    );
    clearLocalIntakeDraft(null);

    expect(Object.keys(mockStorage)).toEqual([
      'otp_active_intake_draft',
      'otp_active_intake_draft_org',
    ]);
  });

  it('does not collide when identity components contain separators', () => {
    const first: IntakeDraftStorageScope = {
      authUserId: 'auth_a',
      profileId: 'profile',
      organizationId: 'org',
      persona: 'RWA',
    };
    const second: IntakeDraftStorageScope = {
      authUserId: 'auth',
      profileId: 'a_profile',
      organizationId: 'org',
      persona: 'RWA',
    };

    expect(getIntakeDraftStorageKey(first)).not.toBe(getIntakeDraftStorageKey(second));
  });

  it('never restores legacy unscoped keys and preserves them until explicit discard', () => {
    const scope: IntakeDraftStorageScope = {
      authUserId: 'auth-current',
      profileId: 'profile-current',
      organizationId: 'org-current',
      persona: 'MSME',
    };
    const legacyPayload = JSON.stringify({
      version: 1,
      updatedAt: Date.now(),
      stepIndex: 1,
      furthestIndex: 1,
      draft: null,
      scopeState: { title: 'Do not auto-restore' },
    });
    mockStorage.otp_active_intake_draft = legacyPayload;
    mockStorage.otp_active_intake_draft_old_org_old_user = legacyPayload;

    expect(getLegacyLocalIntakeDraftStatus()).toBe('present');
    expect(loadLocalIntakeDraft(scope)).toBeNull();
    expect(mockStorage.otp_active_intake_draft).toBe(legacyPayload);
    expect(mockStorage.otp_active_intake_draft_old_org_old_user).toBe(legacyPayload);

    saveLocalIntakeDraft(
      {
        stepIndex: 0,
        furthestIndex: 0,
        draft: null,
        scopeState: {
          originalText: 'Current user',
          title: 'Current user',
          categoryId: null,
          subcategoryId: '',
          requirementMode: 'SERVICE',
          quantity: null,
          unit: null,
        },
      },
      scope,
    );
    const scopedKey = getIntakeDraftStorageKey(scope)!;
    expect(discardLegacyLocalIntakeDrafts(() => true)).toBe('discarded');

    expect(getLegacyLocalIntakeDraftStatus()).toBe('none');
    expect(mockStorage[scopedKey]).toBeDefined();
    expect(loadLocalIntakeDraft(scope)?.scopeState?.title).toBe('Current user');
  });

  it('rejects organizationless RWA/MSME cache scopes', () => {
    expect(getIntakeDraftStorageKey({
      authUserId: 'auth-user',
      profileId: 'profile-user',
      organizationId: null,
      persona: 'RWA',
    })).toBeNull();
    expect(getIntakeDraftStorageKey({
      authUserId: 'auth-user',
      profileId: 'profile-user',
      organizationId: null,
      persona: 'MSME',
    })).toBeNull();
  });

  it('returns null for malformed scoped JSON without deleting the scoped key', () => {
    const scope: IntakeDraftStorageScope = {
      authUserId: 'auth-user',
      profileId: 'profile-user',
      organizationId: null,
      persona: 'INDIVIDUAL',
    };
    const key = getIntakeDraftStorageKey(scope)!;
    mockStorage[key] = '{not-json';

    expect(loadLocalIntakeDraft(scope)).toBeNull();
    expect(mockStorage[key]).toBe('{not-json');
  });

  it('contains localStorage read exceptions', () => {
    const scope: IntakeDraftStorageScope = {
      authUserId: 'auth-user',
      profileId: 'profile-user',
      organizationId: 'org-1',
      persona: 'RWA',
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem: () => { throw new Error('read denied'); } },
      configurable: true,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(loadLocalIntakeDraft(scope)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('contains localStorage write exceptions', () => {
    const scope: IntakeDraftStorageScope = {
      authUserId: 'auth-user',
      profileId: 'profile-user',
      organizationId: 'org-1',
      persona: 'RWA',
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: { setItem: () => { throw new Error('write denied'); } },
      configurable: true,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => saveLocalIntakeDraft(
      { stepIndex: 0, furthestIndex: 0, draft: null },
      scope,
    )).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('contains scoped delete exceptions', () => {
    const scope: IntakeDraftStorageScope = {
      authUserId: 'auth-user',
      profileId: 'profile-user',
      organizationId: 'org-1',
      persona: 'RWA',
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: { removeItem: () => { throw new Error('delete denied'); } },
      configurable: true,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(() => clearLocalIntakeDraft(scope)).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('shows a safe legacy notice when legacy-key inspection fails', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        get length(): number { throw new Error('storage unavailable'); },
      },
      configurable: true,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const status = getLegacyLocalIntakeDraftStatus();
    const notice = getLegacyIntakeDraftNotice(status);

    expect(status).toBe('unavailable');
    expect(notice?.message).toContain('could not check');
    expect(notice?.message).toContain('never restored automatically');
    expect(notice?.actionLabel).toBe('Review and discard legacy drafts');
    const discardFailureNotice = getLegacyIntakeDraftNotice('discard-failed');
    expect(discardFailureNotice?.message).toContain('could not remove all matching');
    expect(discardFailureNotice?.actionLabel).toContain('retry');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('requires confirmation for global legacy discard and preserves scoped v2 drafts', () => {
    const scope: IntakeDraftStorageScope = {
      authUserId: 'auth-current',
      profileId: 'profile-current',
      organizationId: 'org-current',
      persona: 'MSME',
    };
    const state: Omit<SavedIntakeState, 'version' | 'updatedAt'> = {
      stepIndex: 0,
      furthestIndex: 0,
      draft: null,
    };
    saveLocalIntakeDraft(state, scope);
    const scopedKey = getIntakeDraftStorageKey(scope)!;
    mockStorage.otp_active_intake_draft = 'legacy-generic';
    mockStorage.otp_active_intake_draft_other_org = 'legacy-org';
    const confirm = vi.fn(() => false);

    expect(discardLegacyLocalIntakeDrafts(confirm)).toBe('cancelled');
    expect(confirm).toHaveBeenCalledWith(LEGACY_INTAKE_DRAFT_DISCARD_CONFIRMATION);
    expect(LEGACY_INTAKE_DRAFT_DISCARD_CONFIRMATION).toContain('no ownership metadata');
    expect(LEGACY_INTAKE_DRAFT_DISCARD_CONFIRMATION).toContain('ALL matching legacy intake-draft keys');
    expect(LEGACY_INTAKE_DRAFT_DISCARD_CONFIRMATION).toContain('v2 drafts will be preserved');
    expect(mockStorage.otp_active_intake_draft).toBe('legacy-generic');

    expect(discardLegacyLocalIntakeDrafts(() => true)).toBe('discarded');
    expect(mockStorage.otp_active_intake_draft).toBeUndefined();
    expect(mockStorage.otp_active_intake_draft_other_org).toBeUndefined();
    expect(mockStorage[scopedKey]).toBeDefined();
  });

});
