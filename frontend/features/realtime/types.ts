export type RealtimeEventType =
  | 'COURT_TOKEN_UPDATED'
  | 'HEARING_RESCHEDULED'
  | 'HEARING_CHANGED'
  | 'JUDGMENT_PRONOUNCED'
  | 'JUDGMENT_DOCUMENT_UPLOADED'
  | 'REMINDER_DUE'
  | 'NOTIFICATION_CREATED'
  | 'NOTIFICATION_READ';

export type RealtimeConnectionStatus =
  | 'CONNECTED'
  | 'CONNECTING'
  | 'RECONNECTING'
  | 'OFFLINE';

export interface RealtimeEvent<T = Record<string, unknown>> {
  id: number;
  event_uuid: string;
  event_type: RealtimeEventType;
  payload: T;
  created_at: string;
}

export interface RealtimeEventsResponse {
  events: RealtimeEvent[];
  latest_event_id: number;
  count: number;
  since_id: number;
  has_more: boolean;
  cursor_expired?: boolean;
  requires_full_sync?: boolean;
}

export interface RealtimeTicketResponse {
  ticket: string;
  expires_in: number;
}

export interface RealtimeStatusResponse {
  status: string;
  redis_connected: boolean;
  latest_event_id: number;
  streaming_supported: boolean;
}

export interface CourtTokenPayload {
  case_id: number;
  case_number: string;
  court_hall_number: number;
  token_number: number | null;
  status: string;
  stage: string;
  is_bench_sitting: boolean;
  observed_at: string;
}

export interface JudgmentPayload {
  judgment_id: number;
  case_id: number;
  case_number: string;
  judgment_date: string;
  judgment_type: string;
  order_number: string;
  document_link: string;
  has_document: boolean;
  event: 'PRONOUNCED' | 'DOCUMENT_UPLOADED' | 'UPDATED';
}

export interface HearingChangePayload {
  hearing_id: number;
  case_id: number;
  case_number: string;
  change_type: string;
  hearing_date: string;
  court_hall_number: number;
  item_number: number;
  status: string;
  details: Record<string, unknown>;
}

export interface NotificationPayload {
  notification_id: number;
  title: string;
  body: string;
  category: string;
  data_payload: Record<string, unknown>;
  sent_at: string;
}

export interface NotificationReadPayload {
  read_notification_ids: number[];
  unread_count: number;
}
