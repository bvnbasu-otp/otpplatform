import { computeDeterministicHmac } from './procurement-communications';

/**
 * OTP Phase 6.5: Progressive Milestone Inspection & Quality Sign-Off Domain Model
 *
 * Implements rigorous quality inspection verification, evidence attachment security,
 * cryptographic inspector digital sign-off, rework cycle tracking, and progressive
 * invoicing gatekeeping.
 */

export type InspectionType =
  | 'PHYSICAL_ONSITE'
  | 'DOCUMENT_VERIFICATION'
  | 'REMOTE_AUDIT'
  | 'THIRD_PARTY_QA';

export const INSPECTION_TYPES: readonly InspectionType[] = [
  'PHYSICAL_ONSITE',
  'DOCUMENT_VERIFICATION',
  'REMOTE_AUDIT',
  'THIRD_PARTY_QA',
] as const;

export type InspectionStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'REWORK_REQUESTED';

export const INSPECTION_STATUSES: readonly InspectionStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'REWORK_REQUESTED',
] as const;

export type InspectionItemCategory =
  | 'MATERIALS'
  | 'COMPLETION'
  | 'SAFETY'
  | 'QUALITY'
  | 'SPECIFICATION';

export const INSPECTION_ITEM_CATEGORIES: readonly InspectionItemCategory[] = [
  'MATERIALS',
  'COMPLETION',
  'SAFETY',
  'QUALITY',
  'SPECIFICATION',
] as const;

export type InspectionItemStatus =
  | 'PASSED'
  | 'FAILED'
  | 'WARNING'
  | 'NOT_APPLICABLE';

export const INSPECTION_ITEM_STATUSES: readonly InspectionItemStatus[] = [
  'PASSED',
  'FAILED',
  'WARNING',
  'NOT_APPLICABLE',
] as const;

export interface InspectionEvidenceMetadata {
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  sha256Hash: string;
  uploadedAt: string;
}

export interface WorkOrderInspectionItem {
  id: string;
  inspectionId: string;
  itemCode: string;
  category: InspectionItemCategory;
  description: string;
  status: InspectionItemStatus;
  score?: number | null;
  evidenceUrls: string[];
  evidenceMetadata: InspectionEvidenceMetadata[];
  notes?: string | null;
  createdAt: string;
}

export interface WorkOrderInspection {
  id: string;
  workOrderId: string;
  milestoneId: string;
  organizationId: string;
  inspectorId: string;
  inspectionType: InspectionType;
  status: InspectionStatus;
  checklistTemplateCode: string;
  overallScore?: number | null;
  passed: boolean;
  digitalSignoffHash?: string | null;
  reworkReason?: string | null;
  reworkCount: number;
  evidenceVersion: number;
  notes?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  items?: WorkOrderInspectionItem[];
}

export interface InspectionScoreResult {
  overallScore: number;
  passed: boolean;
  passedCount: number;
  failedCount: number;
  warningCount: number;
  totalCount: number;
  passPercentage: number;
}

/**
 * Calculates overall score and pass/fail determination from checklist items.
 */
export function calculateInspectionScore(
  items: Array<{ status: InspectionItemStatus; score?: number | null }>,
  passingScoreThreshold = 80,
): InspectionScoreResult {
  if (!items || items.length === 0) {
    return {
      overallScore: 0,
      passed: false,
      passedCount: 0,
      failedCount: 0,
      warningCount: 0,
      totalCount: 0,
      passPercentage: 0,
    };
  }

  let passedCount = 0;
  let failedCount = 0;
  let warningCount = 0;
  let applicableCount = 0;
  let scoreSum = 0;
  let scoredItemsCount = 0;

  for (const item of items) {
    if (item.status === 'NOT_APPLICABLE') continue;

    applicableCount++;
    if (item.status === 'PASSED') {
      passedCount++;
    } else if (item.status === 'FAILED') {
      failedCount++;
    } else if (item.status === 'WARNING') {
      warningCount++;
    }

    if (typeof item.score === 'number' && !isNaN(item.score)) {
      scoreSum += item.score;
      scoredItemsCount++;
    }
  }

  const passPercentage = applicableCount > 0 ? Math.round((passedCount / applicableCount) * 100) : 100;
  const overallScore = scoredItemsCount > 0 ? Math.round((scoreSum / scoredItemsCount) * 100) / 100 : passPercentage;

  // Passed if no FAILED items and overall score meets or exceeds threshold
  const passed = failedCount === 0 && overallScore >= passingScoreThreshold;

  return {
    overallScore,
    passed,
    passedCount,
    failedCount,
    warningCount,
    totalCount: items.length,
    passPercentage,
  };
}

/**
 * Generates an immutable cryptographic digital sign-off hash.
 */
export function generateDigitalSignoffHash(
  inspectionId: string,
  milestoneId: string,
  inspectorId: string,
  overallScore: number,
  timestamp: string,
  secretSalt: string,
): string {
  const message = `${inspectionId}:${milestoneId}:${inspectorId}:${overallScore.toFixed(2)}:${timestamp}`;
  return computeDeterministicHmac(message, secretSalt);
}

/**
 * Verifies the validity of an inspector's digital sign-off hash.
 */
export function verifyDigitalSignoffHash(
  signoffHash: string,
  inspectionId: string,
  milestoneId: string,
  inspectorId: string,
  overallScore: number,
  timestamp: string,
  secretSalt: string,
): boolean {
  if (!signoffHash || !secretSalt) return false;
  const expected = generateDigitalSignoffHash(
    inspectionId,
    milestoneId,
    inspectorId,
    overallScore,
    timestamp,
    secretSalt,
  );
  return signoffHash.toLowerCase() === expected.toLowerCase();
}

/**
 * Determines whether a milestone is eligible for progressive invoice generation.
 * INVARIANT: Progressive invoice requires an APPROVED inspection with passed=true.
 */
export function isMilestoneInvoiceEligible(
  inspectionStatus: InspectionStatus,
  passed: boolean,
): boolean {
  return inspectionStatus === 'APPROVED' && passed === true;
}

export const ALLOWED_EVIDENCE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export const MAX_EVIDENCE_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Validates file mime type and size for evidence uploads.
 */
export function validateInspectionEvidenceAttachment(
  fileSizeBytes: number,
  mimeType: string,
  allowedMimeTypes = ALLOWED_EVIDENCE_MIME_TYPES,
  maxSizeBytes = MAX_EVIDENCE_FILE_SIZE_BYTES,
): { valid: boolean; error?: string } {
  if (fileSizeBytes <= 0) {
    return { valid: false, error: 'File size must be greater than zero bytes.' };
  }
  if (fileSizeBytes > maxSizeBytes) {
    return {
      valid: false,
      error: `File size exceeds the maximum limit of ${maxSizeBytes / (1024 * 1024)}MB.`,
    };
  }
  if (!allowedMimeTypes.includes(mimeType)) {
    return {
      valid: false,
      error: `File MIME type '${mimeType}' is not permitted for inspection evidence.`,
    };
  }
  return { valid: true };
}
