import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { ThemeMode, PersonaMode, ColorTheme, ThemeContextType } from './types';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      return (localStorage.getItem('otp-theme') as ThemeMode) || 'system';
    } catch {
      return 'system';
    }
  });

  const [persona, setPersonaState] = useState<PersonaMode>(() => {
    try {
      return (localStorage.getItem('otp-persona') as PersonaMode) || 'buyer';
    } catch {
      return 'buyer';
    }
  });

  const [colorTheme, setColorThemeState] = useState<ColorTheme>(() => {
    try {
      return (localStorage.getItem('otp-color-theme') as ColorTheme) || 'auto';
    } catch {
      return 'auto';
    }
  });

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    if (theme === 'dark') return 'dark';
    if (theme === 'light') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Apply theme & listen to system media query changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const isDark = theme === 'dark' || (theme === 'system' && mediaQuery.matches);
      const root = document.documentElement;

      if (isDark) {
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
        setResolvedTheme('dark');
      } else {
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
        setResolvedTheme('light');
      }
    };

    applyTheme();

    const listener = () => {
      if (theme === 'system') {
        applyTheme();
      }
    };

    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, [theme]);

  // Apply persona
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-persona', persona);
    }
  }, [persona]);

  // Apply colorTheme
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (colorTheme === 'auto') {
        document.documentElement.removeAttribute('data-color-theme');
      } else {
        document.documentElement.setAttribute('data-color-theme', colorTheme);
      }
    }
  }, [colorTheme]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem('otp-theme', newTheme);
    } catch {
      // Ignore storage errors
    }
  };

  const setPersona = (newPersona: PersonaMode) => {
    setPersonaState(newPersona);
    try {
      localStorage.setItem('otp-persona', newPersona);
    } catch {
      // Ignore storage errors
    }
  };

  const setColorTheme = (newColor: ColorTheme) => {
    setColorThemeState(newColor);
    try {
      localStorage.setItem('otp-color-theme', newColor);
    } catch {
      // Ignore storage errors
    }
  };

  const value = useMemo(
    () => ({ theme, resolvedTheme, persona, colorTheme, setTheme, setPersona, setColorTheme }),
    [theme, resolvedTheme, persona, colorTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
