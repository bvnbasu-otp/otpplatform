import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { createUserClient, rfqIdFromUrl } from '../_shared/auth.ts';

const FORBIDDEN = [
  'supplier_id',
  'supplierId',
  'business_name',
  'businessName',
  'phone',
  'email',
  'address',
  'source',
  'match_score',
  'matchScore',
];

function assertBlindSafe(row: Record<string, unknown>) {
  for (const key of FORBIDDEN) {
    if (key in row && row[key] != null) {
      throw new Error(`Blind payload leak: ${key}`);
    }
  }
}

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

    if (rfq?.reveal_status !== 'PROTECTED' && rfq?.reveal_status !== 'BLIND') {
      return errorResponse('Identity-protected quotes unavailable after reveal', 403);
    }

    const { data, error } = await client
      .from('quotes_identity_protected')
      .select('*')
      .eq('rfq_id', rfqId);

    if (error) {
      return errorResponse(error.message, 403);
    }

    for (const row of data ?? []) {
      assertBlindSafe(row as Record<string, unknown>);
    }

    return jsonResponse({ quotes: data ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return errorResponse(message, 401);
  }
});
