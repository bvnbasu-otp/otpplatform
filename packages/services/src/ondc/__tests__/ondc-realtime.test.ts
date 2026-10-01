import { describe, expect, it } from 'vitest';
import {
  createOndcAuthHeader,
  generateOndcKeyPair,
  verifyOndcAuthHeader,
} from '../crypto/ondc-auth-crypto';
import { OndcBapReceiver } from '../receiver/ondc-bap-receiver';
import {
  mapCategoryToOndcDomain,
  mergeOndcServiceOptionsFromEnv,
  resolveOndcSearchDomain,
} from '../ondc-network-service';
import type { OndcCatalog, OndcPayload } from '../types/ondc-beckn';

describe('ONDC Beckn Real-time Cryptography & Protocol Suite', () => {
  it('generates valid Ed25519 keypairs and signs/verifies standard ONDC headers', () => {
    const keys = generateOndcKeyPair();
    expect(keys.publicKeyPem).toContain('BEGIN PUBLIC KEY');
    expect(keys.privateKeyPem).toContain('BEGIN PRIVATE KEY');

    const body = {
      context: {
        domain: 'ONDC:SRV11',
        action: 'search',
        transaction_id: 'tx-12345',
        message_id: 'msg-67890',
      },
      message: {
        intent: { item: { descriptor: { name: 'Water Filter' } } },
      },
    };

    const authHeader = createOndcAuthHeader({
      body,
      subscriberId: 'bap.otp.in',
      uniqueKeyId: 'key-2026',
      privateKeyPem: keys.privateKeyPem,
    });

    expect(authHeader).toContain('Signature keyId="bap.otp.in|key-2026|ed25519"');
    expect(authHeader).toContain('algorithm="ed25519"');
    expect(authHeader).toContain('signature=');

    // 1. Verify valid signature
    const verification = verifyOndcAuthHeader({
      authHeader,
      body,
      publicKeyPem: keys.publicKeyPem,
    });
    expect(verification.valid).toBe(true);

    // 2. Reject tampered body
    const tamperedBody = { ...body, message: { intent: { item: { descriptor: { name: 'CCTV' } } } } };
    const tamperedVerification = verifyOndcAuthHeader({
      authHeader,
      body: tamperedBody,
      publicKeyPem: keys.publicKeyPem,
    });
    expect(tamperedVerification.valid).toBe(false);
  });

  it('correctly maps business categories to Beckn domains', () => {
    expect(mapCategoryToOndcDomain('Cotton Yarn & Textiles')).toBe('ONDC:RET12');
    expect(mapCategoryToOndcDomain('Home CCTV & Surveillance')).toBe('ONDC:RET14');
    expect(mapCategoryToOndcDomain('Construction Ready Mix Concrete RMC')).toBe('ONDC:B2B10');
    expect(mapCategoryToOndcDomain('Clubhouse Gym Equipment AMC')).toBe('ONDC:SRV13');
    expect(mapCategoryToOndcDomain('Domestic RO Water Purifiers')).toBe('ONDC:SRV11');
  });

  it('resolveOndcSearchDomain does not honor a title or injected domain (LOCAL/CI/MOCK)', () => {
    expect(resolveOndcSearchDomain('MOTOR_WINDING', 'ONDC:RET14')).toBeNull();
    expect(resolveOndcSearchDomain('MOTOR_WINDING')).toBeNull();
    expect(resolveOndcSearchDomain('MOTOR_WINDING', 'not-a-domain')).toBeNull();
  });

  it('with explicit subcategory, does not fall back to SRV11 from title alone', () => {
    expect(
      resolveOndcSearchDomain('MOTOR_WINDING', undefined, {
        subcategoryCode: 'motor_rewinding',
        requirementMode: 'REPAIR_MAINTENANCE',
      }),
    ).toBeNull();
  });

  it('mergeOndcServiceOptionsFromEnv reads documented ONDC_* vars', () => {
    const prev = {
      ONDC_ENABLED: process.env.ONDC_ENABLED,
      ONDC_ENVIRONMENT: process.env.ONDC_ENVIRONMENT,
      ONDC_SUBSCRIBER_ID: process.env.ONDC_SUBSCRIBER_ID,
      ONDC_DISCOVERY_DOMAIN: process.env.ONDC_DISCOVERY_DOMAIN,
    };
    process.env.ONDC_ENABLED = 'true';
    process.env.ONDC_ENVIRONMENT = 'PREPROD';
    process.env.ONDC_SUBSCRIBER_ID = 'otpplatform-theta.vercel.app';
    process.env.ONDC_DISCOVERY_DOMAIN = 'ONDC:RET14';

    const merged = mergeOndcServiceOptionsFromEnv({});
    expect(merged.environment).toBe('PRE_PRODUCTION');
    expect(merged.subscriberId).toBe('otpplatform-theta.vercel.app');
    expect(merged.discoveryDomain).toBe('ONDC:RET14');

    for (const [key, val] of Object.entries(prev)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it('parses incoming ONDC /on_search catalog into OTP supplier candidates', () => {
    const receiver = new OndcBapReceiver();

    const payload: OndcPayload<{ catalog: OndcCatalog }> = {
      context: {
        domain: 'ONDC:SRV11',
        country: 'IND',
        city: 'std:080',
        action: 'on_search',
        core_version: '1.2.0',
        bap_id: 'bap.otp.in',
        bap_uri: 'https://api.otp.in/ondc/bap',
        bpp_id: 'seller.pureaqua.in',
        bpp_uri: 'https://seller.pureaqua.in/ondc',
        transaction_id: 'tx-rfq-water-001',
        message_id: 'msg-001',
        timestamp: new Date().toISOString(),
      },
      message: {
        catalog: {
          providers: [
            {
              id: 'prv-pureaqua-01',
              descriptor: { name: 'PureAqua Commercial RO Solutions' },
              rating: '4.9',
              items: [
                {
                  id: 'item-ro-500',
                  descriptor: { name: '500 LPH Commercial RO System' },
                  price: { currency: 'INR', value: '28000.00' },
                },
              ],
            },
          ],
        },
      },
    };

    const result = receiver.handleOnSearch(payload);
    expect(result.transactionId).toBe('tx-rfq-water-001');
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.businessName).not.toBe('ONDC Verified Supplier');
    expect(result.candidates[0]?.bppId).not.toBe('unknown-bpp');
    expect(result.candidates[0]).toEqual({
      network: 'ONDC',
      externalRef: 'ondc:seller.pureaqua.in:prv-pureaqua-01',
      bppId: 'seller.pureaqua.in',
      bppUri: 'https://seller.pureaqua.in/ondc',
      providerId: 'prv-pureaqua-01',
      businessName: 'PureAqua Commercial RO Solutions',
      rating: 4.9,
      itemIds: ['item-ro-500'],
      samplePrice: 28000,
      categories: [],
    });
  });

  it('omits participant id, display name, and rating when the callback does not supply them', () => {
    const receiver = new OndcBapReceiver();
    const payload: OndcPayload<{ catalog: OndcCatalog }> = {
      context: {
        domain: 'ONDC:SRV11',
        country: 'IND',
        city: 'std:080',
        action: 'on_search',
        core_version: '1.2.0',
        bap_id: 'bap.otp.in',
        bap_uri: 'https://api.otp.in/ondc/bap',
        transaction_id: 'tx-rfq-water-002',
        message_id: 'msg-002',
        timestamp: '2026-10-01T05:31:00.000Z',
      },
      message: {
        catalog: {
          providers: [
            {
              id: 'prv-unnamed',
              descriptor: { name: '' },
              items: [],
            },
          ],
        },
      },
    };

    const missingIdentity = receiver.handleOnSearch(payload);
    expect(missingIdentity.candidates).toEqual([]);
    expect(JSON.stringify(missingIdentity)).not.toContain('unknown-bpp');
    expect(JSON.stringify(missingIdentity)).not.toContain('ONDC Verified Supplier');
    expect(JSON.stringify(missingIdentity)).not.toContain('4.5');

    const rated = receiver.handleOnSearch({
      ...payload,
      context: { ...payload.context, bpp_id: 'seller.example.test', bpp_uri: 'https://seller.example.test/ondc' },
      message: {
        catalog: {
          providers: [
            {
              id: 'prv-named',
              descriptor: { name: 'Reported Water Seller' },
              items: [{ id: 'item-1', descriptor: { name: 'Filter' } }],
            },
          ],
        },
      },
    });
    expect(rated.candidates).toHaveLength(1);
    expect(rated.candidates[0]?.bppId).toBe('seller.example.test');
    expect(rated.candidates[0]?.businessName).toBe('Reported Water Seller');
    expect(rated.candidates[0]?.rating).toBeUndefined();
  });

  it('parses incoming ONDC /on_select price breakup into OTP identity-protected quote format', () => {
    const receiver = new OndcBapReceiver();

    const payload = {
      context: {
        domain: 'ONDC:SRV11',
        country: 'IND',
        city: 'std:080',
        action: 'on_select' as const,
        core_version: '1.2.0',
        bap_id: 'bap.otp.in',
        bap_uri: 'https://api.otp.in/ondc/bap',
        bpp_id: 'seller.pureaqua.in',
        bpp_uri: 'https://seller.pureaqua.in/ondc',
        transaction_id: 'tx-rfq-water-001',
        message_id: 'msg-002',
        timestamp: new Date().toISOString(),
      },
      message: {
        order: {
          provider: { id: 'prv-pureaqua-01' },
          quote: {
            price: { currency: 'INR', value: '30440.00' },
            breakup: [
              {
                title: 'Base Equipment Cost',
                price: { currency: 'INR', value: '28000.00' },
              },
              {
                title: 'GST (18%)',
                price: { currency: 'INR', value: '2440.00' },
              },
            ],
          },
        },
      },
    };

    const result = receiver.handleOnSelect(payload);
    expect(result.transactionId).toBe('tx-rfq-water-001');
    expect(result.quote.basePrice).toBe(28000);
    expect(result.quote.taxAmount).toBe(2440);
    expect(result.quote.totalAmount).toBe(30440);
    expect(result.quote.deliveryDays).toBe(3);
  });
});
