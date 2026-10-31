/**
 * OTP Next — Administration, Compliance & Telemetry Contracts
 * Modules 25, 26, 28
 */

import type { Result } from '../types/result';
import type { ServiceError } from '../types/errors';
import type { ActorContext } from '../types/actor-context';

// ==========================================
// Module 25: Audit & Compliance
// ==========================================

export interface AuditRecordDto {
  auditId: string;
  eventName: string;
  actorProfileId: string;
  actorPersona: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  ipAddress?: string | null;
  recordedAt: string;
}

export interface AuditComplianceContract {
  recordAuditEvent(actor: ActorContext, eventName: string, entityType: string, entityId: string, payload: Record<string, unknown>): Promise<Result<{ recorded: boolean }, ServiceError>>;
  queryAuditTrail(actor: ActorContext, entityId: string): Promise<Result<AuditRecordDto[], ServiceError>>;
}

// ==========================================
// Module 26: SuperAdmin & Platform Administration
// ==========================================

export interface PlatformSystemHealthDto {
  isOperational: boolean;
  databaseLatencyMs: number;
  wahaGatewayStatus: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  googlePlacesQuotaRemaining: number;
  activeRfqsCount: number;
  activeSuppliersCount: number;
  timestamp: string;
}

export interface PlatformAdministrationContract {
  getSystemHealth(actor: ActorContext): Promise<Result<PlatformSystemHealthDto, ServiceError>>;
  freezeSupplierAccount(actor: ActorContext, supplierId: string, reason: string): Promise<Result<{ frozen: boolean }, ServiceError>>;
  unfreezeSupplierAccount(actor: ActorContext, supplierId: string): Promise<Result<{ unfrozen: boolean }, ServiceError>>;
}

// ==========================================
// Module 28: Reporting & Operational Monitoring
// ==========================================

export interface FunnelMetricsDto {
  period: string; // e.g. "CURRENT_MONTH"
  rfqsCreated: number;
  rfqsPublished: number;
  rfqsWithQuotes: number;
  rfqsAwarded: number;
  averageQuotesPerRfq: number;
  averageCycleTimeDays: number;
}

export interface OperationalReportingContract {
  getFunnelMetrics(actor: ActorContext): Promise<Result<FunnelMetricsDto, ServiceError>>;
}
