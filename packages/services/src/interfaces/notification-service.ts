export type NotificationChannel = 'IN_APP' | 'EMAIL';

export interface NotificationEvent {
  recipientId: string;
  channel: NotificationChannel;
  eventType: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
}

/**
 * Future-extensible notification boundary.
 * MVP: in-app + email only.
 */
export interface NotificationService {
  send(event: NotificationEvent): Promise<void>;
}
