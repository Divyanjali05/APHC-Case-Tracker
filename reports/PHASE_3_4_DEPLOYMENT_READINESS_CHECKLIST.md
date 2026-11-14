# PHASE 3.4 — STAGING DEPLOYMENT READINESS CHECKLIST (FINAL AUDIT)

**Project:** APHC Case Tracker  
**Branch:** `integration/phase-4-7-restoration` (HEAD commit: `6fe54a28f8c7a6af3a472ed5f5473971798d9b19`)  
**Audit Date:** November 14, 2026  
**Safety Mandate:** **CONNECTIONS TO NEON PRODUCTION ARE STRICTLY PROHIBITED. ALL CHECKS PERTAIN EXCLUSIVELY TO ISOLATED STAGING INFRASTRUCTURE.**

---

## 1. Readiness Classification Summary

| Dimension | Status | Notes |
| :--- | :---: | :--- |
| **Staging Deployment Preparation** | **Preparation complete** | Architecture, ASGI runtime, dedicated Redis broker, Celery singleton, media backup, and security runbooks fully finalized |
| **Hosting Selection** | **Hosting selection pending** | Awaiting selection of target staging host environment (Local Windows Host vs Dedicated Linux VM vs Containerized Staging) |
| **PostgreSQL 18.6 Runtime Compatibility** | **PostgreSQL 18.6 compatibility pending** | Verified on PostgreSQL 16.15; PG 18.6 testing to execute on isolated container runner with immutable image (`postgres:18.6`) |
| **Actual Staging Deployment** | **Actual staging deployment not started** | Zero deployment commands executed; awaiting formal hosting selection and execution approval |
| **Production Deployment Status** | **Production deployment not approved** | Strictly prohibited; blocked pending staging soak period, PG 18.6 validation, and formal stakeholder authorization |

---

## 2. Technical Readiness Verification Checklist

### A. Repository & Version Control Integrity
- [x] **Branch Isolation:** Pinned to `integration/phase-4-7-restoration`.
- [x] **Main Branch Protection:** `main` branch remains untouched and preserved.
- [x] **HEAD Commit Pinned:** Commit `6fe54a28f8c7a6af3a472ed5f5473971798d9b19` recorded as base.
- [x] **Codebase Preservations:** Phase 1 security remediation, Phase 4–7 functional restoration, direct OTP-free advocate registration, multilingual voice search, and landing page preserved.

### B. Security & Multi-Tenant Authorization Gates
- [x] **Anonymous Route Lockdown:** All private endpoints (`/cases/`, `/cases/dashboard/`, `/reminders/`, `/tokens/alerts/`, `/notifications/history/`, `/calendar/agenda/`, `/schema/`, `/docs/`) return `401 Unauthorized` without credentials.
- [x] **Cross-Advocate Horizontal Isolation:** Advocate B is strictly blocked (`404 Not Found` / `405 Method Not Allowed`) from reading, updating, or deleting Advocate A's cases, hearings, documents, notes, reminders, or token alerts.
- [x] **Dedicated JWT Secret Key:** Independent `JWT_SECRET_KEY` enforced separate from `DJANGO_SECRET_KEY`.
- [x] **Token Blacklisting upon Logout:** Logout invalidates refresh tokens in `token_blacklist`; replayed refresh tokens return `401 Unauthorized`.
- [x] **Direct OTP-Free Advocate Registration:** Successfully creates active accounts without SMS OTP; enrollment numbers normalized to uppercase (`AP/XXXX/YYYY`); role assigned as `ASSOCIATE`.

### C. Database & Schema Integrity
- [x] **Production Database Protection:** Zero queries, connections, or writes to Neon production.
- [x] **Dedicated Staging Database:** `aphc_case_tracker_staging` configured on local PostgreSQL host.
- [x] **Dedicated Staging Role:** `aphc_staging_app` granted least-privilege ownership over staging database.
- [x] **All 52 Migrations Applied:** Applied cleanly from scratch with zero `--fake` flags.
- [x] **Zero Model Drift:** `python manage.py makemigrations --check --dry-run` reports `No changes detected`.
- [x] **Schema Verification:** 35 base tables, 305 CHECK constraints, 44 FOREIGN KEY constraints, 35 PRIMARY KEY constraints, and 21 UNIQUE constraints verified.

### D. Redis / Memurai & Multiprocess Synchronization
- [x] **Active Redis Service:** Memurai Developer 4.1.2 verified on port 6379 (`PING -> PONG: True`, Redis API 7.2.5).
- [x] **Mandatory Staging Cache:** `backend/config/settings/staging.py` enforces mandatory Redis connectivity. LocMemCache fallback is disabled (raises `RuntimeError` if Redis is offline).
- [x] **Multiprocess Concurrency:** `test_real_redis_multiprocess_synchronization` passed against live Memurai.
- [x] **Distributed Lock Safety:** Atomic Lua renewal, ownership token validation, and TTL expiration verified.

### E. Backend Runtime & Realtime SSE Architecture
- [x] **Runtime Specification:** ASGI selected via `config.asgi:application` to support persistent Server-Sent Events without thread/worker starvation.
- [x] **Supported Worker Package:** Deprecated `uvicorn.workers.UvicornWorker` replaced with `uvicorn_worker.UvicornWorker` from standalone package `uvicorn-worker>=0.3.0`.
- [x] **Dependency Verification Status:**
  - Python 3.10.5, Django 5.1.15, DRF 3.17.2, and Celery 5.7.0 verified in `backend/.venv`.
  - `uvicorn`, `uvicorn-worker`, and `gunicorn` confirmed not installed locally, preserving pure development portability.
  - `uvicorn-worker>=0.3.0` compatibility with `uvicorn>=0.31.0` and `gunicorn>=22.0.0` verified for Linux staging deployment. Standalone Uvicorn verified for Windows local hosting.
- [x] **Graceful Timeout Calibration:** `--graceful-timeout 75` (or 90s) specified to safely exceed the 60-second SSE stream duration in `RealtimeStreamView`, eliminating premature `SIGKILL` termination. Worker timeout set to `--timeout 120`.
- [x] **Reverse Proxy Buffering:** Nginx configuration explicitly specifies `proxy_buffering off;` and `proxy_read_timeout 300s;` for `/api/notifications/realtime/stream/`.
- [x] **Health Probes & Shutdown:** `/api/health/` verified with database connectivity probe; graceful shutdown drain window configured.

### F. Background Processing (Celery Worker & Celery Beat)
- [x] **Celery App Configured:** `config/celery.py` autodiscovering tasks across 6 apps (`agenda`, `court_data`, `notifications`, `reminders`, `tokens`, `voice`).
- [x] **Redis Eviction Mechanics Corrected:**
  - `volatile-lru` evicts *only* keys with an explicit TTL; Celery queue messages (without TTL) are not evicted by `volatile-lru`. If memory reaches `maxmemory` without eligible keys, it behaves like `noeviction` (OOM on writes).
  - Risks of `allkeys-lru` (evicting any key including queues) explicitly documented.
- [x] **Dedicated Redis Broker Instance & Result Backend Safeguards:**
  - Celery task queue configured for a dedicated Redis broker instance (port 6380) with mandatory `maxmemory-policy noeviction`.
  - Result backend co-location safeguards: mandatory result expiration (`CELERY_RESULT_EXPIRES = 86400`), task-level result suppression (`ignore_result=True` on periodic tasks), and capacity monitoring to prevent result accumulation from starving broker memory.
  - Active memory monitoring (75% warning, 90% critical) and AOF (`appendfsync everysec`) + RDB persistence for disaster recovery. Cache instance (port 6379) isolated with `volatile-lru`.
- [x] **Celery Beat Singleton Mandate vs Runtime Verification:**
  - Architectural mandate: strictly **ONE** Celery Beat scheduler instance allowed in staging to prevent duplicate dispatches of court syncs, token alerts, and hearing reminders.
  - Runtime verification: operational check to confirm single active process (`systemctl is-active`) upon deployment.
  - Persistent state: schedule database stored in persistent `/var/lib/aphc/celery/beat-schedule` (not ephemeral `/run` tmpfs), owned by `aphc:aphc` with `chmod 750`.

### G. Protected Media Storage & Access Control
- [x] **Storage Subclass:** `SecureDocumentStorage` and `SecureVoiceStorage` enforce private disk storage (`/var/data/staging/`).
- [x] **URL Generation Blocked:** Direct `.url()` calls raise `NotImplementedError` to prevent public link leakage.
- [x] **Access Control:** File downloads require authenticated sessions and verify tracking ownership (`404 Not Found` for unauthorized requests).
- [x] **Off-Host Backup Runbook:** Daily tar archive encrypted with GPG, SHA256 checksummed, and pushed off-host via `rsync` or private bucket sync. Local retention: 7 days; off-host retention: 30 days.
- [x] **Database & Media Backup Consistency:** Documented consistency protocol addressing point-in-time skew between `pg_dump` and media archives, including synchronized backup window, read-only maintenance window, and post-restore referential integrity validation.
- [x] **Restoration Status Clarified:** Step-by-step restoration procedure explicitly classified as a **documented operational runbook ready for verification** (not an executed restoration test).

### H. Static Quality Gates & Test Suites
- [x] **Backend Pytest Suite:** **397 / 397 tests PASSED** in 107.56s (0 failed, 0 skipped).
- [x] **Frontend Jest Suite:** **294 / 294 tests PASSED** across 27 suites in 13.501s.
- [x] **TypeScript Compilation:** `npx tsc --noEmit` returned clean (0 type errors).
- [x] **ESLint Code Quality:** `eslint . --max-warnings=0` returned clean (0 warnings, 0 errors).
- [x] **Ruff Code Style:** `ruff check backend` returned `All checks passed!` (0 errors).
- [x] **Django System Checks:** `manage.py check --settings=config.settings.staging` returned `0 issues`.
- [x] **Live Staging Scenarios:** 10 browser E2E, 8 API, 3 security, and 7 Redis checks verified (28 live scenarios). Total verified items: 719.

---

## 3. Decisions Required from User

Before initiating any staging deployment operations, the following decisions are required:

1. **Target Staging Hosting Environment:**
   - **Option A (Local Host Staging):** Run Django ASGI (standalone Uvicorn) and Expo Web export on the current Windows host alongside local PostgreSQL 16.15 and Memurai.
   - **Option B (Dedicated Staging Linux VM / VPS):** Deploy to an isolated Linux staging server (e.g. AWS EC2, DigitalOcean, or Hetzner) using the systemd, Gunicorn+`uvicorn_worker.UvicornWorker`, dual-Redis, and Nginx runbooks.
   - **Option C (Containerized Staging):** Containerize the stack (Docker Compose) on an isolated staging server with pinned PostgreSQL and dual-Redis services.
2. **PostgreSQL 18.6 Validation Execution Timing:**
   - Confirm whether to run the exact patch-version container verification (`postgres:18.6`) on an isolated CI/CD runner prior to staging deployment, or proceed with staging deployment on verified PostgreSQL 16.15 first.
3. **Formal Approval to Deploy:**
   - Confirm approval to execute actual staging deployment commands once the hosting environment is selected.
   - *Note:* Production deployment remains strictly unapproved.
