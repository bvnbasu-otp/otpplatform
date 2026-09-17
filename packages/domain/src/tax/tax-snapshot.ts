import type { PlaceOfSupplyResult, SupplyType } from './place-of-supply';
import type { CalculatedLineItemTax, OrderTaxBreakdown } from './gst-calculator';

export interface TaxSnapshotLineItem {
  itemIndex: number;
  description: string;
  hsnSacCode?: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxableAmount: number;
  gstRate: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  utgstRate: number;
  utgstAmount: number;
  igstRate: number;
  igstAmount: number;
  totalAmount: number;
}

export interface TaxSnapshot {
  snapshotVersion: string;
  capturedAt: string;
  supplierGstin?: string | null;
  supplierLegalName?: string | null;
  supplierStateCode: string;
  buyerGstin?: string | null;
  buyerOrgName?: string | null;
  buyerStateCode: string;
  placeOfSupplyStateCode: string;
  placeOfSupplyStateName: string;
  placeOfSupplyBasis: string;
  supplyType: SupplyType;
  isInterState: boolean;
  isUnionTerritory: boolean;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  utgstTotal: number;
  igstTotal: number;
  totalTax: number;
  grossTotal: number;
  lineItems: TaxSnapshotLineItem[];
  deterministicHash?: string;
}

export interface BuildTaxSnapshotInput {
  supplierGstin?: string | null;
  supplierLegalName?: string | null;
  supplierStateCode: string;
  buyerGstin?: string | null;
  buyerOrgName?: string | null;
  buyerStateCode: string;
  supplyType?: SupplyType;
  pos: PlaceOfSupplyResult;
  taxBreakdown: OrderTaxBreakdown;
  capturedAt?: string;
}

/**
 * Deterministic hash computation for tax snapshot integrity verification
 */
export function computeTaxSnapshotHash(snapshot: Omit<TaxSnapshot, 'deterministicHash'>): string {
  const canonicalString = JSON.stringify({
    v: snapshot.snapshotVersion,
    sup: snapshot.supplierGstin || '',
    buy: snapshot.buyerGstin || '',
    pos: snapshot.placeOfSupplyStateCode,
    basis: snapshot.placeOfSupplyBasis,
    inter: snapshot.isInterState,
    ut: snapshot.isUnionTerritory,
    taxable: snapshot.taxableTotal,
    cgst: snapshot.cgstTotal,
    sgst: snapshot.sgstTotal,
    utgst: snapshot.utgstTotal,
    igst: snapshot.igstTotal,
    total: snapshot.grossTotal,
    items: snapshot.lineItems.map((li) => [
      li.itemIndex,
      li.hsnSacCode || '',
      li.taxableAmount,
      li.cgstAmount,
      li.sgstAmount,
      li.utgstAmount,
      li.igstAmount,
      li.totalAmount,
    ]),
  });

  // Simple, fast 32-bit FNV-1a / hex representation
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonicalString.length; i++) {
    hash ^= canonicalString.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `TAX-V1-${(hash >>> 0).toString(16).padStart(8, '0').toUpperCase()}`;
}

/**
 * Constructs an immutable, frozen tax snapshot for a purchase order or tax invoice.
 */
export function buildTaxSnapshot(input: BuildTaxSnapshotInput): TaxSnapshot {
  const capturedAt = input.capturedAt || new Date().toISOString();
  const supplyType = input.supplyType || 'PRODUCT_GOODS';

  const snapshotBase: Omit<TaxSnapshot, 'deterministicHash'> = {
    snapshotVersion: '1.0',
    capturedAt,
    supplierGstin: input.supplierGstin || null,
    supplierLegalName: input.supplierLegalName || null,
    supplierStateCode: input.supplierStateCode.padStart(2, '0'),
    buyerGstin: input.buyerGstin || null,
    buyerOrgName: input.buyerOrgName || null,
    buyerStateCode: input.buyerStateCode.padStart(2, '0'),
    placeOfSupplyStateCode: input.pos.placeOfSupplyStateCode,
    placeOfSupplyStateName: input.pos.placeOfSupplyStateName,
    placeOfSupplyBasis: input.pos.placeOfSupplyBasis,
    supplyType,
    isInterState: input.pos.isInterState,
    isUnionTerritory: input.pos.isUnionTerritory,
    taxableTotal: input.taxBreakdown.taxableTotal,
    cgstTotal: input.taxBreakdown.cgstTotal,
    sgstTotal: input.taxBreakdown.sgstTotal,
    utgstTotal: input.taxBreakdown.utgstTotal,
    igstTotal: input.taxBreakdown.igstTotal,
    totalTax: input.taxBreakdown.totalTax,
    grossTotal: input.taxBreakdown.grossTotal,
    lineItems: input.taxBreakdown.lineItems.map((li: CalculatedLineItemTax) => ({
      itemIndex: li.itemIndex,
      description: li.description,
      hsnSacCode: li.hsnSacCode || null,
      quantity: li.quantity,
      unit: li.unit,
      unitPrice: li.unitPrice,
      taxableAmount: li.taxableAmount,
      gstRate: li.gstRate,
      cgstRate: li.cgstRate,
      cgstAmount: li.cgstAmount,
      sgstRate: li.sgstRate,
      sgstAmount: li.sgstAmount,
      utgstRate: li.utgstRate,
      utgstAmount: li.utgstAmount,
      igstRate: li.igstRate,
      igstAmount: li.igstAmount,
      totalAmount: li.totalAmount,
    })),
  };

  const deterministicHash = computeTaxSnapshotHash(snapshotBase);

  return {
    ...snapshotBase,
    deterministicHash,
  };
}
