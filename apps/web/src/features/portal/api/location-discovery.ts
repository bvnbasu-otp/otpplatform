import { supabase } from '@/lib/supabase';
import { PIN_ONLY_WARMING_CATEGORY } from '@otp/domain';

/** Fire-and-forget buyer onboarding PIN discovery (non-blocking). */
export function queueBuyerPinDiscovery(input: {
  requestId?: string;
  state: string;
  city: string;
  pincode: string;
}): void {
  if (!input.requestId) return;

  void supabase.functions
    .invoke('location-pin-coverage', {
      body: {
        state: input.state,
        city: input.city,
        pincode: input.pincode,
        signupRequestId: input.requestId,
        category: PIN_ONLY_WARMING_CATEGORY,
        discoveryContext: 'BUYER_ONBOARDING',
        forceRefresh: false,
        executeDiscovery: true,
        asyncMode: true,
      },
    })
    .catch(() => undefined);
}
