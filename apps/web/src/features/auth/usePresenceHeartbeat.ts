import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const HEARTBEAT_INTERVAL_MS = 60 * 1000; // Send heartbeat at most once per 60s
const IDLE_CUTOFF_MS = 3 * 60 * 1000; // Consider user idle if no interaction in 3 mins
const THROTTLE_INTERACTION_MS = 10 * 1000; // Throttle recording interaction timestamps

/**
 * Hook to manage real-time presence heartbeats for authenticated users.
 * Automatically updates `last_seen_at` on active sessions while debouncing to prevent DB load.
 */
export function usePresenceHeartbeat(userId?: string | null) {
  const lastHeartbeatSentRef = useRef<number>(0);
  const lastInteractionRef = useRef<number>(Date.now());
  const isExecutingRef = useRef<boolean>(false);

  const sendHeartbeat = useCallback(async () => {
    if (!userId || isExecutingRef.current) return;

    const now = Date.now();
    // Debounce: ensure at least 60 seconds elapsed since last heartbeat
    if (now - lastHeartbeatSentRef.current < HEARTBEAT_INTERVAL_MS) {
      return;
    }

    // Idle check: skip sending heartbeat if user hasn't interacted in the last 3 minutes and document is hidden
    const isIdle = now - lastInteractionRef.current > IDLE_CUTOFF_MS;
    if (typeof document !== 'undefined' && document.hidden && isIdle) {
      return;
    }

    try {
      isExecutingRef.current = true;
      lastHeartbeatSentRef.current = now;

      // 1. Preferred approach: RPC with SECURITY DEFINER
      const { error: rpcError } = await supabase.rpc('update_user_heartbeat');

      // 2. Graceful fallback to direct update if RPC is not yet created
      if (rpcError) {
        await supabase
          .from('profiles')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', userId);
      }
    } catch {
      // Quietly ignore network/heartbeat errors so app flow is never disrupted
    } finally {
      isExecutingRef.current = false;
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    // Send immediate heartbeat on session load / sign-in
    void sendHeartbeat();

    // Interaction handler to track active usage
    let lastThrottledInteraction = 0;
    const handleUserInteraction = () => {
      const now = Date.now();
      if (now - lastThrottledInteraction > THROTTLE_INTERACTION_MS) {
        lastThrottledInteraction = now;
        lastInteractionRef.current = now;

        // If it's been more than 60s since last heartbeat, trigger immediately
        if (now - lastHeartbeatSentRef.current >= HEARTBEAT_INTERVAL_MS) {
          void sendHeartbeat();
        }
      }
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        lastInteractionRef.current = Date.now();
        if (Date.now() - lastHeartbeatSentRef.current >= HEARTBEAT_INTERVAL_MS) {
          void sendHeartbeat();
        }
      }
    };

    // Attach listeners to window/document
    if (typeof window !== 'undefined') {
      window.addEventListener('mousemove', handleUserInteraction, { passive: true });
      window.addEventListener('keydown', handleUserInteraction, { passive: true });
      window.addEventListener('pointerdown', handleUserInteraction, { passive: true });
      window.addEventListener('touchstart', handleUserInteraction, { passive: true });
      window.addEventListener('scroll', handleUserInteraction, { passive: true });
      window.addEventListener('focus', handleVisibilityChange, { passive: true });
      document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });
    }

    // Periodic heartbeat check interval
    const interval = setInterval(() => {
      void sendHeartbeat();
    }, 30 * 1000);

    return () => {
      clearInterval(interval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('mousemove', handleUserInteraction);
        window.removeEventListener('keydown', handleUserInteraction);
        window.removeEventListener('pointerdown', handleUserInteraction);
        window.removeEventListener('touchstart', handleUserInteraction);
        window.removeEventListener('scroll', handleUserInteraction);
        window.removeEventListener('focus', handleVisibilityChange);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [userId, sendHeartbeat]);
}
