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
  MESSAGING_MOCK_SECRET?: string;
  APP_URL?: string;
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

    case 'MOCK':
      return new MockMessagingProvider({ sharedSecret: env.MESSAGING_MOCK_SECRET });

    default:
      throw new MessagingConfigError(
        `Unknown MESSAGING_PROVIDER "${env.MESSAGING_PROVIDER}". Use TWILIO, META or MOCK.`,
      );
  }
}
