import { supabase } from '@/lib/supabase';

export interface PrepareLocationNetworkInput {
  state: string;
  city: string;
  pincode: string;
  category: string;
  forceRefresh: boolean;
  executeDiscovery: boolean;
}

export async function prepareLocationNetworkViaCoverageService(
  input: PrepareLocationNetworkInput,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('location-pin-coverage', { body: input });
  if (error) {
    return {
      ok: false,
      message: error.message,
      error: 'EDGE_UNAVAILABLE',
    };
  }
  return (data ?? { ok: false, message: 'Empty coverage response.' }) as Record<string, unknown>;
}
