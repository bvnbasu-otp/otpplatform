/**
 * Unit spellings, folded to one canonical form.
 *
 * Mirrors private.normalize_unit. A buyer types "kgs", a supplier declared "KG",
 * and a capability is gated in "KG": all three have to compare equal or the
 * capacity gate silently excludes a supplier who can do the job.
 *
 * Deliberately conservative. Anything unrecognised is upper-cased and left
 * alone, because guessing that two unfamiliar units are the same is worse than
 * admitting they are not comparable.
 */
const UNIT_ALIASES: Record<string, string> = {
  kg: 'KG',
  kgs: 'KG',
  kilogram: 'KG',
  kilograms: 'KG',
  mt: 'MT',
  tonne: 'MT',
  tonnes: 'MT',
  ton: 'MT',
  tons: 'MT',
  l: 'L',
  ltr: 'L',
  litre: 'L',
  litres: 'L',
  liter: 'L',
  liters: 'L',
  m: 'M',
  mtr: 'M',
  mtrs: 'M',
  metre: 'M',
  metres: 'M',
  meter: 'M',
  meters: 'M',
  ft: 'FT',
  feet: 'FT',
  foot: 'FT',
  sqft: 'SQFT',
  'sq ft': 'SQFT',
  'sq.ft': 'SQFT',
  'square feet': 'SQFT',
  cum: 'CUM',
  'cubic metre': 'CUM',
  pcs: 'PCS',
  piece: 'PCS',
  pieces: 'PCS',
  nos: 'PCS',
  no: 'PCS',
  unit: 'PCS',
  units: 'PCS',
  item: 'PCS',
  items: 'PCS',
  chair: 'PCS',
  chairs: 'PCS',
  table: 'PCS',
  tables: 'PCS',
  camera: 'PCS',
  cameras: 'PCS',
  panel: 'PCS',
  panels: 'PCS',
  set: 'SET',
  sets: 'SET',
  box: 'BOX',
  boxes: 'BOX',
  bag: 'BAG',
  bags: 'BAG',
  hp: 'HP',
  kw: 'KW',
  kva: 'KVA',
  lph: 'LPH',
  mbps: 'MBPS',
  gb: 'GB',
  mm: 'MM',
  a: 'A',
  amp: 'A',
  amps: 'A',
  लीटर: 'L',
  लीटरों: 'L',
  किलो: 'KG',
  किलोग्राम: 'KG',
  मीटर: 'M',
  टन: 'MT',
  नग: 'PCS',
  पीस: 'PCS',
};

export function normalizeUnit(unit: string | null | undefined): string | null {
  const raw = (unit ?? '').trim();
  if (raw === '') return null;
  return UNIT_ALIASES[raw.toLowerCase()] ?? raw.toUpperCase();
}

export function unitsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalizeUnit(a);
  return left !== null && left === normalizeUnit(b);
}

/** Every spelling the parser will recognise after a number, longest first. */
export const RECOGNISED_UNIT_TOKENS: string[] = Object.keys(UNIT_ALIASES).sort(
  (a, b) => b.length - a.length,
);
