import { useState, useEffect, useCallback } from 'react';
import { usePortalRole } from '@/features/auth/use-portal-role';
import { useRoleContext } from '@/features/roles';
import { notificationService } from '../services/notificationService';
import type { AppNotification } from '../types';

export function useNotifications(options?: {
  fleetView?: boolean;
  mode?: 'AUTO' | 'PROD' | 'DEMO' | 'ALL';
  isPlatformInDemoMode?: boolean;
}) {
  const { context, isLoading: roleLoading } = useRoleContext();
  const { profile, isLoading: profileLoading } = usePortalRole();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [activeMode, setActiveMode] = useState<string>(
    typeof options?.isPlatformInDemoMode === 'boolean'
      ? (options.isPlatformInDemoMode ? 'DEMO' : 'PROD')
      : 'DEMO'
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [toastNotification, setToastNotification] = useState<AppNotification | null>(null);

  const profileId = context.profileId || profile?.profileId || null;
  const isPlatformAdmin = Boolean(context.isPlatformAdmin || profile?.isPlatformAdmin);
  const showFleet = Boolean(options?.fleetView && isPlatformAdmin);

  const resolvedMode = typeof options?.isPlatformInDemoMode === 'boolean'
    ? (options.isPlatformInDemoMode ? 'DEMO' : 'PROD')
    : (options?.mode || 'AUTO');

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      if (showFleet) {
        const res = await notificationService.getAllPlatformNotifications(100, 0, 'ALL', resolvedMode);
        if (res.ok) {
          setNotifications(res.notifications);
          setUnreadCount(res.notifications.filter((n) => n.status !== 'READ').length);
          if (res.activeMode) {
            setActiveMode(res.activeMode);
          }
        }
      } else if (profileId) {
        const list = await notificationService.getNotifications(profileId, isPlatformAdmin, 50, resolvedMode);
        setNotifications(list);
        setUnreadCount(list.filter((n) => n.status !== 'READ').length);
      } else if (isPlatformAdmin) {
        // Platform admin without explicit personal profile id: load all fleet notifications
        const res = await notificationService.getAllPlatformNotifications(100, 0, 'ALL', resolvedMode);
        if (res.ok) {
          setNotifications(res.notifications);
          setUnreadCount(res.notifications.filter((n) => n.status !== 'READ').length);
          if (res.activeMode) {
            setActiveMode(res.activeMode);
          }
        }
      } else {
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [profileId, isPlatformAdmin, showFleet, resolvedMode]);

  useEffect(() => {
    if (roleLoading && profileLoading) return;

    void loadNotifications();

    if (!profileId) return;

    // Real-time subscription for profile
    try {
      const unsubscribe = notificationService.subscribe(profileId, (newNotif) => {
        setNotifications((prev) => [newNotif, ...prev]);
        setUnreadCount((prev) => prev + 1);

        // Trigger floating toast
        setToastNotification(newNotif);
      });

      return () => {
        unsubscribe?.();
      };
    } catch (err) {
      console.warn('Realtime notification subscription failed:', err);
    }
  }, [profileId, roleLoading, profileLoading, loadNotifications]);

  const markAsRead = async (id: string) => {
    // Optimistic state update for instant UI feedback
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, status: 'READ' as const, read_at: new Date().toISOString() } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    await notificationService.markAsRead(id);
  };

  const markAllAsRead = async () => {
    // Optimistic state update
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, status: 'READ' as const, read_at: new Date().toISOString() }))
    );
    setUnreadCount(0);

    // Call backend
    if (showFleet || (isPlatformAdmin && !profileId)) {
      await notificationService.markAllPlatformNotificationsRead();
    } else if (profileId) {
      await notificationService.markAllAsRead(profileId);
    } else if (isPlatformAdmin) {
      await notificationService.markAllPlatformNotificationsRead();
    }
  };

  const dismissToast = () => {
    setToastNotification(null);
  };

  return {
    notifications,
    unreadCount,
    activeMode,
    loading,
    toastNotification,
    markAsRead,
    markAllAsRead,
    dismissToast,
    refresh: loadNotifications,
    isPlatformAdmin,
    profileId,
  };
}

