import { vi } from 'vitest';

export function createSupabaseQueryMock(data: any = null, error: any = null): any {
  let resolvedData = data;
  let resolvedError = error;
  if (
    data !== null &&
    typeof data === 'object' &&
    ('data' in data || 'error' in data) &&
    error === null
  ) {
    resolvedData = data.data;
    resolvedError = data.error ?? null;
  }

  const resolvedResult = { data: resolvedData, error: resolvedError };
  const chain: any = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    or: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn().mockImplementation(() => {
      const singleData = Array.isArray(resolvedData)
        ? (resolvedData[0] ?? null)
        : resolvedData;
      return Promise.resolve({ data: singleData, error: resolvedError });
    }),
    single: vi.fn().mockImplementation(() => {
      const singleData = Array.isArray(resolvedData)
        ? (resolvedData[0] ?? null)
        : resolvedData;
      return Promise.resolve({ data: singleData, error: resolvedError });
    }),
    then: (resolve: (val: any) => any, reject?: (err: any) => any) =>
      Promise.resolve(resolvedResult).then(resolve, reject),
    catch: (reject: (err: any) => any) =>
      Promise.resolve(resolvedResult).catch(reject),
  };
  return chain;
}

// Global singleton to guarantee shared reference across non-isolated test suites
const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
  from: vi.fn(() => createSupabaseQueryMock([])),
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
  },
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'http://localhost' }, error: null }),
      remove: vi.fn().mockResolvedValue({ data: {}, error: null }),
    })),
  },
};

(globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;

export const mockSupabase: Record<string, any> = globalMock;
export const supabase = globalMock;
