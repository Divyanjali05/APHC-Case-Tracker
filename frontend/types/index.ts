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
  court_hall_number?: number;
  item_number?: number;
  business_conducted?: string;
  next_date?: string;
  created_at: string;
}

export interface ReminderItem {
  id: number;
  case?: number;
  title: string;
  description?: string;
  reminder_type: 'HEARING' | 'FILING' | 'BATTA' | 'GENERAL';
  due_date: string;
  is_completed: boolean;
  created_at: string;
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
