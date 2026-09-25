import {
  type BuyerAddress,
  type AddressSnapshot,
  type DeliveryAddressSnapshot,
  type BillingAddressSnapshot,
  type OperationalLocation,
  type OperationalActivityType,
  type LocationType,
  type AddressClassification,
  type BuyerPersona,
  createAddressSnapshot,
  createDeliveryAddressSnapshot,
  createBillingAddressSnapshot,
  createOperationalLocation as domainCreateOperationalLocation,
  isAddressValid,
  isPincodeValid,
  isCoordinatesValid,
  buildOperationalDiscoveryGeographicInput,
  maskAddressForDiscovery,
  resolveProcurementPlaceOfSupply,
  getAllowedLocationTypes,
  getDefaultLocationType,
  isLocationTypeAllowedForPersona,
  type MaskedDiscoveryLocation,
} from '@otp/domain';
import type { AuditService } from '../interfaces/audit-service';
import type { Repositories, BuyerAddressRepository } from '../repositories/interfaces';
import type { BuyerAddressEntity } from '../repositories/entities';
import type { ActorContext } from '../types/actor-context';
import { ForbiddenError, NotFoundError, ValidationError } from '../types/errors';
import { err, ok, type Result } from '../types/result';
import { auditLog, requireOrgAccess } from './service-helpers';
import { createId, timestamp } from '../repositories/in-memory';

export interface CreateBuyerAddressInput {
  organizationId?: string;
  persona?: BuyerPersona;
  label: string;
  locationType?: LocationType;
  recipientName?: string;
  line1: string;
  line2?: string;
  locality?: string;
  landmark?: string;
  city: string;
  district?: string;
  state: string;
  stateCode?: string;
  pincode: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  contactPerson?: string;
  contactPhone?: string;
  isPrimary?: boolean;
  addressType?: AddressClassification;
  delegationId?: string;
}

export interface UpdateBuyerAddressInput {
  label?: string;
  locationType?: LocationType;
  recipientName?: string;
  line1?: string;
  line2?: string;
  locality?: string;
  landmark?: string;
  city?: string;
  district?: string;
  state?: string;
  stateCode?: string;
  pincode?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  contactPerson?: string;
  contactPhone?: string;
  isPrimary?: boolean;
  addressType?: AddressClassification;
  isActive?: boolean;
  delegationId?: string;
}

export interface OperationalLocationInput {
  organizationId?: string;
  operationalType?: OperationalActivityType;
  sourceAddressId?: string;
  label?: string;
  locationType?: LocationType;
  recipientName?: string;
  line1?: string;
  line2?: string;
  locality?: string;
  landmark?: string;
  city?: string;
  district?: string;
  state?: string;
  stateCode?: string;
  pincode?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  contactPerson?: string;
  contactPhone?: string;
  specialAccessInstructions?: string;
  serviceAreaRadiusKm?: number;
}

export interface SourcingGeographicContext {
  discoveryLocation: ReturnType<typeof buildOperationalDiscoveryGeographicInput>;
  maskedLocation: MaskedDiscoveryLocation;
  operationalLocation: OperationalLocation;
}

export interface ResolveSnapshotsParams {
  deliveryAddressId?: string;
  billingAddressId?: string;
  deliveryLocationInput?: OperationalLocationInput;
  billingLocationInput?: OperationalLocationInput;
}

export class BuyerAddressService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditService,
  ) {}

  private checkRepo(): BuyerAddressRepository {
    if (!this.repos.buyerAddresses) {
      throw new Error('BuyerAddress repository not configured');
    }
    return this.repos.buyerAddresses;
  }

  /**
   * Validates delegation active status and UTC expiry if delegationId is provided.
   */
  private async validateDelegation(
    actor: ActorContext,
    organizationId: string,
    delegationId?: string,
  ): Promise<Result<boolean, Error>> {
    if (!delegationId) return ok(true);
    if (!this.repos.organizationDelegations) return ok(true);

    const delegation = await this.repos.organizationDelegations.findById(delegationId);
    if (!delegation) {
      return err(new ForbiddenError('Invalid spend delegation proxy provided'));
    }
    if (delegation.organizationId !== organizationId) {
      return err(new ForbiddenError('Delegation does not belong to specified organization'));
    }
    if (delegation.delegateeId !== actor.profileId && !actor.isPlatformAdmin) {
      return err(new ForbiddenError('Delegation proxy not assigned to active actor'));
    }
    if (!delegation.isActive) {
      return err(new ForbiddenError('Delegation proxy is inactive'));
    }

    const now = new Date().toISOString();
    if (delegation.expiresAt && delegation.expiresAt < now) {
      return err(new ForbiddenError('Delegation proxy has expired in UTC timeline'));
    }

    return ok(true);
  }

  /**
   * Creates a new reusable address book entry.
   */
  async createAddress(
    actor: ActorContext,
    input: CreateBuyerAddressInput,
  ): Promise<Result<BuyerAddressEntity, Error>> {
    const repo = this.checkRepo();

    // 1. Context Authorization & Isolation
    if (input.organizationId) {
      const access = requireOrgAccess(actor, input.organizationId, [
        'OWNER',
        'MANAGER',
        'APPROVER',
        'BUYER',
      ]);
      if (!access.ok) return access;

      // Verify delegation if delegate role
      if (actor.orgRole === 'BUYER' || actor.orgRole === 'APPROVER' || input.delegationId) {
        const delCheck = await this.validateDelegation(actor, input.organizationId, input.delegationId);
        if (!delCheck.ok) return delCheck;
      }
    } else {
      // Individual context: actor can only create addresses for their own profile
      if (!actor.profileId) {
        return err(new ForbiddenError('Authentication and profile required for individual address'));
      }
    }

    // 2. Persona-specific location type validation
    const persona: BuyerPersona = input.organizationId
      ? input.persona || (actor.orgRole === 'COMMITTEE_MEMBER' ? 'RWA' : 'MSME')
      : 'INDIVIDUAL';

    const locationType =
      input.locationType || getDefaultLocationType(persona);

    if (input.locationType && !isLocationTypeAllowedForPersona(input.locationType, persona)) {
      return err(
        new ValidationError(
          `Location type '${input.locationType}' is not permitted for ${persona} persona. Allowed: ${getAllowedLocationTypes(persona).join(', ')}`,
        ),
      );
    }

    // 3. Address field & PIN code validation
    const testAddress: Partial<BuyerAddress> = {
      line1: input.line1,
      city: input.city,
      state: input.state,
      pincode: input.pincode,
      latitude: input.latitude,
      longitude: input.longitude,
    };
    const valResult = isAddressValid(testAddress);
    if (!valResult.valid) {
      return err(new ValidationError(valResult.errors.join(' ')));
    }

    const now = timestamp();
    const addressId = createId();

    const entity: BuyerAddressEntity = {
      id: addressId,
      profileId: input.organizationId ? undefined : actor.profileId,
      organizationId: input.organizationId,
      label: input.label.trim() || (persona === 'RWA' ? 'Society Premises' : persona === 'MSME' ? 'Site / Unit' : 'Home Delivery'),
      locationType,
      recipientName: input.recipientName?.trim() || undefined,
      line1: input.line1.trim(),
      line2: input.line2?.trim() || undefined,
      locality: input.locality?.trim() || undefined,
      landmark: input.landmark?.trim() || undefined,
      city: input.city.trim(),
      district: input.district?.trim() || undefined,
      state: input.state.trim(),
      stateCode: input.stateCode?.trim() || undefined,
      pincode: input.pincode.trim(),
      country: input.country?.trim() || 'India',
      latitude: input.latitude,
      longitude: input.longitude,
      contactPerson: input.contactPerson?.trim() || undefined,
      contactPhone: input.contactPhone?.trim() || undefined,
      isPrimary: Boolean(input.isPrimary),
      addressType: input.addressType || 'DELIVERY',
      isActive: true,
      gstinStateCode: input.stateCode?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await repo.save(entity);

    await auditLog(
      this.audit,
      actor,
      'buyer_address',
      saved.id,
      'buyer_address.created',
      null,
      {
        label: saved.label,
        locationType: saved.locationType,
        isPrimary: saved.isPrimary,
        organizationId: saved.organizationId,
        pincode: saved.pincode,
      },
    );

    return ok(saved);
  }

  /**
   * Updates an existing address book entry with strict permission checking.
   */
  async updateAddress(
    actor: ActorContext,
    addressId: string,
    input: UpdateBuyerAddressInput,
  ): Promise<Result<BuyerAddressEntity, Error>> {
    const repo = this.checkRepo();
    const existing = await repo.findById(addressId);
    if (!existing || !existing.isActive) {
      return err(new NotFoundError('Buyer address not found'));
    }

    // 1. Authorization checks
    if (existing.organizationId) {
      const access = requireOrgAccess(actor, existing.organizationId, [
        'OWNER',
        'MANAGER',
        'APPROVER',
        'BUYER',
      ]);
      if (!access.ok) return access;

      if (actor.orgRole === 'BUYER' || actor.orgRole === 'APPROVER' || input.delegationId) {
        const delCheck = await this.validateDelegation(actor, existing.organizationId, input.delegationId);
        if (!delCheck.ok) return delCheck;
      }
    } else if (existing.profileId !== actor.profileId && !actor.isPlatformAdmin) {
      return err(new ForbiddenError('Cannot edit address belonging to another profile / tenant'));
    }

    // 2. Build updated entity
    const updated: BuyerAddressEntity = {
      ...existing,
      label: input.label !== undefined ? input.label.trim() : existing.label,
      locationType: input.locationType !== undefined ? input.locationType : existing.locationType,
      recipientName: input.recipientName !== undefined ? input.recipientName.trim() : existing.recipientName,
      line1: input.line1 !== undefined ? input.line1.trim() : existing.line1,
      line2: input.line2 !== undefined ? input.line2.trim() : existing.line2,
      locality: input.locality !== undefined ? input.locality.trim() : existing.locality,
      landmark: input.landmark !== undefined ? input.landmark.trim() : existing.landmark,
      city: input.city !== undefined ? input.city.trim() : existing.city,
      district: input.district !== undefined ? input.district.trim() : existing.district,
      state: input.state !== undefined ? input.state.trim() : existing.state,
      stateCode: input.stateCode !== undefined ? input.stateCode.trim() : existing.stateCode,
      pincode: input.pincode !== undefined ? input.pincode.trim() : existing.pincode,
      country: input.country !== undefined ? input.country.trim() : existing.country,
      latitude: input.latitude !== undefined ? input.latitude : existing.latitude,
      longitude: input.longitude !== undefined ? input.longitude : existing.longitude,
      contactPerson: input.contactPerson !== undefined ? input.contactPerson.trim() : existing.contactPerson,
      contactPhone: input.contactPhone !== undefined ? input.contactPhone.trim() : existing.contactPhone,
      isPrimary: input.isPrimary !== undefined ? Boolean(input.isPrimary) : existing.isPrimary,
      addressType: input.addressType !== undefined ? input.addressType : existing.addressType,
      isActive: input.isActive !== undefined ? Boolean(input.isActive) : existing.isActive,
      gstinStateCode: input.stateCode !== undefined ? input.stateCode.trim() : existing.gstinStateCode,
      updatedAt: timestamp(),
    };

    // 3. Validation
    const valResult = isAddressValid(updated as unknown as Partial<BuyerAddress>);
    if (!valResult.valid) {
      return err(new ValidationError(valResult.errors.join(' ')));
    }

    const saved = await repo.save(updated);

    await auditLog(
      this.audit,
      actor,
      'buyer_address',
      saved.id,
      'buyer_address.updated',
      { label: existing.label, isPrimary: existing.isPrimary },
      { label: saved.label, isPrimary: saved.isPrimary },
    );

    return ok(saved);
  }

  /**
   * Sets an address as the primary default address for its context.
   */
  async setPrimary(
    actor: ActorContext,
    addressId: string,
  ): Promise<Result<BuyerAddressEntity, Error>> {
    return this.updateAddress(actor, addressId, { isPrimary: true });
  }

  /**
   * Soft-deletes / deactivates an address, ensuring historical snapshots remain 100% intact.
   */
  async deleteAddress(
    actor: ActorContext,
    addressId: string,
  ): Promise<Result<boolean, Error>> {
    const repo = this.checkRepo();
    const existing = await repo.findById(addressId);
    if (!existing || !existing.isActive) {
      return err(new NotFoundError('Buyer address not found'));
    }

    if (existing.organizationId) {
      const access = requireOrgAccess(actor, existing.organizationId, [
        'OWNER',
        'MANAGER',
      ]);
      if (!access.ok) return access;
    } else if (existing.profileId !== actor.profileId && !actor.isPlatformAdmin) {
      return err(new ForbiddenError('Cannot delete address belonging to another profile'));
    }

    await repo.delete(addressId);

    await auditLog(
      this.audit,
      actor,
      'buyer_address',
      addressId,
      'buyer_address.deleted',
      { label: existing.label },
      null,
    );

    return ok(true);
  }

  /**
   * Lists addresses for an authorized actor/organization.
   */
  async listAddresses(
    actor: ActorContext,
    organizationId?: string,
  ): Promise<Result<BuyerAddressEntity[], Error>> {
    const repo = this.checkRepo();
    if (organizationId) {
      const access = requireOrgAccess(actor, organizationId, [
        'OWNER',
        'MANAGER',
        'APPROVER',
        'BUYER',
        'COMMITTEE_MEMBER',
      ]);
      if (!access.ok) return access;
      const list = await repo.findByOrganizationId(organizationId);
      return ok(list.filter((a) => a.isActive));
    }

    const list = await repo.findByProfileId(actor.profileId);
    return ok(list.filter((a) => a.isActive));
  }

  /**
   * Retrieves primary default address for context.
   */
  async getPrimaryAddress(
    actor: ActorContext,
    organizationId?: string,
  ): Promise<Result<BuyerAddressEntity | null, Error>> {
    const repo = this.checkRepo();
    if (organizationId) {
      const access = requireOrgAccess(actor, organizationId, [
        'OWNER',
        'MANAGER',
        'APPROVER',
        'BUYER',
        'COMMITTEE_MEMBER',
      ]);
      if (!access.ok) return access;
      const primary = await repo.findPrimary(undefined, organizationId);
      return ok(primary && primary.isActive ? primary : null);
    }

    const primary = await repo.findPrimary(actor.profileId);
    return ok(primary && primary.isActive ? primary : null);
  }

  /**
   * Retrieves an address by ID with tenant isolation verification.
   */
  async getAddressById(
    actor: ActorContext,
    addressId: string,
  ): Promise<Result<BuyerAddressEntity, Error>> {
    const repo = this.checkRepo();
    const address = await repo.findById(addressId);
    if (!address || !address.isActive) {
      return err(new NotFoundError('Address not found'));
    }

    if (address.organizationId) {
      const access = requireOrgAccess(actor, address.organizationId, [
        'OWNER',
        'MANAGER',
        'APPROVER',
        'BUYER',
        'COMMITTEE_MEMBER',
      ]);
      if (!access.ok) return access;
    } else if (address.profileId !== actor.profileId && !actor.isPlatformAdmin) {
      return err(new ForbiddenError('Cannot access address belonging to another profile'));
    }

    return ok(address);
  }

  /**
   * Creates an immutable frozen snapshot from a saved address ID.
   */
  async createSnapshot(addressId: string): Promise<Result<AddressSnapshot, Error>> {
    const repo = this.checkRepo();
    const existing = await repo.findById(addressId);
    if (!existing) {
      return err(new NotFoundError('Address not found'));
    }

    const domainAddress: BuyerAddress = {
      id: existing.id,
      profileId: existing.profileId,
      organizationId: existing.organizationId,
      label: existing.label,
      locationType: existing.locationType as LocationType,
      recipientName: existing.recipientName,
      line1: existing.line1,
      line2: existing.line2,
      locality: existing.locality,
      landmark: existing.landmark,
      city: existing.city,
      district: existing.district,
      state: existing.state,
      stateCode: existing.stateCode,
      pincode: existing.pincode,
      country: existing.country,
      latitude: existing.latitude,
      longitude: existing.longitude,
      contactPerson: existing.contactPerson,
      contactPhone: existing.contactPhone,
      isPrimary: existing.isPrimary,
      addressType: existing.addressType,
      isActive: existing.isActive,
      gstinStateCode: existing.gstinStateCode,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    };

    const snapshot = createAddressSnapshot(domainAddress);
    return ok(snapshot);
  }

  /**
   * Resolves or creates an OperationalLocation and generates SNE discovery parameters.
   */
  async buildSourcingGeographicContext(
    actor: ActorContext,
    input: OperationalLocationInput,
  ): Promise<Result<SourcingGeographicContext, Error>> {
    let baseLocation: Partial<BuyerAddress> | Partial<OperationalLocation> = input;

    if (input.sourceAddressId) {
      const addrRes = await this.getAddressById(actor, input.sourceAddressId);
      if (!addrRes.ok) return addrRes;
      baseLocation = {
        ...addrRes.value,
        ...input,
        line1: input.line1 || addrRes.value.line1,
        city: input.city || addrRes.value.city,
        state: input.state || addrRes.value.state,
        pincode: input.pincode || addrRes.value.pincode,
      };
    }

    const val = isAddressValid(baseLocation as any);
    if (!val.valid) {
      return err(new ValidationError(val.errors.join(' ')));
    }

    const operationalLocation = domainCreateOperationalLocation(
      baseLocation,
      input.operationalType || 'DELIVERY',
      input.specialAccessInstructions,
    );

    const discoveryLocation = buildOperationalDiscoveryGeographicInput(operationalLocation);
    const maskedLocation = maskAddressForDiscovery(operationalLocation, input.serviceAreaRadiusKm || 25);

    return ok({
      discoveryLocation,
      maskedLocation,
      operationalLocation,
    });
  }

  /**
   * Resolves distinct Delivery and Billing Snapshots for transaction contracts (RFQ/PO).
   */
  async resolveOperationalAndBillingSnapshots(
    actor: ActorContext,
    params: ResolveSnapshotsParams,
  ): Promise<Result<{ deliverySnapshot: DeliveryAddressSnapshot; billingSnapshot: BillingAddressSnapshot }, Error>> {
    let deliverySnapshot: DeliveryAddressSnapshot;
    let billingSnapshot: BillingAddressSnapshot;

    // Resolve Delivery Snapshot
    if (params.deliveryAddressId) {
      const delAddr = await this.getAddressById(actor, params.deliveryAddressId);
      if (!delAddr.ok) return delAddr;
      deliverySnapshot = createDeliveryAddressSnapshot(delAddr.value);
    } else if (params.deliveryLocationInput) {
      const val = isAddressValid(params.deliveryLocationInput as any);
      if (!val.valid) return err(new ValidationError(`Delivery address: ${val.errors.join(' ')}`));
      deliverySnapshot = createDeliveryAddressSnapshot(params.deliveryLocationInput);
    } else {
      // Auto-inherit primary address
      const primary = await this.getPrimaryAddress(actor, actor.organizationId || undefined);
      if (!primary.ok) return primary;
      if (!primary.value) {
        return err(new ValidationError('No delivery address provided and no primary address found'));
      }
      deliverySnapshot = createDeliveryAddressSnapshot(primary.value);
    }

    // Resolve Billing Snapshot
    if (params.billingAddressId) {
      const billAddr = await this.getAddressById(actor, params.billingAddressId);
      if (!billAddr.ok) return billAddr;
      billingSnapshot = createBillingAddressSnapshot(billAddr.value);
    } else if (params.billingLocationInput) {
      const val = isAddressValid(params.billingLocationInput as any);
      if (!val.valid) return err(new ValidationError(`Billing address: ${val.errors.join(' ')}`));
      billingSnapshot = createBillingAddressSnapshot(params.billingLocationInput);
    } else {
      // Fallback billing to delivery snapshot if not explicitly separated
      billingSnapshot = createBillingAddressSnapshot(deliverySnapshot);
    }

    return ok({
      deliverySnapshot,
      billingSnapshot,
    });
  }
}
