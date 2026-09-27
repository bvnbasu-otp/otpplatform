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

export async function invokeEdgeFunction(
  name: string,
  body: Record<string, unknown>,
): Promise<{ result: EdgeDispatchResult; delivery: NotificationStatusResolution }> {
  try {
    const { data, error } = await supabase.functions.invoke(name, { body });

    if (error) {
      return {
        result: { ok: false, error: 'We could not reach the notification service. Please try again shortly.' },
        delivery: resolveNotificationStatus({
          channel: 'WHATSAPP',
          observation: { kind: 'NETWORK_ERROR', errorMessage: error.message },
        }),
      };
    }

    const result = (data ?? { ok: false }) as EdgeDispatchResult;
    return {
      result,
      delivery: resolveNotificationStatus({
        channel: 'WHATSAPP',
        observation: {
          kind: 'HTTP_RESPONSE',
          httpStatus: result.ok ? 200 : 400,
          errorMessage: result.ok ? null : result.error ?? 'Request failed',
        },
      }),
    };
  } catch (err) {
    return {
      result: { ok: false, error: 'We could not reach the notification service. Please try again shortly.' },
      delivery: resolveNotificationStatus({
        channel: 'WHATSAPP',
        observation: { kind: 'NETWORK_ERROR', errorMessage: err instanceof Error ? err.message : String(err) },
      }),
    };
  }
}
