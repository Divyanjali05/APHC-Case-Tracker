export interface JudgmentItem {
  id: number;
  case: number;
  judgment_date: string;
  judgment_type?: string;
  order_number?: string;
  bench?: string;
  summary?: string;
  document_link?: string;
  created_at: string;
  updated_at: string;
}

export interface CaseItem {
  id: number;
  case_type: string;
  case_number: string;
  filing_year: number;
  petitioner: string;
  respondent: string;
  petitioner_advocate?: string;
  respondent_advocate?: string;
  current_stage: string;
  status?: string;
  status_details?: {
    status: string;
    next_hearing_date?: string | null;
    judgment_date?: string | null;
    has_judgment: boolean;
    has_hearings: boolean;
    judgment_id?: number | null;
  };
  effective_next_hearing_date?: string | null;
  judgment_date?: string | null;
  latest_judgment?: JudgmentItem | null;
  judgments?: JudgmentItem[];
  bench?: string;
  court_hall_number?: number;
  next_hearing_date?: string;
  hearings?: HearingItem[];
  created_at: string;
  updated_at: string;
}

export interface HearingItem {
  id: number;
  case: number;
  hearing_date: string;
  hearing_time?: string | null;
  status?: 'SCHEDULED' | 'RESCHEDULED' | 'COMPLETED' | 'CANCELLED';
  court_hall_number?: number;
  item_number?: number;
  business_conducted?: string;
  next_date?: string;
  previous_hearing_date?: string | null;
  previous_hearing_time?: string | null;
  rescheduled_reason?: string;
  is_rescheduled?: boolean;
  case_details?: {
    id: number;
    case_type: string;
    case_number: string;
    filing_year: number;
    petitioner: string;
    respondent: string;
    formatted_case_number: string;
  };
  created_at: string;
  updated_at?: string;
}

export interface CaseHistoryItem {
  id: number;
  case: number;
  event_type: string;
  field_name?: string;
  old_value?: string;
  new_value?: string;
  description: string;
  source: 'MANUAL' | 'SYSTEM' | 'SYNC';
  changed_by?: {
    id: number;
    username: string;
    full_name?: string;
  } | null;
  created_at: string;
}

export interface ReminderItem {
  id: number;
  case?: number;
  case_details?: {
    id: number;
    case_type: string;
    case_number: string;
    filing_year: number;
    petitioner: string;
    respondent: string;
    formatted_case_number: string;
  } | null;
  hearing?: number | null;
  title: string;
  description?: string;
  reminder_type: 'HEARING' | 'FILING' | 'BATTA' | 'GENERAL';
  reminder_interval_hours?: number | null;
  status?: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELLED' | 'DISMISSED';
  due_date: string;
  is_completed: boolean;
  notification_sent_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface ReminderPreferenceItem {
  id: number;
  remind_24h_before: boolean;
  remind_1h_before: boolean;
  email_notifications: boolean;
  push_notifications: boolean;
  judgment_push_notifications: boolean;
  hearing_change_push_notifications: boolean;
  created_at: string;
  updated_at: string;
}

export type NotificationCategory =
  | 'CAUSELIST'
  | 'TOKEN_ALERT'
  | 'REMINDER'
  | 'JUDGMENT'
  | 'HEARING_CHANGE'
  | 'GENERAL';

export interface NotificationItem {
  id: number;
  title: string;
  body: string;
  category: NotificationCategory;
  data_payload?: Record<string, unknown>;
  is_read: boolean;
  sent_at: string;
}

export interface RescheduleHearingPayload {
  new_hearing_date: string;
  new_hearing_time?: string;
  reason?: string;
  court_hall_number?: number;
  item_number?: number;
}

export interface CourtHallItem {
  id: number;
  hall_number: number;
  bench_name: string;
  presiding_judges?: string;
  is_active: boolean;
  status?: {
    current_item_number: number;
    current_stage: string;
    last_polled_at: string;
  };
}

export interface TokenAlertItem {
  id: number;
  case: number;
  court_hall: number;
  listed_item_number: number;
  alert_threshold: number;
  distance: number;
  is_notified: boolean;
}

export interface HealthCheckResponse {
  status: string;
  service: string;
  version: string;
  database: string;
  engine: string;
  timestamp: string;
}

export type NormalizedCourtStatusType =
  | 'NOT_LISTED'
  | 'LISTED'
  | 'TOKEN_ALLOCATED'
  | 'WAITING'
  | 'IN_PROGRESS'
  | 'CALLED'
  | 'COMPLETED'
  | 'ADJOURNED'
  | 'CANCELLED'
  | 'UNKNOWN';

export interface CourtListingItem {
  id: number;
  case: number;
  court_name: string;
  bench?: string;
  court_hall?: number | null;
  listing_date?: string | null;
  session?: string;
  item_number?: number | null;
  token_number?: string;
  source_status: string;
  normalized_status: NormalizedCourtStatusType;
  normalized_status_display: string;
  provider_name: string;
  last_synced_at?: string | null;
  is_mock: boolean;
  created_at: string;
  updated_at: string;
}

export interface CourtStatusObservationItem {
  id: number;
  case: number;
  court_listing?: number | null;
  source_status: string;
  normalized_status: NormalizedCourtStatusType;
  normalized_status_display: string;
  provider_name: string;
  observed_at: string;
  source_reference?: string;
  court_hall?: number | null;
  item_number?: number | null;
  token_number?: string;
  safe_metadata?: Record<string, unknown>;
  is_meaningful_change: boolean;
  is_alert_dispatched: boolean;
  created_at: string;
}

export interface CaseCourtStatusSummary {
  case_id: number;
  case_reference: string;
  normalized_status: NormalizedCourtStatusType;
  normalized_status_display: string;
  listing?: CourtListingItem | null;
  has_active_listing: boolean;
}

export interface SyncHealthStatus {
  status: string;
  provider: string;
  is_live: boolean;
  latency_ms?: number;
  configured?: boolean;
  notice: string;
  total_active_listings: number;
  last_sync_timestamp?: string | null;
}

export interface CourtStatusSyncResponse {
  detail: string;
  is_meaningful_change: boolean;
  previous_status?: NormalizedCourtStatusType | null;
  new_status?: NormalizedCourtStatusType | null;
  listing?: CourtListingItem | null;
  observation?: CourtStatusObservationItem | null;
  alert_generated: boolean;
}
