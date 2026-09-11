/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /**
   * Legacy pilot switch: selects which hard-coded walkthrough fixture the
   * pilot screens point at. Whether the demo framework itself is on is a
   * server-side fact (demo_settings), read through demo_status().
   */
  readonly VITE_DEMO_MODE: string;
  /** Optional. When set, `@sentry/browser` is loaded and errors are captured. */
  readonly VITE_SENTRY_DSN?: string;
  /**
   * Shared password for every demo login. The demo account registry
   * deliberately stores no credential material, so this is the one place a
   * password lives — and it is a per-environment setting, not a per-account map.
   */
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
