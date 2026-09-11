import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const DEMO_ORG_ID = 'd1000000-0000-4000-8000-000000000001';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  // Fail closed: without a configured secret, nobody can reset the demo. An
  // absent env var used to allow anonymous resets, which is unsafe as soon as
  // this function is deployed anywhere reachable from the internet.
  const demoSecret = Deno.env.get('DEMO_RESET_SECRET');
  const headerSecret = req.headers.get('X-Demo-Secret');
  if (!demoSecret || headerSecret !== demoSecret) {
    return errorResponse('Invalid demo secret', 403);
  }

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!serviceKey || !supabaseUrl) {
    return errorResponse('Server misconfigured', 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  try {
    // Reset Durga Rainbow transactional data back toward walkthrough-ready state.
    const tables = [
      'audit_events',
      'procurement_performance_records',
      'payments',
      'invoices',
      'work_orders',
      'purchase_orders',
      'awards',
      'committee_votes',
      'conflict_of_interest_declarations',
      'quote_evaluations',
      'quote_versions',
      'quotes',
    ] as const;

    for (const table of tables) {
      const column =
        table === 'payments'
          ? 'invoice_id'
          : table === 'invoices'
            ? 'work_order_id'
            : table === 'work_orders'
              ? 'purchase_order_id'
              : table === 'purchase_orders'
                ? 'organization_id'
                : table === 'audit_events' || table === 'procurement_performance_records'
                  ? 'organization_id'
                  : 'rfq_id';

      const value =
        column === 'organization_id'
          ? DEMO_ORG_ID
          : table === 'payments'
            ? 'd1000053-0000-4000-8000-000000000001'
            : table === 'invoices'
              ? 'd1000052-0000-4000-8000-000000000001'
              : table === 'work_orders'
                ? 'd1000051-0000-4000-8000-000000000001'
                : table === 'purchase_orders'
                  ? DEMO_ORG_ID
                  : 'd1000021-0000-4000-8000-000000000001';

      await admin.from(table).delete().eq(column, value);
    }

    await admin
      .from('requirements')
      .update({ status: 'QUOTING', closed_at: null })
      .eq('id', 'd1000020-0000-4000-8000-000000000001');

    await admin
      .from('rfqs')
      .update({ status: 'OPEN', reveal_status: 'BLIND' })
      .eq('id', 'd1000021-0000-4000-8000-000000000001');

    return jsonResponse({
      ok: true,
      message:
        'Demo reset partial — run pnpm demo:seed ready for full walkthrough state',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reset failed';
    return errorResponse(message, 500);
  }
});
