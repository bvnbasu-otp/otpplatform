import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';

type CoverageRequest = {
  state?: string;
  city?: string;
  pincode?: string;
  category?: string;
  forceRefresh?: boolean;
  executeDiscovery?: boolean;
  asyncMode?: boolean;
};

const inFlight = new Map<string, Promise<Record<string, unknown>>>();

function scopeKey(input: Required<Pick<CoverageRequest, 'state' | 'city' | 'pincode' | 'category'>>): string {
  return `${input.state}:${input.city}:${input.pincode}:${input.category}`.toLowerCase();
}

async function geocodePin(pin: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?components=postal_code:${encodeURIComponent(pin)}|country:IN&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  const json = await res.json();
  const loc = json?.results?.[0]?.geometry?.location;
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return null;
  return { lat: loc.lat, lng: loc.lng };
}

async function textSearch(
  query: string,
  apiKey: string,
  center?: { lat: number; lng: number },
): Promise<Array<Record<string, unknown>>> {
  const bias = center ? `&location=${center.lat},${center.lng}&radius=25000` : '';
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}${bias}&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json?.status === 'REQUEST_DENIED') {
    throw new Error('AUTH_FAILURE');
  }
  return Array.isArray(json?.results) ? json.results : [];
}

async function runCoverage(body: CoverageRequest): Promise<Record<string, unknown>> {
  const state = (body.state ?? 'Karnataka').trim();
  const city = (body.city ?? 'Bengaluru').trim();
  const pincode = (body.pincode ?? '').trim();
  const category = (body.category ?? 'General Commercial Supplies').trim();
  const executeDiscovery = body.executeDiscovery !== false;

  if (!/^\d{6}$/.test(pincode)) {
    return { ok: false, message: 'Pincode must be 6 digits.', error: 'VALIDATION' };
  }

  if (!executeDiscovery) {
    return {
      ok: true,
      externalCallsExecuted: 0,
      message: `Coverage status assessed: NEVER_DISCOVERED (edge read-only stub).`,
      report: {
        scope: { state, city, pincode, category },
        freshness: {
          scope: { state, city, pincode, category },
          status: 'NEVER_DISCOVERED',
          knownSupplierCount: 0,
          explanation: 'Read-only check; no discovery executed.',
        },
        suppliers: [],
        summary: { totalKnown: 0 },
      },
    };
  }

  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? Deno.env.get('GOOGLE_MAPS_API_KEY') ?? '';
  if (!apiKey) {
    return {
      ok: false,
      error: 'PROVIDER_UNAVAILABLE',
      message: 'Google Places API key is not configured on the edge runtime.',
    };
  }

  const key = scopeKey({ state, city, pincode, category });
  const existing = inFlight.get(key);
  if (existing) return existing;

  const job = (async () => {
    let calls = 0;
    const center = await geocodePin(pincode, apiKey);
    if (center) calls += 1;
    const query = `${category} suppliers in ${city} ${pincode}`;
    const results = await textSearch(query, apiKey, center ?? undefined);
    calls += 1;

    const suppliers = results
      .filter((r) => typeof r.place_id === 'string')
      .slice(0, 20)
      .map((r) => ({
        id: r.place_id,
        businessName: r.name ?? 'Discovered Supplier',
        verificationStage: 'DISCOVERED_IN_AREA',
        provenanceProviders: ['GOOGLE_PLACES'],
        locations: [{ pincode, city, state, isPrimary: true, serviceRadiusKm: 25 }],
        categories: [{ categoryName: category, isPrimary: true, confidenceScore: 75 }],
        observationsCount: 1,
        isOtpRegistered: false,
        isGstVerified: false,
        complianceStandards: [],
      }));

    return {
      ok: true,
      externalCallsExecuted: calls,
      knownSuppliersCount: suppliers.length,
      message:
        suppliers.length > 0
          ? `Discovered ${suppliers.length} Google Places suppliers for ${pincode}.`
          : 'Discovery completed with zero suppliers (not cached as fresh).',
      report: {
        scope: { state, city, pincode, category },
        freshness: {
          scope: { state, city, pincode, category },
          status: suppliers.length > 0 ? 'FRESH' : 'NEVER_DISCOVERED',
          knownSupplierCount: suppliers.length,
          explanation: suppliers.length > 0 ? 'Successful Google discovery.' : 'Zero Google matches.',
        },
        suppliers,
        summary: { totalKnown: suppliers.length, discoveredInArea: suppliers.length },
      },
    };
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, job);
  return job;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const body = (await req.json()) as CoverageRequest;
    if (body.asyncMode) {
      void runCoverage(body).catch(() => undefined);
      return jsonResponse({ ok: true, queued: true, message: 'Discovery queued.' });
    }
    const result = await runCoverage(body);
    return jsonResponse(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Coverage failed';
    if (msg === 'AUTH_FAILURE') {
      return jsonResponse({ ok: false, error: 'AUTH_FAILURE', message: 'Google auth failed.' });
    }
    return errorResponse(msg, 500);
  }
});
