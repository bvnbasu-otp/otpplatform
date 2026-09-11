export type NotificationActionType =
  | 'RFQ_INVITED'
  | 'QUOTE_RECEIVED'
  | 'VOTE_REQUESTED'
  | 'VOTE_CAST'
  | 'PO_ISSUED'
  | 'PO_ACCEPTED'
  | 'WORK_PROGRESS_UPDATED'
  | 'INVOICE_SUBMITTED'
  | 'PAYMENT_RECORDED'
  | 'RFQ_NOT_AWARDED'
  | 'PROACTIVE_MAINTENANCE'
  | 'SYSTEM_ALERT'
  | string;

export type NotificationStatus = 'PENDING' | 'SENT' | 'READ' | 'FAILED';

export interface AppNotification {
  id: string;
  profile_id: string;
  recipient_name?: string | null;
  recipient_email?: string | null;
  recipient_is_admin?: boolean;
  channel: 'IN_APP' | 'EMAIL';
  status: NotificationStatus;
  event_type: string;
  action_type?: NotificationActionType;
  title: string;
  body: string;
  link?: string;
  payload?: Record<string, any>;
  sent_at?: string | null;
  read_at?: string | null;
  created_at: string;
  updated_at: string;
  is_demo?: boolean;
}

