import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { runEdgeAuthoritativeLocationPinCoverage } from '../_shared/location-pin-coverage/orchestrator.ts';
import {
  authorizeLocationCoverageRecoveryAdmin,
  authorizeLocationPinCoverageRequest,
  isLocationCoverageWorkerRequest,
  resolveLocationPinCoveragePhoneViewer,
} from '../_shared/location-pin-coverage/request-auth.ts';
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
  discoveryContext?: 'BUYER_RFQ' | 'BUYER_ONBOARDING' | 'SUPERADMIN_PREPARE' | 'NETWORK_EXPANSION';
  signupRequestId?: string;
  mode?: 'run_due_retries' | 'list_recovery_jobs' | 'retry_recovery_job';
  scopeKey?: string;
  limit?: number;
};

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !key) throw new Error('Supabase service environment is not configured');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function rpcWithClockSkewFallback<T = unknown>(
  client: ReturnType<typeof serviceClient>,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ client: ReturnType<typeof serviceClient>; data: T | null; error: { message?: string; code?: string } | null }> {
  const res = await client.rpc(fn, args);
  return { client, data: res.data as T | null, error: res.error };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const body = (await req.json()) as CoverageRequest;
    const client = serviceClient();

    if (body.mode === 'run_due_retries') {
      if (!isLocationCoverageWorkerRequest(req)) {
        return errorResponse('Worker authentication required', 401);
      }
      const rpc = await rpcWithClockSkewFallback<Array<Record<string, unknown>>>(
        client,
        'location_pin_coverage_list_due_retries',
        { p_limit: body.limit ?? 5 },
      );
      if (rpc.error) {
        console.error('location_pin_coverage_list_due_retries error:', rpc.error);
        return errorResponse(`Could not read due coverage retries: ${rpc.error.message || rpc.error.code}`, 503);
      }
      const jobs = Array.isArray(rpc.data) ? rpc.data : [];
      const results: Array<Record<string, unknown>> = [];
      for (const job of jobs) {
        try {
          const result = await runEdgeAuthoritativeLocationPinCoverage(rpc.client, {
            state: String(job.state ?? ''),
            city: String(job.city ?? ''),
            pincode: String(job.pincode ?? ''),
            category: String(job.category ?? ''),
            executeDiscovery: true,
            forceRefresh: false,
            discoveryContext: 'NETWORK_EXPANSION',
          });
          results.push({ scopeKey: job.scope_key, ...result });
        } catch (error) {
          results.push({
            scopeKey: job.scope_key,
            ok: false,
            error: error instanceof Error ? error.message : 'Retry worker failed',
          });
        }
      }
      return jsonResponse({ ok: true, processed: results.length, results });
    }

    if (body.mode === 'list_recovery_jobs' || body.mode === 'retry_recovery_job') {
      const admin = await authorizeLocationCoverageRecoveryAdmin(req, client);
      if (!admin.ok) return errorResponse(admin.error, admin.status);

      if (body.mode === 'list_recovery_jobs') {
        const rpc = await rpcWithClockSkewFallback<Array<Record<string, unknown>>>(
          client,
          'location_pin_coverage_list_recovery_jobs',
          { p_limit: body.limit ?? 50 },
        );
        if (rpc.error) {
          console.error('location_pin_coverage_list_recovery_jobs error:', rpc.error);
          return errorResponse(`Could not read supplier coverage recovery status: ${rpc.error.message || rpc.error.code}`, 503);
        }
        return jsonResponse({ ok: true, jobs: Array.isArray(rpc.data) ? rpc.data : [] });
      }

      const scopeKey = body.scopeKey?.trim();
      if (!scopeKey || scopeKey.length > 512) return errorResponse('Valid coverage scope key required', 400);
      const rpc = await rpcWithClockSkewFallback<boolean>(
        client,
        'location_pin_coverage_retry_generation',
        { p_scope_key: scopeKey },
      );
      if (rpc.error) {
        console.error('location_pin_coverage_retry_generation error:', rpc.error);
        return errorResponse(`Could not queue supplier coverage retry: ${rpc.error.message || rpc.error.code}`, 503);
      }
      if (!rpc.data) return errorResponse('Retry is unavailable, already queued, or rate limited', 409);
      return jsonResponse({ ok: true, status: 'QUEUED', message: 'Coverage retry queued for the next worker run.' });
    }

    const auth = await authorizeLocationPinCoverageRequest(req, client, body);
    if (!auth.ok) {
      return errorResponse(auth.error, auth.status);
    }

    const normalizedBody: CoverageRequest = {
      ...body,
      ...(auth.scope ?? {}),
      forceRefresh: auth.effectiveForceRefresh,
    };

    if (body.asyncMode) {
      const task = runEdgeAuthoritativeLocationPinCoverage(client, normalizedBody);
      const runtime = globalThis as typeof globalThis & {
        EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void };
      };
      if (runtime.EdgeRuntime?.waitUntil) {
        runtime.EdgeRuntime.waitUntil(task);
        return jsonResponse({ ok: true, queued: true, message: 'Discovery accepted for background execution.' });
      }

      const result = await task;
      const viewer = await resolveLocationPinCoveragePhoneViewer(req, client);
      return jsonResponse(coveragePhoneVisibleToViewer(viewer) ? result : redactOperationalPhone(result));
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
