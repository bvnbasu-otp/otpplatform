import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('@/lib/supabase', () => {
  const query = {
    select: mocks.select,
    eq: mocks.eq,
    is: mocks.is,
    maybeSingle: mocks.maybeSingle,
  };
  mocks.select.mockReturnValue(query);
  mocks.eq.mockReturnValue(query);
  mocks.is.mockReturnValue(query);
  return {
    supabase: {
      from: vi.fn(() => query),
      rpc: mocks.rpc,
    },
  };
});

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  fetchNotificationPreferences,
  saveNotificationPreferences,
} from './api/profile';

describe('profile notification preference persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the personal server row and does not read localStorage', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        channel_preferences: { WHATSAPP: false, SMS: true, EMAIL: true, IN_APP: false },
        category_opt_outs: ['MARKETING'],
        phone_number: null,
        email: 'buyer@example.test',
        quiet_hours_start: '22:00',
        quiet_hours_end: '08:00',
      },
      error: null,
    });

    const result = await fetchNotificationPreferences('profile-1', null);
    expect(result).toEqual({
      ok: true,
      preferences: {
        channels: { WHATSAPP: false, SMS: true, EMAIL: true, IN_APP: false },
        categoryOptOuts: ['MARKETING'],
        phoneNumber: null,
        email: 'buyer@example.test',
        quietHoursStart: '22:00',
        quietHoursEnd: '08:00',
      },
    });
    expect(mocks.eq).toHaveBeenCalledWith('user_id', 'profile-1');
    expect(mocks.is).toHaveBeenCalledWith('organization_id', null);
  });

  it('saves through the atomic RPC and reports server failure without claiming success', async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: { success: true, preference_id: 'pref-1' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'AUTH-01: FORBIDDEN' },
      });

    const saved = await saveNotificationPreferences('profile-1', null, {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      channels: { ...DEFAULT_NOTIFICATION_PREFERENCES.channels, EMAIL: false },
    });
    expect(saved).toEqual({ ok: true, preferenceId: 'pref-1' });
    expect(mocks.rpc).toHaveBeenCalledWith('update_notification_preferences_atomic', expect.objectContaining({
      p_user_id: 'profile-1',
      p_organization_id: null,
      p_channel_preferences: expect.objectContaining({ EMAIL: false }),
    }));

    const denied = await saveNotificationPreferences('profile-2', null, DEFAULT_NOTIFICATION_PREFERENCES);
    expect(denied).toEqual({ ok: false, error: 'AUTH-01: FORBIDDEN' });
  });
});
