import type { ActorContext } from '../types/actor-context';

export interface RevealResult {
  rfqId: string;
  awardId: string;
  supplierId: string;
  supplierBusinessName: string;
  revealedAt: string;
}

/**
 * Reveals supplier identity after human award (INV-030).
 * Only callable when award exists and reveal is authorized.
 */
export interface SupplierRevealService {
  revealForRfq(actor: ActorContext, rfqId: string): Promise<RevealResult>;
}
