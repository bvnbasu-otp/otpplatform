import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  DEFAULT_SUPPLIER_CAPABILITY_PROFILE,
  PRESET_CAPABILITY_CATEGORIES,
  PRESET_SLA_OPTIONS,
  PRESET_CERTIFICATIONS,
  type SupplierCapabilityProfile,
} from './types/capability-profile';
import {
  loadSupplierCapabilityProfile,
  saveSupplierCapabilityProfile,
  calculateRfqMatchScore,
  SUPPLIER_CAPABILITIES_UPDATED_EVENT,
} from './lib/supplier-radar-state';
import { SupplierCapabilityModal } from './components/SupplierCapabilityModal';
import { useSupplierRadarCapabilities } from './hooks/use-supplier-radar';

function createMockStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
}

describe('Supplier Capability Modal & Radar Matching Engine', () => {
  let mockLocal: Storage;
  const eventListeners: Record<string, ((e: Event) => void)[]> = {};

  beforeEach(() => {
    mockLocal = createMockStorage();
    (globalThis as unknown as { localStorage: Storage }).localStorage = mockLocal;
    (globalThis as unknown as {
      window: {
        localStorage: Storage;
        dispatchEvent: (e: Event) => boolean;
        addEventListener: (name: string, fn: (e: Event) => void) => void;
        removeEventListener: (name: string, fn: (e: Event) => void) => void;
      };
    }).window = {
      localStorage: mockLocal,
      dispatchEvent: (event: Event) => {
        const list = eventListeners[event.type] || [];
        list.forEach((fn) => fn(event));
        return true;
      },
      addEventListener: (name: string, fn: (e: Event) => void) => {
        if (!eventListeners[name]) eventListeners[name] = [];
        eventListeners[name].push(fn);
      },
      removeEventListener: (name: string, fn: (e: Event) => void) => {
        if (eventListeners[name]) {
          eventListeners[name] = eventListeners[name].filter((l) => l !== fn);
        }
      },
    };
  });

  describe('1. Preset Taxonomies & Defaults', () => {
    it('defines standard domain taxonomy categories including HVAC, Electrical, Raw Materials', () => {
      const labels = PRESET_CAPABILITY_CATEGORIES.map((c) => c.label);
      expect(labels).toContain('HVAC Repair & Maintenance');
      expect(labels).toContain('Electrical Hardware & Pumps');
      expect(labels).toContain('Motor Rewinding & Servicing');
      expect(labels).toContain('CNC Precision Machining');
      expect(labels).toContain('Raw Materials & Metals');
      expect(labels).toContain('IT Services & Cloud');
      expect(labels).toContain('Facilities & Security');
      expect(labels).toContain('Plumbing & Industrial Piping');
      expect(labels).toContain('Industrial Automation');
      expect(labels).toContain('Solar & Renewable Power');
    });

    it('defines SLA badge options with 24h Emergency, 48h Standard, and Bulk Capacity', () => {
      const slaLabels = PRESET_SLA_OPTIONS.map((s) => s.label);
      expect(slaLabels).toContain('24h Emergency SLA');
      expect(slaLabels).toContain('48h Standard SLA');
      expect(slaLabels).toContain('72h Turnaround SLA');
      expect(slaLabels).toContain('Bulk Capacity');
      expect(slaLabels).toContain('Same Day Dispatch');
    });

    it('defines verified business certifications including GST, MSME, and ISO', () => {
      const certLabels = PRESET_CERTIFICATIONS.map((c) => c.label);
      expect(certLabels).toContain('GST Verified');
      expect(certLabels).toContain('MSME Udyam Registered');
      expect(certLabels).toContain('MSME ZED Gold');
      expect(certLabels).toContain('ISO 9001:2015');
    });

    it('provides valid default supplier capability profile', () => {
      expect(DEFAULT_SUPPLIER_CAPABILITY_PROFILE.categories.length).toBeGreaterThanOrEqual(2);
      expect(DEFAULT_SUPPLIER_CAPABILITY_PROFILE.radiusKm).toBe(50);
      expect(DEFAULT_SUPPLIER_CAPABILITY_PROFILE.baseCity).toBe('Bengaluru');
      expect(DEFAULT_SUPPLIER_CAPABILITY_PROFILE.slaBadges).toContain('24h Emergency SLA');
      expect(DEFAULT_SUPPLIER_CAPABILITY_PROFILE.certifications).toContain('GST Verified');
    });
  });

  describe('2. State Persistence & Event Dispatching', () => {
    it('loads default profile when local storage is empty', () => {
      const profile = loadSupplierCapabilityProfile();
      expect(profile.categories).toEqual(DEFAULT_SUPPLIER_CAPABILITY_PROFILE.categories);
      expect(profile.radiusKm).toBe(50);
    });

    it('saves updated profile to local storage and dispatches custom event', () => {
      const listener = vi.fn();
      window.addEventListener(SUPPLIER_CAPABILITIES_UPDATED_EVENT, listener);

      const customProfile: SupplierCapabilityProfile = {
        categories: ['CNC Precision Machining', 'Raw Materials & Metals'],
        radiusKm: 200,
        isPanIndia: true,
        baseCity: 'Coimbatore',
        pincode: '641001',
        slaBadges: ['24h Emergency SLA', 'Bulk Capacity'],
        certifications: ['GST Verified', 'ISO 9001:2015', 'MSME ZED Gold'],
        gstin: '33ABCDE1234F1Z5',
        capacityNotes: '5-Axis CNC Milling',
        updatedAt: new Date().toISOString(),
      };

      const saved = saveSupplierCapabilityProfile(customProfile);
      expect(saved.categories).toContain('CNC Precision Machining');
      expect(saved.isPanIndia).toBe(true);

      const reloaded = loadSupplierCapabilityProfile();
      expect(reloaded.categories).toContain('CNC Precision Machining');
      expect(reloaded.baseCity).toBe('Coimbatore');
      expect(reloaded.isPanIndia).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);

      window.removeEventListener(SUPPLIER_CAPABILITIES_UPDATED_EVENT, listener);
    });
  });

  describe('3. Supplier Radar Match Score Engine', () => {
    const testProfile: SupplierCapabilityProfile = {
      categories: ['Motor Rewinding & Servicing', 'Electrical Hardware & Pumps'],
      radiusKm: 50,
      isPanIndia: false,
      baseCity: 'Bengaluru',
      pincode: '560001',
      slaBadges: ['24h Emergency SLA', '48h Standard SLA'],
      certifications: ['GST Verified', 'MSME Udyam Registered'],
      gstin: '29ABCDE1234F1Z5',
      updatedAt: new Date().toISOString(),
    };

    it('calculates high match score for category and city match', () => {
      const rfq = {
        rfqTitle: '10 HP Submersible Borewell Motor Rewind',
        category: 'Electrical & Pumps',
        subcategory: 'Motor Rewinding',
        deliveryCity: 'Bengaluru',
        description: 'Urgent copper coil rewind for residential pump house',
      };

      const breakdown = calculateRfqMatchScore(testProfile, rfq);
      expect(breakdown.categoryMatch).toBe(true);
      expect(breakdown.radiusMatch).toBe(true);
      expect(breakdown.overallScore).toBeGreaterThanOrEqual(90);
      expect(breakdown.badgeLabel).toMatch(/\d+% Radar Match/);
      expect(breakdown.matchReasons.some((r) => r.includes('Motor Rewind'))).toBe(true);
      expect(breakdown.matchReasons.some((r) => r.includes('Bengaluru'))).toBe(true);
    });

    it('awards Pan-India score boost when Pan-India is active', () => {
      const panIndiaProfile: SupplierCapabilityProfile = {
        ...testProfile,
        isPanIndia: true,
      };

      const rfqInDelhi = {
        rfqTitle: '10 HP Motor Rewinding',
        deliveryCity: 'New Delhi',
      };

      const breakdown = calculateRfqMatchScore(panIndiaProfile, rfqInDelhi);
      expect(breakdown.radiusMatch).toBe(true);
      expect(breakdown.radiusScore).toBe(25);
      expect(breakdown.matchReasons).toContain('Pan-India Coverage');
    });

    it('recalculates dynamic match score when supplier adds a new category', () => {
      const hvacRfq = {
        rfqTitle: '50 Ton Chiller Plant Annual Maintenance',
        category: 'HVAC',
        deliveryCity: 'Bengaluru',
      };

      // Before adding HVAC category
      const initialBreakdown = calculateRfqMatchScore(testProfile, hvacRfq);
      expect(initialBreakdown.categoryMatch).toBe(false);

      // After adding HVAC category
      const updatedProfile: SupplierCapabilityProfile = {
        ...testProfile,
        categories: [...testProfile.categories, 'HVAC Repair & Maintenance'],
      };

      const newBreakdown = calculateRfqMatchScore(updatedProfile, hvacRfq);
      expect(newBreakdown.categoryMatch).toBe(true);
      expect(newBreakdown.overallScore).toBeGreaterThan(initialBreakdown.overallScore);
      expect(newBreakdown.matchReasons.some((r) => r.includes('HVAC Repair'))).toBe(true);
    });
  });

  describe('4. Component & Hook Exports', () => {
    it('exports SupplierCapabilityModal and useSupplierRadarCapabilities', () => {
      expect(SupplierCapabilityModal).toBeDefined();
      expect(useSupplierRadarCapabilities).toBeDefined();
    });
  });
});
