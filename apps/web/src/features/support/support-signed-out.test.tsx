import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  user: null as null | { id: string; email: string },
  createSupportTicket: vi.fn(),
}));

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: harness.user, isAuthenticated: Boolean(harness.user), isLoading: false }),
}));
vi.mock('@/features/roles', () => ({
  useRoleContext: () => ({
    context: {
      signedIn: Boolean(harness.user),
      profileId: harness.user ? 'profile-1' : null,
      side: 'BUYER',
      isPlatformAdmin: false,
      activeRole: null,
      organizationId: null,
      organizationName: null,
      email: harness.user?.email ?? null,
    },
  }),
}));
vi.mock('@/features/admin/api/admin-ops', () => ({
  createSupportTicket: harness.createSupportTicket,
}));

import { SupportHelpButtonModal } from './components/SupportHelpButtonModal';

function renderOpenModal(): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/']}>
      <SupportHelpButtonModal isOpen />
    </MemoryRouter>,
  );
}

describe('Support help modal for signed-out visitors', () => {
  beforeEach(() => {
    harness.user = null;
    harness.createSupportTicket.mockReset();
  });

  it('shows a sign-in notice instead of a ticket form and calls no ticket RPC', () => {
    const html = renderOpenModal();
    expect(html).toContain('data-testid="support-signed-out-notice"');
    expect(html).toContain('Please log in to submit a support ticket.');
    expect(html).toContain('href="/login"');
    expect(html).toContain('href="/contact-us"');
    expect(html).not.toContain('<form');
    expect(harness.createSupportTicket).not.toHaveBeenCalled();
  });

  it('keeps the ticket form for signed-in users', () => {
    harness.user = { id: 'user-1', email: 'person@example.com' };
    const html = renderOpenModal();
    expect(html).toContain('<form');
    expect(html).not.toContain('data-testid="support-signed-out-notice"');
  });
});
