/**
 * Small, independent readers for the things buyers write in free text.
 *
 * Each one answers a single question and returns null when it is not confident,
 * because a wrong guess costs the buyer more than an unanswered field: the
 * wizard can ask, but it cannot un-ask.
 */
import { normalizeUnit, RECOGNISED_UNIT_TOKENS } from '../taxonomy/units';

export interface Extracted<T> {
  value: T;
  /** The matched text, so the UI can point at where a value came from. */
  evidence: string;
}

const NUMBER = String.raw`(\d+(?:[.,]\d+)?)`;

function toNumber(raw: string | undefined): number {
  return Number((raw ?? '').replace(/,/g, ''));
}

/**
 * Units that answer "how much am I buying".
 *
 * HP, KVA, MM and the like are excluded on purpose: they describe the thing,
 * not the size of the order. "12.5 HP submersible motor" is one motor, and
 * reading it as a quantity of 12.5 would put nonsense on the RFQ.
 */
const QUANTITY_UNITS = new Set([
  'KG',
  'MT',
  'L',
  'M',
  'FT',
  'SQFT',
  'CUM',
  'PCS',
  'GB',
  'SET',
  'BOX',
  'BAG',
  'LPH',
]);

/**
 * "2000 kg", "5,000 kgs", "500 pieces".
 *
 * Unit spellings are matched longest-first so "sq ft" wins over "ft", and the
 * number must sit immediately before the unit. Returns null rather than
 * guessing when nothing countable appears — the wizard can ask, and an invented
 * quantity is worse than an empty field.
 */
export function extractQuantity(
  text: string,
): Extracted<{ quantity: number; unit: string }> | null {
  const units = RECOGNISED_UNIT_TOKENS.map((u) =>
    u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s*'),
  ).join('|');

  const pattern = new RegExp(`(?:^|\\s|\\b)${NUMBER}\\s*(${units})(?:\\b|\\s|$|[.,!?])`, 'giu');

  for (const match of text.matchAll(pattern)) {
    const unit = normalizeUnit(match[2]);
    if (unit !== null && QUANTITY_UNITS.has(unit)) {
      return {
        value: { quantity: toNumber(match[1]), unit },
        evidence: match[0].trim(),
      };
    }
  }
  return null;
}

/** "25mm", "150 mm bore" — a plain dimension in millimetres. */
export function extractDimensionMm(text: string): Extracted<number> | null {
  const match = new RegExp(`\\b${NUMBER}\\s*mm\\b`, 'i').exec(text);
  return match ? { value: toNumber(match[1]), evidence: match[0].trim() } : null;
}

/** "±0.05mm", "+/- 0.02 mm", "tolerance 0.05mm". */
export function extractToleranceMm(text: string): Extracted<number> | null {
  const patterns = [
    new RegExp(`[±]\\s*${NUMBER}\\s*mm`, 'i'),
    new RegExp(`\\+\\s*/\\s*-\\s*${NUMBER}\\s*mm`, 'i'),
    new RegExp(`tolerance\\s*(?:of\\s*)?${NUMBER}\\s*mm`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return { value: toNumber(match[1]), evidence: match[0].trim() };
  }
  return null;
}

/**
 * Yarn count: "30s", "40s combed", "count 60".
 *
 * Guarded against reading a bare "40s" as a count in text that is not about
 * yarn — the caller only runs this when the subcategory asks for it.
 */
export function extractYarnCount(text: string): Extracted<number> | null {
  const patterns = [
    /\b(\d{1,3})\s*s\b(?=[^%]|$)/i,
    /\bcount\s*(?:of\s*)?(\d{1,3})\b/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const value = toNumber(match[1]);
      if (value >= 2 && value <= 200) {
        return { value, evidence: match[0].trim() };
      }
    }
  }
  return null;
}

/** "below 8%", "max 8% moisture", "moisture under 8 percent". */
export function extractMoisturePercent(text: string): Extracted<number> | null {
  const patterns = [
    new RegExp(`moisture[^.\\d]{0,20}${NUMBER}\\s*(?:%|percent)`, 'i'),
    new RegExp(`(?:below|under|max(?:imum)?|less than)\\s*${NUMBER}\\s*(?:%|percent)`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return { value: toNumber(match[1]), evidence: match[0].trim() };
  }
  return null;
}

/**
 * How soon it is needed, expressed in days.
 *
 * "urgent" and "immediately" are the honest signal that a buyer will not wait
 * for a three-week quote window, so they map to zero rather than to nothing.
 */
export function extractDeliveryWindow(
  text: string,
): Extracted<{ days: number; immediate: boolean }> | null {
  const days = /\b(?:in|within|next|needed in|require in|required in|for)\s*(\d{1,3})\s*(?:day|days)\b/i.exec(text);
  if (days) {
    return {
      value: { days: Number(days[1]), immediate: false },
      evidence: days[0].trim(),
    };
  }

  const rentDays = /\b(\d{1,3})\s*(?:day|days)\s*(?:rent|rental|hire|turnaround|duration)\b/i.exec(text);
  if (rentDays) {
    return {
      value: { days: Number(rentDays[1]), immediate: false },
      evidence: rentDays[0].trim(),
    };
  }

  const immediate = /\b(urgent(?:ly)?|immediate(?:ly)?|asap|right away|today)\b/i.exec(text);
  if (immediate) {
    return { value: { days: 0, immediate: true }, evidence: immediate[0] };
  }

  const weeks = /\b(?:in|within|next|for)\s*(\d{1,2})\s*(?:week|weeks)\b/i.exec(text);
  if (weeks) {
    return {
      value: { days: Number(weeks[1]) * 7, immediate: false },
      evidence: weeks[0].trim(),
    };
  }

  const nextWeek = /\bnext week\b/i.exec(text);
  if (nextWeek) {
    return { value: { days: 7, immediate: false }, evidence: nextWeek[0] };
  }

  const months = /\b(?:in|within|for)\s*(\d{1,2})\s*(?:month|months)\b/i.exec(text);
  if (months) {
    return {
      value: { days: Number(months[1]) * 30, immediate: false },
      evidence: months[0].trim(),
    };
  }

  return null;
}

/** "6 month warranty", "warranty of 1 year", "2 years guarantee". */
export function extractWarrantyMonths(text: string): Extracted<number> | null {
  const monthsFirst = /\b(\d{1,3})\s*(?:month|months)\s*(?:warranty|guarantee)\b/i.exec(text);
  if (monthsFirst) {
    return { value: Number(monthsFirst[1]), evidence: monthsFirst[0].trim() };
  }

  const yearsFirst = /\b(\d{1,2})\s*(?:year|years|yr|yrs)\s*(?:warranty|guarantee)\b/i.exec(text);
  if (yearsFirst) {
    return { value: Number(yearsFirst[1]) * 12, evidence: yearsFirst[0].trim() };
  }

  const after = /\b(?:warranty|guarantee)\s*(?:of|:)?\s*(\d{1,3})\s*(month|months|year|years|yr|yrs)\b/i.exec(
    text,
  );
  if (after) {
    const n = toNumber(after[1]);
    return {
      value: /^y/i.test(after[2] ?? '') ? n * 12 : n,
      evidence: after[0].trim(),
    };
  }

  return null;
}

const CITY_ALIASES: Record<string, string> = {
  bangalore: 'Bengaluru',
  bengaluru: 'Bengaluru',
  madras: 'Chennai',
  chennai: 'Chennai',
  bombay: 'Mumbai',
  mumbai: 'Mumbai',
  calcutta: 'Kolkata',
  kolkata: 'Kolkata',
  kovai: 'Coimbatore',
  coimbatore: 'Coimbatore',
  tirupur: 'Tiruppur',
  tiruppur: 'Tiruppur',
  mysore: 'Mysuru',
  mysuru: 'Mysuru',
  gurgaon: 'Gurugram',
  gurugram: 'Gurugram',
  noida: 'Noida',
  'greater noida': 'Greater Noida',
  delhi: 'Delhi',
  'new delhi': 'New Delhi',
  ghaziabad: 'Ghaziabad',
  faridabad: 'Faridabad',
  hyderabad: 'Hyderabad',
  secunderabad: 'Secunderabad',
  pune: 'Pune',
  ahmedabad: 'Ahmedabad',
  surat: 'Surat',
  vadodara: 'Vadodara',
  baroda: 'Vadodara',
  rajkot: 'Rajkot',
  salem: 'Salem',
  erode: 'Erode',
  bhavani: 'Bhavani',
  madurai: 'Madurai',
  hosur: 'Hosur',
  trichy: 'Tiruchirappalli',
  tiruchirappalli: 'Tiruchirappalli',
  tuticorin: 'Thoothukudi',
  thoothukudi: 'Thoothukudi',
  tirunelveli: 'Tirunelveli',
  vellore: 'Vellore',
  thanjavur: 'Thanjavur',
  dindigul: 'Dindigul',
  karur: 'Karur',
  sivakasi: 'Sivakasi',
  kanchipuram: 'Kanchipuram',
  cochin: 'Kochi',
  kochi: 'Kochi',
  ernakulam: 'Ernakulam',
  calicut: 'Kozhikode',
  kozhikode: 'Kozhikode',
  trivandrum: 'Thiruvananthapuram',
  thiruvananthapuram: 'Thiruvananthapuram',
  thrissur: 'Thrissur',
  jaipur: 'Jaipur',
  jodhpur: 'Jodhpur',
  udaipur: 'Udaipur',
  kota: 'Kota',
  lucknow: 'Lucknow',
  kanpur: 'Kanpur',
  agra: 'Agra',
  varanasi: 'Varanasi',
  banaras: 'Varanasi',
  kashi: 'Varanasi',
  prayagraj: 'Prayagraj',
  allahabad: 'Prayagraj',
  indore: 'Indore',
  bhopal: 'Bhopal',
  gwalior: 'Gwalior',
  nagpur: 'Nagpur',
  nashik: 'Nashik',
  aurangabad: 'Chhatrapati Sambhajinagar',
  sambhajinagar: 'Chhatrapati Sambhajinagar',
  kolhapur: 'Kolhapur',
  vizag: 'Visakhapatnam',
  visakhapatnam: 'Visakhapatnam',
  vijayawada: 'Vijayawada',
  guntur: 'Guntur',
  nellore: 'Nellore',
  tirupati: 'Tirupati',
  chandigarh: 'Chandigarh',
  ludhiana: 'Ludhiana',
  jalandhar: 'Jalandhar',
  amritsar: 'Amritsar',
  dehradun: 'Dehradun',
  haridwar: 'Haridwar',
  bhubaneswar: 'Bhubaneswar',
  cuttack: 'Cuttack',
  patna: 'Patna',
  ranchi: 'Ranchi',
  jamshedpur: 'Jamshedpur',
  raipur: 'Raipur',
  guwahati: 'Guwahati',
  goa: 'Goa',
  panaji: 'Panaji',
  mangaluru: 'Mangaluru',
  mangalore: 'Mangaluru',
  belagavi: 'Belagavi',
  belgaum: 'Belagavi',
  hubballi: 'Hubballi',
  hubli: 'Hubballi',
};

/**
 * The delivery city, matched against cities the platform actually serves.
 *
 * The list is passed in rather than baked in, so a new region is supplier data
 * rather than a parser change.
 */
export function extractCity(
  text: string,
  knownCities: readonly string[],
): Extracted<string> | null {
  const haystack = text.toLowerCase();

  // 1. Direct match on known cities (longest name first, so "Bengaluru North" is preferred over "Bengaluru")
  const ordered = [...knownCities].sort((a, b) => b.length - a.length);

  for (const city of ordered) {
    const needle = city.toLowerCase();
    if (needle.length > 0 && haystack.includes(needle)) {
      return { value: city, evidence: city };
    }
  }

  // 2. Alias match mapped to known cities
  const knownLower = new Set(knownCities.map((c) => c.toLowerCase()));
  const sortedAliases = Object.entries(CITY_ALIASES).sort(
    ([a], [b]) => b.length - a.length,
  );

  for (const [alias, canonical] of sortedAliases) {
    if (haystack.includes(alias) && (knownCities.length === 0 || knownLower.has(canonical.toLowerCase()))) {
      const matchIndex = haystack.indexOf(alias);
      const evidence = text.slice(matchIndex, matchIndex + alias.length);
      return { value: canonical, evidence };
    }
  }

  return null;
}

/** Indian PIN code: six digits, never starting with zero. */
export function extractPincode(text: string): Extracted<string> | null {
  const match = /\b([1-9]\d{5})\b/.exec(text);
  if (!match?.[1]) return null;
  return { value: match[1], evidence: match[1] };
}
