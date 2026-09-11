import { supabase } from '@/lib/supabase';
import type { AppNotification } from '../types';

export const notificationService = {
  /**
   * Fetch all notifications for the given profile ID with mode awareness.
   */
  async getNotifications(
    profileId?: string,
    isPlatformAdmin = false,
    limit = 50,
    mode: 'AUTO' | 'PROD' | 'DEMO' | 'ALL' = 'AUTO'
  ): Promise<AppNotification[]> {
    let resolvedMode = mode;
    if (resolvedMode === 'AUTO') {
      try {
        const { data: setRow } = await supabase.from('demo_settings').select('demo_mode_enabled').eq('id', true).maybeSingle();
        resolvedMode = setRow?.demo_mode_enabled ? 'DEMO' : 'PROD';
      } catch {
        resolvedMode = 'DEMO';
      }
    }

    if (isPlatformAdmin && !profileId) {
      const res = await this.getAllPlatformNotifications(limit, 0, 'ALL', resolvedMode);
      return res.notifications;
    }
    if (!profileId) return [];

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (resolvedMode === 'DEMO') {
      query = query.eq('is_demo', true);
    } else if (resolvedMode === 'PROD') {
      query = query.or('is_demo.eq.false,is_demo.is.null');
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching notifications:', error);
      return [];
    }

    return (data as AppNotification[]) || [];
  },

  /**
   * High-level platform admin audit: Fetch all notification history across all users and modules.
   */
  async getAllPlatformNotifications(
    limit = 100,
    offset = 0,
    filter = 'ALL',
    mode: 'AUTO' | 'PROD' | 'DEMO' | 'ALL' = 'AUTO'
  ): Promise<{ ok: boolean; totalCount: number; notifications: AppNotification[]; activeMode?: string; error?: string }> {
    let resolvedMode = mode;
    if (resolvedMode === 'AUTO') {
      try {
        const { data: setRow } = await supabase.from('demo_settings').select('demo_mode_enabled').eq('id', true).maybeSingle();
        resolvedMode = setRow?.demo_mode_enabled ? 'DEMO' : 'PROD';
      } catch {
        resolvedMode = 'DEMO';
      }
    }

    try {
      const { data, error } = await supabase.rpc('admin_get_all_notifications', {
        p_limit: limit,
        p_offset: offset,
        p_filter: filter,
        p_mode: resolvedMode,
      });
      if (!error && data) {
        const rawNotifications = ((data as any)?.notifications as AppNotification[]) ?? [];
        // Strict environment isolation guard: prevent un-migrated or legacy RPCs from leaking PROD notifications into DEMO
        const filteredNotifications = resolvedMode === 'ALL'
          ? rawNotifications
          : resolvedMode === 'DEMO'
          ? rawNotifications.filter((n) => Boolean(n.is_demo))
          : rawNotifications.filter((n) => !n.is_demo);

        // Fetch exact mode-scoped count directly if RPC returned global count
        let totalCount = filteredNotifications.length;
        if (typeof (data as any)?.total_count === 'number' && (data as any)?.active_mode === resolvedMode) {
          totalCount = (data as any).total_count;
        } else {
          try {
            let countQuery = supabase.from('notifications').select('*', { count: 'exact', head: true });
            if (resolvedMode === 'DEMO') {
              countQuery = countQuery.eq('is_demo', true);
            } else if (resolvedMode === 'PROD') {
              countQuery = countQuery.or('is_demo.eq.false,is_demo.is.null');
            }
            const { count } = await countQuery;
            if (typeof count === 'number') totalCount = count;
          } catch {
            // fallback to filtered length
          }
        }

        return {
          ok: true,
          totalCount,
          notifications: filteredNotifications,
          activeMode: resolvedMode,
        };
      }
    } catch (err) {
      console.error('Error fetching admin all notifications via RPC:', err);
    }

    // Direct select fallback
    try {
      let query = supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (resolvedMode === 'PROD') {
        query = query.or('is_demo.eq.false,is_demo.is.null');
      } else if (resolvedMode === 'DEMO') {
        query = query.eq('is_demo', true);
      }

      if (filter === 'UNREAD') {
        query = query.neq('status', 'READ');
      } else if (filter === 'RFQS') {
        query = query.or('event_type.like.rfq.%,action_type.in.(RFQ_INVITED,QUOTE_RECEIVED,RFQ_NOT_AWARDED)');
      } else if (filter === 'VOTES') {
        query = query.or('event_type.like.governance.%,action_type.in.(VOTE_REQUESTED,VOTE_CAST)');
      } else if (filter === 'ORDERS') {
        query = query.or('event_type.like.po.%,event_type.like.work_order.%,event_type.like.invoice.%,event_type.like.payment.%,action_type.in.(PO_ISSUED,PO_ACCEPTED,WORK_PROGRESS_UPDATED,INVOICE_SUBMITTED,PAYMENT_RECORDED)');
      } else if (filter === 'ALERTS') {
        query = query.or('event_type.like.admin.%,action_type.eq.PROACTIVE_MAINTENANCE');
      }

      const { data: fbData, error: fallbackError } = await query;
      if (fallbackError) {
        return { ok: false, totalCount: 0, notifications: [], activeMode: resolvedMode, error: fallbackError.message };
      }

      let count = fbData?.length ?? 0;
      try {
        let countQ = supabase.from('notifications').select('*', { count: 'exact', head: true });
        if (resolvedMode === 'DEMO') {
          countQ = countQ.eq('is_demo', true);
        } else if (resolvedMode === 'PROD') {
          countQ = countQ.or('is_demo.eq.false,is_demo.is.null');
        }
        const { count: exactCount } = await countQ;
        if (typeof exactCount === 'number') count = exactCount;
      } catch {
        // ignore
      }

      return { ok: true, totalCount: count, notifications: (fbData as AppNotification[]) || [], activeMode: resolvedMode };
    } catch (e: any) {
      return { ok: false, totalCount: 0, notifications: [], activeMode: resolvedMode, error: e?.message || 'Failed to load notifications' };
    }
  },

  /**
   * Get unread notification count for a profile with mode awareness.
   */
  async getUnreadCount(
    profileId: string,
    mode: 'AUTO' | 'PROD' | 'DEMO' | 'ALL' = 'AUTO'
  ): Promise<number> {
    let resolvedMode = mode;
    if (resolvedMode === 'AUTO') {
      try {
        const { data: setRow } = await supabase.from('demo_settings').select('demo_mode_enabled').eq('id', true).maybeSingle();
        resolvedMode = setRow?.demo_mode_enabled ? 'DEMO' : 'PROD';
      } catch {
        resolvedMode = 'DEMO';
      }
    }

    let query = supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profileId)
      .neq('status', 'READ');

    if (resolvedMode === 'DEMO') {
      query = query.eq('is_demo', true);
    } else if (resolvedMode === 'PROD') {
      query = query.or('is_demo.eq.false,is_demo.is.null');
    }

    const { count, error } = await query;

    if (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }

    return count || 0;
  },

  /**
   * Mark a single notification as READ.
   */
  async markAsRead(notificationId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('admin_mark_notification_read', {
        p_notification_id: notificationId,
      });
      if (!error && (data as any)?.ok) {
        return true;
      }
    } catch {
      // Fallback to direct table update below
    }

    const { error } = await supabase
      .from('notifications')
      .update({
        status: 'READ',
        read_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', notificationId);

    if (error) {
      console.error('Error marking notification as read:', error);
      return false;
    }

    return true;
  },

  /**
   * Platform admin: Mark all fleet notifications across the entire platform as READ.
   */
  async markAllPlatformNotificationsRead(filter = 'ALL'): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('admin_mark_all_notifications_read', {
        p_filter: filter,
      });
      if (error) throw error;
      return true;
    } catch (err) {
      console.warn('RPC admin_mark_all_notifications_read failed, falling back to direct table update:', err);
      const { error: fallbackError } = await supabase
        .from('notifications')
        .update({
          status: 'READ',
          read_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .neq('status', 'READ');

      if (fallbackError) {
        console.error('Failed to mark all platform notifications as read:', fallbackError);
        return false;
      }
      return true;
    }
  },

  /**
   * Mark all notifications for a profile as READ.
   */
  async markAllAsRead(profileId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('mark_my_notifications_read');
      if (!error && (data as any)?.ok) {
        return true;
      }
    } catch {
      // Fallback to profile_id update below
    }

    const { error } = await supabase
      .from('notifications')
      .update({
        status: 'READ',
        read_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('profile_id', profileId)
      .neq('status', 'READ');

    if (error) {
      console.error('Error marking all notifications as read:', error);
      return false;
    }

    return true;
  },

  /**
   * Clear / Purge all notifications with environment mode isolation.
   */
  async clearAllNotifications(
    profileId?: string | null,
    isFleet = false,
    mode: 'AUTO' | 'PROD' | 'DEMO' | 'ALL' = 'AUTO'
  ): Promise<{ ok: boolean; message?: string; error?: string }> {
    try {
      if (isFleet) {
        // 1. Try dedicated admin clear notifications RPC first
        try {
          const { data, error } = await supabase.rpc('admin_clear_notifications', {
            p_mode: mode,
          });
          if (!error && (data as any)?.ok) {
            return {
              ok: true,
              message: (data as any)?.message || 'Notifications cleared successfully.',
            };
          }
        } catch (rpcErr) {
          console.warn('admin_clear_notifications RPC unavailable:', rpcErr);
        }

        // 2. Try admin clear audit logs and notifications RPC
        try {
          const { data, error } = await supabase.rpc('admin_clear_audit_logs_and_notifications', {
            p_mode: mode,
          });
          if (!error && (data as any)?.ok) {
            return {
              ok: true,
              message: (data as any)?.message || 'Notifications cleared successfully.',
            };
          }
        } catch {
          // ignore
        }

        // 3. Direct table purge with explicit environment mode filtering
        let targetDemo = mode === 'DEMO';
        if (mode === 'AUTO') {
          try {
            const { data: demoSettings } = await supabase.from('demo_settings').select('demo_mode_enabled').eq('id', true).maybeSingle();
            targetDemo = Boolean(demoSettings?.demo_mode_enabled);
          } catch {
            targetDemo = false;
          }
        }

        if (mode === 'ALL') {
          await Promise.allSettled([
            supabase.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
            supabase.from('supplier_notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
          ]);
        } else if (targetDemo) {
          await Promise.allSettled([
            supabase.from('notifications').delete().eq('is_demo', true),
            supabase.from('supplier_notifications').delete().eq('is_demo', true),
          ]);
        } else {
          await Promise.allSettled([
            supabase.from('notifications').delete().eq('is_demo', false),
            supabase.from('notifications').delete().is('is_demo', null),
            supabase.from('supplier_notifications').delete().eq('is_demo', false),
            supabase.from('supplier_notifications').delete().is('is_demo', null),
          ]);
        }

        // Write audit log entry
        try {
          await supabase.from('audit_events').insert({
            event_type: 'admin.notifications_purged',
            entity_type: 'NOTIFICATION_SYSTEM',
            entity_id: `mode_${targetDemo ? 'demo' : 'prod'}`,
            payload: {
              action: 'CLEAR_NOTIFICATIONS',
              mode_cleared: mode === 'ALL' ? 'ALL' : targetDemo ? 'DEMO' : 'PROD',
              is_demo: targetDemo,
              method: 'client_fallback',
              timestamp: new Date().toISOString(),
            },
            is_demo: targetDemo,
          });
        } catch {
          // ignore
        }

        return { ok: true, message: `Successfully cleared ${mode === 'ALL' ? 'all' : targetDemo ? 'Staging & Demo' : 'Live Production'} notifications.` };
      } else if (profileId) {
        let q = supabase.from('notifications').delete().eq('profile_id', profileId);
        if (mode === 'DEMO') {
          q = q.eq('is_demo', true);
        } else if (mode === 'PROD') {
          q = q.or('is_demo.eq.false,is_demo.is.null');
        }
        const { error: delError } = await q;

        if (delError) throw delError;
        return { ok: true, message: 'User notifications cleared.' };
      } else {
        let q = supabase.from('notifications').delete();
        if (mode === 'ALL') {
          q = q.neq('id', '00000000-0000-0000-0000-000000000000');
        } else if (mode === 'DEMO') {
          q = q.eq('is_demo', true);
        } else {
          q = q.or('is_demo.eq.false,is_demo.is.null');
        }
        const { error: delError } = await q;

        if (delError) throw delError;
        return { ok: true, message: 'Notifications cleared.' };
      }
    } catch (err: any) {
      console.error('Failed to clear notifications:', err);
      return { ok: false, error: err?.message || 'Failed to clear notifications' };
    }
  },

  /**
   * Subscribe to real-time notifications for a profile.
   * Uses a unique channel topic per caller instance to avoid collision with other mounted listeners.
   */
  subscribe(profileId: string, onNewNotification: (notification: AppNotification) => void): () => void {
    try {
      const channelId = `notifications:${profileId}:${Math.random().toString(36).slice(2, 9)}`;
      const channel = supabase
        .channel(channelId)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `profile_id=eq.${profileId}`,
          },
          (payload) => {
            if (payload.new) {
              onNewNotification(payload.new as AppNotification);
            }
          }
        )
        .subscribe();

      return () => {
        try {
          void supabase.removeChannel(channel);
        } catch {
          // Ignore unmount cleanup errors
        }
      };
    } catch (err) {
      console.warn('Failed to initialize notification realtime subscription:', err);
      return () => {};
    }
  },
};
