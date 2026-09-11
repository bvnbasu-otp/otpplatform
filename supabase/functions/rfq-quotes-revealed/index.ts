import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { createUserClient, rfqIdFromUrl } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const url = new URL(req.url);
    const rfqId = rfqIdFromUrl(url) ?? url.searchParams.get('rfq_id');
    if (!rfqId) {
      return errorResponse('rfq_id required', 400);
    }

    const client = createUserClient(req);
    const { data: rfq } = await client
      .from('rfqs')
      .select('reveal_status')
      .eq('id', rfqId)
      .maybeSingle();

    if (rfq?.reveal_status !== 'REVEALED') {
      return errorResponse('Supplier identity not yet revealed', 403);
    }

    const { data, error } = await client
      .from('quotes_revealed')
      .select('*')
      .eq('rfq_id', rfqId);

    if (error) {
      return errorResponse(error.message, 403);
    }

    return jsonResponse({ quotes: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return errorResponse(message, 401);
  }
});
