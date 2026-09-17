import { INDIAN_STATE_CODES } from '../gst/gstin-validator';

/**
 * Statutory India GST Supply Type
 */
export type SupplyType =
  | 'PRODUCT_GOODS'
  | 'PROFESSIONAL_SERVICE'
  | 'WORKS_CONTRACT_PROJECT';

/**
 * Union Territories WITHOUT Legislature (Chargeable to UTGST instead of SGST for intra-UT supply)
 * 04: Chandigarh
 * 25: Daman & Diu (Legacy)
 * 26: Dadra & Nagar Haveli and Daman & Diu
 * 31: Lakshadweep
 * 35: Andaman & Nicobar Islands
 * 38: Ladakh
 * 97: Other Territory
 *
 * NOTE: Delhi (07), Puducherry (34), and Jammu & Kashmir (01) HAVE legislatures, so they levy SGST.
 */
export const UT_WITHOUT_LEGISLATURE_STATE_CODES = new Set<string>([
  '04',
  '25',
  '26',
  '31',
  '35',
  '38',
  '97',
]);

export function isUnionTerritoryWithoutLegislature(stateCode: string): boolean {
  return UT_WITHOUT_LEGISLATURE_STATE_CODES.has(stateCode.padStart(2, '0'));
}

export interface DeterminePlaceOfSupplyInput {
  supplierStateCode: string;
  recipientStateCode?: string | null;
  deliveryStateCode?: string | null;
  supplyType?: SupplyType;
  projectSiteStateCode?: string | null;
}

export interface PlaceOfSupplyResult {
  placeOfSupplyStateCode: string;
  placeOfSupplyStateName: string;
  placeOfSupplyBasis:
    | 'GOODS_TERMINATION_LOCATION'
    | 'SERVICE_RECIPIENT_LOCATION'
    | 'IMMOVABLE_PROPERTY_LOCATION'
    | 'FALLBACK_BUYER_STATE'
    | 'FALLBACK_SUPPLIER_STATE';
  isInterState: boolean;
  isUnionTerritory: boolean;
  requiresTaxExpertValidation: boolean;
  validationNotes?: string[];
}

/**
 * Evaluates the statutory Place of Supply (POS) under the Indian IGST Act 2017:
 * - Section 10: Place of supply of goods (goods termination location)
 * - Section 12(2): Place of supply of general services (location of recipient)
 * - Section 12(3): Place of supply of services directly in relation to immovable property / works contracts (location of property/site)
 */
export function determinePlaceOfSupply(input: DeterminePlaceOfSupplyInput): PlaceOfSupplyResult {
  const notes: string[] = [];
  let requiresTaxExpertValidation = false;

  const cleanSupplierState = (input.supplierStateCode || '').trim().padStart(2, '0');
  const cleanRecipientState = input.recipientStateCode ? input.recipientStateCode.trim().padStart(2, '0') : '';
  const cleanDeliveryState = input.deliveryStateCode ? input.deliveryStateCode.trim().padStart(2, '0') : '';
  const cleanProjectSiteState = input.projectSiteStateCode ? input.projectSiteStateCode.trim().padStart(2, '0') : '';
  const supplyType: SupplyType = input.supplyType || 'PRODUCT_GOODS';

  if (!cleanSupplierState || !INDIAN_STATE_CODES[cleanSupplierState]) {
    notes.push(`Invalid or missing supplier state code: '${input.supplierStateCode}'. Validation required.`);
    requiresTaxExpertValidation = true;
  }

  let posStateCode = '';
  let posBasis: PlaceOfSupplyResult['placeOfSupplyBasis'] = 'GOODS_TERMINATION_LOCATION';

  switch (supplyType) {
    case 'PRODUCT_GOODS': {
      // Sec 10(1)(a) IGST Act: Where supply involves movement of goods, POS is location where movement terminates for delivery
      if (cleanDeliveryState && INDIAN_STATE_CODES[cleanDeliveryState]) {
        posStateCode = cleanDeliveryState;
        posBasis = 'GOODS_TERMINATION_LOCATION';
      } else if (cleanRecipientState && INDIAN_STATE_CODES[cleanRecipientState]) {
        posStateCode = cleanRecipientState;
        posBasis = 'GOODS_TERMINATION_LOCATION';
      } else if (cleanSupplierState && INDIAN_STATE_CODES[cleanSupplierState]) {
        posStateCode = cleanSupplierState;
        posBasis = 'FALLBACK_SUPPLIER_STATE';
        notes.push('Delivery and recipient state missing; falling back to supplier state. TAX-EXPERT-VALIDATION-REQUIRED.');
        requiresTaxExpertValidation = true;
      } else {
        posStateCode = '29'; // Default Karnataka if completely unresolvable
        posBasis = 'FALLBACK_BUYER_STATE';
        requiresTaxExpertValidation = true;
      }
      break;
    }

    case 'WORKS_CONTRACT_PROJECT': {
      // Sec 12(3) IGST Act: Immovable property, construction, works contract POS is location where immovable property is situated
      if (cleanProjectSiteState && INDIAN_STATE_CODES[cleanProjectSiteState]) {
        posStateCode = cleanProjectSiteState;
        posBasis = 'IMMOVABLE_PROPERTY_LOCATION';
      } else if (cleanDeliveryState && INDIAN_STATE_CODES[cleanDeliveryState]) {
        posStateCode = cleanDeliveryState;
        posBasis = 'IMMOVABLE_PROPERTY_LOCATION';
      } else if (cleanRecipientState && INDIAN_STATE_CODES[cleanRecipientState]) {
        posStateCode = cleanRecipientState;
        posBasis = 'IMMOVABLE_PROPERTY_LOCATION';
        notes.push('Project site state not explicitly provided; using recipient address state as immovable property site.');
      } else {
        posStateCode = cleanSupplierState || '29';
        posBasis = 'FALLBACK_BUYER_STATE';
        requiresTaxExpertValidation = true;
      }
      break;
    }

    case 'PROFESSIONAL_SERVICE': {
      // Sec 12(2)(a) IGST Act: Supply of services to a registered person -> POS is location of recipient
      if (cleanRecipientState && INDIAN_STATE_CODES[cleanRecipientState]) {
        posStateCode = cleanRecipientState;
        posBasis = 'SERVICE_RECIPIENT_LOCATION';
      } else if (cleanDeliveryState && INDIAN_STATE_CODES[cleanDeliveryState]) {
        posStateCode = cleanDeliveryState;
        posBasis = 'SERVICE_RECIPIENT_LOCATION';
      } else if (cleanSupplierState && INDIAN_STATE_CODES[cleanSupplierState]) {
        posStateCode = cleanSupplierState;
        posBasis = 'FALLBACK_SUPPLIER_STATE';
        notes.push('Unregistered recipient without address on record; POS is location of supplier.');
      } else {
        posStateCode = '29';
        posBasis = 'FALLBACK_BUYER_STATE';
        requiresTaxExpertValidation = true;
      }
      break;
    }

    default: {
      posStateCode = cleanRecipientState || cleanSupplierState || '29';
      posBasis = 'FALLBACK_BUYER_STATE';
      requiresTaxExpertValidation = true;
    }
  }

  // Inter-State Determination:
  // An Inter-State supply occurs when Supplier State !== Place of Supply State
  const isInterState = cleanSupplierState !== posStateCode;

  // Intra-State supply in a Union Territory without legislature attracts UTGST (not SGST)
  // For Inter-State supply, IGST applies regardless of whether either party is in a UT.
  const isUnionTerritory = !isInterState && isUnionTerritoryWithoutLegislature(posStateCode);

  const stateName = INDIAN_STATE_CODES[posStateCode] || 'Unknown Territory';

  return {
    placeOfSupplyStateCode: posStateCode,
    placeOfSupplyStateName: stateName,
    placeOfSupplyBasis: posBasis,
    isInterState,
    isUnionTerritory,
    requiresTaxExpertValidation,
    validationNotes: notes.length > 0 ? notes : undefined,
  };
}
