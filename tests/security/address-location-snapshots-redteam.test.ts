import { describe, it, expect, beforeEach } from 'vitest';
import {
  type BuyerAddress,
  type OperationalLocation,
  type AddressSnapshot,
  createAddressSnapshot,
  createDeliveryAddressSnapshot,
  createBillingAddressSnapshot,
  createOperationalLocation,
  isAddressValid,
  isPincodeValid,
  isCoordinatesValid,
  buildOperationalDiscoveryGeographicInput,
  maskAddressForDiscovery,
  resolveProcurementPlaceOfSupply,
  assertSnapshotDecoupled,
} from '@otp/domain';
import { InMemoryRepositories } from '../../packages/services/src/repositories/in-memory';
import { InMemoryAuditService } from '../../packages/services/src/audit/in-memory-audit-service';
import { AuditAppService } from '../../packages/services/src/services/audit-service';
import { BuyerAddressService } from '../../packages/services/src/services/buyer-address-service';
import type { ActorContext } from '../../packages/services/src/types/actor-context';

describe('Red Team Security Battery — Stage R2-14: Address Book, Operational Locations & Transaction Snapshots', () => {
  let mem: InMemoryRepositories;
  let audit: AuditAppService;
  let service: BuyerAddressService;

  // Tenant A: RWA Society
  const tenantARwaOwner: ActorContext = {
    profileId: 'user-rwa-owner-a',
    organizationId: 'org-rwa-a',
    orgRole: 'OWNER',
    isPlatformAdmin: false,
  };

  const tenantARwaViewer: ActorContext = {
    profileId: 'user-rwa-viewer-a',
    organizationId: 'org-rwa-a',
    orgRole: 'VIEWER',
    isPlatformAdmin: false,
  };

  const tenantARwaCommitteeMember: ActorContext = {
    profileId: 'user-rwa-comm-a',
    organizationId: 'org-rwa-a',
    orgRole: 'COMMITTEE_MEMBER',
    isPlatformAdmin: false,
  };

  // Tenant B: MSME Factory Enterprise
  const tenantBMsmeOwner: ActorContext = {
    profileId: 'user-msme-owner-b',
    organizationId: 'org-msme-b',
    orgRole: 'OWNER',
    isPlatformAdmin: false,
  };

  const tenantBMsmeDelegate: ActorContext = {
    profileId: 'user-msme-delegate-b',
    organizationId: 'org-msme-b',
    orgRole: 'BUYER',
    isPlatformAdmin: false,
  };

  // Individual Buyer (No Organization)
  const individualBuyer: ActorContext = {
    profileId: 'user-indiv-1',
    isPlatformAdmin: false,
  };

  // Unrelated Attacker / External Tenant
  const externalAttacker: ActorContext = {
    profileId: 'user-attacker-666',
    organizationId: 'org-attacker-666',
    orgRole: 'OWNER',
    isPlatformAdmin: false,
  };

  beforeEach(() => {
    mem = InMemoryRepositories.create();
    const repos = mem.asRepositories();
    const auditInner = new InMemoryAuditService();
    audit = new AuditAppService(auditInner);
    service = new BuyerAddressService(repos, audit);
  });

  // ---------------------------------------------------------------------------
  // RT-01: Cross-Tenant Address Read
  // ---------------------------------------------------------------------------
  it('RT-01: Blocks cross-tenant address read attempts', async () => {
    const addressA = await service.createAddress(tenantARwaOwner, {
      organizationId: 'org-rwa-a',
      label: 'Tenant A Society Sump',
      line1: 'Tower A Basement',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560066',
    });
    expect(addressA.ok).toBe(true);
    if (!addressA.ok) return;

    // Attacker from Tenant B attempts to read Tenant A address by ID
    const readAttempt = await service.getAddressById(externalAttacker, addressA.value.id);
    expect(readAttempt.ok).toBe(false);
    if (!readAttempt.ok) {
      expect(readAttempt.error.name).toBe('ForbiddenError');
    }
  });

  // ---------------------------------------------------------------------------
  // RT-02: Cross-Tenant Address Mutation
  // ---------------------------------------------------------------------------
  it('RT-02: Blocks cross-tenant address update and mutation attempts', async () => {
    const addressA = await service.createAddress(tenantARwaOwner, {
      organizationId: 'org-rwa-a',
      label: 'Main Gate',
      line1: 'Gate 1, Palm Meadows',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560066',
    });
    expect(addressA.ok).toBe(true);
    if (!addressA.ok) return;

    // Attacker attempts to mutate Tenant A address
    const updateAttempt = await service.updateAddress(externalAttacker, addressA.value.id, {
      line1: 'Malicious Injected Address',
      city: 'Attacker City',
    });
    expect(updateAttempt.ok).toBe(false);
    if (!updateAttempt.ok) {
      expect(updateAttempt.error.name).toBe('ForbiddenError');
    }
  });

  // ---------------------------------------------------------------------------
  // RT-03: Individual -> RWA Location Access
  // ---------------------------------------------------------------------------
  it('RT-03: Blocks individual buyer context from accessing or modifying RWA society addresses', async () => {
    const rwaAddr = await service.createAddress(tenantARwaOwner, {
      organizationId: 'org-rwa-a',
      label: 'RWA Clubhouse',
      line1: 'Clubhouse Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560066',
    });
    expect(rwaAddr.ok).toBe(true);
    if (!rwaAddr.ok) return;

    // Individual buyer tries to list or read RWA address
    const readAttempt = await service.getAddressById(individualBuyer, rwaAddr.value.id);
    expect(readAttempt.ok).toBe(false);
    if (!readAttempt.ok) {
      expect(readAttempt.error.name).toBe('ForbiddenError');
    }
  });

  // ---------------------------------------------------------------------------
  // RT-04: RWA -> MSME Location Access
  // ---------------------------------------------------------------------------
  it('RT-04: Blocks RWA committee context from accessing MSME factory and warehouse locations', async () => {
    const msmePlant = await service.createAddress(tenantBMsmeOwner, {
      organizationId: 'org-msme-b',
      label: 'Hosur Plant 1',
      locationType: 'FACTORY',
      line1: 'Plot 42, SIPCOT',
      city: 'Hosur',
      state: 'Tamil Nadu',
      stateCode: '33',
      pincode: '635126',
    });
    expect(msmePlant.ok).toBe(true);
    if (!msmePlant.ok) return;

    // RWA committee member attempts to read MSME address
    const readAttempt = await service.getAddressById(tenantARwaCommitteeMember, msmePlant.value.id);
    expect(readAttempt.ok).toBe(false);
    if (!readAttempt.ok) {
      expect(readAttempt.error.name).toBe('ForbiddenError');
    }
  });

  // ---------------------------------------------------------------------------
  // RT-05: Unauthorized Address Creation
  // ---------------------------------------------------------------------------
  it('RT-05: Blocks unauthorized roles (e.g. VIEWER) from creating organization addresses', async () => {
    const createAttempt = await service.createAddress(tenantARwaViewer, {
      organizationId: 'org-rwa-a',
      label: 'Unauthorized Gate',
      line1: 'Back Gate 4',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560066',
    });

    expect(createAttempt.ok).toBe(false);
    if (!createAttempt.ok) {
      expect(createAttempt.error.name).toBe('ForbiddenError');
    }
  });

  // ---------------------------------------------------------------------------
  // RT-06: Unauthorized Address Modification
  // ---------------------------------------------------------------------------
  it('RT-06: Blocks unauthorized roles (e.g. VIEWER) from modifying organization addresses', async () => {
    const addr = await service.createAddress(tenantARwaOwner, {
      organizationId: 'org-rwa-a',
      label: 'Main Office',
      line1: 'Office Block',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560066',
    });
    expect(addr.ok).toBe(true);
    if (!addr.ok) return;

    const updateAttempt = await service.updateAddress(tenantARwaViewer, addr.value.id, {
      label: 'Tampered Office Name',
    });
    expect(updateAttempt.ok).toBe(false);
    if (!updateAttempt.ok) {
      expect(updateAttempt.error.name).toBe('ForbiddenError');
    }
  });

  // ---------------------------------------------------------------------------
  // RT-07: Unauthorized Address Deletion/Deactivation
  // ---------------------------------------------------------------------------
  it('RT-07: Blocks non-management roles (e.g. COMMITTEE_MEMBER) from deleting organization addresses', async () => {
    const addr = await service.createAddress(tenantARwaOwner, {
      organizationId: 'org-rwa-a',
      label: 'STP Plant',
      line1: 'Plot 1, Eco Area',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560066',
    });
    expect(addr.ok).toBe(true);
    if (!addr.ok) return;

    const delAttempt = await service.deleteAddress(tenantARwaCommitteeMember, addr.value.id);
    expect(delAttempt.ok).toBe(false);
    if (!delAttempt.ok) {
      expect(delAttempt.error.name).toBe('ForbiddenError');
    }
  });

  // ---------------------------------------------------------------------------
  // RT-08: Expired Delegation Location Mutation
  // ---------------------------------------------------------------------------
  it('RT-08: Rejects address mutation by delegates whose delegation has expired in UTC timeline', async () => {
    const expiredDelegationId = 'del-expired-security-1';
    mem.organizationDelegations.set(expiredDelegationId, {
      id: expiredDelegationId,
      organizationId: 'org-msme-b',
      delegatorId: tenantBMsmeOwner.profileId,
      delegateeId: tenantBMsmeDelegate.profileId,
      permissions: ['MANAGE_LOCATIONS'],
      spendCapAmount: 50000,
      startsAt: '2025-01-01T00:00:00Z',
      expiresAt: '2025-06-01T00:00:00Z', // Past date
      isActive: true,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    });

    const createAttempt = await service.createAddress(tenantBMsmeDelegate, {
      organizationId: 'org-msme-b',
      label: 'Expired Delegate Site',
      line1: '123 Test St',
      city: 'Hosur',
      state: 'Tamil Nadu',
      pincode: '635126',
      delegationId: expiredDelegationId,
    });

    expect(createAttempt.ok).toBe(false);
    if (!createAttempt.ok) {
      expect(createAttempt.error.message).toContain('expired in UTC timeline');
    }
  });

  // ---------------------------------------------------------------------------
  // RT-09: Historical Snapshot Overwrite (Rule 1)
  // ---------------------------------------------------------------------------
  it('RT-09: Verifies editing an address book record NEVER mutates past RFQ/PO transaction snapshots', async () => {
    const liveAddr = await service.createAddress(tenantARwaOwner, {
      organizationId: 'org-rwa-a',
      label: 'Contract Site 2026',
      line1: 'Original Street 100',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560066',
    });
    expect(liveAddr.ok).toBe(true);
    if (!liveAddr.ok) return;

    // Capture frozen snapshot for RFQ/PO
    const snapshot = createAddressSnapshot(liveAddr.value, '2026-09-01T10:00:00Z');
    expect(snapshot.line1).toBe('Original Street 100');

    // Customer mutates live address book record
    const updateRes = await service.updateAddress(tenantARwaOwner, liveAddr.value.id, {
      line1: 'Altered Street 999',
      city: 'Mysuru',
      pincode: '570001',
    });
    expect(updateRes.ok).toBe(true);

    // Snapshot remains 100% frozen with original values
    expect(snapshot.line1).toBe('Original Street 100');
    expect(snapshot.city).toBe('Bengaluru');
    expect(snapshot.pincode).toBe('560066');
    expect(assertSnapshotDecoupled(snapshot, updateRes.value)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // RT-10: Snapshot Deletion Through Address Deletion (Rule 3)
  // ---------------------------------------------------------------------------
  it('RT-10: Verifies deactivating/deleting an address from address book leaves past snapshots intact', async () => {
    const liveAddr = await service.createAddress(tenantBMsmeOwner, {
      organizationId: 'org-msme-b',
      label: 'Old Warehouse Erode',
      line1: 'Perundurai Road',
      city: 'Erode',
      state: 'Tamil Nadu',
      pincode: '638052',
    });
    expect(liveAddr.ok).toBe(true);
    if (!liveAddr.ok) return;

    const poSnapshot = createDeliveryAddressSnapshot(liveAddr.value);
    expect(poSnapshot.line1).toBe('Perundurai Road');

    // Delete address from address book
    const delRes = await service.deleteAddress(tenantBMsmeOwner, liveAddr.value.id);
    expect(delRes.ok).toBe(true);

    // Snapshot is still valid and readable
    expect(poSnapshot.line1).toBe('Perundurai Road');
    expect(poSnapshot.city).toBe('Erode');
    expect(poSnapshot.pincode).toBe('638052');
  });

  // ---------------------------------------------------------------------------
  // RT-11: Snapshot Foreign-Key-Only Reconstruction Failure (Rule 2)
  // ---------------------------------------------------------------------------
  it('RT-11: Verifies snapshots are self-contained value objects that do not fail on null addressId', () => {
    // Snapshot generated from a one-off entered operational location (no saved addressId)
    const snapshot = createAddressSnapshot({
      addressId: null,
      label: 'One-off Exhibition Ground',
      line1: 'Hall 3, Palace Grounds',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560080',
    });

    expect(snapshot.addressId).toBeNull();
    expect(snapshot.line1).toBe('Hall 3, Palace Grounds');
    expect(snapshot.city).toBe('Bengaluru');
    expect(snapshot.pincode).toBe('560080');
    expect(snapshot.isFrozen).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // RT-12: Billing / Delivery Address Confusion
  // ---------------------------------------------------------------------------
  it('RT-12: Enforces separation between distinct Billing and Delivery/Service locations', () => {
    const billingSnapshot = createBillingAddressSnapshot({
      label: 'Headquarters Legal Entity',
      recipientName: 'Precision Tools Pvt Ltd',
      line1: '500 Anna Salai',
      city: 'Chennai',
      state: 'Tamil Nadu',
      stateCode: '33',
      pincode: '600002',
    });

    const deliverySnapshot = createDeliveryAddressSnapshot({
      label: 'Factory Delivery Bay',
      recipientName: 'Precision Tools Plant 2',
      line1: 'Plot 44 SIPCOT',
      city: 'Hosur',
      state: 'Tamil Nadu',
      stateCode: '33',
      pincode: '635126',
    });

    expect(billingSnapshot.addressType).toBe('BILLING');
    expect(deliverySnapshot.addressType).toBe('DELIVERY');
    expect(billingSnapshot.city).toBe('Chennai');
    expect(deliverySnapshot.city).toBe('Hosur');
    expect(billingSnapshot.line1).not.toBe(deliverySnapshot.line1);
  });

  // ---------------------------------------------------------------------------
  // RT-13: PIN Code Tampering & Injection
  // ---------------------------------------------------------------------------
  it('RT-13: Rejects invalid 6-digit PIN codes, non-numeric strings, and SQL injection attempts', () => {
    expect(isPincodeValid('560066')).toBe(true);
    expect(isPincodeValid('012345')).toBe(false); // Leading zero
    expect(isPincodeValid("560066' OR '1'='1")).toBe(false); // SQLi
    expect(isPincodeValid('<script>alert(1)</script>')).toBe(false); // XSS
    expect(isPincodeValid('56006')).toBe(false); // 5 digits
    expect(isPincodeValid('5600666')).toBe(false); // 7 digits
    expect(isPincodeValid(null)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // RT-14: Unauthorized Geographic Data Injection
  // ---------------------------------------------------------------------------
  it('RT-14: Sanitizes invalid and out-of-bounds geographic coordinates', () => {
    expect(isCoordinatesValid(12.9716, 77.5946)).toBe(true);
    expect(isCoordinatesValid(100.0, 77.5946)).toBe(false); // Lat out of [-90, 90]
    expect(isCoordinatesValid(12.9716, 200.0)).toBe(false); // Lng out of [-180, 180]
  });

  // ---------------------------------------------------------------------------
  // RT-15: Supplier Discovery Location Leakage
  // ---------------------------------------------------------------------------
  it('RT-15: Masks buyer exact street, door number, and phone PII during pre-award supplier discovery', () => {
    const fullLocation: OperationalLocation = {
      operationalType: 'DELIVERY',
      label: 'Confidential Production Site',
      recipientName: 'High Security Aerospace R&D',
      line1: 'Building 9, Secret Compound, Door 101',
      locality: 'Peenya Industrial Area',
      city: 'Bengaluru',
      district: 'Bengaluru Urban',
      state: 'Karnataka',
      pincode: '560058',
      country: 'India',
      contactPerson: 'Confidential Officer',
      contactPhone: '+919999900000',
    };

    const masked = maskAddressForDiscovery(fullLocation, 25);
    expect(masked.city).toBe('Bengaluru');
    expect(masked.district).toBe('Bengaluru Urban');
    expect(masked.state).toBe('Karnataka');
    expect(masked.pincode).toBe('560058');
    expect(masked.generalArea).toBe('Peenya Industrial Area');
    expect(masked.serviceRadiusKm).toBe(25);

    // Exact PII fields must NEVER appear on masked discovery object
    expect((masked as any).line1).toBeUndefined();
    expect((masked as any).contactPerson).toBeUndefined();
    expect((masked as any).contactPhone).toBeUndefined();
    expect((masked as any).recipientName).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // RT-16: Transaction Snapshot PII Leakage Protection
  // ---------------------------------------------------------------------------
  it('RT-16: Verifies SNE geographic descriptor excludes sensitive contact and door numbers', () => {
    const address: BuyerAddress = {
      id: 'addr-pii-test',
      label: 'Personal Residence',
      line1: 'Flat 101, Secret Residency',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
      country: 'India',
      contactPerson: 'Private Citizen',
      contactPhone: '+919123456789',
      isPrimary: true,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    };

    const sneGeo = buildOperationalDiscoveryGeographicInput(address);
    expect(sneGeo.city).toBe('Bengaluru');
    expect(sneGeo.pinCode).toBe('560001');
    expect(sneGeo.state).toBe('Karnataka');

    // Verify zero contact PII in SNE descriptor
    expect((sneGeo as any).contactPerson).toBeUndefined();
    expect((sneGeo as any).contactPhone).toBeUndefined();
    expect((sneGeo as any).line1).toBeUndefined();
  });
});
