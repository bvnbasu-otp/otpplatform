export type ThemeMode = 'light' | 'dark' | 'system';
export type PersonaMode = 'buyer' | 'supplier' | 'admin';
export type ColorTheme = 'auto' | 'indigo' | 'emerald' | 'amber' | 'blue' | 'purple' | 'rose';

export interface ThemeContextType {
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  persona: PersonaMode;
  colorTheme: ColorTheme;
  setTheme: (theme: ThemeMode) => void;
  setPersona: (persona: PersonaMode) => void;
  setColorTheme: (colorTheme: ColorTheme) => void;
}
