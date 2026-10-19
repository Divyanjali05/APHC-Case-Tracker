# APHC Case Tracker — Database Design Documentation

This document describes the relational database schema, model definitions, foreign key relationships, indexes, and constraints for the High Court of Andhra Pradesh Case Tracker.

---

## 1. Entity-Relationship (ER) Diagram

```mermaid
erDiagram
    User ||--o| AdvocateProfile : "has profile"
    User ||--o{ Case : "tracks"
    User ||--o{ Reminder : "creates"
    User ||--o{ TokenAlertRule : "configures"
    User ||--o{ DeviceRegistration : "registers"
    User ||--o{ NotificationHistory : "receives"

    Case ||--o{ Hearing : "contains"
    Case ||--o{ Reminder : "triggers"
    Case ||--o{ TokenAlertRule : "monitored in"

    CourtHall ||--|| CourtTokenStatus : "broadcasts"
    CourtHall ||--o{ TokenAlertRule : "targets"

    AdvocateProfile {
        int id PK
        int user_id FK
        string enrollment_number UK "AP/XXXX/YYYY"
        string full_name
        string phone_number
        string preferred_language "en | te | hi"
        boolean is_verified
        timestamp created_at
        timestamp updated_at
    }

    Case {
        int id PK
        int user_id FK "nullable"
        string case_type "WP, WA, CRP, etc."
        string case_number
        int filing_year
        string petitioner
        string respondent
        string petitioner_advocate
        string respondent_advocate
        string current_stage
        string bench
        int court_hall_number
        date next_hearing_date
        timestamp created_at
        timestamp updated_at
    }

    Hearing {
        int id PK
        int case_id FK
        date hearing_date
        int court_hall_number
        int item_number
        text business_conducted
        date next_date
        timestamp created_at
    }

    Reminder {
        int id PK
        int user_id FK
        int case_id FK "nullable"
        string title
        text description
        string reminder_type "HEARING | FILING | BATTA | GENERAL"
        datetime due_date
        boolean is_completed
        timestamp created_at
        timestamp updated_at
    }

    CourtHall {
        int id PK
        int hall_number UK
        string bench_name
        string presiding_judges
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }

    CourtTokenStatus {
        int id PK
        int court_hall_id FK "OneToOne"
        int current_item_number
        string current_stage
        timestamp last_polled_at
        timestamp updated_at
    }

    TokenAlertRule {
        int id PK
        int user_id FK
        int case_id FK
        int court_hall_id FK
        int listed_item_number
        int alert_threshold "e.g. 5 tokens before"
        boolean is_notified
        timestamp created_at
    }

    DeviceRegistration {
        int id PK
        int user_id FK
        string expo_push_token UK
        string platform "android | ios | web"
        string app_version
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }

    NotificationHistory {
        int id PK
        int user_id FK
        string title
        text body
        string notification_type "TOKEN | HEARING | COMPLIANCE | SYSTEM"
        json payload
        boolean is_read
        timestamp sent_at
    }
```

---

## 2. Table Specifications & Indexes

### 2.1 `accounts_advocateprofile`

- **Primary Key**: `id` (BigAutoField)
- **Unique Constraints**:
  - `enrollment_number` (must match regex `^[A-Z]{2}/[0-9]{1,6}/(19|20)[0-9]{2}$`)
  - `user_id` (One-to-One with `auth_user`)
- **Indexes**:
  - `idx_advocate_enrollment` (`enrollment_number`)
  - `idx_advocate_verified` (`is_verified`)

### 2.2 `cases_case`

- **Primary Key**: `id` (BigAutoField)
- **Unique Constraints**:
  - `unique_together`: `['case_type', 'case_number', 'filing_year']`
- **Indexes**:
  - `idx_case_lookup` (`case_type`, `case_number`, `filing_year`)
  - `idx_case_hearing_date` (`next_hearing_date`)
  - `idx_case_hall` (`court_hall_number`)

### 2.3 `cases_hearing`

- **Primary Key**: `id` (BigAutoField)
- **Foreign Keys**: `case_id` references `cases_case(id)` on delete CASCADE.
- **Indexes**:
  - `idx_hearing_case_date` (`case_id`, `hearing_date`)

### 2.4 `reminders_reminder`

- **Primary Key**: `id` (BigAutoField)
- **Foreign Keys**:
  - `user_id` references `auth_user(id)` on delete CASCADE.
  - `case_id` references `cases_case(id)` on delete SET_NULL.
- **Indexes**:
  - `idx_reminder_user_due` (`user_id`, `due_date`, `is_completed`)

### 2.5 `tokens_courthall` & `tokens_courttokenstatus`

- **Primary Key**: `id` (BigAutoField)
- **Unique Constraints**: `hall_number` on `CourtHall`.
- **Relationship**: `CourtTokenStatus` has `OneToOneField` to `CourtHall`.
- **Indexes**:
  - `idx_hall_number` (`hall_number`)
  - `idx_token_updated` (`updated_at`)

### 2.6 `notifications_deviceregistration`

- **Primary Key**: `id` (BigAutoField)
- **Unique Constraints**: `expo_push_token`.
- **Indexes**:
  - `idx_device_user_active` (`user_id`, `is_active`)

---

## 3. Database Engine Portability

- **Local Development**: Supported on SQLite (`db.sqlite3`) for lightweight testing without external services.
- **Production**: Configured for PostgreSQL 16 via `psycopg` (v3) with connection pooling and SSL mode.
