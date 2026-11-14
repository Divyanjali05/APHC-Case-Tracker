# Phase 3.3: Windows Local Staging Infrastructure Setup Guide

- **Repository Root:** `C:\projects\APHC-Case-Tracker`
- **Branch:** `integration/phase-4-7-restoration` (`main` untouched)
- **Status:** Stopped after **Step 1 (Environment Discovery)** for user approval — no system software or Windows services were installed, started, or modified.
- **Neon Production Database:** Untouched (`backend/.env` was not read or modified).

---

## 1. Step 1 Environment Discovery Findings

### Available Tooling & Dependencies (Ready)
| Component | Observed State | Details |
|---|---|---|
| Git Branch | `integration/phase-4-7-restoration` | Confirmed active |
| Python Virtual Environment | Present (`backend\.venv\Scripts\python.exe`) | Python `3.10.5` |
| Backend Python Packages | Installed in `.venv` | `django 5.1.15`, `psycopg 3.3.8`, `redis 8.1.0`, `celery 5.7.0`, `pytest 9.2.0` (matches [requirements.txt](file:///C:/projects/APHC-Case-Tracker/backend/requirements.txt)) |
| Frontend Runtime & Packages | Present (`frontend\node_modules`) | `node v24.14.0`, `npm 11.9.0`, dependencies installed |
| Windows Package Manager | Available | `C:\Users\anusr\AppData\Local\Microsoft\WindowsApps\winget.exe` (`choco` not installed) |

### Missing Local Infrastructure Services (Blocking Steps 2–6)
| Component | Probe Findings | Port / Service Status |
|---|---|---|
| PostgreSQL Server & Client | `psql`, `pg_ctl`, `initdb`, `pg_isready` not found; `C:\Program Files\PostgreSQL` missing | No PostgreSQL service registered; `127.0.0.1:5432` **CLOSED / Unoccupied** |
| Redis / Memurai | `redis-server`, `redis-cli`, `memurai`, `memurai-cli` not found; `C:\Program Files\Redis` & `C:\Program Files\Memurai` missing | No Redis/Memurai service registered; `127.0.0.1:6379` **CLOSED / Unoccupied** |
| Docker Desktop | `docker` not found; `C:\Program Files\Docker` missing | Not installed |
| Windows Subsystem for Linux (WSL) | `wsl --list --verbose` exited `1`: `Windows Subsystem for Linux is not installed.` | Not installed |

---

## 2. Recommended Windows Installation Options

Choose **Option A** (lightweight native Windows services — no Hyper-V/WSL reboot typically required) or **Option B** (containerized services via Docker Desktop + WSL 2). Both ports `5432` and `6379` are currently free on this machine.

### Option A — Native Windows Services (Recommended for Direct Local Setup)

1. **PostgreSQL 16 or 18 (Windows x64 Installer or `winget`):**
   - Official EDB Windows Installer: https://www.postgresql.org/download/windows/ (match Neon's PostgreSQL 18.x major version if desired, or PostgreSQL 16+).
   - Or via elevated PowerShell (`winget`):
     ```powershell
     winget install --id PostgreSQL.PostgreSQL.16 --source winget
     ```
   - During setup:
     - Keep default port **`5432`**.
     - Set a local-only superuser password (do **not** reuse any Neon password).
     - Ensure `psql` (PostgreSQL `bin` directory, e.g., `C:\Program Files\PostgreSQL\16\bin`) is added to PATH.

2. **Redis-Compatible Server on Windows — Memurai Developer Edition (Free):**
   - Download installer: https://www.memurai.com/get-memurai (native Windows Redis-compatible service supporting Redis 7.x commands & Pub/Sub).
   - Or via `winget`:
     ```powershell
     winget install --id Memurai.MemuraiDeveloper --source winget
     ```
   - During setup:
     - Keep default port **`6379`** bound to `127.0.0.1`.
     - Enable running as the Windows `Memurai` service.

---

### Option B — Containerized Staging via Docker Desktop (Alternative)

If you prefer disposable containers instead of persistent native Windows database services:

1. **Install WSL 2 + Docker Desktop** (Administrator PowerShell + reboot required):
   ```powershell
   wsl --install
   winget install --id Docker.DockerDesktop --source winget
   ```
2. After reboot and starting Docker Desktop, launch **isolated localhost-only** containers on free ports `5432` and `6379`:
   ```powershell
   docker run -d --name aphc-staging-postgres `
     -e POSTGRES_USER=aphc_staging `
     -e POSTGRES_PASSWORD=aphc_local_staging_only `
     -e POSTGRES_DB=aphc_case_tracker_staging `
     -p 127.0.0.1:5432:5432 `
     postgres:16-alpine

   docker run -d --name aphc-staging-redis `
     -p 127.0.0.1:6379:6379 `
     redis:7-alpine --appendonly no
   ```

---

## 3. Isolated Staging Database Initialization (After Installation)

If you chose **Option A**, create the dedicated local user and isolated staging database **`aphc_case_tracker_staging`** (never using Neon credentials):

```sql
CREATE USER aphc_staging WITH PASSWORD '<LOCAL_STAGING_PASSWORD>';
CREATE DATABASE aphc_case_tracker_staging OWNER aphc_staging;
GRANT ALL PRIVILEGES ON DATABASE aphc_case_tracker_staging TO aphc_staging;
```

Verify both services before resuming Phase 3.3 Steps 2–7:

```powershell
psql -h 127.0.0.1 -p 5432 -U aphc_staging -d aphc_case_tracker_staging -c "SELECT version();"
memurai-cli -h 127.0.0.1 -p 6379 PING   # or redis-cli PING -> PONG
```

---

## 4. Safety & Isolation Rules Enforced Upon Resumption

Once you confirm PostgreSQL + Redis are ready (or approve installation), Steps 2–7 will:
1. Use a separate staging config/env rejecting any database host other than `localhost` / `127.0.0.1` and any database name other than `aphc_case_tracker_staging`.
2. Use a dedicated local Redis URL/namespace (`redis://127.0.0.1:6379/2` & `redis://127.0.0.1:6379/3`).
3. Never read, print, or reuse Neon credentials from `backend/.env`.
4. Run normal Django migrations (never `--fake` / `--fake-initial`), full PostgreSQL inspection, real Redis multiprocess lock test (`test_real_redis_multiprocess_synchronization`), combined backend + headless Chrome E2E verification, full `backend`/`frontend` regression suites, and produce `reports/PHASE_3_3_STAGING_INFRASTRUCTURE_REPORT.md`.

