import { createClient } from '@supabase/supabase-js';

// The local Supabase URL and the well-known demo anon JWT are baked in as
// fallbacks for `pnpm dev` only. A production build must set both env vars —
// shipping the demo key to real users would let anyone read the anon-visible
// surface of the local dev database if the deployment ever pointed at it.
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Safe fallback for client anon key
const supabaseAnonKey = envKey || LOCAL_ANON_KEY;

function resolveSupabaseUrl(): string {
  // If running in a browser accessed through an external hostname or Cloudflare tunnel,
  // route through the same-origin proxy (window.location.origin) so all requests use standard HTTPS port 443.
  if (
    typeof window !== 'undefined' &&
    window.location.hostname &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    return window.location.origin;
  }
  if (envUrl) return envUrl;
  return LOCAL_SUPABASE_URL;
}

const supabaseUrl = resolveSupabaseUrl();

/**
 * Where the session is kept, and therefore how long it survives.
 *
 * "Remember this device" is only meaningful if declining it does something. With
 * it, the session goes to localStorage and outlives the browser. Without it, it
 * goes to sessionStorage and dies with the tab — which is what someone signing
 * in from a shared machine in a society office is actually asking for.
 *
 * The choice has to be made when the client is constructed, before any screen
 * renders, so the flag is read from localStorage rather than passed in.
 */
const REMEMBER_KEY = 'otp.remember_device';

function sessionStore(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage.getItem(REMEMBER_KEY) === 'false'
      ? window.sessionStorage
      : window.localStorage;
  } catch {
    // Private browsing modes can throw on access rather than on write.
    return undefined;
  }
}

export function setRememberDevice(remember: boolean): void {
  try {
    window.localStorage.setItem(REMEMBER_KEY, remember ? 'true' : 'false');
  } catch {
    // Nothing to do: the session simply falls back to the default store.
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storage: sessionStore(), persistSession: true, autoRefreshToken: true },
});

export {
  DEFAULT_RFQ_ID,
  DEMO_PO_ID,
  DEMO_WO_ID,
  DEMO_REQUIREMENT_ID,
  FULFILLMENT_RFQ_ID,
  ORG_DISPLAY_NAME,
  REQUIREMENT_TITLE,
} from './app-context';

// Demo logins used to live here as a hard-coded map, which meant reseeding the
// demo with different personas broke the login screen until someone edited the
// client. They now come from the demo_accounts registry through
// features/demo/api/demo.ts, and the shared password from the environment.
