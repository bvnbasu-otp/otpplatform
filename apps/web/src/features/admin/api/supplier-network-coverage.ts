import { supabase } from '@/lib/supabase';

export interface PrepareLocationNetworkInput {
  state: string;
  city: string;
  pincode: string;
  category: string;
  forceRefresh: boolean;
  executeDiscovery: boolean;
}

export interface SupplierNetworkRecoveryJob {
  scope_key: string;
  state: string;
  city: string;
  pincode: string;
  category: string;
  status: 'queued' | 'in_progress' | 'completed' | 'partial' | 'failed' | 'exhausted';
  retry_count: number;
  max_retries: number;
  next_attempt_at: string | null;
  error_code: string | null;
  last_error: string | null;
  recovered_at: string | null;
  supplier_count: number;
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

export async function fetchSupplierNetworkRecoveryJobs(): Promise<
  { ok: true; jobs: SupplierNetworkRecoveryJob[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase.functions.invoke('location-pin-coverage', {
    body: { mode: 'list_recovery_jobs', limit: 50 },
  });
  if (error) return { ok: false, error: error.message };
  const payload = (data ?? {}) as { jobs?: SupplierNetworkRecoveryJob[] };
  return { ok: true, jobs: Array.isArray(payload.jobs) ? payload.jobs : [] };
}

export async function retrySupplierNetworkRecovery(scopeKey: string): Promise<
  { ok: true; message: string } | { ok: false; error: string }
> {
  const { data, error } = await supabase.functions.invoke('location-pin-coverage', {
    body: { mode: 'retry_recovery_job', scopeKey },
  });
  if (error) return { ok: false, error: error.message };
  const payload = (data ?? {}) as { ok?: boolean; message?: string };
  return payload.ok
    ? { ok: true, message: payload.message ?? 'Coverage retry queued.' }
    : { ok: false, error: payload.message ?? 'Coverage retry could not be queued.' };
}
