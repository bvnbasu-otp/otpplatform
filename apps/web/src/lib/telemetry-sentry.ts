/**
 * Sentry adapter. Loaded on demand only when `VITE_SENTRY_DSN` is set.
 *
 * The `@sentry/browser` package is intentionally not a hard dependency: the
 * app compiles and ships without it, and this module only makes sense to
 * import when a project actually adds it. If Sentry is not installed the
 * dynamic import in main.tsx catches the error and the telemetry fallback
 * (console) remains active.
 */
import { installTelemetry } from './telemetry';

export async function installSentry(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  try {
    // Dynamically evaluated import expression so Vite static import analysis does not attempt resolution
    const dynamicImport = new Function('modulePath', 'return import(modulePath)');
    const Sentry = await dynamicImport('@sentry/browser');
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
    });

    installTelemetry((error: Error, context?: Record<string, unknown>) => {
      Sentry.captureException(error, { extra: context });
    });
  } catch {
    // Sentry package not installed or failed to initialize; fallback to console telemetry
  }
}
