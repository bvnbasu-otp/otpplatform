import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MaintenanceStatusContextType } from './MaintenanceContext';
import {
  captureUnsavedSession,
  getRetainedSession,
  clearRetainedSession,
  restoreSessionInputs,
  MAINTENANCE_SESSION_KEY,
  type RetainedSessionData,
} from './session-retention';

describe('Maintenance Mode Architecture & Guards', () => {
  it('correctly models maintenance payload structure', () => {
    const activeMaint: MaintenanceStatusContextType = {
      isMaintenanceMode: true,
      maintenanceMessage: 'Regular scheduled platform maintenance in progress.',
      checkedAt: '2026-09-07T07:18:34.176Z',
      isLoading: false,
      refetch: async () => {},
    };

    expect(activeMaint.isMaintenanceMode).toBe(true);
    expect(activeMaint.maintenanceMessage).toContain('maintenance in progress');
    expect(activeMaint.isLoading).toBe(false);
  });

  it('computes correct redirect path for non-admins during maintenance', () => {
    const computeMaintenanceRedirect = (pathname: string, search: string, isPlatformAdmin: boolean, isMaint: boolean) => {
      if (!isMaint || isPlatformAdmin) return null;
      const searchParams = new URLSearchParams(search);
      const isAdminLogin = pathname === '/login' && searchParams.get('admin') === 'true';
      if (isAdminLogin) return null;

      const currentPath = pathname + search;
      return currentPath && currentPath !== '/maintenance' && currentPath !== '/'
        ? `/maintenance?returnUrl=${encodeURIComponent(currentPath)}`
        : '/maintenance';
    };

    // Platform admins should not be redirected
    expect(computeMaintenanceRedirect('/admin', '?tab=actions', true, true)).toBeNull();
    expect(computeMaintenanceRedirect('/dashboard', '', true, true)).toBeNull();

    // Emergency admin sign-in should not be redirected
    expect(computeMaintenanceRedirect('/login', '?admin=true', false, true)).toBeNull();

    // Regular users and visitors should be redirected directly to maintenance with returnUrl
    expect(computeMaintenanceRedirect('/login', '', false, true)).toBe('/maintenance?returnUrl=%2Flogin');
    expect(computeMaintenanceRedirect('/dashboard', '', false, true)).toBe('/maintenance?returnUrl=%2Fdashboard');
    expect(computeMaintenanceRedirect('/rfq/123/quotes', '?sort=price', false, true)).toBe('/maintenance?returnUrl=%2Frfq%2F123%2Fquotes%3Fsort%3Dprice');
    expect(computeMaintenanceRedirect('/signup', '', false, true)).toBe('/maintenance?returnUrl=%2Fsignup');

    // Root path redirects directly to /maintenance without redundant returnUrl
    expect(computeMaintenanceRedirect('/', '', false, true)).toBe('/maintenance');

    // When maintenance is off, no redirection occurs
    expect(computeMaintenanceRedirect('/dashboard', '', false, false)).toBeNull();
    expect(computeMaintenanceRedirect('/login', '', false, false)).toBeNull();
  });

  it('determines correct banner action target for super admins vs general visitors', () => {
    const getBannerAction = (isSuperAdmin: boolean, currentPath: string) => {
      if (isSuperAdmin) {
        return {
          label: 'Admin Console',
          to: '/admin?tab=actions',
          badge: '🛡️ Super Admin Bypass Active',
        };
      }
      return {
        label: 'View Status & Games',
        to: currentPath && currentPath !== '/'
          ? `/maintenance?returnUrl=${encodeURIComponent(currentPath)}`
          : '/maintenance',
        badge: 'Demo & Staging Restricted',
      };
    };

    const adminAction = getBannerAction(true, '/');
    expect(adminAction.to).toBe('/admin?tab=actions');
    expect(adminAction.badge).toContain('Super Admin Bypass');

    const visitorAction = getBannerAction(false, '/pricing');
    expect(visitorAction.to).toBe('/maintenance?returnUrl=%2Fpricing');
    expect(visitorAction.badge).toContain('Demo & Staging Restricted');
  });

  describe('Unsaved Transaction Session Retention', () => {
    // Mock sessionStorage
    const storageMap: Record<string, string> = {};
    const mockSessionStorage = {
      getItem: (k: string) => storageMap[k] || null,
      setItem: (k: string, v: string) => { storageMap[k] = v; },
      removeItem: (k: string) => { delete storageMap[k]; },
      clear: () => {
        Object.keys(storageMap).forEach((k) => delete storageMap[k]);
      },
    };

    beforeEach(() => {
      mockSessionStorage.clear();
      vi.stubGlobal('sessionStorage', mockSessionStorage);
      vi.stubGlobal('window', { sessionStorage: mockSessionStorage });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('safely serializes and retrieves in-progress session data', () => {
      const mockSession: RetainedSessionData = {
        path: '/intake',
        title: 'Requirement Intake',
        timestamp: new Date().toISOString(),
        promptDraft: 'Need 50 ergonomic chairs and 10 workstations',
        fields: [
          { name: 'category', value: 'FURNITURE', type: 'select' },
          { name: 'budget', value: '250000', type: 'input' },
        ],
        fieldCount: 3,
      };

      mockSessionStorage.setItem(MAINTENANCE_SESSION_KEY, JSON.stringify(mockSession));

      const retrieved = getRetainedSession();
      expect(retrieved).not.toBeNull();
      expect(retrieved?.path).toBe('/intake');
      expect(retrieved?.promptDraft).toContain('50 ergonomic chairs');
      expect(retrieved?.fieldCount).toBe(3);
      expect(retrieved?.fields).toHaveLength(2);

      clearRetainedSession();
      expect(getRetainedSession()).toBeNull();
    });

    it('does not capture session if path is /maintenance', () => {
      const res = captureUnsavedSession('/maintenance');
      expect(res).toBeNull();
    });
  });
});
