import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminGreenfieldResetCard } from './components/AdminGreenfieldResetCard';
import { executeGreenfieldReset } from './api/admin-ops';
import { supabase } from '@/lib/supabase';

vi.mock('@/features/auth', () => ({
  useAuth: () => ({
    user: { email: 'bvnbasu@gmail.com' },
  }),
}));

vi.mock('@/features/roles', () => ({
  useRoleContext: () => ({
    context: { isFounder: true, email: 'bvnbasu@gmail.com' },
  }),
}));

describe('Admin Greenfield Pilot Reset Engine', () => {
  it('renders greenfield reset card with founder-authorized controls', () => {
    const html = renderToStaticMarkup(
      React.createElement(AdminGreenfieldResetCard, {})
    );

    expect(html).toContain('Platform Lifecycle &amp; Greenfield Reset Engine');
    expect(html).toContain('Post-Pilot Reset');
    expect(html).toContain('Founder Only');
    expect(html).toContain('Reset to Greenfield State');
  });

  it('calls execute_greenfield_pilot_reset RPC with exact confirmation token', async () => {
    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: {
        status: 'SUCCESS',
        timestamp: new Date().toISOString(),
        message: 'Platform successfully reset to pristine greenfield state.',
        retained_users: ['bvnbasu@gmail.com', 'bvnbasu@yahoo.com'],
      },
      error: null,
    } as any);

    const result = await executeGreenfieldReset('RESET-TO-GREENFIELD-2026');

    expect(rpcSpy).toHaveBeenCalledWith('execute_greenfield_pilot_reset', {
      p_confirmation_token: 'RESET-TO-GREENFIELD-2026',
    });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Platform successfully reset to pristine greenfield state');

    rpcSpy.mockRestore();
  });

  it('handles RPC errors gracefully with descriptive error feedback', async () => {
    const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValueOnce({
      data: null,
      error: { message: 'Invalid confirmation token' } as any,
    } as any);

    const result = await executeGreenfieldReset('WRONG-TOKEN');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Invalid confirmation token');

    rpcSpy.mockRestore();
  });
});
