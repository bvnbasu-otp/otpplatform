import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false, isLoading: false }),
}));

describe('X2O Mobile-First LandingPage', () => {
  it('renders X2O registration wizard and canonical SEO markers', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/']}>
        <LandingPage />
      </MemoryRouter>,
    );

    expect(html).toContain('X2O');
    expect(html).toContain('Tell, Review, Decide &amp; Track in one place');
    expect(html).toContain('data-testid="primary-cta-area"');
    expect(html).toContain('data-testid="public-journey"');
    expect(html).toContain('data-testid="trust-principles"');
    expect(html).toContain('data-testid="site-footer"');
  });
});
