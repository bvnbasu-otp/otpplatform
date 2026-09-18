import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface AnnouncementItem {
  id: string;
  title: string;
  message: string;
  category: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  audience: 'ALL' | 'BUYER' | 'SUPPLIER' | 'ADMIN';
  publishAt: string;
  expiresAt?: string | null;
  acknowledgementRequired?: boolean;
  actionUrl?: string | null;
  actionLabel?: string | null;
  createdAt: string;
}

export function useAnnouncements() {
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('otp_dismissed_announcements');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const fetchActiveAnnouncements = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_active_announcements');
      if (error) throw error;
      if (Array.isArray(data)) {
        setAnnouncements(data as AnnouncementItem[]);
      }
    } catch (err) {
      console.warn('Failed to load active announcements:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchActiveAnnouncements();
    const interval = setInterval(() => {
      void fetchActiveAnnouncements();
    }, 60000); // 1 minute poll
    return () => clearInterval(interval);
  }, [fetchActiveAnnouncements]);

  const dismissAnnouncement = useCallback((id: string) => {
    setDismissedIds((prev) => {
      const updated = [...prev, id];
      try {
        localStorage.setItem('otp_dismissed_announcements', JSON.stringify(updated));
      } catch {
        // Ignore localStorage errors
      }
      return updated;
    });
  }, []);

  const visibleAnnouncements = announcements.filter(
    (a) => !dismissedIds.includes(a.id) || a.severity === 'CRITICAL'
  );

  return {
    announcements: visibleAnnouncements,
    allAnnouncements: announcements,
    loading,
    dismissAnnouncement,
    refetch: fetchActiveAnnouncements,
  };
}
