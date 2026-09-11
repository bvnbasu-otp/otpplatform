export const NotificationChannel = {
  IN_APP: 'IN_APP',
  EMAIL: 'EMAIL',
} as const;

export type NotificationChannel =
  (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const NotificationStatus = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  READ: 'READ',
  FAILED: 'FAILED',
} as const;

export type NotificationStatus =
  (typeof NotificationStatus)[keyof typeof NotificationStatus];
