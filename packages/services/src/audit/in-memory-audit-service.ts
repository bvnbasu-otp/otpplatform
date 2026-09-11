import type { AuditEventInput, AuditService } from '../interfaces/audit-service';

export class InMemoryAuditService implements AuditService {
  readonly events: AuditEventInput[] = [];

  async log(event: AuditEventInput): Promise<void> {
    this.events.push({ ...event });
  }
}
