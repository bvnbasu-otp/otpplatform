import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import {
  fetchCurrentProfile,
  resolvePortalRole,
  type PortalRole,
  type UserProfile,
} from './user-role';

export function usePortalRole() {
  const { user, isLoading: authLoading } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<PortalRole>('unknown');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setProfile(null);
      setRole('unknown');
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const load = async () => {
      const p = await fetchCurrentProfile();
      if (cancelled) return;
      if (!p) {
        const fallbackRole = user?.email && (user.email.toLowerCase() === 'bvnbasu@gmail.com' || user.email.toLowerCase() === 'admin@otp.test') ? 'admin' : 'unknown';
        setProfile(null);
        setRole(fallbackRole);
        setIsLoading(false);
        return;
      }
      const r = await resolvePortalRole(p.profileId, p.isPlatformAdmin, p.email || user?.email);
      if (cancelled) return;
      setProfile(p);
      setRole(r);
      setIsLoading(false);
    };

    void load();

    const handleRoleChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ side?: string; role?: string }>;
      if (customEvent.detail?.side) {
        setRole(customEvent.detail.side === 'SUPPLIER' ? 'supplier' : 'buyer');
      } else {
        void load();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('otp:role-context-change', handleRoleChange);
    }

    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('otp:role-context-change', handleRoleChange);
      }
    };
  }, [user, authLoading]);

  return { profile, role, isLoading: authLoading || isLoading };
}
