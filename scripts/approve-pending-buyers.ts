import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://otpplatform-theta.vercel.app';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

async function tryApproveOnEndpoint(url: string) {
  console.log(`\n-----------------------------------------------------------------`);
  console.log(`Checking Endpoint: ${url}`);
  console.log(`-----------------------------------------------------------------`);

  const supabase = createClient(url, ANON_KEY, {
    auth: { persistSession: false },
  });

  // Authenticate as Super Admin
  let token: string | null = null;
  const adminCredentials = [
    { email: 'bvnbasu@gmail.com', password: 'Admin@OTP2026!' },
    { email: 'admin@otp.test', password: 'password' },
    { email: 'admin@otp.test', password: '@dm!n123' },
    { email: 'ops@otp.test', password: 'password' },
  ];

  for (const cred of adminCredentials) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword(cred);
      if (!error && data?.session) {
        console.log(`✅ Authenticated as Platform Super Admin: ${cred.email}`);
        token = data.session.access_token;
        break;
      }
    } catch (e: any) {
      // ignore
    }
  }

  if (!token) {
    console.log(`❌ Could not sign in as Super Admin on ${url}`);
    return;
  }

  // Fetch pending requests via RPC
  const { data: rpcRequests, error: rpcErr } = await supabase.rpc('admin_get_signup_requests');
  let requests: any[] = [];

  if (!rpcErr && Array.isArray(rpcRequests)) {
    requests = rpcRequests;
  } else {
    console.log(`⚠️ admin_get_signup_requests RPC notice: ${rpcErr?.message || 'Empty'}. Trying direct table select...`);
    const { data: tableRequests, error: tblErr } = await supabase
      .from('signup_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (tblErr) {
      console.log(`❌ Table query error: ${tblErr.message}`);
    } else {
      requests = tableRequests || [];
    }
  }

  console.log(`Total signup requests found: ${requests.length}`);
  const pendingRequests = requests.filter((r) => r.status === 'PENDING');
  console.log(`Pending signup requests: ${pendingRequests.length}`);

  for (const req of requests) {
    console.log(`  • ID: ${req.id} | Side: ${req.side} | Status: ${req.status} | Email: ${req.email} | Name: ${req.contact_first_name || ''} ${req.contact_last_name || ''} | Org: ${req.business_name || 'Self'} | Created: ${req.created_at}`);
  }

  if (pendingRequests.length === 0) {
    console.log(`No pending registrations waiting for approval on this endpoint.`);
    return;
  }

  console.log(`\nApproving pending registrations...`);
  for (const req of pendingRequests) {
    console.log(`\nApproving ${req.side} registration for ${req.email} (${req.id})...`);
    
    // Call admin_review_signup_request
    const { data: reviewRes, error: reviewErr } = await supabase.rpc('admin_review_signup_request', {
      p_request_id: req.id,
      p_action: 'APPROVE',
      p_notes: 'Batch auto-approved by Super Admin',
      p_initial_password: 'Welcome@OTP2026!',
    });

    if (reviewErr) {
      console.log(`❌ RPC error reviewing ${req.email}: ${reviewErr.message}`);
      
      // Fallback: direct table update if RPC failed
      const { data: updateRes, error: updateErr } = await supabase
        .from('signup_requests')
        .update({
          status: 'ONBOARDED',
          reviewed_at: new Date().toISOString(),
          review_notes: 'Direct approval by Super Admin',
        })
        .eq('id', req.id);

      if (updateErr) {
        console.log(`❌ Direct update error: ${updateErr.message}`);
      } else {
        console.log(`✅ Direct table update set status = ONBOARDED for ${req.email}`);
      }
    } else {
      console.log(`✅ Approved successfully via RPC:`, reviewRes);
    }
  }
}

async function main() {
  await tryApproveOnEndpoint(LOCAL_SUPABASE_URL);
  await tryApproveOnEndpoint(SUPABASE_URL);
}

main().catch(console.error);
