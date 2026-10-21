import { describe, expect, it } from 'vitest';
import { normalizeColorTheme, normalizeThemeMode } from './types';

describe('theme preference normalization', () => {
  it('keeps light, dark, and system', () => {
    expect(normalizeThemeMode('light')).toBe('light');
    expect(normalizeThemeMode('dark')).toBe('dark');
    expect(normalizeThemeMode('system')).toBe('system');
  });

  it('falls back when the stored theme is missing or invalid', () => {
    expect(normalizeThemeMode(null)).toBe('system');
    expect(normalizeThemeMode('')).toBe('system');
    expect(normalizeThemeMode('neon')).toBe('system');
  });

  it('falls back when the stored accent is not one of the supported palettes', () => {
    expect(normalizeColorTheme('emerald')).toBe('emerald');
    expect(normalizeColorTheme('rainbow')).toBe('auto');
    expect(normalizeColorTheme(undefined)).toBe('auto');
  });
});
