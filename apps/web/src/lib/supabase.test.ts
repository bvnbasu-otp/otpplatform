import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveSupabaseUrl, setRememberDevice } from './supabase';

describe('Supabase Client Configuration & Resolver', () => {
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => mockStorage[k] ?? null,
        setItem: (k: string, v: string) => {
          mockStorage[k] = v;
        },
        removeItem: (k: string) => {
          delete mockStorage[k];
        },
      },
      location: {
        hostname: 'localhost',
        origin: 'http://localhost:3000',
      },
    });
  });

  it('prioritizes explicit environment URL when provided', () => {
    const customUrl = 'https://custom-supabase.example.com';
    const resolved = resolveSupabaseUrl(customUrl, 'otpplatform-theta.vercel.app', 'https://otpplatform-theta.vercel.app');
    expect(resolved).toBe(customUrl);
  });

  it('routes through same-origin when running on reverse-proxy host (not localhost, not vercel)', () => {
    const resolved = resolveSupabaseUrl(
      null,
      'app.my-custom-domain.com',
      'https://app.my-custom-domain.com'
    );
    expect(resolved).toBe('https://app.my-custom-domain.com');
  });

  it('falls back to local development URL on localhost', () => {
    const resolved = resolveSupabaseUrl(
      null,
      'localhost',
      'http://localhost:3000'
    );
    expect(resolved).toBe('http://127.0.0.1:54321');
  });

  it('falls back to local development URL on 127.0.0.1', () => {
    const resolved = resolveSupabaseUrl(
      null,
      '127.0.0.1',
      'http://127.0.0.1:3000'
    );
    expect(resolved).toBe('http://127.0.0.1:54321');
  });

  it('handles vercel.app domains without crashing and detects missing cloud env vars', () => {
    const resolved = resolveSupabaseUrl(
      null,
      'otpplatform-theta.vercel.app',
      'https://otpplatform-theta.vercel.app'
    );
    // When VITE_SUPABASE_URL is omitted during build, it falls back to LOCAL_SUPABASE_URL
    expect(resolved).toBe('http://127.0.0.1:54321');
  });

  it('correctly toggles device remember flag in localStorage', () => {
    setRememberDevice(true);
    expect(window.localStorage.getItem('otp.remember_device')).toBe('true');

    setRememberDevice(false);
    expect(window.localStorage.getItem('otp.remember_device')).toBe('false');
  });
});
