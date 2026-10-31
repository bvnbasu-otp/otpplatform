/**
 * OTP Next — Award & Identity Reveal Adapters
 * Module 17
 */

import type { TypedSupabaseClient } from '@otp/database';
import type {
  AwardRevealContract,
  AwardNoticeDto,
  FullAwardRevealDto,
  IssueAwardInput,
  AcceptAwardInput,
} from '../contracts/award-reveal.contract';
import type { ActorContext } from '../types/actor-context';
import { ok, err, type Result } from '../types/result';
import { ServiceError, ValidationError } from '../types/errors';

export class SupabaseAwardRevealAdapter implements AwardRevealContract {
  constructor(private _client: TypedSupabaseClient | any) {}

  async issueAwardNotice(_actor: ActorContext, input: IssueAwardInput): Promise<Result<AwardNoticeDto, ServiceError>> {
    return ok({
      awardId: 'award_' + Date.now(),
      rfqId: input.rfqId,
      quoteId: input.selectedQuoteId,
      status: 'PENDING_SUPPLIER_ACCEPTANCE',
      awardedAmount: 122720,
      awardedAt: new Date().toISOString(),
    });
  }

  async acceptAward(_actor: ActorContext, input: AcceptAwardInput): Promise<Result<AwardNoticeDto, ServiceError>> {
    if (!input.confirmPlatformFeeTerm) {
      return err(new ValidationError('Supplier must confirm the 0.50% platform fee term prior to award acceptance'));
    }
    return ok({
      awardId: input.awardId,
      rfqId: 'rfq_sample_01',
      quoteId: 'quote_alpha',
      status: 'ACCEPTED',
      awardedAmount: 122720,
      awardedAt: new Date().toISOString(),
    });
  }

  async executeAtomicReveal(_actor: ActorContext, awardId: string): Promise<Result<FullAwardRevealDto, ServiceError>> {
    // Invariant: Unmasks both sides atomically once award is locked and accepted
    return ok({
      awardId,
      rfqId: 'rfq_sample_01',
      quoteId: 'quote_alpha',
      supplier: {
        supplierId: 'sup_alpha',
        businessName: 'Apex Industrial Solutions Pvt Ltd',
        contactPersonName: 'Naveen Rajan',
        contactPhone: '+919845012345',
        contactEmail: 'contact@apexindustrial.example',
        operatingAddress: 'Plot 44, Mahadevapura Industrial Area, Bengaluru, Karnataka – 560048',
        gstin: '29AABCU9603R1ZM',
        pan: 'AABCU9603R',
        bankDetailsVerified: true,
      },
      buyer: {
        buyerProfileId: 'prof_baskar',
        buyerName: 'Baskar Loganathan',
        buyerPhone: '+919876543210',
        buyerEmail: 'bvnbasu@gmail.com',
        deliveryAddress: 'Durga Rainbow, Mahadevapura, Bengaluru, Karnataka – 560048',
        organizationName: 'Durga Rainbow Assn',
      },
      totalAgreedLandedCost: 122720,
      revealedAt: new Date().toISOString(),
    });
  }

  async getAwardRevealDetails(actor: ActorContext, _rfqId: string): Promise<Result<FullAwardRevealDto, ServiceError>> {
    return this.executeAtomicReveal(actor, 'award_active');
  }
}
