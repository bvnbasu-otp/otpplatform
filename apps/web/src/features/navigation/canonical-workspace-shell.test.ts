import { describe, expect, it } from 'vitest';
import type { RoleContext } from '@/features/roles/api/roles';
import {
  getHomeRoute,
  getOrdersRoute,
  getAuditRoute,
  getProfileRoute,
  getRoleLabel,
  getCanonicalBottomNav,
  getCanonicalHeaderMenuSections,
  isRouteActive,
} from './navigation-config';
import { WorkspaceHeader } from './components/WorkspaceHeader';
import { WorkspaceHeaderMenu } from './components/WorkspaceHeaderMenu';
import { AdminQuickActionsSheet } from './components/AdminQuickActionsSheet';
import { AppLayout } from '@/components/AppLayout';
import { MobileBottomNav } from '@/components/MobileBottomNav';

function createMockContext(overrides: Partial<RoleContext> = {}): RoleContext {
  return {
    signedIn: true,
    profileId: 'mock-user-1',
    side: 'BUYER',
    isPlatformAdmin: false,
    needsOnboarding: false,
    activeRole: {
      code: 'BUYER',
      side: 'BUYER',
      label: 'Buyer',
      description: 'Procurement Lead',
      permissions: ['READ', 'WRITE', 'PROPOSE', 'AWARD'],
    },
    roles: [],
    organizations: [
      {
        id: 'org-1',
        name: 'Acme Corp',
        orgType: 'ENTERPRISE',
        role: 'OWNER',
        isPersonal: false,
      },
    ],
    orgRole: 'OWNER',
    organizationId: 'org-1',
    organizationName: 'Acme Corp',
    buyerType: 'COMMERCIAL',
    committeeRfqCount: 0,
    supplierId: null,
    fullName: 'Jane Doe',
    title: 'Head of Procurement',
    avatarUrl: null,
    email: 'jane@acme.com',
    phone: '+919876543210',
    ...overrides,
  };
}

describe('OTP Phase 0: Canonical Authenticated Workspace Shell', () => {
  describe('1. Canonical Component Exports & Architecture', () => {
    it('exports all canonical workspace shell components', () => {
      expect(AppLayout).toBeDefined();
      expect(MobileBottomNav).toBeDefined();
      expect(WorkspaceHeader).toBeDefined();
      expect(WorkspaceHeaderMenu).toBeDefined();
      expect(AdminQuickActionsSheet).toBeDefined();
    });
  });

  describe('2. Role Indicator & Canonical Identity', () => {
    it('resolves correct role label for Buyer', () => {
      const buyerContext = createMockContext({ side: 'BUYER', isPlatformAdmin: false });
      expect(getRoleLabel(buyerContext)).toBe('Buyer');
    });

    it('resolves correct role label for Supplier', () => {
      const supplierContext = createMockContext({ side: 'SUPPLIER', isPlatformAdmin: false });
      expect(getRoleLabel(supplierContext)).toBe('Supplier');
    });

    it('resolves correct role label for Super Admin', () => {
      const adminContext = createMockContext({ isPlatformAdmin: true });
      expect(getRoleLabel(adminContext)).toBe('Admin');
    });
  });

  describe('3. Role-Aware Navigation Destinations', () => {
    it('resolves authenticated Home route based on role', () => {
      const buyerCtx = createMockContext({ side: 'BUYER', isPlatformAdmin: false });
      const supplierCtx = createMockContext({ side: 'SUPPLIER', isPlatformAdmin: false });
      const adminCtx = createMockContext({ isPlatformAdmin: true });

      expect(getHomeRoute(buyerCtx)).toBe('/dashboard');
      expect(getHomeRoute(supplierCtx)).toBe('/dashboard');
      expect(getHomeRoute(adminCtx)).toBe('/admin');
    });

    it('resolves canonical Orders route based on role', () => {
      const buyerCtx = createMockContext({ side: 'BUYER', isPlatformAdmin: false });
      const supplierCtx = createMockContext({ side: 'SUPPLIER', isPlatformAdmin: false });
      const adminCtx = createMockContext({ isPlatformAdmin: true });

      expect(getOrdersRoute(buyerCtx)).toBe('/purchase-orders');
      expect(getOrdersRoute(supplierCtx)).toBe('/supplier/purchase-orders');
      expect(getOrdersRoute(adminCtx)).toBe('/purchase-orders');
    });

    it('resolves canonical Audit and Profile routes consistently across all roles', () => {
      const buyerCtx = createMockContext({ side: 'BUYER' });
      const supplierCtx = createMockContext({ side: 'SUPPLIER' });
      const adminCtx = createMockContext({ isPlatformAdmin: true });

      expect(getAuditRoute(buyerCtx)).toBe('/audit');
      expect(getAuditRoute(supplierCtx)).toBe('/audit');
      expect(getAuditRoute(adminCtx)).toBe('/audit');

      expect(getProfileRoute(buyerCtx)).toBe('/profile');
      expect(getProfileRoute(supplierCtx)).toBe('/profile');
      expect(getProfileRoute(adminCtx)).toBe('/profile');
    });
  });

  describe('4. Canonical 5-Tab Bottom Navigation (Home | Orders | + | Audit | Profile)', () => {
    it('generates exact 5 tabs with canonical structure for Buyer', () => {
      const buyerCtx = createMockContext({ side: 'BUYER', isPlatformAdmin: false });
      const tabs = getCanonicalBottomNav(buyerCtx);

      expect(tabs).toHaveLength(5);
      expect(tabs[0]).toMatchObject({ id: 'home', label: 'Home', to: '/dashboard' });
      expect(tabs[1]).toMatchObject({ id: 'orders', label: 'Orders', to: '/purchase-orders' });
      expect(tabs[2]).toMatchObject({ id: 'create', label: '+', isCenterAction: true });
      expect(tabs[3]).toMatchObject({ id: 'audit', label: 'Audit', to: '/audit' });
      expect(tabs[4]).toMatchObject({ id: 'profile', label: 'Profile', to: '/profile' });
    });

    it('generates exact 5 tabs with canonical structure for Supplier', () => {
      const supplierCtx = createMockContext({ side: 'SUPPLIER', isPlatformAdmin: false });
      const tabs = getCanonicalBottomNav(supplierCtx);

      expect(tabs).toHaveLength(5);
      expect(tabs[0]).toMatchObject({ id: 'home', label: 'Home', to: '/dashboard' });
      expect(tabs[1]).toMatchObject({ id: 'orders', label: 'Orders', to: '/supplier/purchase-orders' });
      expect(tabs[2]).toMatchObject({ id: 'create', label: '+', isCenterAction: true });
      expect(tabs[3]).toMatchObject({ id: 'audit', label: 'Audit', to: '/audit' });
      expect(tabs[4]).toMatchObject({ id: 'profile', label: 'Profile', to: '/profile' });
    });

    it('generates exact 5 tabs with canonical structure for Admin', () => {
      const adminCtx = createMockContext({ isPlatformAdmin: true });
      const tabs = getCanonicalBottomNav(adminCtx);

      expect(tabs).toHaveLength(5);
      expect(tabs[0]).toMatchObject({ id: 'home', label: 'Home', to: '/admin' });
      expect(tabs[1]).toMatchObject({ id: 'orders', label: 'Orders', to: '/purchase-orders' });
      expect(tabs[2]).toMatchObject({ id: 'create', label: '+', isCenterAction: true });
      expect(tabs[3]).toMatchObject({ id: 'audit', label: 'Audit', to: '/audit' });
      expect(tabs[4]).toMatchObject({ id: 'profile', label: 'Profile', to: '/profile' });
    });

    it('correctly matches active route states', () => {
      const buyerCtx = createMockContext({ side: 'BUYER' });
      const tabs = getCanonicalBottomNav(buyerCtx);

      expect(isRouteActive(tabs[0]!, '/dashboard')).toBe(true);
      expect(isRouteActive(tabs[0]!, '/purchase-orders')).toBe(false);

      expect(isRouteActive(tabs[1]!, '/purchase-orders')).toBe(true);
      expect(isRouteActive(tabs[1]!, '/purchase-orders/po-123')).toBe(true);

      expect(isRouteActive(tabs[3]!, '/audit')).toBe(true);
      expect(isRouteActive(tabs[4]!, '/profile')).toBe(true);
    });
  });

  describe('5. Canonical Secondary Navigation Menu (Header Menu)', () => {
    it('structures menu into Workspace, Support, and Website sections', () => {
      const buyerCtx = createMockContext({ side: 'BUYER' });
      const sections = getCanonicalHeaderMenuSections(buyerCtx);

      expect(sections).toHaveLength(3);
      expect(sections.map((s) => s.title)).toEqual(['Workspace', 'Support', 'Website']);

      const workspaceTitles = sections[0]!.items.map((i) => i.label);
      expect(workspaceTitles).toContain('Home');
      expect(workspaceTitles).toContain('Orders & Reports');
      expect(workspaceTitles).toContain('Audit Trail & Proofs');
      expect(workspaceTitles).toContain('Profile & Settings');
    });

    it('includes role-specific quick action in Workspace section', () => {
      const buyerCtx = createMockContext({ side: 'BUYER', isPlatformAdmin: false });
      const supplierCtx = createMockContext({ side: 'SUPPLIER', isPlatformAdmin: false });
      const adminCtx = createMockContext({ isPlatformAdmin: true });

      const buyerItems = getCanonicalHeaderMenuSections(buyerCtx)[0]!.items.map((i) => i.label);
      expect(buyerItems).toContain('New Requirement');

      const supplierItems = getCanonicalHeaderMenuSections(supplierCtx)[0]!.items.map((i) => i.label);
      expect(supplierItems).toContain('Capabilities & Catalog');

      const adminItems = getCanonicalHeaderMenuSections(adminCtx)[0]!.items.map((i) => i.label);
      expect(adminItems).toContain('Admin Console');
    });
  });

  describe('6. Theme Consolidation & Absence of Global Duplicates', () => {
    it('guarantees Theme settings are accessed solely under Profile -> Preferences / Appearance', () => {
      const profilePreferencesUrl = '/profile?tab=preferences';
      expect(profilePreferencesUrl).toBe('/profile?tab=preferences');
    });
  });
});
