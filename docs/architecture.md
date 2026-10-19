# APHC Case Tracker — Architecture Documentation

## 1. High-Level Architecture

The system is designed as a decoupled monorepo composed of a Django REST Framework backend with Celery background workers, PostgreSQL and Redis services, and a React Native Expo mobile application.

```mermaid
graph TD
    subgraph Mobile Client [Mobile Application - React Native / Expo]
        UI[Expo Router UI Views]
        TQ[TanStack Query State]
        LocalDB[(expo-sqlite / AsyncStorage)]
        PushClient[Expo Push Client]
    end

    subgraph API Gateway & Backend [Django REST Framework]
        Auth[accounts / SimpleJWT]
        Cases[cases - Case Dockets]
        Tokens[tokens - Live Court Hall Tracker]
        Reminders[reminders - Compliance Diary]
        Notifs[notifications - Push Dispatcher]
    end

    subgraph Data Stores
        PG[(PostgreSQL 16 Database)]
        Redis[(Redis 7 Cache / Broker)]
    end

    subgraph Background Services [Celery Workers]
        Scraper[APHC Portal Scraper & Parser]
        ListWatcher[Daily Cause List Ingestion]
        BoardWatcher[Display Board Live Poller]
        PushWorker[Expo Push Notification Worker]
    end

    UI --> TQ
    TQ <-->|REST API + JWT| Auth
    TQ <-->|REST API + JWT| Cases
    TQ <-->|REST API + JWT| Tokens
    TQ <-->|REST API + JWT| Reminders
    TQ <--> LocalDB

    Auth --> PG
    Cases --> PG
    Tokens --> PG
    Reminders --> PG
    Notifs --> PG

    Cases -.-> Redis
    Tokens -.-> Redis

    Scraper --> PG
    ListWatcher --> PG
    BoardWatcher --> Redis
    PushWorker --> PushClient

    Redis <==> BackgroundServices
```

## 2. Backend Architecture (`backend/`)

- **`config/`**: Django project settings, WSGI/ASGI handlers, Celery instance, and root URL routing.
- **`accounts/`**: Advocate identity, Bar Council enrollment number verification, custom User model, SimpleJWT authentication, and team permissions.
- **`cases/`**: Case metadata (WP, WA, CRP, etc.), petitioner/respondent records, order PDFs, and case stage timelines.
- **`reminders/`**: Compliance deadlines (counter-affidavit, batta, process fee), limitation tracking, and advocate diary.
- **`tokens/`**: Andhra Pradesh High Court live display board monitor, Court Hall item tracking, and distance-to-hearing calculation.
- **`notifications/`**: Push notification dispatching, device token registry, notification history, and category subscriptions.
- **`tests/`**: Pytest test suite covering all apps, API contracts, and edge cases.

## 3. Mobile Architecture (`mobile/`)

- **`app/`**: File-based routing with Expo Router:
  - `(auth)`: Login, Register, Forgot Password.
  - `(tabs)`: Dashboard, Cases, Cause List, Display Board, Diary.
  - `cases/[id]`: Detailed case timeline, order history, and court hall tracking.
- **`components/`**: Modular UI components (buttons, cards, badges, status chips, loading skeletons).
- **`services/`**: Axios API client with SimpleJWT token rotation, TanStack Query client configuration.
- **`i18n/`**: Localization setup using `i18next` and `react-i18next` supporting English (`en`) and Telugu (`te`).
- **`tests/`**: Jest and React Native Testing Library tests for screens, components, and hooks.
