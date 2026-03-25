export type StatusType = 'MDF_ONLY' | 'RETURN' | 'HARDWARE' | 'OTHER';
export type UserRole = 'admin' | 'operator';

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

export interface ConsistencyNote {
  id: string;
  orderNumber: string;
  note: string;
  updatedAt: number;
  updatedByUid: string;
  updatedByEmail?: string | null;
}
