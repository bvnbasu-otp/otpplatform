import { RequirementType } from './procurement';

/**
 * What the buyer is actually asking for, in their own terms.
 *
 * RequirementType (PRODUCT | SERVICE | PROJECT) stays exactly as it was, because
 * the state machine and INV-007 are written against it. The mode is the richer
 * buyer-facing choice, and the type is derived from it — never the other way
 * round, and never chosen independently by a client.
 */
export const RequirementMode = {
  PRODUCT_MATERIAL: 'PRODUCT_MATERIAL',
  SERVICE: 'SERVICE',
  REPAIR_MAINTENANCE: 'REPAIR_MAINTENANCE',
  JOB_WORK: 'JOB_WORK',
  PROJECT_CONTRACT: 'PROJECT_CONTRACT',
  RENTAL_HIRE: 'RENTAL_HIRE',
  AMC: 'AMC',
  COMMODITY_TRADING: 'COMMODITY_TRADING',
  LOGISTICS: 'LOGISTICS',
  PROFESSIONAL_SERVICE: 'PROFESSIONAL_SERVICE',
  OTHER: 'OTHER',
} as const;

export type RequirementMode =
  (typeof RequirementMode)[keyof typeof RequirementMode];

/** Labels for the mode picker, kept beside the enum so they cannot drift apart. */
export const REQUIREMENT_MODE_LABELS: Record<RequirementMode, string> = {
  PRODUCT_MATERIAL: 'Buy a product or material',
  SERVICE: 'Hire a service',
  REPAIR_MAINTENANCE: 'Repair or maintain something',
  JOB_WORK: 'Send out job work',
  PROJECT_CONTRACT: 'Award a project or contract',
  RENTAL_HIRE: 'Rent or hire',
  AMC: 'Annual maintenance contract',
  COMMODITY_TRADING: 'Buy a traded commodity',
  LOGISTICS: 'Move goods',
  PROFESSIONAL_SERVICE: 'Engage a professional',
  OTHER: 'Something else',
};

/**
 * Mirrors private.requirement_mode_base_type. The database is authoritative;
 * this exists so the wizard can show the consequence of a choice before saving.
 */
export function requirementTypeForMode(
  mode: RequirementMode,
): RequirementType | null {
  switch (mode) {
    case RequirementMode.PRODUCT_MATERIAL:
    case RequirementMode.COMMODITY_TRADING:
      return RequirementType.PRODUCT;
    case RequirementMode.PROJECT_CONTRACT:
      return RequirementType.PROJECT;
    case RequirementMode.SERVICE:
    case RequirementMode.REPAIR_MAINTENANCE:
    case RequirementMode.JOB_WORK:
    case RequirementMode.RENTAL_HIRE:
    case RequirementMode.AMC:
    case RequirementMode.LOGISTICS:
    case RequirementMode.PROFESSIONAL_SERVICE:
      return RequirementType.SERVICE;
    case RequirementMode.OTHER:
      return null;
  }
}

/** How the buyer wants suppliers found for this RFQ. */
export const SourcingMode = {
  OPEN_RFQ: 'OPEN_RFQ',
  IDENTITY_PROTECTED: 'IDENTITY_PROTECTED',
  INVITE_SELECTED: 'INVITE_SELECTED',
  NETWORK_DISCOVERY: 'NETWORK_DISCOVERY',
  PREVIOUS_SUPPLIERS: 'PREVIOUS_SUPPLIERS',
} as const;

export type SourcingMode = (typeof SourcingMode)[keyof typeof SourcingMode];

export const RequiredByMode = {
  IMMEDIATE: 'IMMEDIATE',
  WITHIN_DAYS: 'WITHIN_DAYS',
  SPECIFIC_DATE: 'SPECIFIC_DATE',
  FLEXIBLE: 'FLEXIBLE',
} as const;

export type RequiredByMode =
  (typeof RequiredByMode)[keyof typeof RequiredByMode];

export const FulfilmentMode = {
  SUPPLIER_DELIVERY: 'SUPPLIER_DELIVERY',
  BUYER_PICKUP: 'BUYER_PICKUP',
  SUPPLIER_ONSITE: 'SUPPLIER_ONSITE',
  REMOTE: 'REMOTE',
  LOGISTICS_REQUIRED: 'LOGISTICS_REQUIRED',
} as const;

export type FulfilmentMode =
  (typeof FulfilmentMode)[keyof typeof FulfilmentMode];
