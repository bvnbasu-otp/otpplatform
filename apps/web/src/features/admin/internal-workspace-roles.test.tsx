import { readFileSync } from 'node:fs';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  canAccessRoleSwitcher,
  maskSensitiveData,
  INTERNAL_ROLE_CONFIGS,
  type InternalConsoleRoleCode,
} from './types/admin-navigation';

import { InternalRoleMascot } from './components/InternalRoleMascots';
import { InternalRoleSwitcherBar } from './components/InternalRoleSwitcherBar';
import { CeoFounderCommandCenter } from './components/CeoFounderCommandCenter';
import { AuditorConsoleView } from './components/AuditorConsoleView';
import { GeneralSupportConsoleView } from './components/GeneralSupportConsoleView';
import { OperationsConsoleView } from './components/OperationsConsoleView';
import { SalesMarketingConsoleView } from './components/SalesMarketingConsoleView';
import { LegalPrivacyConsoleView } from './components/LegalPrivacyConsoleView';
import type { LiveTransactionItem } from './types/admin';

describe('Executive & Internal Employee Workspace Architecture (X2O / OTP Next)', () => {
  describe('RBAC & Role Switcher Access Invariants (canAccessRoleSwitcher)', () => {
    it('authorizes bvnbasu@gmail.com unconditionally as Founder & Super Admin', () => {
      expect(canAccessRoleSwitcher(null, 'bvnbasu@gmail.com')).toBe(true);
      expect(canAccessRoleSwitcher({ isFounder: true }, 'bvnbasu@gmail.com')).toBe(true);
      expect(canAccessRoleSwitcher({ isPlatformAdmin: true }, 'BVNBASU@GMAIL.COM')).toBe(true);
    });

    it('authorizes bvnbasu@yahoo.com unconditionally as Founder & Super Admin', () => {
      expect(canAccessRoleSwitcher(null, 'bvnbasu@yahoo.com')).toBe(true);
      expect(canAccessRoleSwitcher({ isFounder: true }, 'bvnbasu@yahoo.com')).toBe(true);
      expect(canAccessRoleSwitcher({ isPlatformAdmin: true }, 'BVNBASU@YAHOO.COM')).toBe(true);
    });

    it('authorizes any account with isFounder = true', () => {
      expect(canAccessRoleSwitcher({ isFounder: true }, 'ceo@platform.test')).toBe(true);
    });

    it('authorizes platform admin with SUPER_ADMIN role', () => {
      expect(
        canAccessRoleSwitcher(
          { isPlatformAdmin: true, activeRole: { code: 'SUPER_ADMIN' } },
          'superadmin@otp.test'
        )
      ).toBe(true);
    });

    it('strictly denies all other internal employee roles from accessing the role switcher or impersonation', () => {
      const nonSuperAdminRoles: InternalConsoleRoleCode[] = [
        'GENERAL_SUPPORT',
        'OPERATIONS',
        'SALES_MARKETING',
        'LEGAL_PRIVACY',
        'AUDITOR',
      ];

      for (const roleCode of nonSuperAdminRoles) {
        const canSwitch = canAccessRoleSwitcher(
          { isPlatformAdmin: false, isFounder: false, activeRole: { code: roleCode } },
          `${roleCode.toLowerCase()}@otp.internal`
        );
        expect(canSwitch).toBe(false);
      }
    });

    it('strictly denies regular buyers and suppliers from accessing the role switcher', () => {
      expect(
        canAccessRoleSwitcher(
          { isPlatformAdmin: false, isFounder: false, activeRole: { code: 'RWA_PRESIDENT' } },
          'buyer@society.test'
        )
      ).toBe(false);

      expect(
        canAccessRoleSwitcher(
          { isPlatformAdmin: false, isFounder: false, activeRole: { code: 'SUPPLIER_ADMIN' } },
          'supplier@vendor.test'
        )
      ).toBe(false);
    });
  });

  describe('Internal Console Roles Configuration Matrix (INTERNAL_ROLE_CONFIGS)', () => {
    it('defines all 7 canonical internal roles with strict permissions', () => {
      const expectedRoles: InternalConsoleRoleCode[] = [
        'CEO_FOUNDER',
        'SUPER_ADMIN',
        'GENERAL_SUPPORT',
        'OPERATIONS',
        'SALES_MARKETING',
        'LEGAL_PRIVACY',
        'AUDITOR',
      ];

      for (const role of expectedRoles) {
        expect(INTERNAL_ROLE_CONFIGS[role]).toBeDefined();
        expect(INTERNAL_ROLE_CONFIGS[role].code).toBe(role);
        expect(INTERNAL_ROLE_CONFIGS[role].title).toBeTruthy();
        expect(INTERNAL_ROLE_CONFIGS[role].badge).toBeTruthy();
      }
    });

    it('restricts role switching capability strictly to CEO_FOUNDER and SUPER_ADMIN', () => {
      expect(INTERNAL_ROLE_CONFIGS.CEO_FOUNDER.canSwitchRoles).toBe(true);
      expect(INTERNAL_ROLE_CONFIGS.SUPER_ADMIN.canSwitchRoles).toBe(true);

      expect(INTERNAL_ROLE_CONFIGS.GENERAL_SUPPORT.canSwitchRoles).toBe(false);
      expect(INTERNAL_ROLE_CONFIGS.OPERATIONS.canSwitchRoles).toBe(false);
      expect(INTERNAL_ROLE_CONFIGS.SALES_MARKETING.canSwitchRoles).toBe(false);
      expect(INTERNAL_ROLE_CONFIGS.LEGAL_PRIVACY.canSwitchRoles).toBe(false);
      expect(INTERNAL_ROLE_CONFIGS.AUDITOR.canSwitchRoles).toBe(false);
    });

    it('configures canonical allowed tabs per internal role', () => {
      expect(INTERNAL_ROLE_CONFIGS.GENERAL_SUPPORT.allowedTabs).toEqual([
        'TICKETS',
        'BUYER_DEBUG',
        'SUPPLIER_DEBUG',
        'NOTIFICATIONS',
        'LOGS',
      ]);

      expect(INTERNAL_ROLE_CONFIGS.OPERATIONS.allowedTabs).toEqual([
        'HEALTH',
        'TESTS',
        'ACTIONS',
        'TERMINAL',
        'BACKUPS',
        'ANNOUNCEMENTS',
      ]);

      expect(INTERNAL_ROLE_CONFIGS.SALES_MARKETING.allowedTabs).toEqual([
        'SUPPLIER_NETWORK',
        'TAXONOMY',
        'APPROVALS',
        'STAFF_REFERRALS',
        'ORGS_SUPPLIERS',
        'WHATSAPP_CAMPAIGNS',
      ]);

      expect(INTERNAL_ROLE_CONFIGS.LEGAL_PRIVACY.allowedTabs).toEqual([
        'TICKETS',
        'LOGS',
        'APPROVALS',
      ]);

      expect(INTERNAL_ROLE_CONFIGS.AUDITOR.allowedTabs).toEqual([
        'TRANSACTIONS',
        'SELLER_ORDERS',
        'USERS',
        'ORGS_SUPPLIERS',
        'LOGS',
        'NOTIFICATIONS',
      ]);
    });
  });

  describe('Auditor Redaction & Data Masking Engine (maskSensitiveData)', () => {
    it('masks email addresses preserving only first char and domain', () => {
      const masked = maskSensitiveData('baskar@enterprise.com');
      expect(masked).toBe('b•••••@enterprise.com');
      expect(masked).not.toContain('baskar');
    });

    it('masks bank accounts, cards, and phone numbers showing only last 4 digits', () => {
      const maskedPhone = maskSensitiveData('+919876543210', 'phone');
      expect(maskedPhone).toBe('+91 ••••• ••210');

      const maskedBankAcc = maskSensitiveData('987654321098', 'bank');
      expect(maskedBankAcc).toBe('••••••••1098');
    });

    it('handles null, undefined, and empty string safely', () => {
      expect(maskSensitiveData(null)).toBe('—');
      expect(maskSensitiveData(undefined)).toBe('—');
      expect(maskSensitiveData('')).toBe('—');
    });
  });

  describe('Internal Role Mascot Avatars (InternalRoleMascots)', () => {
    it('renders vector illustrations for all 7 internal personas', () => {
      const roles: InternalConsoleRoleCode[] = [
        'CEO_FOUNDER',
        'SUPER_ADMIN',
        'GENERAL_SUPPORT',
        'OPERATIONS',
        'SALES_MARKETING',
        'LEGAL_PRIVACY',
        'AUDITOR',
      ];

      for (const role of roles) {
        const html = renderToStaticMarkup(
          React.createElement(InternalRoleMascot, { role, size: 'md' })
        );
        expect(html).toContain('<svg');
        expect(html).toContain('viewBox="0 0 160 120"');
      }
    });
  });

  describe('Internal Role Switcher & Persona Bar Component', () => {
    it('renders simulation dropdown and controls when canSwitch is true', () => {
      const onSelect = vi.fn();
      const html = renderToStaticMarkup(
        React.createElement(InternalRoleSwitcherBar, {
          currentRole: 'CEO_FOUNDER',
          onSelectRole: onSelect,
          canSwitch: true,
          isFounder: true,
          userName: 'Baskar Loganathan',
          userEmail: 'bvnbasu@gmail.com',
        })
      );

      expect(html).toContain('Baskar Loganathan');
      expect(html).toContain('bvnbasu@gmail.com');
      expect(html).toContain('Switch Role / View');
      expect(html).toContain('Console View Mode');
    });

    it('renders locked access banner and hides role dropdown when canSwitch is false', () => {
      const onSelect = vi.fn();
      const html = renderToStaticMarkup(
        React.createElement(InternalRoleSwitcherBar, {
          currentRole: 'GENERAL_SUPPORT',
          onSelectRole: onSelect,
          canSwitch: false,
          userName: 'Support Agent',
          userEmail: 'support@otp.internal',
        })
      );

      expect(html).toContain('Support Agent');
      expect(html).toContain('support@otp.internal');
      expect(html).toContain('Restricted to role-authorized functions');
      expect(html).not.toContain('Switch Role / View');
    });
  });

  describe('CEO & Founder Command Center View (CeoFounderCommandCenter)', () => {
    it('renders macro executive command center with GMV and 0.5% take rate telemetry', () => {
      const onNavigate = vi.fn();
      const onRefresh = vi.fn();

      const html = renderToStaticMarkup(
        React.createElement(CeoFounderCommandCenter, {
          health: null,
          transactions: [
            {
              requirement_id: 'tx-001',
              requirement_title: 'Submersible Pump 7.5 HP',
              requirement_type: 'PROJECT',
              requirement_status: 'QUOTING',
              requirement_created_at: new Date().toISOString(),
              organization_id: 'org-001',
              organization_name: 'Greenview Heights RWA',
              organization_type: 'RWA',
              po_id: 'po-001',
              po_number: 'PO-2026-001',
              po_status: 'ISSUED',
              po_amount: 125000,
              work_order_id: null,
              work_order_status: null,
              progress_percent: 0,
              quotes_count: 3,
              votes_count: 2,
              idle_hours: 1,
              quote_deadline: null,
            } as LiveTransactionItem,
          ],
          onNavigateTab: onNavigate,
          onRefresh: onRefresh,
          userEmail: 'bvnbasu@gmail.com',
        })
      );

      expect(html).toContain('CEO &amp; Founder Command Center');
      expect(html).toContain('Gross Merchandise Value');
      expect(html).toContain('Platform Take-Rate');
      expect(html).toContain('Supplier Network Engine (SNE) Geographic Expansion');
      expect(html).toContain('Hyperlocal');
    });
  });

  describe('Auditor Read-Only Console View (AuditorConsoleView)', () => {
    it('renders auditor read-only portal with sensitive data masking notice', () => {
      const onRefresh = vi.fn();
      const html = renderToStaticMarkup(
        React.createElement(AuditorConsoleView, {
          health: null,
          transactions: [],
          sellerOrders: [],
          onRefresh: onRefresh,
        })
      );

      expect(html).toContain('Compliance &amp; Audit Oversight Portal');
      expect(html).toContain('Independent Platform Auditor');
      expect(html).toContain('Sensitive Data Masking:');
      expect(html).toContain('Mutation Authority:');
    });
  });

  describe('Operations Console View (OperationsConsoleView)', () => {
    it('renders infrastructure health, regression tests, circuit breakers and announcements', () => {
      const onRefresh = vi.fn();
      const onExecute = vi.fn().mockResolvedValue(null);
      const onNavigate = vi.fn();

      const html = renderToStaticMarkup(
        React.createElement(OperationsConsoleView, {
          health: null,
          alerts: [],
          isLoadingHealth: false,
          onRefresh: onRefresh,
          onExecuteAction: onExecute,
          onNavigateTab: onNavigate,
        })
      );

      expect(html).toContain('SysOps, SecOps &amp; DBOps Console');
      expect(html).toContain('Platform Operations, Security &amp; Database Governance');
      expect(html).toContain('Sitewide Broadcast Announcements');
      expect(html).toContain('Service Breakers &amp; Restart');
    });
  });

  describe('General Support Console View (GeneralSupportConsoleView)', () => {
    it('renders ticket triage and buyer/seller troubleshooters', () => {
      const onRefresh = vi.fn();
      const onNavigate = vi.fn();

      const html = renderToStaticMarkup(
        React.createElement(GeneralSupportConsoleView, {
          health: null,
          alerts: [],
          onRefresh: onRefresh,
          onNavigateTab: onNavigate,
        })
      );

      expect(html).toContain('Support &amp; Diagnostics Desk');
      expect(html).toContain('General Customer Support &amp; Issue Resolution');
      expect(html).toContain('Buyer Intake Diagnostics');
      expect(html).toContain('Seller &amp; Quote Diagnostics');
    });
  });

  describe('Sales & Marketing Console View (SalesMarketingConsoleView)', () => {
    it('renders SNE pre-warm console, 17-category taxonomy, and referral ledger', () => {
      const onRefresh = vi.fn();
      const onNavigate = vi.fn();

      const html = renderToStaticMarkup(
        React.createElement(SalesMarketingConsoleView, {
          health: null,
          onRefresh: onRefresh,
          onNavigateTab: onNavigate,
        })
      );

      expect(html).toContain('Sales, Marketing &amp; SNE Engine');
      expect(html).toContain('Growth, Network Liquidity &amp; Taxonomy Architecture');
      expect(html).toContain('SNE Discovery &amp; Pre-Warm Console');
      expect(html).toContain('17-Category Taxonomy &amp; Clusters');
      expect(html).toContain('Staff Referral Ledger');
    });
  });

  describe('Legal & Privacy Console View (LegalPrivacyConsoleView)', () => {
    it('renders dispute arbitration desk, audit vault, and compliance review', () => {
      const onRefresh = vi.fn();
      const onNavigate = vi.fn();

      const html = renderToStaticMarkup(
        React.createElement(LegalPrivacyConsoleView, {
          health: null,
          onRefresh: onRefresh,
          onNavigateTab: onNavigate,
        })
      );

      expect(html).toContain('Legal, Privacy &amp; Compliance Vault');
      expect(html).toContain('Legal, Privacy, Compliance &amp; Dispute Arbitration');
      expect(html).toContain('Commercial Dispute Arbitration');
      expect(html).toContain('Immutable Cryptographic Audit Vault');
    });
  });

  describe('Internal Role Switcher & Persona Bar Elevated Layering', () => {
    it('elevates role switcher to z-50 with backdrop dismiss guard', () => {
      const onSelect = vi.fn();
      const html = renderToStaticMarkup(
        React.createElement(InternalRoleSwitcherBar, {
          currentRole: 'CEO_FOUNDER',
          onSelectRole: onSelect,
          canSwitch: true,
          isFounder: true,
          userName: 'Baskar Loganathan',
          userEmail: 'bvnbasu@gmail.com',
        })
      );
      expect(html).toContain('relative z-50 mb-6');
    });
  });
});
