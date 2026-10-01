import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { runEdgeAuthoritativeLocationPinCoverage } from '../_shared/location-pin-coverage/orchestrator.ts';
import { authorizeLocationPinCoverageRequest, resolveLocationPinCoveragePhoneViewer } from '../_shared/location-pin-coverage/request-auth.ts';
import {
  coveragePhoneVisibleToViewer,
  redactOperationalPhone,
} from '../../../packages/services/src/discovery/supplier-phone-visibility.ts';

type CoverageRequest = {
  state?: string;
  city?: string;
  pincode?: string;
  category?: string;
  forceRefresh?: boolean;
  executeDiscovery?: boolean;
  asyncMode?: boolean;
};

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return createClient(url, key, { auth: { persistSession: false } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const body = (await req.json()) as CoverageRequest;
    const client = serviceClient();

    const auth = await authorizeLocationPinCoverageRequest(req, client, body);
    if (!auth.ok) {
      return errorResponse(auth.error, auth.status);
    }

    const normalizedBody: CoverageRequest = {
      ...body,
      forceRefresh: auth.effectiveForceRefresh,
    };

    if (body.asyncMode) {
      void runEdgeAuthoritativeLocationPinCoverage(client, normalizedBody).catch(() => undefined);
      return jsonResponse({ ok: true, queued: true, message: 'Discovery queued.' });
    }

    const result = await runEdgeAuthoritativeLocationPinCoverage(client, normalizedBody);
    const viewer = await resolveLocationPinCoveragePhoneViewer(req, client);
    const response = coveragePhoneVisibleToViewer(viewer) ? result : redactOperationalPhone(result);
    return jsonResponse(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Coverage failed';
    return errorResponse(msg, 500);
  }
});
