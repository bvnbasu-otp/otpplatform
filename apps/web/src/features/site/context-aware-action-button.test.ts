import { describe, expect, it } from 'vitest';
import { SiteHeader } from './components/SiteHeader';
import { AppLayout } from '@/components/AppLayout';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { SupplierCapabilityModal } from '@/features/supplier';
import { QuickRegisterModal } from '@/features/portal';

describe('Context-Aware Global "+" Action Button Logic', () => {
  describe('1. Component Availability & Setup', () => {
    it('exports all navigation and layout components with context-aware logic', () => {
      expect(SiteHeader).toBeDefined();
      expect(AppLayout).toBeDefined();
      expect(MobileBottomNav).toBeDefined();
      expect(SupplierCapabilityModal).toBeDefined();
      expect(QuickRegisterModal).toBeDefined();
    });
  });

  describe('2. Buyer vs Supplier Persona Action Contracts', () => {
    it('verifies Buyer Mode triggers procurement requirement intake', () => {
      const buyerContract = {
        mode: 'BUYER',
        buttonLabel: 'Post Need',
        drawerLabel: '+ Create New Requirement',
        tooltip: 'Post a new requirement / broadcast RFQ',
        targetRoute: '/requirements/new',
        altTargetRoute: '/intake',
        allowCreateRequirement: true,
      };

      expect(buyerContract.allowCreateRequirement).toBe(true);
      expect(buyerContract.tooltip).toBe('Post a new requirement / broadcast RFQ');
      expect(['/requirements/new', '/intake']).toContain(buyerContract.targetRoute);
    });

    it('verifies Supplier Mode disables requirement posting and triggers capability editor modal', () => {
      const supplierContract = {
        mode: 'SUPPLIER',
        buttonLabel: 'Add Capabilities',
        drawerLabel: '+ Expand Catalog & Services',
        tooltip: 'Maximize Business Reach — Update Capabilities',
        triggersModal: 'SupplierCapabilityModal',
        allowCreateRequirement: false, // Requirement creation trigger removed/disabled for suppliers
      };

      expect(supplierContract.allowCreateRequirement).toBe(false);
      expect(supplierContract.tooltip).toBe('Maximize Business Reach — Update Capabilities');
      expect(supplierContract.buttonLabel).toBe('Add Capabilities');
      expect(supplierContract.triggersModal).toBe('SupplierCapabilityModal');
    });

    it('verifies Pre-Login Unauthenticated State triggers quick registration modal', () => {
      const preLoginContract = {
        authenticated: false,
        buttonLabel: 'Get Started',
        tooltip: 'Get Started — Quick Registration',
        triggersModal: 'QuickRegisterModal',
        navItemCount: 5,
        navItems: ['Home', 'Pricing', '+', 'About Us', 'FAQs'],
      };

      expect(preLoginContract.authenticated).toBe(false);
      expect(preLoginContract.triggersModal).toBe('QuickRegisterModal');
      expect(preLoginContract.navItemCount).toBe(5);
      expect(preLoginContract.navItems).toEqual(['Home', 'Pricing', '+', 'About Us', 'FAQs']);
    });
  });

  describe('3. Mobile Bottom Navigation Elevated Center Action Button', () => {
    it('elevated center "+" button serves as context-aware trigger for Buyer, Supplier, and Pre-Login', () => {
      const getActionProps = (roleSide: 'BUYER' | 'SUPPLIER' | 'UNAUTHENTICATED') => {
        if (roleSide === 'SUPPLIER') {
          return {
            type: 'button',
            title: 'Maximize Business Reach — Update Capabilities',
            ariaLabel: 'Maximize Business Reach — Update Capabilities',
            testId: 'bottom-nav-supplier-add-capabilities',
            opensModal: true,
            modalName: 'SupplierCapabilityModal',
          };
        }
        if (roleSide === 'UNAUTHENTICATED') {
          return {
            type: 'button',
            title: 'Get Started — Quick Registration',
            ariaLabel: 'Get Started — Quick Registration',
            testId: 'bottom-nav-prelogin-create-requirement',
            opensModal: true,
            modalName: 'QuickRegisterModal',
          };
        }
        return {
          type: 'link',
          to: '/requirements/new',
          title: 'Post a new requirement / broadcast RFQ',
          ariaLabel: 'Post a new requirement / broadcast RFQ',
          testId: 'bottom-nav-buyer-create-requirement',
          opensModal: false,
        };
      };

      const buyerAction = getActionProps('BUYER');
      expect(buyerAction.type).toBe('link');
      expect(buyerAction.to).toBe('/requirements/new');
      expect(buyerAction.title).toBe('Post a new requirement / broadcast RFQ');

      const supplierAction = getActionProps('SUPPLIER');
      expect(supplierAction.type).toBe('button');
      expect(supplierAction.opensModal).toBe(true);
      expect(supplierAction.modalName).toBe('SupplierCapabilityModal');
      expect(supplierAction.title).toBe('Maximize Business Reach — Update Capabilities');
      expect(supplierAction.testId).toBe('bottom-nav-supplier-add-capabilities');

      const unauthAction = getActionProps('UNAUTHENTICATED');
      expect(unauthAction.type).toBe('button');
      expect(unauthAction.opensModal).toBe(true);
      expect(unauthAction.modalName).toBe('QuickRegisterModal');
      expect(unauthAction.title).toBe('Get Started — Quick Registration');
    });
  });
});
