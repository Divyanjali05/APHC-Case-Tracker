# APHC Case Tracker — Mobile Application Frontend

The mobile client for advocates practicing before the **High Court of Andhra Pradesh at Amaravati**. Built with React Native, Expo SDK 51, TypeScript, Expo Router, TanStack Query, and i18next.

---

## 1. Tech Stack Overview

- **Framework**: React Native 0.74.5 with Expo SDK 51
- **Language**: TypeScript 5.3 (strict typing enabled)
- **Routing**: Expo Router (file-based navigation with tabs and nested stacks)
- **Data Fetching & Caching**: TanStack Query (React Query v5) with Axios
- **Form Management**: React Hook Form with Zod schema validation
- **Internationalization**: i18next & react-i18next (English, Telugu, and Hindi)
- **Secure Token Storage**: Expo SecureStore
- **Notifications**: Expo Notifications
- **Voice Assistance**: Expo Speech (Text-to-Speech)
- **Styling**: Curated High Court dark theme design system (`constants/colors.ts`)
- **Testing**: Jest with React Native Testing Library
- **Code Quality**: ESLint, Prettier, TypeScript strict check

---

## 2. Directory Structure

```text
frontend/
├── app/
│   ├── (auth)/
│   │   └── login.tsx         # Advocate login with Bar Council enrollment ID validation
│   ├── (tabs)/
│   │   ├── _layout.tsx       # Bottom tab bar navigation layout
│   │   ├── index.tsx         # Advocate Dashboard & API connectivity probe
│   │   ├── cases.tsx         # Case cause list & docket search
│   │   ├── reminders.tsx     # Compliance deadlines & filing reminders
│   │   ├── tokens.tsx        # Live court hall display board tracking
│   │   └── settings.tsx      # Language selector, push alerts, TTS voice test, sign-out
│   ├── cases/
│   │   └── [id].tsx          # Case docket detail view with hearing history & voice summary
│   ├── _layout.tsx           # Root provider stack (QueryClient, SafeArea, StatusBar)
│   └── +not-found.tsx        # 404 fallback screen
│
├── components/
│   ├── common/               # ScreenContainer, Card, Badge, Button, EmptyState, LoadingIndicator
│   ├── cases/                # CaseCard
│   ├── dashboard/            # StatCard
│   ├── reminders/            # ReminderItem
│   └── tokens/               # CourtHallCard
│
├── features/
│   ├── auth/                 # Zod validation schemas
│   ├── cases/                # useCases, useCaseDetail hooks
│   ├── reminders/            # useReminders hook
│   └── tokens/               # useCourtHalls hook (with 15s auto-polling)
│
├── services/
│   ├── api/
│   │   ├── client.ts         # Axios instance with auth interceptors & health check
│   │   └── endpoints.ts      # API endpoint constants
│   ├── auth/
│   │   └── tokenStorage.ts   # SecureStore wrapper for JWT access & refresh tokens
│   ├── notifications/
│   │   └── pushService.ts    # Expo push notification permissions & listeners
│   └── speech/
│       └── ttsService.ts     # Multilingual text-to-speech audio service
│
├── constants/
│   └── colors.ts             # High Court navy/gold/slate color tokens
├── i18n/
│   ├── index.ts              # i18next initialization
│   └── locales/              # en.json, te.json, hi.json
├── types/
│   └── index.ts              # TypeScript interfaces (CaseItem, HearingItem, etc.)
├── utils/
│   └── formatters.ts         # Case number and date formatting helpers
└── tests/
    ├── App.test.tsx          # Component test suites (Button, Card, Badge, EmptyState)
    └── health.test.ts        # API client health check test suite
```

---

## 3. Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- Expo Go on iOS/Android or an emulator/simulator

### Configuration

Copy the sample environment file:

```bash
cp .env.example .env
```

Default `.env` configuration:

```ini
EXPO_PUBLIC_API_URL=http://localhost:8000/api
EXPO_PUBLIC_ENV=development
EXPO_PUBLIC_APP_NAME=APHC Case Tracker
EXPO_PUBLIC_DEFAULT_LOCALE=en
```

> **Note for Android Emulators:** Set `EXPO_PUBLIC_API_URL=http://10.0.2.2:8000/api` to reach the Django backend running on the host machine.
> **Note for Physical Devices via Expo Go:** Set `EXPO_PUBLIC_API_URL=http://<YOUR_LOCAL_IP>:8000/api`.

### Running Locally

```bash
# Start the Expo development server
npm start

# Run on Android emulator / device
npm run android

# Run on iOS simulator / device
npm run ios

# Run web preview
npm run web
```

---

## 4. Verification & Testing

```bash
# Run unit tests
npm test

# Run ESLint (zero-warning policy)
npm run lint

# Run TypeScript compiler check
npx tsc --noEmit
```
