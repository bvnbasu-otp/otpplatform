export type ThemeMode = 'light' | 'dark' | 'system';
export type PersonaMode = 'buyer' | 'supplier' | 'admin';
export type ColorTheme = 'auto' | 'indigo' | 'emerald' | 'amber' | 'blue' | 'purple' | 'rose';

const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];
const COLOR_THEMES: readonly ColorTheme[] = ['auto', 'indigo', 'emerald', 'amber', 'blue', 'purple', 'rose'];

export function normalizeThemeMode(value: string | null | undefined): ThemeMode {
  return THEME_MODES.includes(value as ThemeMode) ? (value as ThemeMode) : 'system';
}

export function normalizeColorTheme(value: string | null | undefined): ColorTheme {
  return COLOR_THEMES.includes(value as ColorTheme) ? (value as ColorTheme) : 'auto';
}

export interface ThemeContextType {
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  persona: PersonaMode;
  colorTheme: ColorTheme;
  setTheme: (theme: ThemeMode) => void;
  setPersona: (persona: PersonaMode) => void;
  setColorTheme: (colorTheme: ColorTheme) => void;
}
