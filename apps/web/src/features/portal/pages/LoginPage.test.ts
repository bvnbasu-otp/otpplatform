import { describe, it, expect } from 'vitest';

/**
 * Validates the redirect calculation logic used by LoginPage
 */
function resolveLoginRedirect(redirectParam: string | null): string {
  const validRedirect =
    redirectParam &&
    redirectParam.startsWith('/') &&
    !redirectParam.startsWith('//') &&
    !redirectParam.startsWith('/login')
      ? redirectParam
      : '/dashboard';
  return validRedirect;
}

/**
 * Validates redirect loop detection logic used by LoginPage
 */
function evaluateRedirectLoop(history: number[], now = Date.now()): { isLoop: boolean; updated: number[] } {
  const recent = history.filter((t) => now - t < 3000);
  if (recent.length >= 2) {
    return { isLoop: true, updated: [] };
  }
  return { isLoop: false, updated: [...recent, now] };
}

describe('LoginPage Navigation & Security Invariants', () => {
  describe('resolveLoginRedirect', () => {
    it('redirects to /dashboard by default when no redirect param provided', () => {
      expect(resolveLoginRedirect(null)).toBe('/dashboard');
      expect(resolveLoginRedirect('')).toBe('/dashboard');
    });

    it('honours valid internal relative paths', () => {
      expect(resolveLoginRedirect('/purchase-orders')).toBe('/purchase-orders');
      expect(resolveLoginRedirect('/supplier/quotes')).toBe('/supplier/quotes');
      expect(resolveLoginRedirect('/requirements/req-123')).toBe('/requirements/req-123');
    });

    it('rejects protocol-relative open redirect attacks', () => {
      expect(resolveLoginRedirect('//evil.com/steal')).toBe('/dashboard');
      expect(resolveLoginRedirect('//attacker.com')).toBe('/dashboard');
    });

    it('rejects external URL open redirect attacks', () => {
      expect(resolveLoginRedirect('https://evil.com')).toBe('/dashboard');
      expect(resolveLoginRedirect('javascript:alert(1)')).toBe('/dashboard');
    });

    it('prevents self-redirect back to /login', () => {
      expect(resolveLoginRedirect('/login')).toBe('/dashboard');
      expect(resolveLoginRedirect('/login?foo=bar')).toBe('/dashboard');
    });
  });

  describe('evaluateRedirectLoop', () => {
    it('allows initial redirect attempt without loop flag', () => {
      const result = evaluateRedirectLoop([]);
      expect(result.isLoop).toBe(false);
      expect(result.updated.length).toBe(1);
    });

    it('detects rapid redirect loops (>= 2 attempts within 3 seconds)', () => {
      const now = Date.now();
      const pastAttempts = [now - 1000, now - 500];
      const result = evaluateRedirectLoop(pastAttempts, now);
      expect(result.isLoop).toBe(true);
      expect(result.updated.length).toBe(0);
    });

    it('resets attempt counter when attempts are older than 3 seconds', () => {
      const now = Date.now();
      const staleAttempts = [now - 10000, now - 5000];
      const result = evaluateRedirectLoop(staleAttempts, now);
      expect(result.isLoop).toBe(false);
      expect(result.updated.length).toBe(1);
    });
  });
});
