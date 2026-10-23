export interface WahaDeliveryStatus {
  ack?: number | string | null;
  status?: number | string | null;
  deliveryStatus?: number | string | null;
}

export interface WahaAcceptedMessage extends WahaDeliveryStatus {
  id?: string | null;
  messageId?: string | null;
  key?: { id?: string | null } | null;
}

export interface WahaDeliveryEvidence {
  delivered: true;
  messageId: string;
  acknowledgement: number | string;
  observations: Array<{ attempt: number; ack: number | string | null }>;
}

export function isActuallyDelivered(record: WahaDeliveryStatus | null | undefined): boolean;

export function verifyWahaDelivery(input: {
  sendMessage: () => Promise<WahaAcceptedMessage>;
  getMessageStatus: (messageId: string) => Promise<WahaDeliveryStatus>;
  maxStatusChecks?: number;
}): Promise<WahaDeliveryEvidence>;
