import { describe, it, expect } from 'vitest';
import {
  RequirementMode,
  REQUIREMENT_MODE_LABELS,
  requirementTypeForMode,
  SourcingMode,
  SupplierReach,
  RequiredByMode,
  FulfilmentMode,
} from './requirement-mode';
import { RequirementType } from './procurement';

describe('RequirementMode & Sourcing Enums', () => {
  it('correctly derives base RequirementType from RequirementMode', () => {
    expect(requirementTypeForMode(RequirementMode.PRODUCT_MATERIAL)).toBe(RequirementType.PRODUCT);
    expect(requirementTypeForMode(RequirementMode.COMMODITY_TRADING)).toBe(RequirementType.PRODUCT);
    expect(requirementTypeForMode(RequirementMode.SERVICE)).toBe(RequirementType.SERVICE);
    expect(requirementTypeForMode(RequirementMode.PROJECT_CONTRACT)).toBe(RequirementType.PROJECT);
    expect(requirementTypeForMode(RequirementMode.OTHER)).toBeNull();
  });

  it('exposes comprehensive human-readable labels for all requirement modes', () => {
    for (const mode of Object.values(RequirementMode)) {
      expect(REQUIREMENT_MODE_LABELS[mode]).toBeDefined();
      expect(typeof REQUIREMENT_MODE_LABELS[mode]).toBe('string');
    }
  });

  it('provides canonical SourcingMode options including OPEN_RFQ_TENDER and IDENTITY_PROTECTED', () => {
    expect(SourcingMode.IDENTITY_PROTECTED).toBe('IDENTITY_PROTECTED');
    expect(SourcingMode.OPEN_RFQ_TENDER).toBe('OPEN_RFQ_TENDER');
    expect(SourcingMode.OPEN_RFQ).toBe('OPEN_RFQ');
  });

  it('provides canonical SupplierReach options orthogonal to geographic reach', () => {
    expect(SupplierReach.CURATED_VERIFIED).toBe('CURATED_VERIFIED');
    expect(SupplierReach.EXISTING_SUCCESSFUL).toBe('EXISTING_SUCCESSFUL');
    expect(SupplierReach.EXISTING_PLUS_EXPANDED).toBe('EXISTING_PLUS_EXPANDED');
    expect(SupplierReach.ALL_ELIGIBLE).toBe('ALL_ELIGIBLE');
  });

  it('provides canonical RequiredByMode and FulfilmentMode values', () => {
    expect(RequiredByMode.IMMEDIATE).toBe('IMMEDIATE');
    expect(RequiredByMode.WITHIN_DAYS).toBe('WITHIN_DAYS');
    expect(FulfilmentMode.SUPPLIER_DELIVERY).toBe('SUPPLIER_DELIVERY');
    expect(FulfilmentMode.BUYER_PICKUP).toBe('BUYER_PICKUP');
  });
});
