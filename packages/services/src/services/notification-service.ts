import type {
  NotificationEvent,
  NotificationService,
} from '../interfaces/notification-service';

/** Wires the in-app notification implementation for application use. */
export class NotificationAppService implements NotificationService {
  constructor(private readonly inner: NotificationService) {}

  async send(event: NotificationEvent): Promise<void> {
    return this.inner.send(event);
  }
}
