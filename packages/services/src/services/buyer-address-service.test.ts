import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryRepositories } from '../repositories/in-memory';
import { InMemoryAuditService } from '../audit/in-memory-audit-service';
import { AuditAppService } from './audit-service';
import { BuyerAddressService } from './buyer-address-service';
import type { ActorContext } from '../types/actor-context';

describe('BuyerAddressService — Address Book, Operational Locations & Transaction Snapshots', () => {
  let mem: InMemoryRepositories;
  let audit: AuditAppService;
  let service: BuyerAddressService;

  const individualActor: ActorContext = {
    profileId: 'indiv-user-1',
    isPlatformAdmin: false,
  };

  const rwaOwnerActor: ActorContext = {
    profileId: 'rwa-owner-1',
    organizationId: 'org-rwa-100',
    orgRole: 'OWNER',
    isPlatformAdmin: false,
  };

  const rwaManagerActor: ActorContext = {
    profileId: 'rwa-mgr-1',
    organizationId: 'org-rwa-100',
    orgRole: 'MANAGER',
    isPlatformAdmin: false,
  };

  const rwaResidentActor: ActorContext = {
    profileId: 'rwa-resident-1',
    organizationId: 'org-rwa-100',
    orgRole: 'COMMITTEE_MEMBER',
    isPlatformAdmin: false,
  };

  const msmeOwnerActor: ActorContext = {
    profileId: 'msme-owner-1',
    organizationId: 'org-msme-200',
    orgRole: 'OWNER',
    isPlatformAdmin: false,
  };

  const msmeDelegateActor: ActorContext = {
    profileId: 'msme-delegate-1',
    organizationId: 'org-msme-200',
    orgRole: 'BUYER',
    isPlatformAdmin: false,
  };

  const otherTenantActor: ActorContext = {
    profileId: 'other-user-999',
    organizationId: 'org-other-999',
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

  describe('1. Individual Buyer Address Book', () => {
    it('creates personal address with auto-primary flag', async () => {
      const res = await service.createAddress(individualActor, {
        label: 'My Home',
        locationType: 'HOME',
        line1: 'Flat 302, Palm Heights',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560100',
        isPrimary: true,
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.profileId).toBe(individualActor.profileId);
      expect(res.value.organizationId).toBeUndefined();
      expect(res.value.isPrimary).toBe(true);
      expect(res.value.locationType).toBe('HOME');
    });

    it('enforces single primary address per profile', async () => {
      const addr1 = await service.createAddress(individualActor, {
        label: 'Home 1',
        line1: '100 Main St',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560100',
        isPrimary: true,
      });
      expect(addr1.ok).toBe(true);

      const addr2 = await service.createAddress(individualActor, {
        label: 'Home 2',
        line1: '200 Second St',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560100',
        isPrimary: true,
      });
      expect(addr2.ok).toBe(true);

      const primary = await service.getPrimaryAddress(individualActor);
      expect(primary.ok).toBe(true);
      if (!primary.ok) return;
      expect(primary.value?.label).toBe('Home 2');
    });
  });

  describe('2. RWA Governance & Location Authority', () => {
    it('allows RWA Owner to create society premises address', async () => {
      const res = await service.createAddress(rwaOwnerActor, {
        organizationId: 'org-rwa-100',
        persona: 'RWA',
        label: 'Clubhouse & Main Sump',
        locationType: 'SOCIETY_PREMISES',
        line1: 'Gate 1, Palm Meadows RWA',
        locality: 'Whitefield',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560066',
        isPrimary: true,
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.organizationId).toBe('org-rwa-100');
      expect(res.value.locationType).toBe('SOCIETY_PREMISES');
    });

    it('blocks resident/committee member from mutating society addresses', async () => {
      const addr = await service.createAddress(rwaOwnerActor, {
        organizationId: 'org-rwa-100',
        label: 'Gate 1',
        line1: 'Gate 1, Palm Meadows RWA',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560066',
      });
      if (!addr.ok) throw addr.error;

      // Committee member attempts deletion -> BLOCKED
      const delRes = await service.deleteAddress(rwaResidentActor, addr.value.id);
      expect(delRes.ok).toBe(false);
      if (!delRes.ok) {
        expect(delRes.error.name).toBe('ForbiddenError');
      }
    });
  });

  describe('3. MSME Multi-Location & Spend Delegation', () => {
    it('allows MSME Owner to create multiple industrial locations (Factory, Warehouse, Registered Office)', async () => {
      const factory = await service.createAddress(msmeOwnerActor, {
        organizationId: 'org-msme-200',
        persona: 'MSME',
        label: 'Hosur Plant 1',
        locationType: 'FACTORY',
        line1: 'Plot 42, SIPCOT Industrial Complex',
        city: 'Hosur',
        district: 'Krishnagiri',
        state: 'Tamil Nadu',
        stateCode: '33',
        pincode: '635126',
        isPrimary: true,
      });
      expect(factory.ok).toBe(true);

      const warehouse = await service.createAddress(msmeOwnerActor, {
        organizationId: 'org-msme-200',
        persona: 'MSME',
        label: 'Erode Central Warehouse',
        locationType: 'WAREHOUSE',
        line1: 'SF 120, Perundurai Road',
        city: 'Erode',
        district: 'Erode',
        state: 'Tamil Nadu',
        stateCode: '33',
        pincode: '638052',
        isPrimary: false,
      });
      expect(warehouse.ok).toBe(true);

      const list = await service.listAddresses(msmeOwnerActor, 'org-msme-200');
      expect(list.ok).toBe(true);
      if (!list.ok) return;
      expect(list.value).toHaveLength(2);
    });

    it('blocks expired delegation from mutating MSME addresses', async () => {
      // Seed an expired delegation
      const expiredDelegationId = 'del-expired-1';
      mem.organizationDelegations.set(expiredDelegationId, {
        id: expiredDelegationId,
        organizationId: 'org-msme-200',
        delegatorId: msmeOwnerActor.profileId,
        delegateeId: msmeDelegateActor.profileId,
        permissions: ['MANAGE_LOCATIONS'],
        spendCapAmount: 100000,
        startsAt: '2026-01-01T00:00:00Z',
        expiresAt: '2026-06-01T00:00:00Z', // Expired
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });

      const res = await service.createAddress(msmeDelegateActor, {
        organizationId: 'org-msme-200',
        label: 'Unauthorized Site',
        line1: '100 Street',
        city: 'Hosur',
        state: 'Tamil Nadu',
        pincode: '635126',
        delegationId: expiredDelegationId,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.message).toContain('expired in UTC timeline');
      }
    });
  });

  describe('4. Cross-Tenant Isolation & Multi-Context Security', () => {
    it('blocks tenant B from reading tenant A addresses', async () => {
      const addrA = await service.createAddress(rwaOwnerActor, {
        organizationId: 'org-rwa-100',
        label: 'Secret Site A',
        line1: 'Site A Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560066',
      });
      if (!addrA.ok) throw addrA.error;

      const readRes = await service.getAddressById(otherTenantActor, addrA.value.id);
      expect(readRes.ok).toBe(false);
      if (!readRes.ok) {
        expect(readRes.error.name).toBe('ForbiddenError');
      }
    });
  });

  describe('5. SNE Discovery Context & Snapshot Separation', () => {
    it('builds sourcing geographic context and masks PII for candidate discovery', async () => {
      const addr = await service.createAddress(rwaOwnerActor, {
        organizationId: 'org-rwa-100',
        label: 'Rooftop Solar Plant',
        line1: 'Palm Meadows Tower C Roof, Door 402',
        locality: 'Whitefield',
        landmark: 'Opposite Shell Petrol Pump',
        city: 'Bengaluru',
        district: 'Bengaluru Urban',
        state: 'Karnataka',
        pincode: '560066',
        latitude: 12.9698,
        longitude: 77.7499,
        contactPerson: 'Arun Kumar',
        contactPhone: '+919999988888',
      });
      if (!addr.ok) throw addr.error;

      const geoContextRes = await service.buildSourcingGeographicContext(rwaOwnerActor, {
        sourceAddressId: addr.value.id,
        operationalType: 'INSTALLATION',
        specialAccessInstructions: 'Crane access via Gate 3 only',
      });

      expect(geoContextRes.ok).toBe(true);
      if (!geoContextRes.ok) return;

      const { discoveryLocation, maskedLocation, operationalLocation } = geoContextRes.value;

      expect(discoveryLocation.city).toBe('Bengaluru');
      expect(discoveryLocation.pinCode).toBe('560066');
      expect(discoveryLocation.coordinates).toEqual({ lat: 12.9698, lng: 77.7499 });

      expect(maskedLocation.city).toBe('Bengaluru');
      expect(maskedLocation.district).toBe('Bengaluru Urban');
      expect(maskedLocation.generalArea).toBe('Whitefield');
      expect((maskedLocation as any).line1).toBeUndefined();
      expect((maskedLocation as any).contactPhone).toBeUndefined();

      expect(operationalLocation.operationalType).toBe('INSTALLATION');
      expect(operationalLocation.specialAccessInstructions).toBe('Crane access via Gate 3 only');
    });

    it('resolves distinct delivery and billing snapshots for transaction contracts', async () => {
      const delAddr = await service.createAddress(msmeOwnerActor, {
        organizationId: 'org-msme-200',
        label: 'Hosur Plant',
        addressType: 'DELIVERY',
        line1: 'Plot 42 SIPCOT',
        city: 'Hosur',
        state: 'Tamil Nadu',
        stateCode: '33',
        pincode: '635126',
      });
      if (!delAddr.ok) throw delAddr.error;

      const billAddr = await service.createAddress(msmeOwnerActor, {
        organizationId: 'org-msme-200',
        label: 'Chennai Corporate Office',
        addressType: 'BILLING',
        line1: '100 Mount Road',
        city: 'Chennai',
        state: 'Tamil Nadu',
        stateCode: '33',
        pincode: '600002',
      });
      if (!billAddr.ok) throw billAddr.error;

      const snapshots = await service.resolveOperationalAndBillingSnapshots(msmeOwnerActor, {
        deliveryAddressId: delAddr.value.id,
        billingAddressId: billAddr.value.id,
      });

      expect(snapshots.ok).toBe(true);
      if (!snapshots.ok) return;

      expect(snapshots.value.deliverySnapshot.line1).toBe('Plot 42 SIPCOT');
      expect(snapshots.value.deliverySnapshot.city).toBe('Hosur');
      expect(snapshots.value.billingSnapshot.line1).toBe('100 Mount Road');
      expect(snapshots.value.billingSnapshot.city).toBe('Chennai');
    });
  });
});
