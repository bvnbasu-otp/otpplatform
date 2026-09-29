import { resolveNotificationStatus, type NotificationStatusResolution } from '@otp/domain';
import { supabase } from '@/lib/supabase';

/**
 * One place every client call site goes through to reach the server-side
 * dispatch edge functions (otp-dispatch, onboarding-notify).
 *
 * D-21/A-30/B-01: the browser never generates a code, never builds a
 * WhatsApp/SMS message body, and never calls a messaging provider directly
 * any more — it only ever asks one of these two edge functions to do that,
 * and is told success/failure (mapped onto the same truthful
 * NotificationStatusResolution scale the rest of the UI already uses for
 * "submitted, not delivered" copy). No destination detail (masked phone,
 * partial email) is ever present in what these functions return, so none
 * can leak through here either.
 */
export interface EdgeDispatchResult {
  ok: boolean;
  error?: string;
  debugCode?: string;
  status?: string;
}

function deliveryFromResult(
  channel: 'EMAIL' | 'WHATSAPP',
  result: EdgeDispatchResult,
): NotificationStatusResolution {
  return resolveNotificationStatus({
    channel,
    observation: {
      kind: 'HTTP_RESPONSE',
      httpStatus: result.ok ? 200 : 400,
      errorMessage: result.ok ? null : result.error ?? 'Request failed',
    },
  });
}

async function readHttpErrorBody(error: unknown): Promise<EdgeDispatchResult | null> {
  if (!error || typeof error !== 'object') return null;
  const ctx = (error as { context?: Response }).context;
  if (!ctx || typeof ctx.json !== 'function') return null;
  try {
    const body = await ctx.json();
    if (body && typeof body === 'object') {
      return (body ?? { ok: false }) as EdgeDispatchResult;
    }
  } catch {
    // ignore parse failures
  }
  return null;
}

export async function invokeEdgeFunction(
  name: string,
  body: Record<string, unknown>,
  channel: 'WHATSAPP' | 'EMAIL' = 'WHATSAPP',
): Promise<{ result: EdgeDispatchResult; delivery: NotificationStatusResolution }> {
  try {
    const { data, error } = await supabase.functions.invoke(name, { body });

    if (error) {
      const parsed = await readHttpErrorBody(error);
      if (parsed) {
        return { result: parsed, delivery: deliveryFromResult(channel, parsed) };
      }
      return {
        result: { ok: false, error: 'We could not reach the notification service. Please try again shortly.' },
        delivery: resolveNotificationStatus({
          channel,
          observation: { kind: 'NETWORK_ERROR', errorMessage: error.message },
        }),
      };
    }

    const result = (data ?? { ok: false }) as EdgeDispatchResult;
    return { result, delivery: deliveryFromResult(channel, result) };
  } catch (err) {
    return {
      result: { ok: false, error: 'We could not reach the notification service. Please try again shortly.' },
      delivery: resolveNotificationStatus({
        channel,
        observation: { kind: 'NETWORK_ERROR', errorMessage: err instanceof Error ? err.message : String(err) },
      }),
    };
  }
}
