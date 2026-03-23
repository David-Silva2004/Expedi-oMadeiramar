export type StatusType = 'MDF_ONLY' | 'RETURN' | 'HARDWARE' | 'OTHER';

export interface ShippingEntry {
  id: string;
  userId: string;
  date: string;
  orderNumber: string;
  customer: string;
  statusType: StatusType;
  volumes?: number;
  otherDescription?: string;
  createdAt: number;
}
