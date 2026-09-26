import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AboutPage } from './pages/AboutPage';

const roleState = vi.hoisted(() => ({ isFounder: false, isPlatformAdmin: false }));

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false }),
}));

vi.mock('@/features/roles', () => ({
  useRoleContext: () => ({
    context: {
      signedIn: roleState.isFounder || roleState.isPlatformAdmin,
      profileId: null,
      side: 'BUYER',
      isFounder: roleState.isFounder,
      isPlatformAdmin: roleState.isPlatformAdmin,
      needsOnboarding: false,
      activeRole: null,
      roles: [],
      organizations: [],
      orgRole: null,
      organizationId: null,
      organizationName: null,
      buyerType: null,
      committeeRfqCount: 0,
      supplierId: null,
      fullName: null,
      title: null,
      avatarUrl: null,
      email: null,
    },
    switchRole: vi.fn(),
    switchOrganization: vi.fn(),
  }),
}));

function renderAbout(): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/about-us']}>
      <AboutPage />
    </MemoryRouter>,
  );
}

describe('AboutPage Product Leadership & Provenance — hidden from the public', () => {
  beforeEach(() => {
    roleState.isFounder = false;
    roleState.isPlatformAdmin = false;
  });

  it('does not render Product Leadership or Provenance for an anonymous visitor', () => {
    const html = renderAbout();
    expect(html).not.toContain('data-testid="product-leadership-provenance"');
    expect(html).not.toMatch(/Provenance/i);
    expect(html).not.toMatch(/Product Leadership/i);
    expect(html).not.toContain('Product Creator &amp; Author');
  });

  it('renders Product Creator, Product Manager and CEO / Founder attribution for the founder', () => {
    roleState.isFounder = true;
    const html = renderAbout();
    expect(html).toContain('data-testid="product-leadership-provenance"');
    expect(html).toContain('Product Creator &amp; Author');
    expect(html).toContain('Product Manager');
    expect(html).toContain('CEO / Founder');
    expect(html).toContain('Baskar Loganathan');
  });

  it('renders the provenance block for a platform admin', () => {
    roleState.isPlatformAdmin = true;
    const html = renderAbout();
    expect(html).toContain('data-testid="product-leadership-provenance"');
  });
});
