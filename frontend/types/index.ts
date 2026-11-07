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
  | 'GENERAL'
  | 'HEARING_REMINDER'
  | 'TOKEN_APPROACHING'
  | 'TOKEN_CALLED'
  | 'CASE_UPDATE'
  | 'CALENDAR_REMINDER'
  | 'COMPLIANCE_DEADLINE'
  | 'VOICE_TRANSCRIPTION_COMPLETED'
  | 'VOICE_TRANSCRIPTION_FAILED'
  | 'SYSTEM_ALERT';

export interface DeviceRegistrationPayload {
  expo_push_token: string;
  platform?: string;
  device_name?: string;
  device_id?: string;
  app_version?: string;
}

export interface DeviceDeactivationPayload {
  expo_push_token?: string;
  device_id?: string;
  all?: boolean;
}

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

export type TokenAlertStatus =
  | 'REGISTERED'
  | 'WAITING'
  | 'APPROACHING'
  | 'CALLED'
  | 'COMPLETED'
  | 'ADJOURNED'
  | 'CANCELLED'
  | 'UNKNOWN';

export interface TokenAlertRuleItem {
  id: number;
  advocate?: number;
  case: number;
  case_details?: {
    id: number;
    case_type: string;
    case_number: string;
    filing_year: number;
    petitioner: string;
    respondent: string;
    formatted_case_number: string;
  };
  court_hall: number;
  court_hall_details?: {
    id: number;
    hall_number: number;
    bench_name: string;
  };
  court_name: string;
  hearing_date: string;
  token_number: string;
  listed_item_number: number;
  bench_name: string;
  alert_threshold: number;
  alert_on_approach: boolean;
  alert_on_called: boolean;
  status: TokenAlertStatus;
  current_called_token: string;
  items_remaining?: number | null;
  distance: number;
  is_active: boolean;
  is_stale: boolean;
  last_synced_at?: string | null;
  sync_source: string;
  is_mock: boolean;
  approaching_alert_sent: boolean;
  called_alert_sent: boolean;
  is_notified: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTokenAlertPayload {
  case: number;
  court_hall: number;
  hearing_date: string;
  token_number: string;
  listed_item_number: number;
  alert_threshold?: number;
  alert_on_approach?: boolean;
  alert_on_called?: boolean;
  court_name?: string;
  bench_name?: string;
}

export interface UpdateTokenAlertPayload {
  alert_threshold?: number;
  alert_on_approach?: boolean;
  alert_on_called?: boolean;
  is_active?: boolean;
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

export interface DashboardSummary {
  total_cases: number;
  pending_cases: number;
  disposed_cases: number;
  adjourned_cases: number;
}

export interface DashboardHearingItem {
  id: number;
  case_id: number;
  case_number: string;
  petitioner: string;
  respondent: string;
  court_hall: number | null;
  item_number: number | null;
  judge: string;
  hearing_date: string;
  hearing_time: string | null;
  status: string;
}

export interface DashboardReminderItem {
  id: number;
  case_id: number | null;
  case_number: string | null;
  title: string;
  reminder_type: string;
  due_date: string;
  status: string;
}

export interface DashboardNotificationItem {
  id: number;
  title: string;
  body: string;
  category: string;
  is_read: boolean;
  sent_at: string;
  case_id: number | null;
}

export interface DashboardSyncStatus {
  last_synced_at: string | null;
  is_fresh: boolean;
  status: string;
}

export interface DashboardData {
  summary: DashboardSummary;
  today_hearings: DashboardHearingItem[];
  upcoming_hearings: DashboardHearingItem[];
  upcoming_reminders: DashboardReminderItem[];
  recent_notifications: DashboardNotificationItem[];
  sync_status: DashboardSyncStatus;
}

export type CaseDocumentCategory =
  | 'PETITION'
  | 'COUNTER_AFFIDAVIT'
  | 'REJOINDER'
  | 'JUDGMENT'
  | 'COURT_ORDER'
  | 'WRITTEN_SUBMISSIONS'
  | 'EVIDENCE'
  | 'SUPPORTING_DOCUMENTS'
  | 'OTHER';

export interface CaseDocumentItem {
  id: number;
  case: number;
  uploaded_by: number;
  uploaded_by_name?: string;
  title: string;
  document_type: CaseDocumentCategory;
  document_type_display: string;
  description?: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  download_url: string;
  created_at: string;
  updated_at: string;
}

export interface CaseNoteItem {
  id: number;
  case: number;
  advocate: number;
  advocate_name?: string;
  title: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export type VoiceTranscriptionStatus = 'NOT_STARTED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type VoiceTranscriptionLanguage = 'en' | 'te' | 'hi';

export interface VoiceNoteItem {
  id: number;
  case: number;
  case_number?: string;
  advocate: number;
  advocate_name?: string;
  title: string;
  audio_file_name?: string;
  audio_duration_seconds: number;
  audio_file_size_bytes: number;
  audio_mime_type: string;
  transcription_status: VoiceTranscriptionStatus;
  transcription_status_display?: string;
  transcription_language: VoiceTranscriptionLanguage;
  transcription_language_display?: string;
  original_transcript: string;
  transcript: string;
  transcription_provider: string;
  is_mock: boolean;
  transcription_error?: string;
  transcribed_at?: string | null;
  recorded_at: string;
  created_at: string;
  updated_at: string;
  audio_stream_url: string;
}

export interface CreateVoiceNotePayload {
  title?: string;
  audio_file: {
    uri: string;
    name: string;
    type: string;
    size?: number;
  } | Blob | File;
  transcription_language?: VoiceTranscriptionLanguage;
  audio_duration_seconds?: number;
  recorded_at?: string;
  auto_transcribe?: boolean;
}

export interface UpdateVoiceNotePayload {
  title?: string;
  transcript?: string;
  transcription_language?: VoiceTranscriptionLanguage;
}

export interface OfflineVoiceQueueItem {
  id: string;
  caseId: number;
  title: string;
  audioUri: string;
  audioName: string;
  audioMimeType: string;
  audioDurationSeconds: number;
  audioSizeBytes: number;
  language: VoiceTranscriptionLanguage;
  recordedAt: string;
  status: 'PENDING' | 'UPLOADING' | 'FAILED';
  errorMessage?: string;
  retryCount: number;
}

export type CalendarViewType = 'day' | 'week' | 'month' | 'custom';

export type CalendarEventType = 'HEARING' | 'REMINDER' | 'DEADLINE' | 'TOKEN';

export interface AgendaHearingItem {
  id: number;
  event_type: 'HEARING';
  title: string;
  case_id: number;
  case_number: string;
  case_type?: string;
  petitioner?: string;
  respondent?: string;
  court_name?: string;
  court_hall_number?: number | string;
  item_number?: number | null;
  bench?: string;
  hearing_date: string;
  hearing_time: string | null;
  is_all_day: boolean;
  status: string;
  business_conducted?: string;
}

export interface AgendaReminderItem {
  id: number;
  event_type: 'REMINDER';
  title: string;
  description: string;
  case_id?: number | null;
  case_number?: string | null;
  due_date: string;
  date: string;
  time: string;
  reminder_type: string;
  status: string;
  is_completed: boolean;
}

export interface AgendaTokenItem {
  id: number;
  event_type: 'TOKEN';
  title: string;
  token_number: string | number;
  item_number?: number;
  court_hall_number: number | string;
  court_name: string;
  hearing_date: string;
  status: string;
  current_called_token?: string;
  items_remaining?: number | null;
  last_synced_at?: string | null;
  case_id?: number | null;
}

export type AgendaEventUnion = AgendaHearingItem | AgendaReminderItem | AgendaTokenItem;

export interface AgendaSummary {
  total_events: number;
  today_hearings: number;
  upcoming_hearings: number;
  pending_reminders: number;
  completed_events: number;
}

export interface AgendaResponse {
  view: CalendarViewType;
  selected_date: string;
  start_date: string;
  end_date: string;
  timezone: string;
  summary: AgendaSummary;
  today_hearings: AgendaHearingItem[];
  upcoming_hearings: AgendaHearingItem[];
  reminders: AgendaReminderItem[];
  compliance_deadlines: AgendaReminderItem[];
  token_events: AgendaTokenItem[];
  events_by_date: Record<string, AgendaEventUnion[]>;
}

export interface CreatePersonalReminderPayload {
  title: string;
  due_date: string;
  description?: string;
  case_id?: number | null;
  reminder_type?: 'GENERAL' | 'FILING' | 'BATTA' | 'HEARING';
}

export interface UpdatePersonalReminderPayload {
  title?: string;
  description?: string;
  due_date?: string;
  is_completed?: boolean;
}

export type CalendarSyncProviderType = 'NONE' | 'GOOGLE' | 'APPLE_DEVICE' | 'ICS';

export interface CalendarSyncSettingItem {
  sync_enabled: boolean;
  provider: CalendarSyncProviderType;
  google_account_email: string;
  sync_hearing_reminders: boolean;
  sync_compliance_deadlines: boolean;
  sync_personal_reminders: boolean;
  sync_status: 'IDLE' | 'SYNCING' | 'SUCCESS' | 'FAILED';
  last_synced_at: string | null;
  sync_error: string;
  updated_at: string;
}

export interface CalendarSyncConnectPayload {
  provider: CalendarSyncProviderType;
  sync_enabled?: boolean;
  google_account_email?: string;
  google_access_token?: string;
  google_refresh_token?: string;
  sync_hearing_reminders?: boolean;
  sync_compliance_deadlines?: boolean;
  sync_personal_reminders?: boolean;
}


