import { describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc, from: vi.fn() },
}));
vi.mock('@/features/audit/api/log-client-audit-event', () => ({
  logClientAuditEvent: vi.fn(),
}));

import { notificationService } from './services/notificationService';

describe('platform notification pagination', () => {
  it('sends the page offset and server filter and preserves the scoped total', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        notifications: [{ id: 'notification-101', is_demo: true }],
        total_count: 24757,
        active_mode: 'DEMO',
      },
      error: null,
    });

    const result = await notificationService.getAllPlatformNotifications(
      50,
      100,
      'ALERTS',
      'DEMO',
    );

    expect(rpc).toHaveBeenCalledWith('admin_get_all_notifications', {
      p_limit: 50,
      p_offset: 100,
      p_filter: 'ALERTS',
      p_mode: 'DEMO',
    });
    expect(result.notifications.map((row) => row.id)).toEqual(['notification-101']);
    expect(result.totalCount).toBe(24757);
  });
});
