import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AboutPage } from './pages/AboutPage';

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/about-us', hash: '', search: '' }),
  useNavigate: () => vi.fn(),
  Link: ({ children, to, ...props }: any) =>
    React.createElement('a', { href: to, ...props }, children),
  NavLink: ({ children, to, ...props }: any) =>
    React.createElement('a', { href: to, ...props }, children),
}));

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false }),
}));

vi.mock('@/features/roles', () => ({
  useRoleContext: () => ({
    context: {
      signedIn: false,
      profileId: null,
      side: 'BUYER',
      isFounder: false,
      isPlatformAdmin: false,
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

describe('AboutPage Product Leadership & Provenance Suite', () => {
  it('renders Product Creator & Author attribution cleanly', () => {
    const html = renderToStaticMarkup(<AboutPage />);
    expect(html).toContain('Product Creator &amp; Author');
    expect(html).toContain('Baskar Loganathan');
  });

  it('renders Product Manager attribution cleanly', () => {
    const html = renderToStaticMarkup(<AboutPage />);
    expect(html).toContain('Product Manager');
    expect(html).toContain('Baskar Loganathan');
  });

  it('renders CEO / Founder attribution cleanly', () => {
    const html = renderToStaticMarkup(<AboutPage />);
    expect(html).toContain('CEO / Founder');
    expect(html).toContain('Baskar Loganathan');
  });
});
