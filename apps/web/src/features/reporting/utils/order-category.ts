/**
 * Shared order-title categories for buyer and supplier reporting.
 * The same rules build the dropdown and apply the filter, so every preset
 * actually narrows the list. Persona-specific spend versus revenue labels
 * stay outside this classifier.
 */

const CATEGORY_RULES: readonly { category: string; needles: readonly string[] }[] = [
  { category: 'Painting & Coating', needles: ['paint'] },
  { category: 'Furniture & Interiors', needles: ['furnitur', 'workstation'] },
  { category: 'CCTV & Surveillance', needles: ['cctv', 'camera'] },
  { category: 'Swimming Pool AMC', needles: ['pool', 'swim'] },
  { category: 'STP & Water Treatment', needles: ['stp', 'wtp'] },
  { category: 'DG Sets & Power', needles: ['dg', 'generator'] },
  { category: 'Gym & Sports', needles: ['gym', 'fitness'] },
  { category: 'Vehicle & Fleet', needles: ['vehicle', 'auto'] },
];

export const GENERAL_ORDER_CATEGORY = 'General Procurement';

export function classifyOrderCategory(title: string | null | undefined): string {
  const titleLower = (title || '').toLowerCase();
  if (!titleLower) return GENERAL_ORDER_CATEGORY;
  for (const rule of CATEGORY_RULES) {
    if (
      rule.needles.some((needle) =>
        needle === 'dg'
          ? /(^|[^a-z0-9])dg([^a-z0-9]|$)/i.test(titleLower)
          : titleLower.includes(needle),
      )
    ) {
      return rule.category;
    }
  }
  return GENERAL_ORDER_CATEGORY;
}
