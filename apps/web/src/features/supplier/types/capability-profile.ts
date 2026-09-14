export interface CapabilityCategoryItem {
  id: string;
  label: string;
  icon: string;
  description?: string;
}

export interface SlaOption {
  id: string;
  label: string;
  icon: string;
  description: string;
}

export interface CertificationOption {
  id: string;
  label: string;
  icon: string;
  code: string;
  description: string;
}

export interface SupplierCapabilityProfile {
  categories: string[];
  radiusKm: number;
  isPanIndia: boolean;
  baseCity: string;
  pincode: string;
  slaBadges: string[];
  certifications: string[];
  gstin?: string;
  capacityNotes?: string;
  updatedAt: string;
}

export interface SupplierRadarMatchBreakdown {
  categoryMatch: boolean;
  categoryScore: number;
  radiusMatch: boolean;
  radiusScore: number;
  slaMatch: boolean;
  slaScore: number;
  trustScore: number;
  overallScore: number;
  matchReasons: string[];
  badgeLabel: string;
}

export const PRESET_CAPABILITY_CATEGORIES: CapabilityCategoryItem[] = [
  { id: 'hvac', label: 'HVAC Repair & Maintenance', icon: '❄️', description: 'Chillers, AHUs, ducting, split & VRF systems' },
  { id: 'electrical', label: 'Electrical Hardware & Pumps', icon: '⚡', description: 'Submersible pumps, switchgear, transformers' },
  { id: 'motor_rewind', label: 'Motor Rewinding & Servicing', icon: '🔄', description: 'LT/HT motors, rewinding, coil varnish' },
  { id: 'cnc_machining', label: 'CNC Precision Machining', icon: '⚙️', description: 'Turning, 4-axis milling, shafts, impellers' },
  { id: 'raw_materials', label: 'Raw Materials & Metals', icon: '🔩', description: 'SS 304/316, structural steel, aluminum' },
  { id: 'it_services', label: 'IT Services & Cloud', icon: '💻', description: 'Networking, server infra, managed support' },
  { id: 'facilities', label: 'Facilities & Security', icon: '🏢', description: 'Property maintenance, housekeeping, access control' },
  { id: 'plumbing', label: 'Plumbing & Industrial Piping', icon: '🚰', description: 'CPVC, GI piping, fire hydrant lines, valves' },
  { id: 'automation', label: 'Industrial Automation', icon: '🤖', description: 'PLCs, SCADA, proximity sensors, robotics' },
  { id: 'solar', label: 'Solar & Renewable Power', icon: '☀️', description: 'Rooftop PV, inverters, net-metering setup' },
  { id: 'furniture', label: 'Office Supplies & Furniture', icon: '🪑', description: 'Ergonomic chairs, modular workstations' },
  { id: 'logistics', label: 'Logistics & Freight', icon: '🚚', description: 'Intercity freight, part-load, express delivery' },
];

export const PRESET_SLA_OPTIONS: SlaOption[] = [
  { id: 'sla_24h', label: '24h Emergency SLA', icon: '⚡', description: 'Dispatch team within 24 hours for critical downtime' },
  { id: 'sla_48h', label: '48h Standard SLA', icon: '⏱️', description: 'Standard turnaround commitment within 2 business days' },
  { id: 'sla_72h', label: '72h Turnaround SLA', icon: '⏳', description: 'Batch delivery and installation within 3 days' },
  { id: 'sla_bulk', label: 'Bulk Capacity', icon: '🏭', description: 'High-volume production line availability' },
  { id: 'sla_same_day', label: 'Same Day Dispatch', icon: '🚀', description: 'Ready stock items dispatched same business day' },
];

export const PRESET_CERTIFICATIONS: CertificationOption[] = [
  { id: 'gst_verified', label: 'GST Verified', icon: '🛡️', code: 'GST', description: 'Active GSTIN with verified tax filing compliance' },
  { id: 'msme_registered', label: 'MSME Udyam Registered', icon: '🏅', code: 'UDYAM', description: 'Government registered micro/small enterprise' },
  { id: 'msme_zed_gold', label: 'MSME ZED Gold', icon: '🥇', code: 'ZED', description: 'Zero Defect Zero Effect certified manufacturing' },
  { id: 'iso_9001', label: 'ISO 9001:2015', icon: '📜', code: 'ISO9001', description: 'Quality Management Systems certified' },
  { id: 'iso_14001', label: 'ISO 14001', icon: '🌿', code: 'ISO14001', description: 'Environmental Management Systems certified' },
];

export const DEFAULT_SUPPLIER_CAPABILITY_PROFILE: SupplierCapabilityProfile = {
  categories: [
    'HVAC Repair & Maintenance',
    'Electrical Hardware & Pumps',
    'Motor Rewinding & Servicing',
  ],
  radiusKm: 50,
  isPanIndia: false,
  baseCity: 'Bengaluru',
  pincode: '560001',
  slaBadges: ['24h Emergency SLA', '48h Standard SLA'],
  certifications: ['GST Verified', 'MSME Udyam Registered'],
  gstin: '29ABCDE1234F1Z5',
  capacityNotes: 'Up to 25 HP motors and standard industrial HVAC units.',
  updatedAt: new Date().toISOString(),
};
