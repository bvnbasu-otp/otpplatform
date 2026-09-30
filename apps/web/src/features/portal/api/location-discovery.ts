import { supabase } from '@/lib/supabase';

/** Fire-and-forget buyer onboarding PIN discovery (non-blocking). */
export function queueBuyerPinDiscovery(input: {
  state: string;
  city: string;
  pincode: string;
  category?: string;
}): void {
  void supabase.functions
    .invoke('location-pin-coverage', {
      body: {
        state: input.state,
        city: input.city,
        pincode: input.pincode,
        category: input.category ?? 'General Commercial Supplies',
        forceRefresh: false,
        executeDiscovery: true,
        asyncMode: true,
      },
    })
    .catch(() => undefined);
}
