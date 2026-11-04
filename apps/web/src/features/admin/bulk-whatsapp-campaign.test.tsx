import React from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BulkWhatsAppCampaignPanel,
  CAMPAIGN_TEMPLATES,
  fetchWahaGatewayStatus,
  sendWahaTextMessage,
} from './components/BulkWhatsAppCampaignPanel';
import {
  ALL_ADMIN_MODULES,
  INTERNAL_ROLE_CONFIGS,
} from './types/admin-navigation';

describe('BulkWhatsAppCampaignPanel & Admin Role Suite', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('validates sendWahaTextMessage rejects invalid phone numbers', async () => {
    const invalidResult = await sendWahaTextMessage('123', 'Hello');
    expect(invalidResult.ok).toBe(false);
    expect(invalidResult.error).toContain('Invalid phone number format');
  });

  it('handles gateway probing and dispatch execution', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/sessions/default')) {
        return {
          ok: true,
          json: async () => ({
            status: 'WORKING',
            me: { id: '919972967530@c.us', pushName: 'Baskar Loganathan' },
            engine: { engine: 'WEBJS' },
          }),
        };
      }
      if (url.includes('/api/sendText')) {
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: 'MSG-001' }),
        };
      }
      return { ok: false, status: 404 };
    }) as any;

    const status = await fetchWahaGatewayStatus();
    expect(status.status).toBe('WORKING');
    expect(status.phone).toBe('+919972967530');
    expect(status.pushName).toBe('Baskar Loganathan');

    const sendRes = await sendWahaTextMessage('+91 99729 67530', 'Test notification');
    expect(sendRes.ok).toBe(true);
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
