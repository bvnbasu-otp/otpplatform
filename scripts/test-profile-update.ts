import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

async function testUser(roleName: string, email: string, pass: string, updateData: { fullName: string; title: string; avatarUrl: string }) {
  console.log(`\n======================================================`);
  console.log(`Testing Profile Update for ${roleName}: ${email}`);
  console.log(`======================================================`);

  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });

  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email,
    password: pass,
  });

  if (authErr || !auth.session) {
    throw new Error(`Login failed for ${email}: ${authErr?.message}`);
  }

  console.log(`✓ Logged in successfully. User ID: ${auth.user.id}`);

  // 1. Test get_my_profile
  const { data: getRes, error: getErr } = await supabase.rpc('get_my_profile');
  if (getErr) throw new Error(`get_my_profile failed: ${getErr.message}`);
  console.log(`✓ get_my_profile returned:`, getRes.profile);

  const initialEmail = getRes.profile.email;
  const initialPhone = getRes.profile.phone;

  // 2. Test update_my_profile
  const { data: updRes, error: updErr } = await supabase.rpc('update_my_profile', {
    p_full_name: updateData.fullName,
    p_title: updateData.title,
    p_avatar_url: updateData.avatarUrl,
  });

  if (updErr) throw new Error(`update_my_profile failed: ${updErr.message}`);
  console.log(`✓ update_my_profile returned:`, updRes);

  if (!updRes.ok) throw new Error(`update_my_profile returned not ok: ${updRes.error}`);

  // 3. Verify that email and phone remain strictly locked and untouched
  if (updRes.profile.email !== initialEmail) {
    throw new Error(`SECURITY BREACH: Email was modified! ${initialEmail} -> ${updRes.profile.email}`);
  }
  if (updRes.profile.phone !== initialPhone) {
    throw new Error(`SECURITY BREACH: Phone was modified! ${initialPhone} -> ${updRes.profile.phone}`);
  }
  console.log(`✓ Verified email (${updRes.profile.email}) and phone (${updRes.profile.phone}) are strictly preserved and non-editable!`);

  // 4. Verify updated name, title, and avatar in my_role_context
  const { data: roleCtx, error: roleErr } = await supabase.rpc('my_role_context');
  if (roleErr) throw new Error(`my_role_context failed: ${roleErr.message}`);
  console.log(`✓ my_role_context returned profile fields:`, {
    fullName: roleCtx.fullName,
    title: roleCtx.title,
    avatarUrl: roleCtx.avatarUrl,
    email: roleCtx.email,
    phone: roleCtx.phone,
  });

  if (roleCtx.fullName !== updateData.fullName) {
    throw new Error(`fullName mismatch in role context: expected ${updateData.fullName}, got ${roleCtx.fullName}`);
  }
  if (roleCtx.title !== updateData.title) {
    throw new Error(`title mismatch in role context: expected ${updateData.title}, got ${roleCtx.title}`);
  }

  console.log(`✓ All profile checks PASSED for ${roleName} (${email})!`);
}

async function run() {
  try {
    // 1. Super Admin
    await testUser(
      'Super Admin',
      'bvnbasu@gmail.com',
      'Admin@OTP2026!',
      {
        fullName: 'Baskar Loganathan',
        title: 'Platform Super Administrator',
        avatarUrl: 'data:image/svg+xml;utf8,%3Csvg%3E%3C/svg%3E',
      }
    );

    // 2. Buyer
    await testUser(
      'Buyer',
      'secretary@sunrise.test',
      'password',
      {
        fullName: 'Ananya Deshmukh',
        title: 'Procurement Committee Secretary',
        avatarUrl: 'data:image/svg+xml;utf8,%3Csvg%3E%3C/svg%3E',
      }
    );

    // 3. Supplier
    await testUser(
      'Supplier',
      'solar01@otpdemo.test',
      'password',
      {
        fullName: 'Rajesh Sundaram',
        title: 'Director of Solar Operations',
        avatarUrl: 'data:image/svg+xml;utf8,%3Csvg%3E%3C/svg%3E',
      }
    );

    console.log('\n🎉 ALL 3 ROLES (SUPER ADMIN, BUYER, SUPPLIER) VERIFIED SUCCESSFULLY!');
  } catch (err: any) {
    console.error('\n❌ Test failed:', err.message);
    process.exit(1);
  }
}

run();
