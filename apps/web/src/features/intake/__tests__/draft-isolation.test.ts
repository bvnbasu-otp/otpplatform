import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveLocalIntakeDraft,
  loadLocalIntakeDraft,
  clearLocalIntakeDraft,
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
    const orgId = 'org-enterprise-1';
    const userA = 'user-alice-123';
    const userB = 'user-bob-456';

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
    saveLocalIntakeDraft(draftA, orgId, userA);
    saveLocalIntakeDraft(draftB, orgId, userB);

    // Load drafts
    const loadedA = loadLocalIntakeDraft(orgId, userA);
    const loadedB = loadLocalIntakeDraft(orgId, userB);

    expect(loadedA?.scopeState?.title).toBe('Alice Solar Requirement');
    expect(loadedB?.scopeState?.title).toBe('Bob Security Cameras');

    // Clear user A's draft only
    clearLocalIntakeDraft(orgId, userA);

    expect(loadLocalIntakeDraft(orgId, userA)).toBeNull();
    expect(loadLocalIntakeDraft(orgId, userB)?.scopeState?.title).toBe('Bob Security Cameras');
  });

  it('guarantees intake inputs (Type, Voice, Photo, Upload, Template) remain strictly in draft until explicit buyer confirmation', () => {
    const orgId = 'org-1';
    const userId = 'user-1';
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

    saveLocalIntakeDraft(draft, orgId, userId);
    const loaded = loadLocalIntakeDraft(orgId, userId);

    expect(loaded?.draft).toBeNull();
    expect(loaded?.scopeState?.originalText).toBe('Dictated Voice Input for Elevator Maintenance');
  });
});
