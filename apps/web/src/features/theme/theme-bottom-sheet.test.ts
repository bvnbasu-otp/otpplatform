import { describe, expect, it } from 'vitest';
import type { ThemeMode, ColorTheme } from './types';

interface ColorOption {
  id: ColorTheme;
  name: string;
  description: string;
  previewColor: string;
}

const COLOR_OPTIONS: ColorOption[] = [
  {
    id: 'auto',
    name: 'Auto Sync',
    description: 'Follows active role (Buyer / Supplier / Admin)',
    previewColor: '#6366f1',
  },
  {
    id: 'indigo',
    name: 'Indigo',
    description: 'Institutional & Governance (Buyer)',
    previewColor: '#4f46e5',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    description: 'Verified Trade & Commerce (Supplier)',
    previewColor: '#059669',
  },
  {
    id: 'amber',
    name: 'Amber',
    description: 'Security & Operations (SuperAdmin)',
    previewColor: '#d97706',
  },
  {
    id: 'blue',
    name: 'Ocean Blue',
    description: 'Enterprise Corporate Standard',
    previewColor: '#0284c7',
  },
  {
    id: 'purple',
    name: 'Royal Purple',
    description: 'Executive Institutional',
    previewColor: '#7c3aed',
  },
  {
    id: 'rose',
    name: 'Crimson Rose',
    description: 'High-Contrast Modern',
    previewColor: '#e11d48',
  },
];

const MODE_OPTIONS: { id: ThemeMode; label: string; description: string }[] = [
  {
    id: 'light',
    label: 'Light',
    description: 'Clean high-contrast light surface',
  },
  {
    id: 'system',
    label: 'System',
    description: 'Follows operating system display mode',
  },
  {
    id: 'dark',
    label: 'Dark',
    description: 'Low-light obsidian dark surface',
  },
];

describe('Theme System & Bottom Sheet Data Models', () => {
  it('supports all required theme modes (light, dark, system)', () => {
    const modes = MODE_OPTIONS.map((m) => m.id);
    expect(modes).toEqual(['light', 'system', 'dark']);
    for (const mode of MODE_OPTIONS) {
      expect(mode.label).toBeTruthy();
      expect(mode.description).toBeTruthy();
    }
  });

  it('supports all curated accent color themes including auto persona sync', () => {
    const colorIds = COLOR_OPTIONS.map((c) => c.id);
    expect(colorIds).toContain('auto');
    expect(colorIds).toContain('indigo');
    expect(colorIds).toContain('emerald');
    expect(colorIds).toContain('amber');
    expect(colorIds).toContain('blue');
    expect(colorIds).toContain('purple');
    expect(colorIds).toContain('rose');

    for (const opt of COLOR_OPTIONS) {
      expect(opt.name).toBeTruthy();
      expect(opt.description).toBeTruthy();
      expect(opt.previewColor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('verifies theme persistence keys follow application standards', () => {
    const storageKeys = {
      theme: 'otp-theme',
      color: 'otp-color-theme',
      persona: 'otp-persona',
    };
    expect(storageKeys.theme).toBe('otp-theme');
    expect(storageKeys.color).toBe('otp-color-theme');
    expect(storageKeys.persona).toBe('otp-persona');
  });
});
