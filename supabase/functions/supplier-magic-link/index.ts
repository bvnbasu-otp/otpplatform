/**
 * Redeeming a supplier magic link.
 *
 * A supplier who arrived from an SMS has no account, so this cannot return a
 * normal sign-in. It returns a capability instead: a short-lived token that
 * authorises quoting on one enquiry as one supplier, and nothing else. That is
 * the least authority which makes the journey work — the token cannot read the
 * supplier's other enquiries, their profile, or anyone else's bid.
 *
 * The link itself is single-use and the database enforces that, so two people
 * opening the same forwarded link cannot both get in.
 *
 * Routes:
 *   POST /supplier-magic-link  { token }  ->  { sessionToken, expiresAt }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Body must be JSON', 400);
  }

  if (!body.token) {
    return errorResponse('token is required', 400);
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  // Everything that makes redemption safe — single use, expiry, the enquiry
  // still being open — is checked inside this one statement, so two concurrent
  // redemptions of the same link cannot both succeed.
  const { data, error } = await db.rpc('redeem_supplier_magic_link', {
    p_token: body.token,
    // Recorded so a link that was forwarded or stolen leaves a trace. Not used
    // for access decisions: an IP is too easy to change to be a control.
    p_from: req.headers.get('x-forwarded-for')
      ?? req.headers.get('cf-connecting-ip')
      ?? null,
  });

  if (error) {
    console.error('redeem_supplier_magic_link failed', error.message);
    return errorResponse('Could not open that link', 400);
  }

  switch (data?.outcome) {
    case 'OK':
      return jsonResponse({
        sessionToken: data.sessionToken,
        reference: data.publicRef,
        expiresAt: data.expiresAt,
      });

    case 'RFQ_CLOSED':
      return jsonResponse({ error: 'RFQ_CLOSED' }, 410);

    case 'RATE_LIMITED':
      return jsonResponse({ error: 'RATE_LIMITED' }, 429);

    default:
      // One response for missing, expired and already-used, so a caller
      // grinding tokens learns nothing about which guesses were ever real.
      return jsonResponse({ error: 'INVALID' }, 404);
  }
});
