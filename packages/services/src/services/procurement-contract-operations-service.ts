import type {
  ContractTerms,
  ProcurementContract,
  ContractStatus,
} from '@otp/domain';
import {
  compileContractAgreementMarkdown,
  computeContractDocumentHash,
  generateContractSignatureHash,
  verifyContractSignatureHash,
} from '@otp/domain';
import type { Repositories } from '../repositories/interfaces';
import type { AuditAppService } from './audit-service';
import type { ActorContext } from '../types/actor-context';
import { auditLog } from './service-helpers';
import { ForbiddenError, NotFoundError, ValidationError } from '../types/errors';

export class ProcurementContractOperationsService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditAppService
  ) {}

  /**
   * Generates a tamper-evident procurement contract agreement at Step 11 (Contract Gate).
   */
  async generateContract(
    actor: ActorContext,
    terms: ContractTerms
  ): Promise<ProcurementContract> {
    const rfq = await this.repos.rfqs.findById(terms.rfqId);
    if (!rfq) throw new NotFoundError(`RFQ ${terms.rfqId} not found`);

    if (!actor.isPlatformAdmin && actor.organizationId !== terms.buyerOrganizationId) {
      throw new ForbiddenError('Access denied: Must belong to buyer organization to generate contract.');
    }

    const markdownBody = compileContractAgreementMarkdown(terms);
    const documentHash = computeContractDocumentHash(markdownBody, terms);
    const contractNumber = `CTR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

    const now = new Date().toISOString();
    const contract: ProcurementContract = {
      id: crypto.randomUUID(),
      contractNumber,
      rfqId: terms.rfqId,
      organizationId: terms.buyerOrganizationId,
      supplierId: terms.supplierId,
      quoteId: terms.quoteId,
      status: 'PENDING_BUYER_SIGNATURE',
      terms,
      contractBodyMarkdown: markdownBody,
      documentHash,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    if (this.repos.procurementContracts) {
      await this.repos.procurementContracts.save({
        ...contract,
        terms: contract.terms as unknown as Record<string, unknown>,
      });
    }

    await auditLog(
      this.audit,
      actor,
      'PROCUREMENT_CONTRACT',
      contract.id,
      'GENERATE_PROCUREMENT_CONTRACT',
      null,
      { contractNumber, rfqId: terms.rfqId, documentHash }
    );

    return contract;
  }

  /**
   * Cryptographically signs the procurement contract by Buyer or Supplier.
   */
  async signContract(
    actor: ActorContext,
    params: {
      contractId: string;
      partyType: 'BUYER' | 'SUPPLIER';
      signatureTimestampIso?: string;
    }
  ): Promise<ProcurementContract> {
    const existing = await this.repos.procurementContracts?.findById(params.contractId);
    if (!existing) throw new NotFoundError(`Contract ${params.contractId} not found`);

    const now = params.signatureTimestampIso || new Date().toISOString();
    const signerRole = actor.orgRole || (params.partyType === 'BUYER' ? 'BUYER_REPRESENTATIVE' : 'SUPPLIER_REPRESENTATIVE');
    const signatureHash = generateContractSignatureHash(
      existing.documentHash,
      actor.profileId,
      signerRole,
      now
    );

    let updated = { ...existing };

    if (params.partyType === 'BUYER') {
      if (!actor.isPlatformAdmin && actor.organizationId !== existing.organizationId) {
        throw new ForbiddenError('Access denied: Not authorized to sign as buyer.');
      }
      updated.buyerSignedBy = actor.profileId;
      updated.buyerSignedAt = now;
      updated.buyerSignatureHash = signatureHash;
      updated.status = updated.supplierSignedAt ? 'ACTIVE' : 'PENDING_SUPPLIER_SIGNATURE';
    } else if (params.partyType === 'SUPPLIER') {
      if (!actor.isPlatformAdmin && actor.organizationId === existing.organizationId) {
        throw new ForbiddenError('Access denied: Counterparty supplier required.');
      }
      updated.supplierSignedBy = actor.profileId;
      updated.supplierSignedAt = now;
      updated.supplierSignatureHash = signatureHash;
      updated.status = updated.buyerSignedAt ? 'ACTIVE' : 'PENDING_BUYER_SIGNATURE';
    }

    updated.updatedAt = now;

    if (this.repos.procurementContracts) {
      await this.repos.procurementContracts.save(updated);
    }

    await auditLog(
      this.audit,
      actor,
      'PROCUREMENT_CONTRACT',
      updated.id,
      `SIGN_CONTRACT_${params.partyType}`,
      null,
      { contractNumber: updated.contractNumber, partyType: params.partyType, signatureHash }
    );

    return updated as unknown as ProcurementContract;
  }
}
