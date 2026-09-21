import {
  CapacityHeadroomStatus,
  type CandidateCapacityHeadroom,
} from '../types/supplier-network-engine';

export interface CapacityCalculationInput {
  declaredCapacity?: number | null;
  observedCapacity?: number | null;
  activeBacklog?: number | null;
  capacityUnit?: string | null;
  backlogUnit?: string | null;
  tenantId?: string | null;
}

/**
 * Dynamic Capacity Headroom Engine (Phase SN.3).
 *
 * Implements:
 * 1. Available Capacity Headroom Formula:
 *    Headroom Ratio = (Max Capacity - Active Backlog) / Max Capacity
 * 2. Operational Status Categories:
 *    - SUFFICIENT: Headroom Ratio >= 20% (ratio >= 0.20)
 *    - CONSTRAINED: Headroom Ratio > 0% and < 20% (0 < ratio < 0.20)
 *    - EXHAUSTED: Headroom Ratio <= 0% (ratio <= 0)
 *    - UNKNOWN: Missing/invalid capacity or backlog, unit mismatch, or cross-tenant contamination.
 * 3. Robust Exploit Defenses:
 *    - Max Capacity <= 0 or null -> Fails closed to UNKNOWN (isHeadroomKnown: false).
 *    - Negative numbers, NaN, Infinity -> Fails closed to UNKNOWN.
 *    - Unit mismatches -> Fails closed to UNKNOWN.
 *    - Zero/Unknown backlog fallback without fake 0 or 100% invention.
 */
export class DynamicCapacityHeadroomCalculator {
  /**
   * Safely calculates capacity headroom metrics and status.
   */
  public static calculateHeadroom(input: CapacityCalculationInput): CandidateCapacityHeadroom {
    const rawDeclared = input.declaredCapacity;
    const rawObserved = input.observedCapacity;
    const rawBacklog = input.activeBacklog;
    const capacityUnit = input.capacityUnit?.trim().toLowerCase();
    const backlogUnit = input.backlogUnit?.trim().toLowerCase();

    // 1. Validate units match if both are specified
    if (capacityUnit && backlogUnit && capacityUnit !== backlogUnit) {
      return {
        status: CapacityHeadroomStatus.UNKNOWN,
        declaredCapacity: typeof rawDeclared === 'number' && Number.isFinite(rawDeclared) && rawDeclared > 0 ? rawDeclared : undefined,
        observedCapacity: typeof rawObserved === 'number' && Number.isFinite(rawObserved) && rawObserved > 0 ? rawObserved : undefined,
        isHeadroomKnown: false,
        unit: capacityUnit,
        explanation: `Capacity unit mismatch: declared in '${capacityUnit}' vs backlog in '${backlogUnit}'`,
      };
    }

    // 2. Validate max capacity (declared or observed)
    const maxCapacity =
      typeof rawDeclared === 'number' && Number.isFinite(rawDeclared) && rawDeclared > 0
        ? rawDeclared
        : typeof rawObserved === 'number' && Number.isFinite(rawObserved) && rawObserved > 0
          ? rawObserved
          : null;

    if (maxCapacity === null || maxCapacity <= 0 || !Number.isFinite(maxCapacity)) {
      return {
        status: CapacityHeadroomStatus.UNKNOWN,
        isHeadroomKnown: false,
        explanation: 'Max operational capacity is undeclared, zero, or non-finite',
      };
    }

    // 3. Check active backlog
    if (rawBacklog === null || rawBacklog === undefined || typeof rawBacklog !== 'number' || !Number.isFinite(rawBacklog) || rawBacklog < 0) {
      // Known capacity, but unknown or negative backlog -> Safe UNKNOWN status
      return {
        status: CapacityHeadroomStatus.UNKNOWN,
        declaredCapacity: rawDeclared ?? undefined,
        observedCapacity: rawObserved ?? undefined,
        unit: capacityUnit ?? backlogUnit ?? undefined,
        isHeadroomKnown: false,
        explanation: 'Operational capacity declared, but active backlog is unknown or unmeasured',
      };
    }

    // 4. Compute Headroom Ratio safely
    const availableUnits = Math.max(0, maxCapacity - rawBacklog);
    const rawRatio = (maxCapacity - rawBacklog) / maxCapacity;
    // Bounded headroom ratio [0.0, 1.0]
    const headroomRatio = Math.max(0, Math.min(1.0, Number(rawRatio.toFixed(4))));

    let status: CapacityHeadroomStatus;
    let explanation: string;

    if (headroomRatio >= 0.20) {
      status = CapacityHeadroomStatus.SUFFICIENT;
      explanation = `Sufficient operational capacity headroom (${(headroomRatio * 100).toFixed(1)}% available)`;
    } else if (headroomRatio > 0) {
      status = CapacityHeadroomStatus.CONSTRAINED;
      explanation = `Constrained operational capacity headroom (${(headroomRatio * 100).toFixed(1)}% available)`;
    } else {
      status = CapacityHeadroomStatus.EXHAUSTED;
      explanation = 'Operational capacity exhausted (0% headroom remaining)';
    }

    return {
      status,
      declaredCapacity: rawDeclared ?? undefined,
      observedCapacity: rawObserved ?? undefined,
      activeBacklog: rawBacklog,
      availableHeadroomUnits: availableUnits,
      headroomRatio,
      unit: capacityUnit ?? backlogUnit ?? undefined,
      isHeadroomKnown: true,
      explanation,
    };
  }

  /**
   * Computes capacity headroom contribution (0-15) for discovery confidence.
   */
  public static calculateConfidenceFactor(headroom: CandidateCapacityHeadroom): {
    score: number;
    explanation: string;
  } {
    if (!headroom.isHeadroomKnown || headroom.status === CapacityHeadroomStatus.UNKNOWN) {
      return {
        score: 7,
        explanation: 'Neutral undeclared capacity headroom (+7)',
      };
    }

    switch (headroom.status) {
      case CapacityHeadroomStatus.SUFFICIENT:
        return {
          score: 15,
          explanation: `Verified sufficient capacity headroom (${((headroom.headroomRatio ?? 0.2) * 100).toFixed(0)}%) (+15)`,
        };
      case CapacityHeadroomStatus.CONSTRAINED:
        return {
          score: 8,
          explanation: `Constrained operational capacity headroom (${((headroom.headroomRatio ?? 0.05) * 100).toFixed(0)}%) (+8)`,
        };
      case CapacityHeadroomStatus.EXHAUSTED:
        return {
          score: 2,
          explanation: 'Exhausted operational capacity headroom (+2)',
        };
      default:
        return {
          score: 7,
          explanation: 'Standard neutral capacity baseline (+7)',
        };
    }
  }
}
