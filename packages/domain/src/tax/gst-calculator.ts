import type { PlaceOfSupplyResult } from './place-of-supply';

export interface GstTaxBreakdown {
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
  totalTax: number;
  totalAmount: number;
}

export interface LineItemTaxInput {
  itemIndex?: number;
  description?: string;
  hsnSacCode?: string | null;
  quantity: number;
  unit?: string;
  unitPrice: number;
  gstRate?: number;
}

export interface CalculatedLineItemTax extends GstTaxBreakdown {
  itemIndex: number;
  description: string;
  hsnSacCode?: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
}

export interface OrderTaxBreakdown {
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  utgstTotal: number;
  igstTotal: number;
  totalTax: number;
  grossTotal: number;
  lineItems: CalculatedLineItemTax[];
}

function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates statutory GST splitting for a single line item given its taxable amount,
 * statutory GST rate, and Place of Supply determination.
 *
 * Statutory Splitting Invariant:
 * 1. Inter-State: IGST Rate = GST Rate, CGST = 0, SGST = 0, UTGST = 0.
 * 2. Intra-State (State / UT with legislature): CGST Rate = GST Rate / 2, SGST Rate = GST Rate / 2, UTGST = 0, IGST = 0.
 * 3. Intra-State (UT without legislature): CGST Rate = GST Rate / 2, UTGST Rate = GST Rate / 2, SGST = 0, IGST = 0.
 * 4. Line equality: totalAmount === taxableAmount + totalTax
 */
export function calculateGstTaxBreakdown(
  taxableAmount: number,
  gstRate: number,
  pos: { isInterState: boolean; isUnionTerritory: boolean },
): GstTaxBreakdown {
  const cleanTaxable = round2(taxableAmount);
  const cleanRate = round2(Math.max(0, gstRate));

  if (cleanRate === 0 || cleanTaxable <= 0) {
    return {
      taxableAmount: cleanTaxable,
      gstRate: 0,
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      utgstRate: 0,
      utgstAmount: 0,
      igstRate: 0,
      igstAmount: 0,
      totalTax: 0,
      totalAmount: cleanTaxable,
    };
  }

  if (pos.isInterState) {
    // Inter-State supply -> IGST
    const igstRate = cleanRate;
    const igstAmount = round2((cleanTaxable * igstRate) / 100);
    const totalTax = igstAmount;
    const totalAmount = round2(cleanTaxable + totalTax);

    return {
      taxableAmount: cleanTaxable,
      gstRate: cleanRate,
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      utgstRate: 0,
      utgstAmount: 0,
      igstRate,
      igstAmount,
      totalTax,
      totalAmount,
    };
  }

  // Intra-State supply -> Split 50% / 50%
  const halfRate = round2(cleanRate / 2);
  const halfAmount = round2((cleanTaxable * halfRate) / 100);

  if (pos.isUnionTerritory) {
    // Intra-UT supply in Union Territory without legislature -> CGST + UTGST
    const cgstRate = halfRate;
    const cgstAmount = halfAmount;
    const utgstRate = halfRate;
    const utgstAmount = halfAmount;
    const totalTax = round2(cgstAmount + utgstAmount);
    const totalAmount = round2(cleanTaxable + totalTax);

    return {
      taxableAmount: cleanTaxable,
      gstRate: cleanRate,
      cgstRate,
      cgstAmount,
      sgstRate: 0,
      sgstAmount: 0,
      utgstRate,
      utgstAmount,
      igstRate: 0,
      igstAmount: 0,
      totalTax,
      totalAmount,
    };
  }

  // Standard Intra-State supply -> CGST + SGST
  const cgstRate = halfRate;
  const cgstAmount = halfAmount;
  const sgstRate = halfRate;
  const sgstAmount = halfAmount;
  const totalTax = round2(cgstAmount + sgstAmount);
  const totalAmount = round2(cleanTaxable + totalTax);

  return {
    taxableAmount: cleanTaxable,
    gstRate: cleanRate,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    utgstRate: 0,
    utgstAmount: 0,
    igstRate: 0,
    igstAmount: 0,
    totalTax,
    totalAmount,
  };
}

/**
 * Calculates line-by-line and aggregate order tax breakdown for an array of items.
 */
export function calculateOrderTaxBreakdown(
  items: LineItemTaxInput[],
  pos: PlaceOfSupplyResult | { isInterState: boolean; isUnionTerritory: boolean },
): OrderTaxBreakdown {
  let taxableTotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let utgstTotal = 0;
  let igstTotal = 0;

  const calculatedItems: CalculatedLineItemTax[] = items.map((item, index) => {
    const qty = Number(item.quantity) || 1;
    const rate = Number(item.unitPrice) || 0;
    const lineTaxable = round2(qty * rate);
    const lineGstRate = item.gstRate != null ? Number(item.gstRate) : 18.0;

    const breakdown = calculateGstTaxBreakdown(lineTaxable, lineGstRate, pos);

    taxableTotal = round2(taxableTotal + breakdown.taxableAmount);
    cgstTotal = round2(cgstTotal + breakdown.cgstAmount);
    sgstTotal = round2(sgstTotal + breakdown.sgstAmount);
    utgstTotal = round2(utgstTotal + breakdown.utgstAmount);
    igstTotal = round2(igstTotal + breakdown.igstAmount);

    return {
      itemIndex: item.itemIndex ?? index + 1,
      description: item.description || `Line Item #${index + 1}`,
      hsnSacCode: item.hsnSacCode || null,
      quantity: qty,
      unit: item.unit || 'units',
      unitPrice: rate,
      ...breakdown,
    };
  });

  const totalTax = round2(cgstTotal + sgstTotal + utgstTotal + igstTotal);
  const grossTotal = round2(taxableTotal + totalTax);

  return {
    taxableTotal,
    cgstTotal,
    sgstTotal,
    utgstTotal,
    igstTotal,
    totalTax,
    grossTotal,
    lineItems: calculatedItems,
  };
}

/**
 * Reverse computes taxable base amount from a gross GST-inclusive amount.
 * Useful when gross price is fixed by quotation.
 */
export function calculateTaxableFromGross(
  grossAmount: number,
  gstRate = 18.0,
): {
  taxableAmount: number;
  taxAmount: number;
  grossAmount: number;
} {
  const cleanGross = round2(grossAmount);
  const cleanRate = round2(gstRate);
  const taxableAmount = round2(cleanGross / (1 + cleanRate / 100));
  const taxAmount = round2(cleanGross - taxableAmount);

  return {
    taxableAmount,
    taxAmount,
    grossAmount: cleanGross,
  };
}
