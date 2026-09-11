export interface AuditEventInput {
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export interface AuditService {
  log(event: AuditEventInput): Promise<void>;
}
