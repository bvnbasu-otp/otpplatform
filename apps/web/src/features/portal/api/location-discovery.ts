import { supabase } from '@/lib/supabase';

/** Fire-and-forget buyer onboarding PIN discovery (non-blocking). */
export function queueBuyerPinDiscovery(input: {
  state: string;
  city: string;
  pincode: string;
  category?: string;
}): void {
  const category = input.category?.trim();
  if (!category) {
    return;
  }
  void supabase.functions
    .invoke('location-pin-coverage', {
      body: {
        state: input.state,
        city: input.city,
        pincode: input.pincode,
        category,
        forceRefresh: false,
        executeDiscovery: true,
        asyncMode: true,
      },
    })
    .catch(() => undefined);
}
