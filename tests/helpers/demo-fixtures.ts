/**
 * Fixed identifiers from supabase/seed_demo_environment.sql.
 *
 * The demo environment is deliberately deterministic, so tests can name a
 * scenario and know exactly which organization, requirement and RFQ they are
 * talking about.
 */

export const DEMO = {
  orgs: {
    sunrise: '0da00000-0000-4000-8000-000000000001',
    kovai: '0da00000-0000-4000-8000-000000000002',
    lakshmi: '0da00000-0000-4000-8000-000000000003',
    bharathi: '0da00000-0000-4000-8000-000000000004',
    qaIndividual: '0da00000-0000-4000-8000-000000000051',
    qaCommunity: '0da00000-0000-4000-8000-000000000061',
  },
  requirements: {
    motor: '0d700000-0000-4000-8000-000000000001',
    liftAmc: '0d700000-0000-4000-8000-000000000002',
    cnc: '0d700000-0000-4000-8000-000000000003',
    yarn: '0d700000-0000-4000-8000-000000000004',
    turmeric: '0d700000-0000-4000-8000-000000000005',
  },
  rfqs: {
    motor: '0d800000-0000-4000-8000-000000000001',
    liftAmc: '0d800000-0000-4000-8000-000000000002',
    cnc: '0d800000-0000-4000-8000-000000000003',
    yarn: '0d800000-0000-4000-8000-000000000004',
    turmeric: '0d800000-0000-4000-8000-000000000005',
  },
  logins: {
    admin: 'admin@otp.test',
    sunriseManager: 'secretary@sunrise.test',
    sunriseCommittee: 'treasurer@sunrise.test',
    sunriseCommittee2: 'member1@sunrise.test',
    kovaiOwner: 'owner@kovaiprecision.test',
    kovaiPartner: 'partner@kovaiprecision.test',
    lakshmiManager: 'procurement@srilakshmi.test',
    bharathiOwner: 'bharathi@agrotrade.test',
    /** Freeform tester — INDIVIDUAL buyer, no committee, any category. */
    qaBuyer: 'qa-buyer@otp.test',
    /** Freeform tester — COMMUNITY buyer, committee chair. */
    qaCommittee: 'qa-committee@otp.test',
    /** Second voter for the QA community committee. */
    qaVoter: 'qa-voter@otp.test',
    /** Aqua Prime Borewell Works — 20 HP motor rewinding, Bengaluru. */
    motorSupplier: 'supplier01@otpdemo.test',
    /** Nandi Electricals — 10 HP ceiling, excluded from the 12.5 HP job. */
    tooSmallSupplier: 'supplier04@otpdemo.test',
    /** Tirupur Combed Yarn Traders. */
    yarnSupplier: 'supplier24@otpdemo.test',
  },
  suppliers: {
    /** 20 HP rewinding ceiling. */
    aquaPrime: '0d500000-0000-4000-8000-000000000001',
    /** 10 HP rewinding ceiling — the capacity gate should exclude this one. */
    nandi: '0d500000-0000-4000-8000-000000000004',
    tirupurYarn: '0d500000-0000-4000-8000-000000000024',
  },
  scenarios: {
    motor: 'sunrise_motor',
    liftAmc: 'sunrise_lift_amc',
    cnc: 'kovai_cnc',
    yarn: 'lakshmi_yarn',
    turmeric: 'bharathi_turmeric',
  },
} as const;

/**
 * Fields that must never appear in anything a buyer sees before reveal, or in
 * anything a supplier sees about a competitor.
 *
 * match_score and source are included because either one lets a buyer rank or
 * segment bidders by something other than their offer, which is what blind
 * evaluation exists to prevent.
 */
export const BLIND_FORBIDDEN_FIELDS = [
  'supplier_id',
  'supplierId',
  'business_name',
  'businessName',
  'contact_phone',
  'contactPhone',
  'contact_email',
  'contactEmail',
  'phone',
  'email',
  'address',
  'gstin',
  'source',
  'match_score',
  'matchScore',
  'match_reasons',
  'matchReasons',
  'city',
  'pincode',
  'original_filename',
  'originalFilename',
  'uploaded_by',
  'uploadedBy',
] as const;

export function findBlindLeaks(row: Record<string, unknown>): string[] {
  return BLIND_FORBIDDEN_FIELDS.filter(
    (key) => key in row && row[key] !== undefined && row[key] !== null,
  );
}
