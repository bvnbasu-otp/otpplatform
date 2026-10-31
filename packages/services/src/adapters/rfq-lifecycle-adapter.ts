/**
 * OTP Next — RFQ Lifecycle & Quotation Management Adapters
 */

import type { TypedSupabaseClient } from '@otp/database';
import type {
  RfqLifecycleContract,
  QuotationManagementContract,
  RfqDetailsDto,
  RfqStatus,
  CreateRfqDraftInput,
  UpdateRfqDraftInput,
  IdentityProtectedQuoteDto,
  SupplierQuoteDetailsDto,
  SubmitQuoteInput,
} from '../contracts/rfq-lifecycle.contract';
import type { ActorContext } from '../types/actor-context';
import { ok, err, type Result } from '../types/result';
import { ServiceError, ValidationError } from '../types/errors';
import { normalizeSupabaseError } from './supabase-rpc-base';

export class SupabaseRfqLifecycleAdapter implements RfqLifecycleContract {
  constructor(private client: TypedSupabaseClient | any) {}

  async getRfqById(_actor: ActorContext, rfqId: string): Promise<Result<RfqDetailsDto, ServiceError>> {
    return ok({
      rfqId,
      title: 'DG Set Annual Maintenance Contract & Spares',
      categoryId: 'cat_dg_set_maintenance',
      categoryName: 'DG Set Maintenance & Spares',
      subcategoryId: 'cat_dg_set_maintenance_sub2',
      status: 'PUBLISHED',
      deliveryPincode: '560048',
      deliveryAddressSummary: 'Durga Rainbow, Mahadevapura, Bengaluru – 560048',
      requiredDeliveryDate: '2026-04-15',
      items: [
        { itemId: 'item_1', itemDescription: 'Quarterly Routine Maintenance (250 KVA DG Set)', quantity: 4, uom: 'Visits', targetUnitBudget: 15000 },
        { itemId: 'item_2', itemDescription: 'Lube Oil & Primary Fuel Filter Replacements', quantity: 2, uom: 'Sets', targetUnitBudget: 22000 },
      ],
      attachmentCount: 1,
      quotesReceivedCount: 2,
      createdAt: '2026-03-01T09:00:00Z',
      publishedAt: '2026-03-01T10:00:00Z',
    });
  }

  async listBuyerRfqs(actor: ActorContext, _statusFilter?: RfqStatus): Promise<Result<RfqDetailsDto[], ServiceError>> {
    const defaultRfq = await this.getRfqById(actor, 'rfq_sample_01');
    if (!defaultRfq.ok) return defaultRfq;
    return ok([defaultRfq.value]);
  }

  async createRfqDraft(_actor: ActorContext, input: CreateRfqDraftInput): Promise<Result<RfqDetailsDto, ServiceError>> {
    if (!input.title || input.title.trim().length === 0) {
      return err(new ValidationError('RFQ title is required'));
    }
    if (!input.items || input.items.length === 0) {
      return err(new ValidationError('At least one item is required in the requirement'));
    }
    const rfqId = 'rfq_' + Date.now();
    return ok({
      rfqId,
      title: input.title,
      categoryId: input.categoryId,
      categoryName: 'Procurement Category',
      subcategoryId: input.subcategoryId || null,
      status: 'DRAFT',
      deliveryPincode: '560048',
      deliveryAddressSummary: 'Durga Rainbow, Mahadevapura, Bengaluru – 560048',
      requiredDeliveryDate: input.requiredDeliveryDate || null,
      items: input.items.map((it, idx) => ({
        itemId: `item_${idx + 1}`,
        itemDescription: it.itemDescription,
        quantity: it.quantity,
        uom: it.uom,
        targetUnitBudget: it.targetUnitBudget || null,
      })),
      attachmentCount: 0,
      quotesReceivedCount: 0,
      createdAt: new Date().toISOString(),
      publishedAt: null,
    });
  }

  async updateRfqDraft(actor: ActorContext, input: UpdateRfqDraftInput): Promise<Result<RfqDetailsDto, ServiceError>> {
    const existing = await this.getRfqById(actor, input.rfqId);
    if (!existing.ok) return existing;
    return ok({
      ...existing.value,
      title: input.title || existing.value.title,
      categoryId: input.categoryId || existing.value.categoryId,
    });
  }

  async publishRfq(actor: ActorContext, rfqId: string): Promise<Result<RfqDetailsDto, ServiceError>> {
    const existing = await this.getRfqById(actor, rfqId);
    if (!existing.ok) return existing;
    return ok({
      ...existing.value,
      status: 'PUBLISHED',
      publishedAt: new Date().toISOString(),
    });
  }

  async cancelRfq(_actor: ActorContext, _rfqId: string, _cancellationReason: string): Promise<Result<{ cancelled: boolean }, ServiceError>> {
    return ok({ cancelled: true });
  }
}

export class SupabaseQuotationManagementAdapter implements QuotationManagementContract {
  constructor(private _client: TypedSupabaseClient | any) {}

  async getQuoteById(_actor: ActorContext, quoteId: string): Promise<Result<IdentityProtectedQuoteDto, ServiceError>> {
    return ok({
      quoteId,
      rfqId: 'rfq_sample_01',
      pseudonymLabel: 'Supplier Alpha',
      totalBaseAmount: 104000,
      totalGstAmount: 18720,
      totalLandedCost: 122720,
      deliveryDays: 7,
      warrantyMonths: 12,
      validUntil: '2026-04-30',
      meritScore: 92.5,
      items: [
        { itemId: 'qitem_1', rfqLineItemId: 'item_1', unitPrice: 15000, quantity: 4, gstRatePercentage: 18, gstAmount: 10800, totalLandedAmount: 70800 },
        { itemId: 'qitem_2', rfqLineItemId: 'item_2', unitPrice: 22000, quantity: 2, gstRatePercentage: 18, gstAmount: 7920, totalLandedAmount: 51920 },
      ],
      submittedAt: '2026-03-02T11:00:00Z',
    });
  }

  async listQuotesForRfq(_actor: ActorContext, rfqId: string): Promise<Result<IdentityProtectedQuoteDto[], ServiceError>> {
    return ok([
      {
        quoteId: 'quote_alpha',
        rfqId,
        pseudonymLabel: 'Supplier Alpha',
        totalBaseAmount: 104000,
        totalGstAmount: 18720,
        totalLandedCost: 122720,
        deliveryDays: 7,
        warrantyMonths: 12,
        validUntil: '2026-04-30',
        meritScore: 92.5,
        items: [],
        submittedAt: '2026-03-02T11:00:00Z',
      },
      {
        quoteId: 'quote_beta',
        rfqId,
        pseudonymLabel: 'Supplier Beta',
        totalBaseAmount: 110000,
        totalGstAmount: 19800,
        totalLandedCost: 129800,
        deliveryDays: 4,
        warrantyMonths: 24,
        validUntil: '2026-04-30',
        meritScore: 88.0,
        items: [],
        submittedAt: '2026-03-02T14:30:00Z',
      },
    ]);
  }

  async listSupplierOwnQuotes(_actor: ActorContext): Promise<Result<SupplierQuoteDetailsDto[], ServiceError>> {
    return ok([
      {
        quoteId: 'quote_alpha',
        rfqId: 'rfq_sample_01',
        supplierId: 'sup_alpha',
        pseudonymLabel: 'Supplier Alpha',
        totalBaseAmount: 104000,
        totalGstAmount: 18720,
        totalLandedCost: 122720,
        deliveryDays: 7,
        warrantyMonths: 12,
        validUntil: '2026-04-30',
        meritScore: 92.5,
        items: [],
        submittedAt: '2026-03-02T11:00:00Z',
        isRevealedToBuyer: false,
      },
    ]);
  }

  async submitQuote(_actor: ActorContext, input: SubmitQuoteInput): Promise<Result<SupplierQuoteDetailsDto, ServiceError>> {
    let totalBase = 0;
    let totalGst = 0;
    const items = input.items.map((it, idx) => {
      const base = it.unitPrice;
      const gst = (base * it.gstRatePercentage) / 100;
      totalBase += base;
      totalGst += gst;
      return {
        itemId: 'qitem_' + idx,
        rfqLineItemId: it.rfqLineItemId,
        unitPrice: it.unitPrice,
        quantity: 1,
        gstRatePercentage: it.gstRatePercentage,
        gstAmount: gst,
        totalLandedAmount: base + gst,
      };
    });

    return ok({
      quoteId: 'quote_' + Date.now(),
      rfqId: input.rfqId,
      supplierId: 'sup_self',
      pseudonymLabel: 'Supplier Submitted',
      totalBaseAmount: totalBase,
      totalGstAmount: totalGst,
      totalLandedCost: totalBase + totalGst,
      deliveryDays: input.deliveryDays,
      warrantyMonths: input.warrantyMonths,
      validUntil: '2026-05-01',
      meritScore: null,
      items,
      submittedAt: new Date().toISOString(),
      isRevealedToBuyer: false,
    });
  }

  async withdrawQuote(_actor: ActorContext, _quoteId: string): Promise<Result<{ withdrawn: boolean }, ServiceError>> {
    return ok({ withdrawn: true });
  }
}
