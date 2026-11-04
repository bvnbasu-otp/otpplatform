/**
 * Self-contained Indian postal code geography inference (Zero external dependencies).
 */
export function inferIndianCity(pincode?: string | null, _state?: string | null): string | null {
  if (!pincode || !/^[1-9][0-9]{5}$/.test(pincode.trim())) return null;
  const pin = pincode.trim();
  const p3 = pin.slice(0, 3);
  const p2 = pin.slice(0, 2);

  if (['560', '561', '562'].includes(p3)) return 'Bengaluru';
  if (p3 === '570') return 'Mysuru';
  if (p3 === '575') return 'Mangaluru';
  if (p3 === '600') return 'Chennai';
  if (p3 === '641') return 'Coimbatore';
  if (p3 === '625') return 'Madurai';
  if (p3 === '500') return 'Hyderabad';
  if (p3 === '520') return 'Vijayawada';
  if (p3 === '530') return 'Visakhapatnam';
  if (p3 === '682') return 'Kochi';
  if (p3 === '695') return 'Thiruvananthapuram';
  if (p3 === '673') return 'Kozhikode';
  if (p3 === '400') return 'Mumbai';
  if (p3 === '411') return 'Pune';
  if (p2 === '11') return 'Delhi NCR';
  if (p2 === '12' && p3 === '122') return 'Gurugram';
  if (p2 === '20' && p3 === '201') return 'Noida';
  return null;
}

export function inferIndianState(pincode?: string | null, _city?: string | null): string | null {
  if (!pincode || !/^[1-9][0-9]{5}$/.test(pincode.trim())) return null;
  const pin = pincode.trim();
  const p2 = pin.slice(0, 2);

  if (['56', '57', '58', '59'].includes(p2)) return 'Karnataka';
  if (['60', '61', '62', '63', '64'].includes(p2)) return 'Tamil Nadu';
  if (['50', '51', '52', '53'].includes(p2)) return 'Telangana';
  if (['67', '68', '69'].includes(p2)) return 'Kerala';
  if (['40', '41', '42', '43', '44'].includes(p2)) return 'Maharashtra';
  if (p2 === '11') return 'Delhi';
  if (['12', '13'].includes(p2)) return 'Haryana';
  if (['20', '21', '22'].includes(p2)) return 'Uttar Pradesh';
  return 'India';
}

export const SNE_17_CATEGORIES: string[] = [
  'Borewells & Submersible Pumps',
  'Motor Rewinding & Overhaul',
  'Elevators & Lift Maintenance',
  'CNC Machining & Precision Lathe',
  'Textile Spinning & Yarn Processing',
  'Agri Commodities & Mandi Produce',
  'Commercial Solar PV Systems',
  'Commercial CCTV & Surveillance',
  'Modular Office Furniture & Fitouts',
  'Diesel Generators (DG Sets)',
  'Commercial HVAC & Chillers',
  'Industrial Valves & Piping',
  'Fire Safety & Hydrant Systems',
  'Industrial Packaging & Corrugated',
  'Commercial Waste & Recycling',
  'Scaffolding & Formwork Rental',
  'Fleet Logistics & Heavy Transport',
];

export type OutreachEntityType = 'RWA' | 'MSME' | 'SUPPLIER_PROSPECT' | 'BUYER_PROSPECT';

export interface OutreachDirectoryLead {
  id: string;
  entityType: OutreachEntityType;
  organizationName: string;
  contactPerson: string;
  phone: string; // E.164 sanitized: +91XXXXXXXXXX
  pincode: string; // 6-digit Indian PIN
  city: string;
  state: string;
  category: string;
  status: 'UNCONTACTED' | 'CAMPAIGN_QUEUED' | 'CONTACTED' | 'ONBOARDED';
  source: string;
  createdAt: string;
}

export interface OrganicPincodeEntry {
  pincode: string;
  city: string;
  state: string;
  isUnlocked: boolean;
  unlockedAt: string;
  density: {
    buyersCount: number;
    suppliersCount: number;
    msmeCount: number;
    rwaCount: number;
    totalEntities: number;
  };
  densityStatus: 'HIGH_DENSITY' | 'GROWING' | 'SEED_ACTIVE';
}

const STORAGE_KEY_LEADS = 'otp_outreach_leads_directory_v2';
const STORAGE_KEY_PINCODES = 'otp_organic_pincodes_registry_v2';

let inMemoryLeadsStore: OutreachDirectoryLead[] | null = null;
let inMemoryPincodesStore: Map<string, OrganicPincodeEntry> | null = null;

/**
 * Reset memory store (used for tests or fresh reset).
 */
export function resetOutreachMemoryStore(): void {
  inMemoryLeadsStore = null;
  inMemoryPincodesStore = null;
}

/**
 * Sanitizes phone numbers to standard E.164 Indian format (+91XXXXXXXXXX).
 */
export function sanitizeIndianPhone(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `+91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91') && /^91[6-9]/.test(digits)) {
    return `+${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0') && /^0[6-9]/.test(digits)) {
    return `+91${digits.slice(1)}`;
  }
  return null;
}

/**
 * Validates 6-digit Indian Postal Index Number.
 */
export function validateIndianPincode(pincode: string): boolean {
  return /^[1-9][0-9]{5}$/.test(pincode.trim());
}

/**
 * Initial benchmark active leads representing authentic RWA societies and MSME industrial entities.
 */
export const INITIAL_OUTREACH_LEADS: OutreachDirectoryLead[] = [
  // Bengaluru (560001, 560034, 560087)
  {
    id: 'LEAD-BLR-001',
    entityType: 'RWA',
    organizationName: 'Prestige Lakeside Habitat RWA',
    contactPerson: 'Col. K. R. Nair',
    phone: '+919972967530',
    pincode: '560087',
    city: 'Bengaluru',
    state: 'Karnataka',
    category: 'Plumbing & Sanitary',
    status: 'UNCONTACTED',
    source: 'ORGANIC_SIGNUP',
    createdAt: '2026-11-01',
  },
  {
    id: 'LEAD-BLR-002',
    entityType: 'MSME',
    organizationName: 'Sri Balaji Precision Tooling MSME',
    contactPerson: 'Suresh Venkatesh',
    phone: '+919845011223',
    pincode: '560034',
    city: 'Bengaluru',
    state: 'Karnataka',
    category: 'Machinery & Engineering',
    status: 'UNCONTACTED',
    source: 'DIRECTORY_INGESTION',
    createdAt: '2026-11-02',
  },
  {
    id: 'LEAD-BLR-003',
    entityType: 'RWA',
    organizationName: 'Sobha Dahlia Owners Association',
    contactPerson: 'Anand Parthasarathy',
    phone: '+919845022334',
    pincode: '560001',
    city: 'Bengaluru',
    state: 'Karnataka',
    category: 'Electrical & Power',
    status: 'UNCONTACTED',
    source: 'ORGANIC_SIGNUP',
    createdAt: '2026-11-02',
  },

  // Chennai (600001, 600034)
  {
    id: 'LEAD-MAA-001',
    entityType: 'RWA',
    organizationName: 'Anna Nagar West Resident Welfare Association',
    contactPerson: 'S. Rajendran',
    phone: '+919444012345',
    pincode: '600001',
    city: 'Chennai',
    state: 'Tamil Nadu',
    category: 'Water & Environmental Solutions',
    status: 'UNCONTACTED',
    source: 'DIRECTORY_INGESTION',
    createdAt: '2026-11-03',
  },
  {
    id: 'LEAD-MAA-002',
    entityType: 'MSME',
    organizationName: 'Ambattur Fasteners & Precision Turned Components',
    contactPerson: 'Muruganandam K.',
    phone: '+919444054321',
    pincode: '600034',
    city: 'Chennai',
    state: 'Tamil Nadu',
    category: 'Industrial Supplies & Hardware',
    status: 'UNCONTACTED',
    source: 'DIRECTORY_INGESTION',
    createdAt: '2026-11-03',
  },

  // Hyderabad (500001, 500081)
  {
    id: 'LEAD-HYD-001',
    entityType: 'RWA',
    organizationName: 'My Home Bhooja Residents Apex Society',
    contactPerson: 'Chaitanya Rao',
    phone: '+919848011222',
    pincode: '500081',
    city: 'Hyderabad',
    state: 'Telangana',
    category: 'HVAC & Refrigeration',
    status: 'UNCONTACTED',
    source: 'ORGANIC_SIGNUP',
    createdAt: '2026-11-03',
  },
  {
    id: 'LEAD-HYD-002',
    entityType: 'MSME',
    organizationName: 'Katedan Industrial Polymer Moulds MSME',
    contactPerson: 'Venkat Ramana',
    phone: '+919848033444',
    pincode: '500001',
    city: 'Hyderabad',
    state: 'Telangana',
    category: 'Chemicals & Process Materials',
    status: 'UNCONTACTED',
    source: 'DIRECTORY_INGESTION',
    createdAt: '2026-11-03',
  },

  // Kochi (682001, 682030)
  {
    id: 'LEAD-COK-001',
    entityType: 'RWA',
    organizationName: 'Marine Drive Waterfront Flat Owners Association',
    contactPerson: 'Jacob Varghese',
    phone: '+919846012345',
    pincode: '682001',
    city: 'Kochi',
    state: 'Kerala',
    category: 'Property & Facility Management',
    status: 'UNCONTACTED',
    source: 'ORGANIC_SIGNUP',
    createdAt: '2026-11-03',
  },
  {
    id: 'LEAD-COK-002',
    entityType: 'MSME',
    organizationName: 'Kalamassery High-Tech CNC Fabricators',
    contactPerson: 'P. M. Antony',
    phone: '+919846098765',
    pincode: '682030',
    city: 'Kochi',
    state: 'Kerala',
    category: 'Machinery & Engineering',
    status: 'UNCONTACTED',
    source: 'DIRECTORY_INGESTION',
    createdAt: '2026-11-03',
  },

  // Mumbai (400001, 400051)
  {
    id: 'LEAD-BOM-001',
    entityType: 'MSME',
    organizationName: 'Thane Precision Forgings & Pumps MSME',
    contactPerson: 'Rajesh Solanki',
    phone: '+919820012345',
    pincode: '400051',
    city: 'Mumbai',
    state: 'Maharashtra',
    category: 'Machinery & Engineering',
    status: 'UNCONTACTED',
    source: 'DIRECTORY_INGESTION',
    createdAt: '2026-11-02',
  },
  {
    id: 'LEAD-BOM-002',
    entityType: 'RWA',
    organizationName: 'Bandra West Residents Federation',
    contactPerson: 'Meera Merchant',
    phone: '+919820098765',
    pincode: '400001',
    city: 'Mumbai',
    state: 'Maharashtra',
    category: 'Safety & Security',
    status: 'UNCONTACTED',
    source: 'ORGANIC_SIGNUP',
    createdAt: '2026-11-02',
  },

  // Delhi NCR (110001, 122002)
  {
    id: 'LEAD-DEL-001',
    entityType: 'RWA',
    organizationName: 'Greater Kailash II Enclave RWA',
    contactPerson: 'Brig. J. S. Ahluwalia',
    phone: '+919810011223',
    pincode: '110001',
    city: 'Delhi NCR',
    state: 'Delhi',
    category: 'Construction & Civil Infrastructure',
    status: 'UNCONTACTED',
    source: 'ORGANIC_SIGNUP',
    createdAt: '2026-11-01',
  },
  {
    id: 'LEAD-DEL-002',
    entityType: 'MSME',
    organizationName: 'Manesar Precision Auto Components MSME',
    contactPerson: 'Gurpreet Singh',
    phone: '+919810099887',
    pincode: '122002',
    city: 'Delhi NCR',
    state: 'Haryana',
    category: 'Machinery & Engineering',
    status: 'UNCONTACTED',
    source: 'DIRECTORY_INGESTION',
    createdAt: '2026-11-01',
  },
];

/**
 * Retrieve leads directory with local persistence.
 */
export function getOutreachDirectoryLeads(filter?: {
  entityType?: OutreachEntityType | 'ALL';
  city?: string;
  pincode?: string;
  status?: string;
}): OutreachDirectoryLead[] {
  let allLeads: OutreachDirectoryLead[] = inMemoryLeadsStore || INITIAL_OUTREACH_LEADS;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(STORAGE_KEY_LEADS);
      if (saved) {
        allLeads = JSON.parse(saved);
        inMemoryLeadsStore = allLeads;
      }
    }
  } catch {
    // fallback to initial
  }

  return allLeads.filter((l) => {
    if (filter?.entityType && filter.entityType !== 'ALL' && l.entityType !== filter.entityType) {
      return false;
    }
    if (filter?.city && filter.city !== 'ALL' && l.city !== filter.city) {
      return false;
    }
    if (filter?.pincode && filter.pincode.trim() && l.pincode !== filter.pincode.trim()) {
      return false;
    }
    if (filter?.status && filter.status !== 'ALL' && l.status !== filter.status) {
      return false;
    }
    return true;
  });
}

/**
 * Save leads into storage.
 */
export function saveOutreachDirectoryLeads(leads: OutreachDirectoryLead[]): void {
  inMemoryLeadsStore = leads;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY_LEADS, JSON.stringify(leads));
    }
  } catch {
    // storage unavailable
  }
}

/**
 * Retrieve organically unlocked PIN codes with active network density.
 */
export function getUnlockedOrganicPincodes(): OrganicPincodeEntry[] {
  const leads = getOutreachDirectoryLeads();
  const pincodeMap = new Map<string, OrganicPincodeEntry>();

  for (const lead of leads) {
    const pin = lead.pincode.trim();
    if (!pin) continue;

    if (!pincodeMap.has(pin)) {
      const city = lead.city || inferIndianCity(pin) || 'Regional Hub';
      const state = lead.state || inferIndianState(pin, city) || 'India';

      pincodeMap.set(pin, {
        pincode: pin,
        city,
        state,
        isUnlocked: true,
        unlockedAt: lead.createdAt || '2026-11-01',
        density: {
          buyersCount: 0,
          suppliersCount: 0,
          msmeCount: 0,
          rwaCount: 0,
          totalEntities: 0,
        },
        densityStatus: 'SEED_ACTIVE',
      });
    }

    const entry = pincodeMap.get(pin)!;
    entry.density.totalEntities++;
    if (lead.entityType === 'RWA') entry.density.rwaCount++;
    if (lead.entityType === 'MSME') entry.density.msmeCount++;
    if (lead.entityType === 'BUYER_PROSPECT') entry.density.buyersCount++;
    if (lead.entityType === 'SUPPLIER_PROSPECT') entry.density.suppliersCount++;

    // Calculate density status
    if (entry.density.totalEntities >= 5) {
      entry.densityStatus = 'HIGH_DENSITY';
    } else if (entry.density.totalEntities >= 2) {
      entry.densityStatus = 'GROWING';
    } else {
      entry.densityStatus = 'SEED_ACTIVE';
    }
  }

  return Array.from(pincodeMap.values()).sort(
    (a, b) => b.density.totalEntities - a.density.totalEntities
  );
}

/**
 * Organic PIN code registration hook.
 * Unlocks the PIN code dynamically the instant any entity onboards or registers.
 */
export function registerOrganicPincode(
  pincode: string,
  entityType: OutreachEntityType,
  details?: { city?: string; state?: string }
): OrganicPincodeEntry | null {
  if (!validateIndianPincode(pincode)) return null;

  const pin = pincode.trim();
  const city = details?.city || inferIndianCity(pin) || 'Regional Hub';
  const state = details?.state || inferIndianState(pin, city) || 'India';

  const currentUnlocked = getUnlockedOrganicPincodes();
  const existing = currentUnlocked.find((p) => p.pincode === pin);

  if (existing) {
    existing.density.totalEntities++;
    if (entityType === 'RWA') existing.density.rwaCount++;
    if (entityType === 'MSME') existing.density.msmeCount++;
    if (entityType === 'BUYER_PROSPECT') existing.density.buyersCount++;
    if (entityType === 'SUPPLIER_PROSPECT') existing.density.suppliersCount++;
    return existing;
  }

  const newEntry: OrganicPincodeEntry = {
    pincode: pin,
    city,
    state,
    isUnlocked: true,
    unlockedAt: new Date().toISOString().split('T')[0] ?? '',
    density: {
      buyersCount: entityType === 'BUYER_PROSPECT' ? 1 : 0,
      suppliersCount: entityType === 'SUPPLIER_PROSPECT' ? 1 : 0,
      msmeCount: entityType === 'MSME' ? 1 : 0,
      rwaCount: entityType === 'RWA' ? 1 : 0,
      totalEntities: 1,
    },
    densityStatus: 'SEED_ACTIVE',
  };

  return newEntry;
}

/**
 * Ingests external lead lines (CSV, TSV, or piped text) into the directory
 * and automatically triggers organic PIN code unlocking.
 */
export function parseAndIngestLeadRecords(
  rawText: string,
  defaultEntityType: OutreachEntityType = 'MSME',
  defaultCategory: string = 'Machinery & Engineering'
): {
  added: number;
  unlockedPincodesCount: number;
  errors: string[];
  leads: OutreachDirectoryLead[];
} {
  const lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('#'));
  const currentLeads = getOutreachDirectoryLeads();
  const existingPhones = new Set(currentLeads.map((l) => l.phone));
  const newLeads: OutreachDirectoryLead[] = [];
  const errors: string[] = [];
  const newlyUnlockedPins = new Set<string>();

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (!line) continue;
    // Split by comma, tab, or pipe
    const parts = line.includes('\t')
      ? line.split('\t').map((p) => p.trim())
      : line.includes('|')
      ? line.split('|').map((p) => p.trim())
      : line.split(',').map((p) => p.trim());

    if (parts.length < 3) {
      errors.push(`Line ${idx + 1}: Insufficient fields (Organization, Phone, Pincode required)`);
      continue;
    }

    const orgName = parts[0] ?? 'Organization';
    const contactPerson = parts.length > 3 ? (parts[1] ?? 'Executive Representative') : 'Executive Representative';
    const rawPhone = parts.length > 3 ? (parts[2] ?? '') : (parts[1] ?? '');
    const rawPin = parts.length > 3 ? (parts[3] ?? '') : (parts[2] ?? '');
    const explicitType = ((parts[4]?.toUpperCase() || defaultEntityType) as OutreachEntityType);
    const category = parts[5] || defaultCategory;

    const sanitizedPhone = sanitizeIndianPhone(rawPhone);
    if (!sanitizedPhone) {
      errors.push(`Line ${idx + 1}: Invalid Indian mobile number format '${rawPhone}'`);
      continue;
    }

    if (!validateIndianPincode(rawPin)) {
      errors.push(`Line ${idx + 1}: Invalid 6-digit Indian PIN code '${rawPin}'`);
      continue;
    }

    if (existingPhones.has(sanitizedPhone)) {
      // deduplicate
      continue;
    }

    const city = inferIndianCity(rawPin) || 'Regional Hub';
    const state = inferIndianState(rawPin, city) || 'India';

    const newLead: OutreachDirectoryLead = {
      id: `LEAD-INGEST-${Date.now().toString().slice(-6)}-${idx}`,
      entityType: explicitType,
      organizationName: orgName,
      contactPerson,
      phone: sanitizedPhone,
      pincode: rawPin,
      city,
      state,
      category,
      status: 'UNCONTACTED',
      source: 'MANUAL_IMPORT',
      createdAt: new Date().toISOString().split('T')[0] ?? '',
    };

    newLeads.push(newLead);
    existingPhones.add(sanitizedPhone);
    newlyUnlockedPins.add(rawPin);

    // Auto-unlock pin organically
    registerOrganicPincode(rawPin, explicitType, { city, state });
  }

  const updatedAll = [...newLeads, ...currentLeads];
  saveOutreachDirectoryLeads(updatedAll);

  return {
    added: newLeads.length,
    unlockedPincodesCount: newlyUnlockedPins.size,
    errors,
    leads: updatedAll,
  };
}
