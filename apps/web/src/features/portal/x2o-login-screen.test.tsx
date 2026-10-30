import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false, isLoading: false }),
}));

vi.mock('@/features/auth/components/SignInForm', () => ({
  SignInForm: () => React.createElement('form', { 'data-testid': 'sign-in-form-mock' }),
}));

vi.mock('@/features/maintenance', () => ({
  useMaintenance: () => ({ isMaintenanceMode: false }),
}));

describe('X2O Mobile-First LoginPage', () => {
  it('renders X2O branding and sign-in heading', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(html).toContain('X2O');
    expect(html).toContain('Sign in to your account');
    expect(html).toContain('Register on X2O');
    expect(html).toContain('data-testid="sign-in-form-mock"');
  });

  it('preserves canonical brand positioning in screen-reader container', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(html).toContain('data-testid="login-brand-title"');
    expect(html).toContain('OTP — Identity-Protected Competitive Sourcing');
  });
});
