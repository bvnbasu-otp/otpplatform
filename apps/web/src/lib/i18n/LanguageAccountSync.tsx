import { useEffect } from 'react';
import { useAuth } from '@/features/auth';
import { useLanguage } from './LanguageContext';

/**
 * Binds the shared language preference to the authenticated account.
 * Logout and account switches pass a different id, which resets to English
 * unless that account has its own saved preference.
 */
export function LanguageAccountSync() {
  const { user, isLoading } = useAuth();
  const { bindAccount } = useLanguage();

  useEffect(() => {
    if (isLoading) return;
    bindAccount(user?.id ?? null);
  }, [isLoading, user?.id, bindAccount]);

  return null;
}
