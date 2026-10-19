# APHC Case Tracker — REST API Contract

Base URL: `http://<host>:8000/api`
Interactive OpenAPI 3.0 Documentation: `http://<host>:8000/api/docs/`
OpenAPI JSON Schema: `http://<host>:8000/api/schema/`

---

## 1. Authentication & Security

All protected endpoints require a JWT Bearer token in the `Authorization` header:

```http
Authorization: Bearer <jwt_access_token>
```

Tokens are generated via RFC 7519 JSON Web Tokens using `djangorestframework-simplejwt`.

---

## 2. Standard Response & Error Envelopes

### Success Response

Standard pagination envelope for collection endpoints:

```json
{
  "count": 42,
  "next": "http://localhost:8000/api/cases/?page=2",
  "previous": null,
  "results": []
}
```

### Standard Error Response

```json
{
  "error": {
    "code": "AUTHENTICATION_FAILED",
    "message": "Invalid credentials or inactive advocate account.",
    "status_code": 401,
    "details": {
      "enrollment_number": ["Advocate profile not found."]
    }
  }
}
```

---

## 3. Endpoints Specification

### 3.1 Health Probe

#### `GET /api/health/`

Public endpoint for uptime monitoring and client connectivity testing.

- **Status**: `200 OK`
- **Response**:

```json
{
  "status": "ok",
  "service": "aphc-case-tracker-api",
  "version": "0.1.0",
  "database": "healthy",
  "engine": "sqlite3",
  "timestamp": "2026-10-19T16:00:00Z"
}
```

---

### 3.2 Authentication (`/api/auth/`)

#### `POST /api/auth/token/`

Obtain access and refresh JWT pair.

- **Request Body**:

```json
{
  "username": "AP/1234/2020",
  "password": "SecurePassword123!"
}
```

- **Response `200 OK`**:

```json
{
  "access": "<jwt_access_token>",
  "refresh": "<jwt_refresh_token>"
}
```

#### `POST /api/auth/token/refresh/`

Rotate access token using refresh token.

- **Request Body**:

```json
{
  "refresh": "<jwt_refresh_token>"
}
```

- **Response `200 OK`**:

```json
{
  "access": "<new_jwt_access_token>"
}
```

#### `GET /api/auth/profile/`

Retrieve the authenticated advocate's profile details.

- **Headers**: `Authorization: Bearer <token>`
- **Response `200 OK`**:

```json
{
  "id": 1,
  "enrollment_number": "AP/1234/2020",
  "full_name": "Advocate K. Rama Rao",
  "phone_number": "+919876543210",
  "preferred_language": "te",
  "is_verified": true
}
```

---

### 3.3 Cases & Cause Lists (`/api/cases/`)

#### `GET /api/cases/`

List cases tracked by the authenticated advocate.

- **Query Parameters**:
  - `search` (string): Search by case type, case number, or party name.
  - `stage` (string): Filter by stage (e.g., `Admission`, `Notice`, `Hearing`).
  - `page` (integer): Page number.
- **Response `200 OK`**:

```json
{
  "count": 1,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 1,
      "case_type": "WP",
      "case_number": "1042",
      "filing_year": 2024,
      "petitioner": "M/s Amaravati Builders Ltd",
      "respondent": "State of Andhra Pradesh & Others",
      "petitioner_advocate": "K. Rama Rao",
      "respondent_advocate": "Advocate General",
      "current_stage": "Admission",
      "bench": "Hon'ble Division Bench I",
      "court_hall_number": 1,
      "next_hearing_date": "2026-10-25",
      "created_at": "2026-10-19T10:00:00Z",
      "updated_at": "2026-10-19T10:00:00Z"
    }
  ]
}
```

#### `POST /api/cases/`

Track a new case docket.

- **Request Body**:

```json
{
  "case_type": "WP",
  "case_number": "1042",
  "filing_year": 2024,
  "petitioner": "M/s Amaravati Builders Ltd",
  "respondent": "State of Andhra Pradesh & Others"
}
```

- **Response `201 Created`**

#### `GET /api/cases/{id}/`

Retrieve case docket details along with hearing history.

- **Response `200 OK`**:

```json
{
  "id": 1,
  "case_type": "WP",
  "case_number": "1042",
  "filing_year": 2024,
  "petitioner": "M/s Amaravati Builders Ltd",
  "respondent": "State of Andhra Pradesh & Others",
  "petitioner_advocate": "K. Rama Rao",
  "respondent_advocate": "Advocate General",
  "current_stage": "Admission",
  "bench": "Hon'ble Division Bench I",
  "court_hall_number": 1,
  "next_hearing_date": "2026-10-25",
  "hearings": [
    {
      "id": 1,
      "hearing_date": "2026-10-15",
      "court_hall_number": 1,
      "item_number": 14,
      "business_conducted": "Notice ordered before admission. Counter by 25-10-2026.",
      "next_date": "2026-10-25"
    }
  ],
  "created_at": "2026-10-19T10:00:00Z",
  "updated_at": "2026-10-19T10:00:00Z"
}
```

#### `POST /api/cases/{id}/sync/`

Trigger an on-demand synchronization with the High Court mock client.

- **Response `200 OK`**:

```json
{
  "status": "synced",
  "case_id": 1,
  "updated_fields": ["next_hearing_date", "current_stage"]
}
```

---

### 3.4 Reminders (`/api/reminders/`)

#### `GET /api/reminders/`

List active reminders and compliance tasks for the advocate.

- **Response `200 OK`**:

```json
[
  {
    "id": 1,
    "case": 1,
    "title": "File Counter Affidavit in WP 1042/2024",
    "description": "Serve copy on Government Pleader prior to next hearing",
    "reminder_type": "FILING",
    "due_date": "2026-10-23T17:00:00Z",
    "is_completed": false,
    "created_at": "2026-10-19T10:00:00Z"
  }
]
```

#### `POST /api/reminders/`

Create a new compliance reminder.

- **Request Body**:

```json
{
  "case": 1,
  "title": "File Process Fee for Respondent 2",
  "reminder_type": "BATTA",
  "due_date": "2026-10-22T17:00:00Z"
}
```

- **Response `201 Created`**

---

### 3.5 Tokens & Display Board (`/api/tokens/`)

#### `GET /api/tokens/halls/`

List active court halls and their current broadcast status.

- **Response `200 OK`**:

```json
[
  {
    "id": 1,
    "hall_number": 1,
    "bench_name": "Chief Justice & Justice K. Manmadha Rao",
    "presiding_judges": "Hon'ble The Chief Justice",
    "is_active": true,
    "status": {
      "current_item_number": 12,
      "current_stage": "Motion Hearing",
      "last_polled_at": "2026-10-19T10:30:00Z"
    }
  }
]
```

#### `POST /api/tokens/alerts/`

Configure an alert threshold for an upcoming matter.

- **Request Body**:

```json
{
  "case": 1,
  "court_hall": 1,
  "listed_item_number": 18,
  "alert_threshold": 5
}
```

- **Response `201 Created`**: Returns alert rule with calculated item distance.

---

### 3.6 Notifications (`/api/notifications/`)

#### `POST /api/notifications/devices/`

Register an Expo push token for the authenticated device.

- **Request Body**:

```json
{
  "expo_push_token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "platform": "android",
  "app_version": "0.1.0"
}
```

- **Response `201 Created`**

#### `GET /api/notifications/history/`

List recent notifications delivered to the advocate's devices.

- **Response `200 OK`**
