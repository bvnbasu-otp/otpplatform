/**
 * Choosing a provider from configuration.
 *
 * Deliberately explicit rather than clever: the provider is whatever
 * MESSAGING_PROVIDER names, and if that provider's credentials are missing we
 * fail rather than fall back. A silent fallback to MOCK in production would look
 * exactly like a working system while every enquiry went nowhere.
 */

import type { MessagingProvider, MessagingProviderId } from '../types.ts';
import { MockMessagingProvider } from './mock.ts';
import { TwilioMessagingProvider } from './twilio.ts';
import { MetaWhatsAppProvider } from './meta.ts';
import { WahaMessagingProvider } from './waha.ts';

export interface MessagingEnv {
  MESSAGING_PROVIDER?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_SMS_FROM?: string;
  TWILIO_WHATSAPP_FROM?: string;
  TWILIO_WEBHOOK_URL?: string;
  META_PHONE_NUMBER_ID?: string;
  META_ACCESS_TOKEN?: string;
  META_APP_SECRET?: string;
  /** Origin of the WAHA gateway, for example http://127.0.0.1:3008. No path, query, or credentials. */
  WAHA_BASE_URL?: string;
  /** WAHA session name. The local gateway uses the literal default. */
  WAHA_SESSION?: string;
  MESSAGING_MOCK_SECRET?: string;
  APP_URL?: string;
}

/** Accepts an origin only. Credentials, paths, and query strings are rejected so they cannot be sent or logged. */
export function wahaBaseUrl(raw: string | undefined): string {
  const value = raw?.trim() ?? '';
  if (!value) {
    throw new MessagingConfigError('MESSAGING_PROVIDER=WAHA needs WAHA_BASE_URL and WAHA_SESSION');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MessagingConfigError('WAHA_BASE_URL must be an http(s) URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new MessagingConfigError('WAHA_BASE_URL must be an http(s) URL');
  }
  if (url.username || url.password) {
    throw new MessagingConfigError('WAHA_BASE_URL must not contain credentials');
  }
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
    throw new MessagingConfigError('WAHA_BASE_URL must be an origin without a path, query, or fragment');
  }
  return url.origin;
}

export function wahaSession(raw: string | undefined): string {
  const value = raw?.trim() ?? '';
  if (!value) {
    throw new MessagingConfigError('MESSAGING_PROVIDER=WAHA needs WAHA_BASE_URL and WAHA_SESSION');
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
    throw new MessagingConfigError('WAHA_SESSION has an invalid format');
  }
  return value;
}

export class MessagingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MessagingConfigError';
  }
}

export function resolveProvider(env: MessagingEnv): MessagingProvider {
  const id = (env.MESSAGING_PROVIDER ?? 'MOCK').toUpperCase() as MessagingProviderId;

  switch (id) {
    case 'TWILIO': {
      if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
        throw new MessagingConfigError(
          'MESSAGING_PROVIDER=TWILIO needs TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN',
        );
      }
      return new TwilioMessagingProvider({
        accountSid: env.TWILIO_ACCOUNT_SID,
        authToken: env.TWILIO_AUTH_TOKEN,
        smsFrom: env.TWILIO_SMS_FROM,
        whatsappFrom: env.TWILIO_WHATSAPP_FROM,
        webhookUrl: env.TWILIO_WEBHOOK_URL,
      });
    }

    case 'META': {
      if (!env.META_PHONE_NUMBER_ID || !env.META_ACCESS_TOKEN || !env.META_APP_SECRET) {
        throw new MessagingConfigError(
          'MESSAGING_PROVIDER=META needs META_PHONE_NUMBER_ID, META_ACCESS_TOKEN and META_APP_SECRET',
        );
      }
      return new MetaWhatsAppProvider({
        phoneNumberId: env.META_PHONE_NUMBER_ID,
        accessToken: env.META_ACCESS_TOKEN,
        appSecret: env.META_APP_SECRET,
      });
    }

    case 'WAHA': {
      const baseUrl = wahaBaseUrl(env.WAHA_BASE_URL);
      const session = wahaSession(env.WAHA_SESSION);
      return new WahaMessagingProvider({ baseUrl, session });
    }

    case 'MOCK':
      return new MockMessagingProvider({ sharedSecret: env.MESSAGING_MOCK_SECRET });

    default:
      throw new MessagingConfigError(
        `Unknown MESSAGING_PROVIDER "${env.MESSAGING_PROVIDER}". Use TWILIO, META, WAHA or MOCK.`,
      );
  }
}
