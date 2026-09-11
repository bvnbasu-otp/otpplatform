/**
 * The messaging core, as one entry point.
 *
 * Imported by three callers: the inbound webhook (Deno), the demo UI in the web
 * app (via the @otp/messaging alias), and the unit tests (Node). One
 * implementation of parsing, phone handling and message copy for all three —
 * so the demo cannot demonstrate behaviour that production does not have, and a
 * fix to the parser lands everywhere at once.
 */

export * from './types.ts';
export * from './phone.ts';
export * from './parser.ts';
export * from './templates.ts';
export * from './crypto.ts';
export * from './providers/mock.ts';
export * from './providers/twilio.ts';
export * from './providers/meta.ts';
export * from './providers/resolve.ts';
