import { useEffect } from 'react';
import { useRoleContext } from '@/features/roles';
import { useTheme } from './ThemeProvider';

export function ThemePersonaSync() {
  const { context } = useRoleContext();
  const { setPersona } = useTheme();

  useEffect(() => {
    if (context.isPlatformAdmin) {
      setPersona('admin');
    } else if (context.side === 'SUPPLIER') {
      setPersona('supplier');
    } else {
      setPersona('buyer');
    }
  }, [context.isPlatformAdmin, context.side, setPersona]);

  return null;
}
