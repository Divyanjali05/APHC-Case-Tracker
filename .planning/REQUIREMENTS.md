# System Requirements — APHC Case Tracker

## 1. Functional Requirements

### 1.1 Authentication & Profile Management (`accounts`)

- Custom User model using mobile number or email with Bar Council Enrollment Number (e.g., `AP/XXXX/YYYY`).
- JWT-based authentication using SimpleJWT with access and refresh tokens.
- Role management: Lead Advocate, Junior Associate, Office Clerk.
- Advocate profile details: Chamber address, phone, notification preferences.

### 1.2 Case Tracking & Docket Management (`cases`)

- Case filing schema: Case Type (WP, WA, CRP, CRLP, MACMA, etc.), Case Number, Filing Year.
- Litigant details: Petitioner(s), Respondent(s), Impugned Order details.
- Daily case status, next listing date, bench/court hall assignment, item number.
- Order/Judgment PDF retrieval and storage.

### 1.3 Cause List Ingestion (`cases` / background jobs)

- Periodic Celery tasks to scrape and parse daily cause lists published on the APHC portal.
- Automated matching of parsed cause lists with tracked advocate enrollment IDs or names.
- Automatic creation of daily cause list entries for advocates.

### 1.4 Display Board & Live Token Monitoring (`tokens`)

- Live scraping / polling of APHC live display board (Court Hall Number -> Active Item Number).
- Delta calculation between active item number and advocate's listed item number.
- Threshold alerts (e.g., alert when 10 items away, 5 items away, and next matter).

### 1.5 Reminders & Diary (`reminders`)

- Personalized reminder scheduler for:
  - Filing counter-affidavits / rejoinders.
  - Paying process fees / batta.
  - Limitation period countdowns.
- Sync with mobile device calendar.

### 1.6 Push Notifications (`notifications`)

- Push notification delivery via Expo Push Notification API.
- Notification categorization: Cause list listing alert, Live item movement alert, Reminder alert, Case status change.
- In-app notification center with read/unread statuses.

### 1.7 Mobile Client & Offline First Experience

- Expo Router file-based navigation (tabs for Dashboard, My Cases, Cause List, Display Board, Diary).
- TanStack Query with optimistic updates and caching.
- Offline database using expo-sqlite / AsyncStorage for courtroom offline accessibility.
- Bilingual localization (English & Telugu) via react-i18next.

## 2. Non-Functional Requirements

- **Performance**: API responses under 200ms; background scrapers resilient to APHC portal rate limits and downtime.
- **Security**: No secrets in source code, password hashing with Argon2/PBKDF2, JWT token rotation, HTTPS enforcement.
- **Reliability**: Celery tasks with exponential backoff retries.
- **Maintainability**: Modular Django apps, typed TypeScript contracts, high test coverage.
