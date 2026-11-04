import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BulkWhatsAppCampaignPanel,
  CAMPAIGN_TEMPLATES,
} from './components/BulkWhatsAppCampaignPanel';
import {
  ALL_ADMIN_MODULES,
  INTERNAL_ROLE_CONFIGS,
} from './types/admin-navigation';

describe('BulkWhatsAppCampaignPanel & Admin Role Suite', () => {
  it('defines pre-approved marketing templates for buyers and suppliers', () => {
    expect(CAMPAIGN_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    const launchTpl = CAMPAIGN_TEMPLATES.find((t) => t.id === 'TPL-X2O-LAUNCH');
    expect(launchTpl).toBeDefined();
    expect(launchTpl?.body).toContain('{{platform}}');
    expect(launchTpl?.callToAction).toContain('https://x2o.app/signup');

    const buyerTpl = CAMPAIGN_TEMPLATES.find((t) => t.id === 'TPL-BUYER-WELCOME');
    expect(buyerTpl?.audience).toBe('BUYER');

    const supplierTpl = CAMPAIGN_TEMPLATES.find((t) => t.id === 'TPL-SUPPLIER-ONBOARD');
    expect(supplierTpl?.audience).toBe('SUPPLIER');
  });

  it('renders BulkWhatsAppCampaignPanel with audience targeting and preview', () => {
    const html = renderToStaticMarkup(<BulkWhatsAppCampaignPanel />);
    expect(html).toContain('Bulk WhatsApp Marketing &amp; Outreach Engine');
    expect(html).toContain('Prospective Buyers');
    expect(html).toContain('Prospective Suppliers');
    expect(html).toContain('WhatsApp Business Preview');
    expect(html).toContain('Launch Campaign');
    expect(html).toContain('Campaign Dispatch Audit History');
  });

  it('registers WHATSAPP_CAMPAIGNS in ALL_ADMIN_MODULES and allows access for Sales & Marketing, CEO, and Super Admin', () => {
    const campaignModule = ALL_ADMIN_MODULES.find((m) => m.key === 'WHATSAPP_CAMPAIGNS');
    expect(campaignModule).toBeDefined();
    expect(campaignModule?.title).toContain('Bulk WhatsApp');

    expect(INTERNAL_ROLE_CONFIGS.SALES_MARKETING.allowedTabs).toContain('WHATSAPP_CAMPAIGNS');
    expect(INTERNAL_ROLE_CONFIGS.CEO_FOUNDER.allowedTabs).toContain('WHATSAPP_CAMPAIGNS');
    expect(INTERNAL_ROLE_CONFIGS.SUPER_ADMIN.allowedTabs).toContain('WHATSAPP_CAMPAIGNS');
  });

  it('verifies UI deduplication: no duplicate visible notification bell or misplaced sign-out buttons', () => {
    const buyerDashboard = readFileSync(
      resolve(__dirname, '../../pages/DashboardPage.tsx'),
      'utf8'
    );
    const supplierDashboard = readFileSync(
      resolve(__dirname, '../../pages/SupplierDashboardPage.tsx'),
      'utf8'
    );
    const profileEditModal = readFileSync(
      resolve(__dirname, '../profile/components/ProfileEditModal.tsx'),
      'utf8'
    );

    // Verify duplicate header bells are suppressed visually (sr-only)
    expect(buyerDashboard).toContain('Verified Buyer');
    expect(buyerDashboard).not.toContain('relative w-10 h-10 rounded-full bg-card border border-border/80 flex items-center justify-center text-foreground hover:bg-muted transition shadow-2xs');

    expect(supplierDashboard).toContain('Verified Supplier');
    expect(supplierDashboard).not.toContain('relative w-10 h-10 rounded-full bg-card border border-border/80 flex items-center justify-center text-foreground hover:bg-muted transition shadow-2xs');

    // Verify ProfileEditModal no longer contains misplaced sign-out button
    expect(profileEditModal).not.toContain('profile-modal-sign-out-button');
    expect(profileEditModal).not.toContain('Sign Out');
  });
});
