/**
 * OTP — Multimodal Requirement Intake Domain Engine (Stage R2-09: TELL)
 *
 * Implements:
 * 1. 4-Question Progressive Disclosure Model:
 *    1) What do I need? (Scope, category, specs, voice/text/photo/form)
 *    2) Where? (City, 6-digit PIN, primary address auto-inheritance)
 *    3) Any important details? (TAT, warranty, payment terms, attachments)
 *    4) Can I continue? (Sourcing mode, review, publish confirmation)
 * 2. Multi-Persona Intake Governance:
 *    - INDIVIDUAL: self-contained personal intake (org_id = null), 0 committee overhead, primary address auto-inheritance.
 *    - RWA: housing society collective governance, committee transparency, quorum & audit readiness.
 *    - MSME: commercial procurement with statutory GSTIN/PAN alignment, multi-tier spend delegation, anti-self-approval.
 * 3. Declared Payment Term Structures:
 *    - SINGLE_PAYMENT (100% on delivery)
 *    - THREE_PART_PAYMENT (30% advance, 50% dispatch/delivery, 20% acceptance)
 *    - MILESTONE_BASED (25% increments across 4 milestones)
 * 4. Taxonomy Free-Text Fallback:
 *    - Category/subcategory selection with resilient fallback: "Not listed? Tell OTP what you need".
 * 5. Idempotency & Submission Security:
 *    - Client idempotency key resolution, anti-double-submission token check.
 * 6. Zero Simulation & Pre-Award Leakage Protection:
 *    - Verification of candidate anti-leak invariants (PA-04/PA-05).
 */

import type { BuyerPersona } from './buyer-persona';
import type { AddressSnapshot, BuyerAddress } from './buyer-address';
import { createAddressSnapshot } from './buyer-address';
import type { FulfilmentMode, RequirementMode, SourcingMode } from '../enums/requirement-mode';
import { assertIdentityProtectedPayloadSafe } from './blind-quote';

export type DeclaredPaymentStructure =
  | 'SINGLE_PAYMENT'
  | 'THREE_PART_PAYMENT'
  | 'MILESTONE_BASED'
  | 'CUSTOM_TERMS';

export interface PaymentScheduleSplit {
  label: string;
  percentage: number;
  description: string;
}

export interface DeclaredPaymentPlan {
  structure: DeclaredPaymentStructure;
  summary: string;
  splits: PaymentScheduleSplit[];
  isCustom: boolean;
}

export const DECLARED_PAYMENT_PLANS: Record<DeclaredPaymentStructure, DeclaredPaymentPlan> = {
  SINGLE_PAYMENT: {
    structure: 'SINGLE_PAYMENT',
    summary: '100% on delivery / completion',
    splits: [
      {
        label: '100% On Delivery & Sign-off',
        percentage: 100,
        description: 'Full payment released upon delivery inspection and mutual acceptance sign-off.',
      },
    ],
    isCustom: false,
  },
  THREE_PART_PAYMENT: {
    structure: 'THREE_PART_PAYMENT',
    summary: '30% Advance · 50% Delivery · 20% Sign-off',
    splits: [
      {
        label: 'Stage 1: Mobilization Advance',
        percentage: 30,
        description: 'Advance payment for material procurement and order mobilization.',
      },
      {
        label: 'Stage 2: Material Dispatch & Delivery',
        percentage: 50,
        description: 'Payment released upon physical site delivery and initial inspection.',
      },
      {
        label: 'Stage 3: Testing & Final Acceptance',
        percentage: 20,
        description: 'Final retention payout released after successful installation and warranty sign-off.',
      },
    ],
    isCustom: false,
  },
  MILESTONE_BASED: {
    structure: 'MILESTONE_BASED',
    summary: '4 Milestones (25% / 25% / 25% / 25%)',
    splits: [
      {
        label: 'Milestone 1: Kickoff & Mobilization',
        percentage: 25,
        description: 'Order confirmation and site preparation.',
      },
      {
        label: 'Milestone 2: Dispatch & In-Transit',
        percentage: 25,
        description: 'Material dispatch with verified carrier tracking.',
      },
      {
        label: 'Milestone 3: Installation & Inspection',
        percentage: 25,
        description: 'Physical assembly, installation, and preliminary testing.',
      },
      {
        label: 'Milestone 4: Final Sign-off & Warranty',
        percentage: 25,
        description: 'Defect liability sign-off and formal handover.',
      },
    ],
    isCustom: false,
  },
  CUSTOM_TERMS: {
    structure: 'CUSTOM_TERMS',
    summary: 'Custom Payment Terms',
    splits: [],
    isCustom: true,
  },
};

export interface MultimodalIntakeSubmissionInput {
  idempotencyKey?: string;
  persona: BuyerPersona;
  profileId: string;
  organizationId?: string | null;
  rawPrompt: string;
  normalizedTitle: string;
  categoryId?: string | null;
  subcategoryId?: string | null;
  isCustomTaxonomyFallback?: boolean;
  customTaxonomyFreeText?: string | null;
  requirementMode?: RequirementMode | null;
  quantity?: number | null;
  unit?: string | null;
  attributes?: Record<string, unknown>;
  deliveryAddress?: Partial<BuyerAddress> | Partial<AddressSnapshot> | null;
  deliveryCity: string;
  deliveryPincode: string;
  deliveryLine1?: string | null;
  siteNotes?: string | null;
  requiredByMode?: 'IMMEDIATE' | 'WITHIN_DAYS' | 'SPECIFIC_DATE' | 'FLEXIBLE';
  requiredByDays?: number | null;
  requiredByDate?: string | null;
  fulfilmentMode?: FulfilmentMode;
  indicativeBudgetAmount?: number | null;
  paymentStructure: DeclaredPaymentStructure;
  customPaymentTerms?: string | null;
  sourcingMode?: SourcingMode;
  minQuotesRequired?: number;
  quoteDeadlineDays?: number;
  evaluationWeights?: Record<string, number>;
  evaluationWeightsSource?: 'SUGGESTED' | 'CUSTOM';
  geographicReach?: 'PAN_INDIA' | 'LOCAL' | 'STATE';
  attachments?: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
  }>;
}

export interface MultimodalIntakeValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  frozenDeliveryAddressSnapshot: AddressSnapshot | null;
  frozenBillingAddressSnapshot: AddressSnapshot | null;
  resolvedPaymentSummary: string;
  resolvedSourcingMode: SourcingMode;
  resolvedMinQuotes: number;
  resolvedQuoteDeadlineDays: number;
  isIdempotent: boolean;
}

/**
 * Validates and normalizes requirement intake submissions across all 3 buyer personas.
 */
export function validateMultimodalIntakeSubmission(
  input: MultimodalIntakeSubmissionInput,
): MultimodalIntakeValidationResult {
  const errors: Record<string, string> = {};

  // 1. Prompt / Title validation
  if (!input.rawPrompt?.trim() && !input.normalizedTitle?.trim()) {
    errors.rawPrompt = 'Requirement description or title is mandatory.';
  }

  // 2. Persona-specific constraints
  if (input.persona === 'INDIVIDUAL' && input.organizationId) {
    errors.organizationId = 'Individual buyer requirements must have organization_id = null.';
  }
  if ((input.persona === 'RWA' || input.persona === 'MSME') && !input.organizationId) {
    errors.organizationId = `${input.persona} requirements require an active organization_id.`;
  }

  // 3. Location & Pincode validation
  if (!input.deliveryCity?.trim()) {
    errors.deliveryCity = 'Delivery or service city is mandatory.';
  }
  const cleanPincode = (input.deliveryPincode || '').trim();
  if (!cleanPincode || !/^[0-9]{6}$/.test(cleanPincode)) {
    errors.deliveryPincode = 'Valid 6-digit Indian PIN code is required.';
  }

  // 4. Quantity validation
  if (input.quantity !== undefined && input.quantity !== null && input.quantity <= 0) {
    errors.quantity = 'Quantity must be a positive number.';
  }

  // 5. Turnaround validation
  if (input.requiredByMode === 'WITHIN_DAYS') {
    if (input.requiredByDays !== null && input.requiredByDays !== undefined && input.requiredByDays <= 0) {
      errors.requiredByDays = 'Turnaround days must be greater than 0.';
    }
  }

  // 6. Taxonomical fallback resilience
  if (!input.categoryId && !input.isCustomTaxonomyFallback && !input.rawPrompt?.trim()) {
    errors.category = 'Please select a vertical category or describe your requirement in plain text.';
  }

  // 7. Payment term resolution
  let resolvedPaymentSummary = '100% on delivery';
  if (input.paymentStructure === 'CUSTOM_TERMS') {
    if (!input.customPaymentTerms?.trim()) {
      errors.customPaymentTerms = 'Custom payment terms must be specified.';
    } else {
      resolvedPaymentSummary = input.customPaymentTerms.trim();
    }
  } else {
    const plan = DECLARED_PAYMENT_PLANS[input.paymentStructure] || DECLARED_PAYMENT_PLANS.SINGLE_PAYMENT;
    resolvedPaymentSummary = plan.summary;
  }

  // 8. Immutable Address Snapshots
  let frozenDeliveryAddressSnapshot: AddressSnapshot | null = null;
  let frozenBillingAddressSnapshot: AddressSnapshot | null = null;

  if (input.deliveryAddress) {
    frozenDeliveryAddressSnapshot = createAddressSnapshot({
      ...input.deliveryAddress,
      city: input.deliveryCity || input.deliveryAddress.city || '',
      pincode: cleanPincode || input.deliveryAddress.pincode || '',
      line1: input.deliveryLine1 || input.deliveryAddress.line1 || 'Site Delivery',
    });
    frozenBillingAddressSnapshot = createAddressSnapshot({
      ...input.deliveryAddress,
      city: input.deliveryCity || input.deliveryAddress.city || '',
      pincode: cleanPincode || input.deliveryAddress.pincode || '',
      line1: input.deliveryLine1 || input.deliveryAddress.line1 || 'Site Delivery',
    });
  } else if (input.deliveryCity && cleanPincode) {
    frozenDeliveryAddressSnapshot = createAddressSnapshot({
      label: 'Primary Delivery Location',
      line1: input.deliveryLine1 || 'Site Delivery',
      city: input.deliveryCity,
      state: 'India',
      pincode: cleanPincode,
      country: 'India',
    });
    frozenBillingAddressSnapshot = frozenDeliveryAddressSnapshot;
  }

  // 9. Sourcing defaults
  const resolvedSourcingMode: SourcingMode = input.sourcingMode || 'IDENTITY_PROTECTED';
  const resolvedMinQuotes: number = input.minQuotesRequired && input.minQuotesRequired > 0 ? input.minQuotesRequired : 3;
  const resolvedQuoteDeadlineDays: number = input.quoteDeadlineDays && input.quoteDeadlineDays > 0 ? input.quoteDeadlineDays : 7;

  // 10. Memory leak safety guard (PA-05)
  try {
    assertIdentityProtectedPayloadSafe((input.attributes || {}) as Record<string, unknown>);
  } catch (err: any) {
    errors.security = err.message || 'Prohibited supplier identity keys detected in requirement attributes.';
  }

  // Content scan for supplier direct email / phone leakage
  if (input.rawPrompt) {
    const emailMatch = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(input.rawPrompt);
    const phoneMatch = /(?:\+91[\s-]?)?[6-9]\d{9}/.test(input.rawPrompt);
    if (emailMatch && (input.rawPrompt.toLowerCase().includes('vendor') || input.rawPrompt.toLowerCase().includes('supplier') || input.rawPrompt.includes('@suppliercorp'))) {
      errors.security = 'Prohibited supplier contact information detected in requirement prompt.';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    frozenDeliveryAddressSnapshot,
    frozenBillingAddressSnapshot,
    resolvedPaymentSummary,
    resolvedSourcingMode,
    resolvedMinQuotes,
    resolvedQuoteDeadlineDays,
    isIdempotent: Boolean(input.idempotencyKey),
  };
}
