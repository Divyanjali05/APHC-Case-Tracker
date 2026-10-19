# Project Roadmap — APHC Case Tracker

| Phase       | Title                                                   | Focus Area                                                                                  | Status          |
| ----------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------- |
| **Phase 0** | **Repository Audit & Foundation Setup**                 | Monorepo layout, toolchains, docker, linters, pre-commit, GSD docs, base apps               | **IN PROGRESS** |
| **Phase 1** | **Authentication & Advocate Profiles**                  | Custom user model, SimpleJWT, Bar Council enrollment, Auth screens (login, signup, profile) | PENDING         |
| **Phase 2** | **Case Docket & APHC Data Sync**                        | Case models, manual entry, APHC scraper, case detail view, status timeline                  | PENDING         |
| **Phase 3** | **Daily Cause Lists & Smart Reminders**                 | Cause list scraper, daily board matching, reminder engine, diary integration                | PENDING         |
| **Phase 4** | **Live Court Hall Display Board & Alerts**              | Court hall item tracker, token distance calculation, Expo push notifications                | PENDING         |
| **Phase 5** | **Offline Storage, Telugu i18n & Production Readiness** | SQLite sync, bilingual localization, performance optimizations, E2E validation              | PENDING         |

## Milestone Checkpoints

- [x] Phase 0: Base Django + Expo startup, Docker Compose setup, pre-commit and linting rules configured.
- [ ] Phase 1: Advocates can sign up, log in, store Bar Council enrollment ID, and receive valid JWT tokens on mobile.
- [ ] Phase 2: Advocates can view their tracked cases and fetch live case details from APHC.
- [ ] Phase 3: Automated daily cause lists appear in the morning feed with reminders.
- [ ] Phase 4: Advocates receive push notifications when their matter is upcoming in Court Hall.
- [ ] Phase 5: Advocates can use the app inside offline courtrooms with full Telugu language support.
