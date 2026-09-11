import type { AuditEventInput, AuditService } from '../interfaces/audit-service';

/** Wires the in-memory (or injected) audit implementation for application use. */
export class AuditAppService implements AuditService {
  constructor(private readonly inner: AuditService) {}

  async log(event: AuditEventInput): Promise<void> {
    return this.inner.log(event);
  }
}
