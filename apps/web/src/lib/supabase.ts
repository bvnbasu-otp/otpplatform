import { createClient } from '@supabase/supabase-js';
import { resolveDeploymentTarget } from '@otp/domain';

// Every environment supplies its own project-scoped public key. Keeping even a
// local fallback JWT in tracked source makes accidental cross-project use easy.
const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabaseAnonKey = envKey || 'missing-supabase-anon-key';

export interface SupabaseUrlResolutionOptions {
  deploymentTarget?: string | null;
  projectRef?: string | null;
  demoMode?: string | null;
  anonKey?: string | null;
  /** Presentation state. It does not select a database. */
  viewMode?: string | null;
}

/**
 * Resolves the database URL from the deployment class and Supabase URL.
 * A page hostname, viewport toggle, or missing non-production variable
 * cannot select the production project.
 */
export function resolveSupabaseUrl(
  envUrlOverride?: string | null,
  hostnameOverride?: string,
  _originOverride?: string,
  options?: SupabaseUrlResolutionOptions,
): string {
  const targetEnvUrl = envUrlOverride !== undefined ? (envUrlOverride || '') : (envUrl || '');
  const host = hostnameOverride !== undefined
    ? hostnameOverride
    : (typeof window !== 'undefined' ? window.location.hostname : '');
  const result = resolveDeploymentTarget({
    deploymentTarget: options?.deploymentTarget ?? import.meta.env.VITE_OTP_DEPLOYMENT_TARGET,
    supabaseUrl: targetEnvUrl,
    projectRef: options?.projectRef ?? import.meta.env.VITE_SUPABASE_PROJECT_REF,
    demoMode: options?.demoMode ?? import.meta.env.VITE_DEMO_MODE,
    anonKey: options?.anonKey ?? (envKey || ''),
    serviceRoleKeyPresent: Boolean(import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY),
    viewMode: options?.viewMode,
    viteProductionBuild: import.meta.env.PROD,
    pageHostname: host,
  });
  if (!result.ok || !result.databaseSelected || !result.supabaseUrl) return '';
  return result.supabaseUrl;
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
    const payloadPart = parts[1];
    if (parts.length >= 2 && payloadPart) {
      const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
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
