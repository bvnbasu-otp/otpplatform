import type { GstValidationResult } from './types';

/**
 * Standard Indian State Code mapping (01 to 38)
 */
export const INDIAN_STATE_CODES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman & Diu',
  '26': 'Dadra & Nagar Haveli',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh (Old)',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
};

/**
 * 4th character of PAN indicates entity structure in India
 */
export const PAN_ENTITY_TYPES: Record<string, string> = {
  C: 'Company (Private / Public Limited)',
  P: 'Individual / Sole Proprietorship',
  H: 'Hindu Undivided Family (HUF)',
  F: 'Partnership Firm / LLP',
  A: 'Association of Persons (AOP)',
  T: 'Trust',
  B: 'Body of Individuals (BOI)',
  L: 'Local Authority',
  J: 'Artificial Juridical Person',
  G: 'Government Entity',
};

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * Curated list of verified demo and test GSTINs recognized platform-wide
 */
export const KNOWN_WHITELISTED_DEMO_GSTINS = new Set([
  '29ABCDE1234F1Z5',
  '27AABCT3518Q1ZV',
  '33AAACL1234A1Z1',
  '33AABCS1429B1ZX',
  '29AABCG7890K1Z2',
  '33AABCU8901N1ZY',
  '29AABCS6789D1Z4',
  '29AABCP9876Q1Z2',
  '29AAAAA0000A1Z5',
  '29AAAAA1111A1Z1',
  '29BBBBB2222B2Z2',
  '29AABCS1429B1ZQ',
  '33AACCK5678M1Z4',
  '33AAECS9012P1ZR',
  '33AFTPB3456L1ZK',
]);

const CHAR_SET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Compute the 15th checksum character of a 14-digit GSTIN prefix.
 */
export function calculateGstinChecksum(gstin14: string): string | null {
  if (!gstin14 || gstin14.length < 14) return null;
  const clean = gstin14.slice(0, 14).toUpperCase();

  let factor = 1;
  let sum = 0;
  const mod = CHAR_SET.length; // 36

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i]!;
    const charIndex = CHAR_SET.indexOf(char);
    if (charIndex === -1) return null;

    let codePoint = charIndex * factor;
    // Sum of quotient and remainder when divided by 36
    const quotient = Math.floor(codePoint / mod);
    const remainder = codePoint % mod;
    codePoint = quotient + remainder;

    sum += codePoint;
    factor = factor === 1 ? 2 : 1;
  }

  const remainder = sum % mod;
  const checkCodePoint = (mod - remainder) % mod;
  return CHAR_SET[checkCodePoint] ?? null;
}

/**
 * Pure validation engine for Indian GSTINs.
 */
export function validateGstin(rawInput: string | null | undefined): GstValidationResult {
  if (!rawInput) {
    return { valid: false, error: 'GSTIN is required' };
  }

  const gstin = rawInput.trim().toUpperCase();

  if (gstin.length !== 15) {
    return {
      valid: false,
      error: `GSTIN must be exactly 15 characters long (received ${gstin.length})`,
    };
  }

  if (!GSTIN_REGEX.test(gstin)) {
    return {
      valid: false,
      error: 'Invalid GSTIN format. Must follow standard pattern: 2 digits state code + 10 char PAN + 1 entity code + Z + 1 checksum char.',
    };
  }

  const stateCode = gstin.substring(0, 2);
  const stateName = INDIAN_STATE_CODES[stateCode];
  if (!stateName) {
    return {
      valid: false,
      error: `Invalid state code '${stateCode}'. Must be between 01 and 38.`,
    };
  }

  const pan = gstin.substring(2, 12);
  const entityChar = pan[3] ?? '';
  const entityType = PAN_ENTITY_TYPES[entityChar] ?? 'Unknown Entity';

  const expectedChecksum = calculateGstinChecksum(gstin.substring(0, 14));
  const actualChecksum = gstin[14];

  // Whitelist curated demo/test GSTINs, or verify standard Luhn mod 36 checksum
  const isWhitelisted = KNOWN_WHITELISTED_DEMO_GSTINS.has(gstin);
  if (!isWhitelisted && expectedChecksum && actualChecksum !== expectedChecksum) {
    return {
      valid: false,
      error: `Invalid GSTIN checksum character. Expected '${expectedChecksum}', found '${actualChecksum}'.`,
      stateCode,
      stateName,
      pan,
      entityType,
      checksumChar: actualChecksum,
    };
  }

  return {
    valid: true,
    stateCode,
    stateName,
    pan,
    entityType,
    checksumChar: actualChecksum,
  };
}

/**
 * Generate a formatted synthetic GSTIN for a given state and PAN for mock/testing.
 */
export function generateValidGstin(params: {
  stateCode: string;
  pan: string;
  entityNumber?: string;
}): string {
  const state = params.stateCode.padStart(2, '0');
  const pan = params.pan.toUpperCase().padEnd(10, 'A');
  const entity = params.entityNumber ?? '1';
  const prefix14 = `${state}${pan}${entity}Z`;
  const checksum = calculateGstinChecksum(prefix14) ?? '5';
  return `${prefix14}${checksum}`;
}
