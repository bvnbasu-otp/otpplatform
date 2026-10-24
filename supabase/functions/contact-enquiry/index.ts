/**
 * Public Contact Us submissions.
 *
 * Wires the real dependencies into the HTTP flow in
 * _shared/contact/http-handler.ts: the signed client identity, the shared
 * per-client and endpoint rate limit (consumed before the body is read), and
 * storage through a service-role-only RPC before success is reported. If the
 * rate limiter or the store is unavailable — including before migration 00324
 * is applied — the visitor is told the enquiry was not recorded.
 *
 * The notice to the support inbox goes through the operator email relay
 * (CONTACT_EMAIL_RELAY_URL + CONTACT_EMAIL_RELAY_SECRET, see email-relay.ts).
 * Without both, it is recorded as NOT_CONFIGURED; a relay failure or timeout
 * is FAILED; SENT means the relay reported it accepted by SMTP, not delivered.
 * Message bodies, contact details and relay responses are never logged.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { jsonResponse } from '../_shared/cors.ts';
import { resolveContactClientIdentity } from '../_shared/contact/client-identity.ts';
import { createContactEmailRelayTransport } from '../_shared/contact/email-relay.ts';
import type { ContactNotificationStatus } from '../_shared/contact/enquiry.ts';
import { type ContactHttpDeps, handleContactHttpRequest } from '../_shared/contact/http-handler.ts';

const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
);

const deps: ContactHttpDeps = {
  rateLimitSecret: () => Deno.env.get('CONTACT_RATE_LIMIT_SECRET'),
  resolveIdentity: (req, secret) =>
    resolveContactClientIdentity(req.headers.get('x-otp-contact-client-token'), secret),
  async checkRateLimit(bucketKey) {
    const { data, error } = await db.rpc('check_contact_enquiry_rate_limit', {
      p_client_key: bucketKey,
    });
    return { data, error };
  },
  enquiry: {
    async recordEnquiry(enquiry) {
      const { data, error } = await db.rpc('submit_contact_enquiry', {
        p_submission_id: enquiry.submissionId,
        p_category: enquiry.category,
        p_name: enquiry.name,
        p_email: enquiry.email,
        p_phone: enquiry.phone,
        p_organisation: enquiry.organisation,
        p_subject: enquiry.subject,
        p_message: enquiry.message,
      });
      if (!error && data?.result === 'SUBMISSION_CONFLICT') return { conflict: true };
      if (error || !data?.id || !data?.reference) {
        console.error('contact-enquiry: enquiry could not be recorded');
        return null;
      }
      return {
        id: String(data.id),
        reference: String(data.reference),
        created: data.created === true,
        notificationStatus: (data.notification_status ?? 'PENDING') as ContactNotificationStatus,
      };
    },
    async markNotification(id, status) {
      const { error } = await db.rpc('mark_contact_enquiry_notification', { p_id: id, p_status: status });
      if (error) console.error('contact-enquiry: notification status could not be stored');
    },
    transport: createContactEmailRelayTransport({
      url: Deno.env.get('CONTACT_EMAIL_RELAY_URL'),
      secret: Deno.env.get('CONTACT_EMAIL_RELAY_SECRET'),
    }),
  },
};

Deno.serve(async (req) => {
  try {
    return await handleContactHttpRequest(req, deps);
  } catch {
    console.error('contact-enquiry: request failed');
    return jsonResponse({ ok: false, code: 'NOT_RECORDED' }, 503, req.headers.get('Origin'));
  }
});
