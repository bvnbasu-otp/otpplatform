import type { NotificationEvent, NotificationService } from '../interfaces/notification-service';

export class InAppNotificationService implements NotificationService {
  readonly sent: NotificationEvent[] = [];

  async send(event: NotificationEvent): Promise<void> {
    const forbidden = ['supplierId', 'supplier_id', 'businessName', 'business_name'];
    for (const key of forbidden) {
      if (event.payload && key in event.payload) {
        throw new Error(`Notification blind violation: ${key}`);
      }
    }
    this.sent.push({ ...event });
  }
}
