import { createClient } from '@supabase/supabase-js';

// Local URL and the well-known demo anon JWT exist only for `pnpm dev`.
// import.meta.env.PROD is folded to true in a production build, so those
// literals are unreachable and are not emitted. A production build must set
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the process environment.
const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function devLocalSupabaseUrl(): string {
  if (import.meta.env.PROD) return '';
  return 'http://127.0.0.1:54321';
}

function devLocalAnonKey(): string {
  if (import.meta.env.PROD) return '';
  return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
}

const supabaseAnonKey = envKey || devLocalAnonKey();

export function resolveSupabaseUrl(
  envUrlOverride?: string | null,
  hostnameOverride?: string,
  originOverride?: string
): string {
  // If explicitly provided (or overridden in test), prioritize it; otherwise use envUrl
  const targetEnvUrl = envUrlOverride !== undefined ? (envUrlOverride || '') : (envUrl || '');
  if (targetEnvUrl) return targetEnvUrl;
  if (import.meta.env.PROD) return '';

  const host = hostnameOverride !== undefined
    ? hostnameOverride
    : (typeof window !== 'undefined' ? window.location.hostname : '');
  const origin = originOverride !== undefined
    ? originOverride
    : (typeof window !== 'undefined' ? window.location.origin : '');

  // Dev only. A self-hosted reverse proxy (not Vercel) uses the page origin.
  // localhost, 127.0.0.1, and *.vercel.app without an explicit URL use the
  // local Supabase API. Production never reaches this branch.
  if (
    host &&
    host !== 'localhost' &&
    host !== '127.0.0.1' &&
    !host.endsWith('.vercel.app')
  ) {
    return origin;
  }
  return devLocalSupabaseUrl();
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

function extractAuthToken(headers: HeadersInit | undefined): string | null {
  if (!headers) return null;
  let val: string | null = null;
  if (typeof (headers as Headers).get === 'function') {
    val = (headers as Headers).get('authorization') || (headers as Headers).get('Authorization');
  } else if (Array.isArray(headers)) {
    const pair = headers.find(([k]) => k.toLowerCase() === 'authorization');
    val = pair ? pair[1] : null;
  } else if (typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === 'authorization' && typeof v === 'string') {
        val = v;
        break;
      }
    }
  }
  if (!val) return null;
  return val.replace(/^Bearer\s+/i, '').trim();
}

function computeClockSkewWaitMs(res: Response, token: string | null, fallbackMs: number): number {
  if (!token) return fallbackMs;
  try {
    const parts = token.split('.');
    if (parts.length >= 2) {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(base64));
      if (typeof payload.iat === 'number') {
        const serverDateHeader = res.headers.get('date');
        const serverTimeMs = serverDateHeader ? Date.parse(serverDateHeader) : Date.now();
        const iatMs = payload.iat * 1000;
        const skewMs = iatMs - serverTimeMs;
        if (skewMs > 0) {
          // Add 800ms safety margin to guarantee server clock has moved past iat
          return Math.min(skewMs + 800, 5000);
        }
      }
    }
  } catch {
    // If decoding or header reading fails, return fallback
  }
  return fallbackMs;
}

async function clockSkewAwareFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const maxRetries = 3;
  let delayMs = 1200;

  let requestUrl: string | URL;
  let requestInit: RequestInit = { ...init };

  if (input instanceof Request) {
    requestUrl = input.url;
    requestInit = {
      method: input.method,
      headers: input.headers,
      mode: input.mode,
      credentials: input.credentials,
      cache: input.cache,
      redirect: input.redirect,
      referrer: input.referrer,
      integrity: input.integrity,
      ...init,
    };
    if (init?.body === undefined && input.body) {
      try {
        const cloned = input.clone();
        requestInit.body = await cloned.arrayBuffer();
      } catch {
        // If body buffering fails, proceed with original
      }
    }
  } else {
    requestUrl = input;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(requestUrl, requestInit);

    // PostgREST returns 401 when the JWT iat claim is in the future
    if (res.status === 401 && attempt < maxRetries) {
      try {
        const cloned = res.clone();
        const text = await cloned.text();
        const errorCode = res.headers.get('sb-error-code') || '';
        const isClockSkew =
          /jwt.*future|issued at future|pgrst303|iat.*future/i.test(text) ||
          /jwt.*future|pgrst303/i.test(errorCode);

        if (isClockSkew) {
          const token = extractAuthToken(requestInit.headers);
          const waitMs = computeClockSkewWaitMs(res, token, delayMs);
          console.warn(`[OTP Auth] Clock skew detected (JWT issued at future, attempt ${attempt + 1}/${maxRetries}). Retrying in ${waitMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          delayMs = Math.min(delayMs * 1.5, 3000);
          continue;
        }
      } catch {
        // If reading/cloning fails, return the original response
      }
    }
    return res;
  }
  return await fetch(requestUrl, requestInit);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storage: sessionStore(), persistSession: true, autoRefreshToken: true },
  global: { fetch: clockSkewAwareFetch },
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
