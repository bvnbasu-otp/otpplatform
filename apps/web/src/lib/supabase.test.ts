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

  it('does not accept a hosted URL unless the deployment class agrees with its project ref', () => {
    const customUrl = 'https://custom-supabase.example.com';
    const resolved = resolveSupabaseUrl(customUrl, 'otpplatform-theta.vercel.app', 'https://otpplatform-theta.vercel.app');
    expect(resolved).toBe('');
  });

  it('does not use the page origin as the database when no deployment target is configured', () => {
    const resolved = resolveSupabaseUrl(
      null,
      'app.my-custom-domain.com',
      'https://app.my-custom-domain.com'
    );
    expect(resolved).toBe('');
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

  it('does not treat a vercel.app host as a database target', () => {
    const resolved = resolveSupabaseUrl(
      null,
      'otpplatform-theta.vercel.app',
      'https://otpplatform-theta.vercel.app'
    );
    expect(resolved).toBe('');
  });

  it('keeps the same database target when the viewport toggle changes', () => {
    const desktop = resolveSupabaseUrl(null, 'localhost', 'http://localhost:3000', { viewMode: 'desktop' });
    const mobile = resolveSupabaseUrl(null, 'localhost', 'http://localhost:3000', { viewMode: 'mobile' });
    expect(desktop).toBe('http://127.0.0.1:54321');
    expect(mobile).toBe(desktop);
  });

  it('refuses the documented production project when the class is non-production', () => {
    const resolved = resolveSupabaseUrl(
      'https://qsuvtcezffomtwzwyrso.supabase.co',
      'localhost',
      'http://localhost:3000',
      { deploymentTarget: 'non-production' },
    );
    expect(resolved).toBe('');
  });

  it('correctly toggles device remember flag in localStorage', () => {
    setRememberDevice(true);
    expect(window.localStorage.getItem('otp.remember_device')).toBe('true');

    setRememberDevice(false);
    expect(window.localStorage.getItem('otp.remember_device')).toBe('false');
  });
});
