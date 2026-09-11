import {
  generateValidGstin,
  validateGstin,
  type GstTaxpayerInfo,
  type GstVerificationResult,
} from '@otp/domain';

export interface GstVerificationPort {
  verifyGstin(gstin: string): Promise<GstVerificationResult>;
}

/**
 * Pre-seeded mock database of verified taxpayer entities for Indian B2B demo/tests.
 */
const KAVVERI_GSTIN = generateValidGstin({ stateCode: '29', pan: 'AABCU9603R', entityNumber: '1' });
const PRECISION_GSTIN = generateValidGstin({ stateCode: '33', pan: 'AABCT1452F', entityNumber: '1' });
const SRI_KRISHNA_GSTIN = generateValidGstin({ stateCode: '33', pan: 'AABCS4455P', entityNumber: '1' });

export const PRE_SEEDED_GSTINS = {
  kavveri: KAVVERI_GSTIN,
  precision: PRECISION_GSTIN,
  sriKrishna: SRI_KRISHNA_GSTIN,
};

const KNOWN_MOCK_TAXPAYERS: Record<string, GstTaxpayerInfo> = {
  [KAVVERI_GSTIN]: {
    gstin: KAVVERI_GSTIN,
    legalName: 'KAVVERI PUMP & ELECTRICAL SERVICES PRIVATE LIMITED',
    tradeName: 'Kavveri Electricals & Borewell Works',
    pan: 'AABCU9603R',
    status: 'ACTIVE',
    taxpayerType: 'REGULAR',
    registrationDate: '2017-07-01',
    stateJurisdiction: 'Karnataka - Ward 080',
    principalAddress: {
      line1: '14, Peenya Industrial Area 1st Stage',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560058',
    },
  },
  [PRECISION_GSTIN]: {
    gstin: PRECISION_GSTIN,
    legalName: 'PRECISION CNC TOOLS & SPINDLE WORKS LLP',
    tradeName: 'Precision Tools Coimbatore',
    pan: 'AABCT1452F',
    status: 'ACTIVE',
    taxpayerType: 'REGULAR',
    registrationDate: '2018-04-15',
    stateJurisdiction: 'Tamil Nadu - Coimbatore Central',
    principalAddress: {
      line1: '88, SIDCO Industrial Estate, Kurichi',
      city: 'Coimbatore',
      state: 'Tamil Nadu',
      pincode: '641021',
    },
  },
  [SRI_KRISHNA_GSTIN]: {
    gstin: SRI_KRISHNA_GSTIN,
    legalName: 'SRI KRISHNA SPINNERS & TEXTILE MILLS',
    tradeName: 'Sri Krishna Spinners',
    pan: 'AABCS4455P',
    status: 'ACTIVE',
    taxpayerType: 'REGULAR',
    registrationDate: '2017-08-20',
    stateJurisdiction: 'Tamil Nadu - Tiruppur North',
    principalAddress: {
      line1: '24, Avinashi Road, Kumar Nagar',
      city: 'Tiruppur',
      state: 'Tamil Nadu',
      pincode: '641602',
    },
  },
};

/**
 * Mock/Sandbox verification adapter for local development and unit tests.
 */
export class MockGstVerificationAdapter implements GstVerificationPort {
  async verifyGstin(rawGstin: string): Promise<GstVerificationResult> {
    const validation = validateGstin(rawGstin);
    if (!validation.valid) {
      return {
        verified: false,
        verifiedAt: new Date().toISOString(),
        source: 'MOCK_SANDBOX',
        error: validation.error ?? 'Invalid GSTIN format',
      };
    }

    const gstin = rawGstin.trim().toUpperCase();
    const known = KNOWN_MOCK_TAXPAYERS[gstin];
    if (known) {
      return {
        verified: true,
        verifiedAt: new Date().toISOString(),
        source: 'MOCK_SANDBOX',
        details: known,
      };
    }

    // Synthesize verified details for any valid format GSTIN in test/demo mode
    const pan = validation.pan!;
    const stateName = validation.stateName!;
    const entityType = validation.entityType!;

    return {
      verified: true,
      verifiedAt: new Date().toISOString(),
      source: 'MOCK_SANDBOX',
      details: {
        gstin,
        legalName: `M/S ${pan} ENTERPRISES (${entityType.toUpperCase()})`,
        tradeName: `Trade Entity - ${validation.stateCode}`,
        pan,
        status: 'ACTIVE',
        taxpayerType: 'REGULAR',
        registrationDate: '2019-01-01',
        stateJurisdiction: `${stateName} Commercial Tax Office`,
        principalAddress: {
          line1: 'Registered Commercial Premises',
          city: validation.stateCode === '29' ? 'Bengaluru' : 'City Center',
          state: stateName,
          pincode: validation.stateCode === '29' ? '560001' : '600001',
        },
      },
    };
  }
}

/**
 * Live GSTN verification adapter via API Gateway.
 */
export class LiveGstVerificationAdapter implements GstVerificationPort {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
  ) {}

  async verifyGstin(rawGstin: string): Promise<GstVerificationResult> {
    const validation = validateGstin(rawGstin);
    if (!validation.valid) {
      return {
        verified: false,
        verifiedAt: new Date().toISOString(),
        source: 'LIVE_GSTN',
        error: validation.error,
      };
    }

    try {
      const gstin = rawGstin.trim().toUpperCase();
      const res = await fetch(`${this.apiUrl}/taxpayer/${gstin}`, {
        headers: {
          'x-api-key': this.apiKey,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        return {
          verified: false,
          verifiedAt: new Date().toISOString(),
          source: 'LIVE_GSTN',
          error: `GST verification service returned HTTP ${res.status}`,
        };
      }

      const data = await res.json();
      return {
        verified: data.status === 'ACTIVE' || data.sts === 'Active',
        verifiedAt: new Date().toISOString(),
        source: 'LIVE_GSTN',
        details: {
          gstin,
          legalName: data.legalName || data.lgnm,
          tradeName: data.tradeName || data.tradeNam,
          pan: validation.pan!,
          status: (data.status || data.sts || 'ACTIVE').toUpperCase(),
          taxpayerType: data.taxpayerType || data.dty,
          registrationDate: data.registrationDate || data.rgdt,
          stateJurisdiction: data.stateJurisdiction || data.stj,
          principalAddress: data.principalAddress || data.pradr,
        },
      };
    } catch (err: any) {
      return {
        verified: false,
        verifiedAt: new Date().toISOString(),
        source: 'LIVE_GSTN',
        error: err?.message || 'Network exception during GST verification',
      };
    }
  }
}

/**
 * Primary GST verification service.
 */
export class GstVerificationService {
  constructor(private readonly adapter: GstVerificationPort = new MockGstVerificationAdapter()) {}

  async verify(gstin: string): Promise<GstVerificationResult> {
    return this.adapter.verifyGstin(gstin);
  }
}
