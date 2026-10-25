import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const ADMIN_EMAIL = process.env.OTP_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.OTP_ADMIN_PASSWORD;
const INITIAL_PASSWORD = process.env.OTP_INITIAL_USER_PASSWORD;
if (!SUPABASE_URL || !ANON_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD || !INITIAL_PASSWORD) {
  throw new Error('Explicit endpoint, key, admin credentials, and initial password are required');
}

type SignupRequest = {
  id: string;
  side: string;
  status: string;
  email: string;
  contact_first_name?: string;
  contact_last_name?: string;
  business_name?: string;
  created_at?: string;
};

async function tryApproveOnEndpoint(url: string) {
  console.log(`\n-----------------------------------------------------------------`);
  console.log(`Checking Endpoint: ${url}`);
  console.log(`-----------------------------------------------------------------`);

  const supabase = createClient(url, ANON_KEY, {
    auth: { persistSession: false },
  });

  // Authenticate as Super Admin
  let token: string | null = null;
  const adminCredentials = [{ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }];

  for (const cred of adminCredentials) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword(cred);
      if (!error && data?.session) {
        console.log(`✅ Authenticated as Platform Super Admin: ${cred.email}`);
        token = data.session.access_token;
        break;
      }
    } catch {
      // ignore
    }
  }

  if (!token) {
    console.log(`❌ Could not sign in as Super Admin on ${url}`);
    return;
  }

  // Fetch pending requests via RPC
  const { data: rpcRequests, error: rpcErr } = await supabase.rpc('admin_get_signup_requests');
  let requests: SignupRequest[] = [];

  if (!rpcErr && Array.isArray(rpcRequests)) {
    requests = rpcRequests as SignupRequest[];
  } else {
    console.log(`⚠️ admin_get_signup_requests RPC notice: ${rpcErr?.message || 'Empty'}. Trying direct table select...`);
    const { data: tableRequests, error: tblErr } = await supabase
      .from('signup_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (tblErr) {
      console.log(`❌ Table query error: ${tblErr.message}`);
    } else {
      requests = (tableRequests || []) as SignupRequest[];
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
      p_initial_password: INITIAL_PASSWORD,
    });

    if (reviewErr) {
      console.log(`❌ RPC error reviewing ${req.email}: ${reviewErr.message}`);
    } else {
      console.log(`✅ Approved successfully via RPC:`, reviewRes);
    }
  }
}

async function main() {
  await tryApproveOnEndpoint(SUPABASE_URL);
}

main().catch(console.error);
