import React from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BulkWhatsAppCampaignPanel,
  CAMPAIGN_TEMPLATES,
  CAMPAIGN_LANGUAGES,
  fetchWahaGatewayStatus,
  sendWahaTextMessage,
  resolveWahaChatId,
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
    expect(html).toContain('Multilingual Dispatch Selector');
    expect(html).toContain('മലയാളം'); // Malayalam
    expect(html).toContain('தமிழ்'); // Tamil
    expect(html).toContain('తెలుగు'); // Telugu
    expect(html).toContain('ಕನ್ನಡ'); // Kannada
    expect(html).toContain('हिन्दी'); // Hindi
  });

  it('supports full multilingual template coverage for South Indian languages, Hindi, and English', () => {
    expect(CAMPAIGN_LANGUAGES.map((l) => l.code)).toEqual(['en', 'hi', 'ta', 'te', 'kn', 'ml']);

    // Check North and South regional tagging
    const malayalam = CAMPAIGN_LANGUAGES.find((l) => l.code === 'ml');
    expect(malayalam?.nativeLabel).toBe('മലയാളം');
    expect(malayalam?.region).toBe('South India');

    const hindi = CAMPAIGN_LANGUAGES.find((l) => l.code === 'hi');
    expect(hindi?.region).toBe('North India');

    // Verify all templates have complete translations for all 6 languages
    for (const tpl of CAMPAIGN_TEMPLATES) {
      for (const lang of ['en', 'hi', 'ta', 'te', 'kn', 'ml'] as const) {
        const variant = tpl.translations[lang];
        expect(variant).toBeDefined();
        expect(variant.subject.length).toBeGreaterThan(0);
        expect(variant.body.length).toBeGreaterThan(0);
        expect(variant.callToAction).toContain('https://x2o.app');
      }
    }
  });

  it('renders Phase 2 & 3: RWA & MSME directory targeting and Organic Pincode Discovery Engine', () => {
    const html = renderToStaticMarkup(<BulkWhatsAppCampaignPanel />);
    expect(html).toContain('RWA &amp; MSME Leads');
    expect(html).toContain('Organic SNE Pincode Discovery Engine (On-Demand Activation)');
    expect(html).toContain('Organically Unlocked PIN Codes');
    expect(html).toContain('560001');
    expect(html).toContain('Bengaluru');
    expect(html).toContain('RWA');
    expect(html).toContain('MSME');
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
      if (url.includes('/api/contacts/check-exists')) {
        return {
          ok: true,
          json: async () => ({
            numberExists: true,
            chatId: '275398168453169@lid',
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

    const resolvedChatId = await resolveWahaChatId('919845096753');
    expect(resolvedChatId).toBe('275398168453169@lid');
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
