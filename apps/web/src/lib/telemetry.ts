/**
 * PII Sanitizer & Telemetry Logger
 * Automatically masks emails, phone numbers, tokens, and passwords from exception messages and stacks.
 */

export interface ErrorContext {
  componentStack?: string;
  route?: string;
  [key: string]: unknown;
}

export type Reporter = (error: Error, context?: ErrorContext) => void;

export function sanitizeErrorText(text: string): string {
  return text
    // Mask email addresses
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
    // Mask 10-digit Indian phones / E.164 phones
    .replace(/(?:\+91[\s-]?)?[6-9]\d{9}/g, '[REDACTED_PHONE]')
    // Mask Bearer tokens / JWTs
    .replace(/Bearer\s+[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/gi, 'Bearer [REDACTED_TOKEN]')
    // Mask passwords in query strings or JSON
    .replace(/(password|secret|apikey)["']?\s*[:=]\s*["']?[^"'\s,}]+/gi, '$1=[REDACTED]');
}

export function sanitizeError(err: Error): Error {
  const sanitized = new Error(sanitizeErrorText(err.message));
  sanitized.name = err.name;
  if (err.stack) {
    sanitized.stack = sanitizeErrorText(err.stack);
  }
  return sanitized;
}

let reporter: Reporter = (error, context) => {
  // eslint-disable-next-line no-console
  console.error('[otp:telemetry]', sanitizeError(error), context);
};

export function installTelemetry(next: Reporter): void {
  reporter = next;
}

export function hasSentryDsn(): boolean {
  try {
    return Boolean(import.meta.env?.VITE_SENTRY_DSN);
  } catch {
    return false;
  }
}

export function reportError(error: unknown, context?: ErrorContext): void {
  const err = error instanceof Error ? error : new Error(String(error));
  try {
    const sanitized = sanitizeError(err);
    const route = typeof window !== 'undefined' ? window.location?.pathname : undefined;
    reporter(sanitized, { route, ...context });
  } catch {
    // Fail silently
  }
}
