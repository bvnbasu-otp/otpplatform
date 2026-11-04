/**
 * Self-contained Indian postal code geography inference (Zero external dependencies).
 * Enriched with South & North Indian hubs and canonical regional MSME/RWA clusters:
 * Erode, Bhavani, Tiruppur, Coimbatore, Hosur, Salem, Bengaluru, Chennai, Kochi, Hyderabad, etc.
 */
export function inferIndianCity(pincode?: string | null, _state?: string | null): string | null {
  if (!pincode || !/^[1-9][0-9]{5}$/.test(pincode.trim())) return null;
  const pin = pincode.trim();
  const p3 = pin.slice(0, 3);
  const p2 = pin.slice(0, 2);

  // Karnataka circles
  if (['560', '561', '562'].includes(p3)) return 'Bengaluru';
  if (p3 === '570') return 'Mysuru';
  if (p3 === '575') return 'Mangaluru';
  if (p3 === '580') return 'Hubballi';
  if (p3 === '590') return 'Belagavi';
  if (p3 === '583') return 'Ballari';
  if (p3 === '577') return 'Davanagere';
  if (p3 === '572') return 'Tumakuru';
  if (p3 === '573') return 'Hassan';

  // Tamil Nadu circles & Authoritative Regional Clusters
  if (p3 === '600') return 'Chennai';
  if (p3 === '641') {
    if (pin.startsWith('6416')) {
      if (pin === '641654') return 'Avinashi';
      if (pin === '641664') return 'Palladam';
      return 'Tiruppur';
    }
    return 'Coimbatore';
  }
  if (p3 === '638') {
    if (pin === '638301') return 'Bhavani';
    if (pin === '638183') return 'Komarapalayam';
    if (pin === '638501') return 'Anthiyur';
    if (pin === '638052') return 'Perundurai';
    if (pin === '638452') return 'Gobichettipalayam';
    if (['638401', '638402'].includes(pin)) return 'Sathyamangalam';
    return 'Erode';
  }
  if (p3 === '635') return 'Hosur';
  if (p3 === '636') return 'Salem';
  if (p3 === '625') return 'Madurai';
  if (p3 === '620') return 'Tiruchirappalli';
  if (p3 === '639') return 'Karur';
  if (p3 === '637') return 'Namakkal';
  if (p3 === '642') return 'Pollachi';
  if (p3 === '632') return 'Vellore';
  if (p3 === '627') return 'Tirunelveli';
  if (p3 === '624') return 'Dindigul';
  if (p3 === '613') return 'Thanjavur';

  // Kerala circles
  if (p3 === '682') return 'Kochi';
  if (p3 === '695') return 'Thiruvananthapuram';
  if (p3 === '673') return 'Kozhikode';
  if (p3 === '680') return 'Thrissur';

  // Telangana & AP circles
  if (p3 === '500') return 'Hyderabad';
  if (p3 === '506') return 'Warangal';
  if (p3 === '520') return 'Vijayawada';
  if (p3 === '530') return 'Visakhapatnam';
  if (p3 === '522') return 'Guntur';
  if (p3 === '517') return 'Tirupati';

  // Maharashtra circles
  if (p3 === '400') return 'Mumbai';
  if (['401', '402'].includes(p3)) return 'Thane';
  if (p3 === '411') return 'Pune';
  if (p3 === '440') return 'Nagpur';
  if (p3 === '422') return 'Nashik';
  if (p3 === '416') return 'Kolhapur';

  // Delhi NCR circles
  if (p2 === '11') return 'Delhi NCR';
  if (p3 === '122') return 'Gurugram';
  if (p3 === '201') return 'Noida';
  if (p3 === '121') return 'Faridabad';

  // Gujarat & Rajasthan
  if (p3 === '380') return 'Ahmedabad';
  if (p3 === '395') return 'Surat';
  if (p3 === '390') return 'Vadodara';
  if (p3 === '302') return 'Jaipur';

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
  if (['38', '39'].includes(p2)) return 'Gujarat';
  if (['30', '31', '32', '33', '34'].includes(p2)) return 'Rajasthan';
  return 'India';
}

/**
 * Authoritative 17 Canonical Categories matching Migration 00331_authoritative_17_category_taxonomy.sql
 * and AdminSupplierNetworkConsole.tsx.
 */
export const SNE_17_CATEGORIES: string[] = [
  'Construction & Civil Infrastructure',
  'Plumbing & Sanitary',
  'Electrical & Power',
  'HVAC & Refrigeration',
  'Machinery & Engineering',
  'Industrial Supplies & Hardware',
  'Chemicals & Process Materials',
  'Textile & Apparel',
  'Agriculture & Commodities',
  'Packaging & Printing',
  'Property & Facility Management',
  'Safety & Security',
  'Water & Environmental Solutions',
  'IT, Electronics & Digital Systems',
  'Logistics & Transportation',
  'Professional & Skilled Services',
  'General / Miscellaneous / Other',
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
 * Production Invariant: In live production (VITE_DEMO_MODE !== 'true'), defaults to a 100% clean blank slate ([]).
 * Benchmark seed leads are loaded exclusively in demo mode (VITE_DEMO_MODE=true) or test harnesses.
 */
export function getOutreachDirectoryLeads(filter?: {
  entityType?: OutreachEntityType | 'ALL';
  city?: string;
  pincode?: string;
  status?: string;
}): OutreachDirectoryLead[] {
  const isDemoOrTest =
    (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE === 'true');

  const defaultSeedLeads: OutreachDirectoryLead[] = isDemoOrTest ? INITIAL_OUTREACH_LEADS : [];
  let allLeads: OutreachDirectoryLead[] = inMemoryLeadsStore ?? defaultSeedLeads;
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

  // 1. Load any standalone registered / unlocked PIN codes from memory or persistence
  if (inMemoryPincodesStore) {
    for (const [pin, entry] of inMemoryPincodesStore.entries()) {
      pincodeMap.set(pin, { ...entry });
    }
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const savedPincodes = window.localStorage.getItem(STORAGE_KEY_PINCODES);
      if (savedPincodes) {
        const parsed = JSON.parse(savedPincodes) as OrganicPincodeEntry[];
        for (const entry of parsed) {
          if (entry.pincode) {
            pincodeMap.set(entry.pincode, entry);
          }
        }
      }
    }
  } catch {
    // fallback
  }

  // 2. Aggregate density from all active leads
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

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY_PINCODES, JSON.stringify(currentUnlocked));
      }
    } catch {
      // storage unavailable
    }
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

  if (!inMemoryPincodesStore) {
    inMemoryPincodesStore = new Map<string, OrganicPincodeEntry>();
  }
  inMemoryPincodesStore.set(pin, newEntry);

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(
        STORAGE_KEY_PINCODES,
        JSON.stringify([...currentUnlocked, newEntry])
      );
    }
  } catch {
    // storage unavailable
  }

  return newEntry;
}

/**
 * Unlocks any organic PIN code manually (e.g. from the Admin SNE console).
 */
export function unlockOrganicPincodeManually(
  pincode: string,
  details?: { city?: string; state?: string }
): OrganicPincodeEntry | null {
  return registerOrganicPincode(pincode, 'MSME', details);
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
