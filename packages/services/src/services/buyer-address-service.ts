import {
  type BuyerAddress,
  type AddressSnapshot,
  createAddressSnapshot,
  isAddressValid,
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
  label: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  stateCode?: string;
  pincode: string;
  country?: string;
  contactPerson?: string;
  contactPhone?: string;
  isPrimary?: boolean;
  addressType?: 'DELIVERY' | 'BILLING' | 'BOTH' | 'REGISTERED' | 'SITE';
}

export interface UpdateBuyerAddressInput {
  label?: string;
  line1?: string;
  line2?: string;
  landmark?: string;
  city?: string;
  state?: string;
  stateCode?: string;
  pincode?: string;
  country?: string;
  contactPerson?: string;
  contactPhone?: string;
  isPrimary?: boolean;
  addressType?: 'DELIVERY' | 'BILLING' | 'BOTH' | 'REGISTERED' | 'SITE';
  isActive?: boolean;
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

  async createAddress(
    actor: ActorContext,
    input: CreateBuyerAddressInput,
  ): Promise<Result<BuyerAddressEntity, Error>> {
    const repo = this.checkRepo();

    if (input.organizationId) {
      const access = requireOrgAccess(actor, input.organizationId, [
        'OWNER',
        'MANAGER',
        'APPROVER',
        'BUYER',
      ]);
      if (!access.ok) return access;
    }

    const testAddress: Partial<BuyerAddress> = {
      line1: input.line1,
      city: input.city,
      state: input.state,
      pincode: input.pincode,
    };
    if (!isAddressValid(testAddress).valid) {
      return err(
        new ValidationError(
          'Address line1, city, state, and a valid 6-digit Indian PIN code are required',
        ),
      );
    }

    const now = timestamp();
    const addressId = createId();

    const entity: BuyerAddressEntity = {
      id: addressId,
      profileId: actor.profileId,
      organizationId: input.organizationId,
      label: input.label.trim() || 'Address',
      line1: input.line1.trim(),
      line2: input.line2?.trim() || undefined,
      landmark: input.landmark?.trim() || undefined,
      city: input.city.trim(),
      state: input.state.trim(),
      stateCode: input.stateCode?.trim() || undefined,
      pincode: input.pincode.trim(),
      country: input.country?.trim() || 'India',
      contactPerson: input.contactPerson?.trim() || undefined,
      contactPhone: input.contactPhone?.trim() || undefined,
      isPrimary: Boolean(input.isPrimary),
      addressType: input.addressType || 'DELIVERY',
      isActive: true,
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
        isPrimary: saved.isPrimary,
        organizationId: saved.organizationId,
      },
    );

    return ok(saved);
  }

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

    if (existing.organizationId) {
      const access = requireOrgAccess(actor, existing.organizationId, [
        'OWNER',
        'MANAGER',
        'APPROVER',
        'BUYER',
      ]);
      if (!access.ok) return access;
    } else if (existing.profileId !== actor.profileId && !actor.isPlatformAdmin) {
      return err(new ForbiddenError('Cannot edit address belonging to another profile'));
    }

    const updated: BuyerAddressEntity = {
      ...existing,
      label: input.label !== undefined ? input.label.trim() : existing.label,
      line1: input.line1 !== undefined ? input.line1.trim() : existing.line1,
      line2: input.line2 !== undefined ? input.line2.trim() : existing.line2,
      landmark: input.landmark !== undefined ? input.landmark.trim() : existing.landmark,
      city: input.city !== undefined ? input.city.trim() : existing.city,
      state: input.state !== undefined ? input.state.trim() : existing.state,
      stateCode: input.stateCode !== undefined ? input.stateCode.trim() : existing.stateCode,
      pincode: input.pincode !== undefined ? input.pincode.trim() : existing.pincode,
      country: input.country !== undefined ? input.country.trim() : existing.country,
      contactPerson: input.contactPerson !== undefined ? input.contactPerson.trim() : existing.contactPerson,
      contactPhone: input.contactPhone !== undefined ? input.contactPhone.trim() : existing.contactPhone,
      isPrimary: input.isPrimary !== undefined ? Boolean(input.isPrimary) : existing.isPrimary,
      addressType: input.addressType !== undefined ? input.addressType : existing.addressType,
      isActive: input.isActive !== undefined ? Boolean(input.isActive) : existing.isActive,
      updatedAt: timestamp(),
    };

    if (!isAddressValid(updated as unknown as Partial<BuyerAddress>).valid) {
      return err(new ValidationError('Invalid address fields provided for update'));
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

  async setPrimary(
    actor: ActorContext,
    addressId: string,
  ): Promise<Result<BuyerAddressEntity, Error>> {
    return this.updateAddress(actor, addressId, { isPrimary: true });
  }

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
      return ok(list);
    }

    const list = await repo.findByProfileId(actor.profileId);
    return ok(list);
  }

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
      return ok(primary);
    }

    const primary = await repo.findPrimary(actor.profileId);
    return ok(primary);
  }

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
      line1: existing.line1,
      line2: existing.line2,
      landmark: existing.landmark,
      city: existing.city,
      state: existing.state,
      stateCode: existing.stateCode,
      pincode: existing.pincode,
      country: existing.country,
      contactPerson: existing.contactPerson,
      contactPhone: existing.contactPhone,
      isPrimary: existing.isPrimary,
      addressType: existing.addressType,
      isActive: existing.isActive,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    };

    const snapshot = createAddressSnapshot(domainAddress);
    return ok(snapshot);
  }
}
