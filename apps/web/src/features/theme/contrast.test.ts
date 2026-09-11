import { describe, expect, it } from 'vitest';

/**
 * Computes relative luminance according to WCAG 2.1 specifications.
 */
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * (rs ?? 0) + 0.7152 * (gs ?? 0) + 0.0722 * (bs ?? 0);
}

/**
 * Computes contrast ratio (1:1 to 21:1)
 */
export function getContrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const l1 = getLuminance(...rgb1);
  const l2 = getLuminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('WCAG 2.1 AAA High-Contrast Compliance Calibration', () => {
  it('verifies dark text on light background meets AAA contrast ratio (>= 7.0:1)', () => {
    const textDark: [number, number, number] = [15, 23, 42]; // #0f172a (slate-900)
    const bgLight: [number, number, number] = [255, 255, 255]; // #ffffff

    const ratio = getContrastRatio(textDark, bgLight);
    expect(ratio).toBeGreaterThanOrEqual(7.0); // WCAG AAA
  });

  it('verifies light text on dark background meets AAA contrast ratio (>= 7.0:1)', () => {
    const textLight: [number, number, number] = [248, 250, 252]; // #f8fafc (slate-50)
    const bgDark: [number, number, number] = [2, 6, 23]; // #020617 (slate-950)

    const ratio = getContrastRatio(textLight, bgDark);
    expect(ratio).toBeGreaterThanOrEqual(7.0); // WCAG AAA
  });

  it('verifies high-contrast action button token meets AA/AAA standard (>= 4.5:1)', () => {
    const highContrastButtonBg: [number, number, number] = [3, 105, 161]; // #0369a1 (sky-700)
    const textWhite: [number, number, number] = [255, 255, 255];

    const ratio = getContrastRatio(textWhite, highContrastButtonBg);
    expect(ratio).toBeGreaterThanOrEqual(4.5); // WCAG AA text & AAA large text
  });
});
