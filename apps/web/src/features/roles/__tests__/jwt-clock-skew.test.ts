import { describe, expect, it, vi } from 'vitest';
import {
  isJwtFutureError,
  retryOnClockSkew,
  fetchRoleContext,
  fetchRoleCatalog,
  chooseMyRole,
} from '../api/roles';
import { supabase } from '@/lib/supabase';
import { translateError } from '@/lib/error-translator';

describe('JWT clock-skew resilience & automatic retry', () => {
  it('identifies clock-skew future-issued JWT errors accurately', () => {
    expect(isJwtFutureError('JWT issued at future')).toBe(true);
    expect(isJwtFutureError('jwt issued in the future')).toBe(true);
    expect(isJwtFutureError('PGRST303: JWT issued at future')).toBe(true);
    expect(isJwtFutureError({ message: 'JWT issued at future' })).toBe(true);
    expect(isJwtFutureError({ code: 'PGRST303', message: 'token iat is in the future' })).toBe(true);

    // Negative assertions
    expect(isJwtFutureError('permission denied for function my_role_context')).toBe(false);
    expect(isJwtFutureError('42501')).toBe(false);
    expect(isJwtFutureError('Network error')).toBe(false);
    expect(isJwtFutureError(null)).toBe(false);
    expect(isJwtFutureError(undefined)).toBe(false);
  });

  it('translates clock-skew errors into a clear user-facing synchronization message', () => {
    const translated = translateError('JWT issued at future');
    expect(translated).toContain('Your device clock is slightly out of sync with the server');
  });

  it('retries on clock skew and succeeds on second attempt without waiting full delay in test', async () => {
    let attempts = 0;
    const mockFn = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts === 1) {
        return { data: null, error: { message: 'JWT issued at future' } };
      }
      return { data: { success: true }, error: null };
    });

    const res = await retryOnClockSkew(mockFn, 10);
    expect(attempts).toBe(2);
    expect(res.data).toEqual({ success: true });
    expect(res.error).toBeNull();
  });

  it('does NOT retry on unrelated non-clock-skew errors', async () => {
    let attempts = 0;
    const mockFn = vi.fn().mockImplementation(async () => {
      attempts++;
      return { data: null, error: { message: 'permission denied for function my_role_context' } };
    });

    const res = await retryOnClockSkew(mockFn, 10);
    expect(attempts).toBe(1);
    expect(res.data).toBeNull();
    expect(res.error?.message).toBe('permission denied for function my_role_context');
  });

  it('fetchRoleContext automatically recovers from transient clock skew without demoting to onboarding', async () => {
    let rpcCount = 0;
    vi.spyOn(supabase, 'rpc').mockImplementation((fn: string) => {
      if (fn === 'my_role_context') {
        rpcCount++;
        if (rpcCount === 1) {
          return Promise.resolve({
            data: null,
            error: { message: 'JWT issued at future' },
          }) as any;
        }
        return Promise.resolve({
          data: {
            signedIn: true,
            profileId: 'admin-123',
            isPlatformAdmin: true,
            isFounder: true,
            needsOnboarding: false,
            email: 'bvnbasu@gmail.com',
            roles: [],
          },
          error: null,
        }) as any;
      }
      return Promise.resolve({ data: null, error: null }) as any;
    });

    const result = await fetchRoleContext();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.signedIn).toBe(true);
      expect(result.context.isPlatformAdmin).toBe(true);
      expect(result.context.isFounder).toBe(true);
      expect(result.context.needsOnboarding).toBe(false);
      expect(result.context.email).toBe('bvnbasu@gmail.com');
    }
    expect(rpcCount).toBe(2);
  });

  it('fetchRoleCatalog automatically retries on clock skew and returns canonical roles', async () => {
    let rpcCount = 0;
    vi.spyOn(supabase, 'rpc').mockImplementation((fn: string) => {
      if (fn === 'role_catalog') {
        rpcCount++;
        if (rpcCount === 1) {
          return Promise.resolve({
            data: null,
            error: { message: 'PGRST303: JWT issued at future' },
          }) as any;
        }
        return Promise.resolve({
          data: [
            {
              code: 'PROCUREMENT_LEAD',
              side: 'BUYER',
              label: 'Procurement Lead',
              description: 'Operational sourcing access',
              permissions: ['READ', 'WRITE', 'PROPOSE'],
            },
          ],
          error: null,
        }) as any;
      }
      return Promise.resolve({ data: null, error: null }) as any;
    });

    const result = await fetchRoleCatalog('BUYER');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.roles).toHaveLength(1);
      expect(result.roles[0]?.code).toBe('PROCUREMENT_LEAD');
    }
    expect(rpcCount).toBe(2);
  });

  it('fetchRoleContext preserves explicit error and never synthesizes needsOnboarding when clock skew persists', async () => {
    let rpcCount = 0;
    vi.spyOn(supabase, 'rpc').mockImplementation((fn: string) => {
      if (fn === 'my_role_context') {
        rpcCount++;
        return Promise.resolve({
          data: null,
          error: { message: 'PGRST303: JWT issued at future' },
        }) as any;
      }
      return Promise.resolve({ data: null, error: null }) as any;
    });

    vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
      data: {
        user: {
          id: 'admin-123',
          email: 'bvnbasu@gmail.com',
          user_metadata: { full_name: 'Baskar Loganathan' },
        } as any,
      },
      error: null,
    } as any);

    vi.spyOn(supabase, 'from').mockReturnValue({
      select: () => ({
        or: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: null,
              error: { message: 'PGRST303: JWT issued at future' },
            }),
        }),
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: null,
              error: { message: 'PGRST303: JWT issued at future' },
            }),
        }),
      }),
    } as any);

    const result = await fetchRoleContext();
    // Criterion 3 & 4: Must return explicit recoverable error; NEVER synthesize ok: true with needsOnboarding: true or demote admin
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/JWT issued at future/i);
    }
    // Strict retry limit: max 1 retry (2 attempts total)
    expect(rpcCount).toBe(2);
  });

  it('fetchRoleContext preserves explicit error when profile query is unavailable', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: null,
      error: { message: 'my_role_context RPC timeout after 5000ms' },
    } as any);

    vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
      data: {
        user: {
          id: 'user-456',
          email: 'customer@example.com',
          user_metadata: {},
        } as any,
      },
      error: null,
    } as any);

    vi.spyOn(supabase, 'from').mockReturnValue({
      select: () => ({
        or: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: null,
              error: { message: '503 Service Unavailable' },
            }),
        }),
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: null,
              error: { message: '503 Service Unavailable' },
            }),
        }),
      }),
    } as any);

    const result = await fetchRoleContext();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/503 Service Unavailable|timeout/i);
    }
  });
});

