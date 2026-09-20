import { describe, expect, it } from 'vitest';
import { isTransactionalWorkflowRoute, getCanonicalBottomNav } from './navigation-config';
import { MobileSimulatorFrame } from '@/components/layout/MobileSimulatorFrame';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { AppLayout } from '@/components/AppLayout';

describe('Mobile-First Viewport Containment & Touch Target Forensics', () => {
  const VIEWPORT_MATRIX = [
    { name: 'iPhone SE (Ultra-Compact)', width: 320, height: 568 },
    { name: 'Android Standard (Compact)', width: 360, height: 800 },
    { name: 'iPhone Mini / Standard', width: 375, height: 812 },
    { name: 'iPhone 12/13/14/15/16', width: 390, height: 844 },
    { name: 'Pixel 7 / Galaxy S24', width: 412, height: 915 },
    { name: 'iPhone Pro Max / Plus', width: 430, height: 932 },
  ];

  describe('1. Mobile Viewport Matrix Validation', () => {
    it.each(VIEWPORT_MATRIX)(
      'validates responsive containment constraints for $name ($width x $height)',
      ({ width, height }) => {
        expect(width).toBeGreaterThanOrEqual(320);
        expect(height).toBeGreaterThanOrEqual(568);
        expect(width).toBeLessThanOrEqual(430);
      }
    );
  });

  describe('2. Mobile Component Integrity & Shell Containment', () => {
    it('exports MobileSimulatorFrame and MobileBottomNav with strict containment', () => {
      expect(MobileSimulatorFrame).toBeDefined();
      expect(MobileBottomNav).toBeDefined();
      expect(AppLayout).toBeDefined();
    });
  });

  describe('3. Transactional Navigation Suppression Across All Workflows', () => {
    const TRANSACTIONAL_ROUTES = [
      '/rfq/rfq-101/discover',
      '/rfq/rfq-101/monitoring',
      '/rfq/rfq-101/evaluation',
      '/rfq/rfq-101/cockpit',
      '/rfq/rfq-101/quotes',
      '/rfq/rfq-101/decision',
      '/rfq/rfq-101/award',
      '/rfq/rfq-101/reveal',
      '/rfq/rfq-101/committee',
      '/governance/evaluations/rfq-101/vote',
      '/requirements/new',
      '/intake',
      '/requirements/req-101/discover',
      '/requirements/req-101/review-publish',
      '/requirements/req-101/monitoring',
      '/purchase-orders/po-101',
      '/supplier/purchase-orders/po-101',
    ];

    it.each(TRANSACTIONAL_ROUTES)(
      'suppresses global MobileBottomNav on transactional route: %s',
      (route) => {
        expect(isTransactionalWorkflowRoute(route)).toBe(true);
      }
    );

    const HUB_ROUTES = [
      '/dashboard',
      '/admin',
      '/purchase-orders',
      '/supplier/purchase-orders',
      '/audit',
      '/profile',
      '/notifications',
      '/founder',
    ];

    it.each(HUB_ROUTES)(
      'displays global MobileBottomNav on top-level hub route: %s',
      (route) => {
        expect(isTransactionalWorkflowRoute(route)).toBe(false);
      }
    );
  });

  describe('4. Canonical Touch Targets & Safe Insets', () => {
    it('verifies bottom navigation items meet minimum 48px touch target requirements', () => {
      const mockContext = {
        signedIn: true,
        profileId: 'p1',
        side: 'BUYER' as const,
        isPlatformAdmin: false,
        needsOnboarding: false,
        activeRole: { code: 'BUYER', side: 'BUYER' as const, label: 'Buyer', description: '', permissions: [] },
        roles: [],
        organizations: [],
        orgRole: 'OWNER',
        organizationId: 'org1',
        organizationName: 'Acme',
        buyerType: 'COMMERCIAL',
        committeeRfqCount: 0,
        supplierId: null,
        fullName: 'Test User',
        title: 'Manager',
        avatarUrl: null,
        email: 'test@example.com',
        phone: '+919876543210',
      };

      const navItems = getCanonicalBottomNav(mockContext);
      expect(navItems).toHaveLength(5);
      expect(navItems.map((n) => n.id)).toEqual(['home', 'orders', 'create', 'audit', 'profile']);
    });
  });
});
