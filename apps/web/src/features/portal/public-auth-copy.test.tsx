import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { BUYER_COPY, SUPPLIER_COPY } from './types/portal';

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false, isLoading: false }),
}));

vi.mock('@/features/auth/components/SignInForm', () => ({
  SignInForm: () => React.createElement('form', { 'data-testid': 'sign-in-form-stub' }),
}));

vi.mock('@/features/maintenance', () => ({
  useMaintenance: () => ({ isMaintenanceMode: false }),
}));

vi.mock('@/features/roles', () => ({
  useRoleContext: () => ({
    context: {
      signedIn: false,
      side: 'BUYER',
      isFounder: false,
      isPlatformAdmin: false,
      roles: [],
      organizations: [],
      avatarUrl: null,
    },
    switchRole: vi.fn(),
    switchOrganization: vi.fn(),
  }),
}));

const CANONICAL_TITLE = 'OTP — Identity-Protected Competitive Sourcing';
const CANONICAL_SUBTITLE = 'Compare competing supplier quotes and make better procurement decisions.';
const JARGON =
  /\bRLS\b|row[- ]level|\bdatabase\b|cryptograph|\bSHA\b|\bhash|\bsalt|architecture|\bWAHA\b|append-only|postgres|supabase|edge function/i;

function render(ui: React.ReactElement, path: string): string {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
}

function toText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
}

describe('sign-in page copy', () => {
  it('shows the canonical title and subtitle', () => {
    const text = toText(render(<LoginPage />, '/login'));
    expect(text).toContain(CANONICAL_TITLE);
    expect(text).toContain(CANONICAL_SUBTITLE);
    expect(text).not.toMatch(/Neutral Sourcing|Procurement Cockpit/i);
  });
});

describe('registration page copy', () => {
  it.each(['/signup?side=buyer', '/signup?side=supplier'])('%s shows the canonical title and subtitle', (path) => {
    const text = toText(render(<SignupPage />, path));
    expect(text).toContain(CANONICAL_TITLE);
    expect(text).toContain(CANONICAL_SUBTITLE);
    expect(text).not.toMatch(/Neutral Sourcing|Procurement Cockpit/i);
  });

  it('keeps the side propositions free of technical jargon', () => {
    for (const copy of [BUYER_COPY, SUPPLIER_COPY]) {
      const prose = [
        copy.headline,
        copy.subhead,
        copy.registerTitle,
        copy.registerSubtitle,
        ...copy.propositions.flatMap((p) => [p.title, p.body]),
      ];
      for (const text of prose) expect(text).not.toMatch(JARGON);
    }
  });
});

describe('referral landing copy', () => {
  it('welcomes a referred visitor without claiming the invitation was verified', () => {
    const text = toText(render(<SignupPage />, '/signup?side=buyer&ref=ABC123'));
    expect(text).toContain('Referred by ABC123');
    expect(text).toContain('Someone who already uses OTP invited you.');
    expect(text).not.toMatch(/verified peer invitation/i);
    expect(text).toContain(CANONICAL_TITLE);
  });
});
