# PHASE 3.4 — STAGING DEPLOYMENT PLAN (TECHNICAL AUDIT & OPERATIONAL RUNBOOK)

**Project:** APHC Case Tracker  
**Branch:** `integration/phase-4-7-restoration` (HEAD commit: `6fe54a28f8c7a6af3a472ed5f5473971798d9b19`)  
**Document Purpose:** Staging Infrastructure Architecture, Build Specifications, Runtime Selection, Background Processing, Media Protection, and Operational Runbook  
**Database Safety Directive:** **CONNECTIONS TO NEON PRODUCTION ARE STRICTLY PROHIBITED (INCLUDING PRE-PRODUCTION TESTING). ALL STAGING OPERATIONS MUST TARGET AN ISOLATED NON-PRODUCTION DATABASE.**

---

## 1. Executive Summary & Readiness Classification

This document specifies the exact architecture, dependencies, runtime selection, background processing topology, media protection strategy, and operational procedures for deploying the restored APHC Case Tracker to an isolated staging environment.

### Final Readiness Classification:
| Dimension | Status | Operational State |
| :--- | :---: | :--- |
| **Staging Deployment Preparation** | **Preparation complete** | Architecture, runtime selection, Celery topology, media backup runbooks, and configuration templates fully audited and finalized |
| **Staging Infrastructure Target** | **Hosting selection pending** | Awaiting selection of target staging host (Local Windows Host vs Dedicated Linux VM vs Containerized Staging) |
| **PostgreSQL 18.6 Runtime Verification** | **PostgreSQL 18.6 compatibility pending** | Verified on PostgreSQL 16.15; PostgreSQL 18.6 runtime testing to execute on isolated container runner with immutable image |
| **Actual Staging Deployment** | **Actual staging deployment not started** | Zero deployment commands executed; awaiting formal hosting selection and execution approval |
| **Production Deployment Status** | **Production deployment not approved** | Strictly prohibited; blocked pending staging soak period, PG 18.6 validation, and formal stakeholder sign-off |

---

## 2. Recommended Deployment Architecture & Runtime Selection

### A. End-to-End System Topology
```
                                   +-----------------------------------------------+
                                   |              Advocate Users / Browsers        |
                                   +-----------------------------------------------+
                                                           |
                                                           | HTTPS (Port 443)
                                                           v
                                   +-----------------------------------------------+
                                   |       Reverse Proxy / TLS Termination         |
                                   |             (Nginx / Caddy / Traefik)         |
                                   +-----------------------------------------------+
                                             |                             |
                       Static Web Assets (/) |                             | API & SSE (/api/*, /admin/*)
                                             v                             v
                    +----------------------------------+   +----------------------------------+
                    | Staging Frontend Static Hosting  |   |    Staging Django Backend API    |
                    | Expo Web Export (`dist/` HTML/JS)|   | ASGI: Gunicorn + UvicornWorker   |
                    | Hosted on Nginx / Static CDN     |   | `uvicorn_worker.UvicornWorker`   |
                    +----------------------------------+   +----------------------------------+
                                                                     |              |
                                                     +---------------+              +---------------+
                                                     |                                              |
                                                     v                                              v
                                    +----------------------------------+   +----------------------------------+
                                    | Isolated Staging PostgreSQL DB   |   | Staging Redis Cache Instance     |
                                    |  (PostgreSQL 16.15 Staging DB)   |   |  Port 6379 (Redis 7.x API)       |
                                    |   `aphc_case_tracker_staging`    |   |  - DB 2: Django Cache, Throttling|
                                    +----------------------------------+   |  - Policy: volatile-lru          |
                                                     |                     +----------------------------------+
                                                     |                                      |
                                                     |                     +----------------------------------+
                                                     |                     | Dedicated Redis Broker Instance  |
                                                     |                     |  Port 6380 (Celery Broker & Res) |
                                                     |                     |  - DB 0: Celery Task Broker      |
                                                     |                     |  - DB 1: Celery Results Backend  |
                                                     |                     |  - Policy: NOEVICTION (Mandatory)|
                                                     |                     |  - Result TTL: 86400s (Mandatory)|
                                                     |                     |  - Persistence: AOF + RDB        |
                                                     |                     +----------------------------------+
                                                     |                                      |
                                                     v                                      v
                                    +----------------------------------+   +----------------------------------+
                                    | Protected Private Media Volume   |   | Celery Worker (Concurrency 2-4)  |
                                    |  `/var/data/staging/documents`   |   +----------------------------------+
                                    |  `/var/data/staging/voice`       |                    |
                                    |  (Off-host encrypted backup)     |   +----------------------------------+
                                    +----------------------------------+   | Celery Beat Scheduler (SINGLETON)|
                                                                           | State: `/var/lib/aphc/celery/`   |
                                                                           | ONLY 1 scheduler instance active |
                                                                           +----------------------------------+
```

### B. Backend Runtime Selection: ASGI vs WSGI
- **Architecture Analysis:** The codebase implements a real-time Server-Sent Events (SSE) streaming endpoint in `apps/notifications/views.py` (`RealtimeStreamView`) using `StreamingHttpResponse`. This endpoint maintains persistent, long-lived HTTP connections (up to 60s per connection with 15s heartbeats) streaming from Redis Pub/Sub channels (`realtime:user:<id>`).
- **Runtime Risk with Synchronous WSGI:** Running synchronous WSGI (e.g., standard Gunicorn sync workers) ties up an entire OS worker process per connected SSE client. In a 4-worker WSGI deployment, just 4 active SSE connections completely block all incoming REST API requests (`/api/cases/`, `/api/health/`), causing immediate connection timeouts and service starvation.
- **Selected Runtime:** **ASGI (Asynchronous Server Gateway Interface)** via `config/asgi.py`.
- **Supported Application Server & Worker Class:**
  - **Deprecation Resolution (`uvicorn-worker`):** In Uvicorn 0.33+, `uvicorn.workers.UvicornWorker` is deprecated and moved to the standalone PyPI package `uvicorn-worker`. Deployments must utilize `uvicorn_worker.UvicornWorker` provided by `uvicorn-worker>=0.3.0`.
  - **Dependency Compatibility & Codebase Inventory:**
    - Codebase verification shows the local Windows environment runs Python 3.10.5, with Django 5.1.15, DRF 3.17.2, and Celery 5.7.0.
    - Neither `uvicorn`, `gunicorn`, nor `uvicorn-worker` are installed in the local Windows environment (`backend/.venv`), nor are they listed in `backend/requirements.txt` (preserving pure development portability).
    - Compatibility Matrix for Linux/Container Staging Deployment:
      - `uvicorn-worker>=0.3.0` requires `uvicorn>=0.31.0` and `gunicorn>=22.0.0` on Python $\ge$ 3.9.
      - Fully compatible with project dependencies (`Django 5.1.x`, `drf 3.17.x`).
    - On Linux/Container staging environments, install `uvicorn-worker>=0.3.0`, `uvicorn>=0.34.0`, and `gunicorn>=23.0.0`.
    - On Windows local hosting, Gunicorn is unsupported (UNIX fork/signal process model); standalone Uvicorn or Django's built-in ASGI server is the verified local runtime.
  - **Option 1 (Recommended Linux/Container Staging):**
    ```bash
    gunicorn config.asgi:application \
      -k uvicorn_worker.UvicornWorker \
      --workers 4 \
      --timeout 120 \
      --graceful-timeout 75 \
      --bind 0.0.0.0:8000
    ```
  - **Option 2 (Standalone Uvicorn for Local Windows Staging):**
    ```powershell
    uvicorn config.asgi:application --host 0.0.0.0 --port 8000 --workers 4 --lifespan off --timeout-keep-alive 75
    ```
- **Graceful Timeout Calibration vs 60-Second SSE Stream:**
  - `RealtimeStreamView` in `apps/notifications/views.py` sets `max_duration = int(request.query_params.get("max_duration", 60))` with heartbeats every 15 seconds.
  - A standard Gunicorn `--graceful-timeout 30` is **critically unsafe**: any SSE connection opened within 30 seconds prior to a reload or shutdown will be forcibly severed by `SIGKILL` at the 30-second mark, causing unhandled disconnect errors on web/mobile clients, broken stream states, and spurious 502/504 errors on reverse proxies.
  - **Configuration Standard:** `--graceful-timeout 75` (or `90`). When Gunicorn receives `SIGTERM`, workers stop accepting new requests, allowing existing 60-second SSE streams to finish their natural lifecycle and emit proper termination frames before the worker exits cleanly. Standard REST API requests (<500ms) drain almost immediately.
  - The worker silence timeout `--timeout 120` provides ample headroom above the 15-second heartbeat interval and the 60-second max stream duration.
- **Reverse Proxy (Nginx) SSE Configuration:**
  ```nginx
  location /api/notifications/realtime/stream/ {
      proxy_pass http://127.0.0.1:8000;
      proxy_http_version 1.1;
      proxy_set_header Connection '';
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_buffering off;
      proxy_cache off;
      proxy_read_timeout 300s;
      chunked_transfer_encoding on;
  }
  ```
- **Health Checks & Graceful Shutdown:**
  - Health check endpoint: `GET /api/health/` (monitors DB connectivity via `connection.ensure_connection()`).
  - Graceful shutdown handles `SIGTERM` / `SIGINT` with the 75-second drain window allowing active SSE streams and database transactions to conclude without data truncation.

---

## 3. Background Processing: Celery Worker & Celery Beat Architecture

### A. Codebase Verification
The project contains active asynchronous background tasks and scheduled routines:
- `backend/config/celery.py`: Celery app initialization with autodiscovery.
- `apps/reminders/tasks.py`: `check_and_send_due_reminders` (scheduled every 15 min).
- `apps/court_data/tasks.py`: `sync_tracked_case_statuses` (scheduled every 5 min with distributed lock).
- `apps/tokens/tasks.py`: `sync_active_token_alerts` (scheduled every 60 sec with proximity logic).
- `apps/notifications/tasks.py`: `retry_failed_push_notifications` (every 5 min), `prune_realtime_events` (daily).
- `apps/voice/tasks.py`: Asynchronous speech transcription worker tasks.

### B. Redis Architecture: Logical Separation vs Infrastructure Isolation

> [!WARNING]
> **CRITICAL ARCHITECTURAL DISTINCTION: LOGICAL DB SEPARATION IS NOT INFRASTRUCTURE ISOLATION**  
> Redis DB numbers (e.g. DB 2, 3, 4) exist within a single Redis process, sharing the same single-threaded event loop, same CPU core, and same unified memory pool (`maxmemory`).  
> 1. **Logical vs Physical Separation:** Using `redis://localhost:6379/2` for cache and `redis://localhost:6379/3` for Celery creates namespace separation only. Both share memory, threads, and configuration.  
> 2. **Precision on `volatile-lru` Eviction Policy:**  
>    - `volatile-lru` evicts **only keys that have an explicit expiration (TTL) set**.  
>    - Standard Celery task queues (Redis Lists or Streams) **do not have a TTL set**. Therefore, `volatile-lru` **does NOT automatically evict Celery queue messages**.  
>    - However, if memory reaches `maxmemory` and no keys with TTL remain to be evicted, `volatile-lru` **behaves exactly like `noeviction`**, causing write operations to fail with Out-Of-Memory errors (`OOM command not allowed when used memory > 'maxmemory'`).  
> 3. **Risks of `allkeys-lru` Policy:**  
>    - Under `allkeys-lru`, Redis evicts *any* key regardless of whether a TTL exists.  
>    - If Celery task queues share a Redis instance configured with `allkeys-lru`, memory pressure from cache churn **will silently evict pending Celery task messages**, resulting in dropped court sync tasks, missing reminders, and broken workflows without any application error.

#### Recommended Staging Configuration: Dedicated Redis Broker Instance
To guarantee zero task loss and predictable staging reliability, deploy two distinct Redis services:

1. **Staging Redis Cache Instance (Port 6379):**
   - **Connection URL:** `REDIS_CACHE_URL=redis://<staging_redis_host>:6379/2`
   - **Purpose:** Ephemeral Django cache, throttling buckets, distributed lock coordination (`common/distributed_lock.py`), and SSE pub/sub channels (`realtime:user:<id>`).
   - **Eviction Policy:** `maxmemory-policy volatile-lru` (or `allkeys-lru`). Cache data is ephemeral; eviction of expired keys is safe and expected.
   - **Persistence:** Optional or periodic RDB snapshots (`save 900 1`).

2. **Dedicated Celery Redis Broker & Result Instance (Port 6380):**
   - **Broker URL (`CELERY_BROKER_URL`):** `redis://<staging_redis_host>:6380/0`
   - **Result Backend (`CELERY_RESULT_BACKEND`):** `redis://<staging_redis_host>:6380/1`
   - **Mandatory Eviction Policy:** **`maxmemory-policy noeviction`**. Under memory pressure, Redis must reject new task publications with an explicit error (`OOM command not allowed`) rather than silently dropping pending queue messages.
   - **Broker & Result Backend Co-location Safeguards:**
     - The broker and result backend *can* share this dedicated Redis instance, provided result accumulation is strictly bounded.
     - **Mandatory Result Expiration:** Pin `CELERY_RESULT_EXPIRES = 86400` (24 hours) or shorter (e.g. 3600s / 1 hour) in Django settings to ensure old results are evicted by TTL.
     - **Task-Level Result Suppression:** For high-frequency scheduled tasks (`sync_tracked_case_statuses`, `sync_active_token_alerts`, `prune_realtime_events`), configure `@shared_task(ignore_result=True)` so return values are never written to the result backend.
     - **Memory Capacity Protection:** Without TTL expiration and result suppression, unexpired task results accumulate under `noeviction` until RAM is exhausted, causing the broker to reject all subsequent task publications.
   - **Memory Monitoring & Capacity Planning:**
     - Provision minimum 1 GB dedicated RAM for the broker instance.
     - Instrument with Redis Exporter / Prometheus tracking `used_memory`, `connected_clients`, and queue length (`LLEN celery`).
     - Configure alerts at 75% memory threshold (warning) and 90% (critical).
   - **Persistence & Disaster Recovery Requirements:**
     - **AOF (Append-Only File):** Enable `appendonly yes` with `appendfsync everysec`, `auto-aof-rewrite-percentage 100`, and `auto-aof-rewrite-min-size 64mb`. In case of unexpected server reboot or crash, Redis restarts and replays the AOF log, bounding maximum task loss to 1 second.
     - **RDB Snapshots:** Enable periodic RDB snapshots (`save 900 1`, `save 300 10`, `save 60 10000`) for point-in-time recovery.
     - **Disaster Recovery:** Daily off-host backup of `appendonlydir/` and `dump.rdb` files.

### C. Celery Beat Scheduler: Singleton Requirement & Persistent State

> [!IMPORTANT]
> **ARCHITECTURAL SINGLETON MANDATE VS RUNTIME VERIFICATION**  
> - **Architectural Mandate:** Exactly ONE Celery Beat scheduler instance must run for the staging environment. Celery Beat is a periodic dispatcher (cron-like timer), not a worker. If multiple Beat schedulers run, every periodic task is dispatched redundantly (duplicate court sync queries, duplicate reminders, duplicate token alerts).  
> - **Runtime Verification Distinction:** The architectural mandate establishes the design requirement. At runtime, singleton execution must be operationally verified by ensuring only one service unit is enabled (`systemctl is-active aphc-celery-beat`), monitoring running processes (`ps aux | grep "celery.*beat"`), and avoiding auto-scaling.  
> - **Persistent Schedule Location:** The schedule file must NOT be stored in `/var/run/` or `/run/` because those directories are mounted on `tmpfs` in modern Linux distributions and are destroyed on reboot. The schedule file MUST be stored in a persistent directory: `/var/lib/aphc/celery/beat-schedule`.  
> - **Service User Ownership & Permissions:** Directory `/var/lib/aphc/celery/` must be owned by `aphc:aphc` with permissions `0750` (`chmod 750 /var/lib/aphc/celery`).

### D. Process Supervision (Systemd Example)

**1. Celery Worker (`/etc/systemd/system/aphc-celery-worker.service`):**
```ini
[Unit]
Description=APHC Case Tracker Celery Worker
After=network.target redis-broker.service

[Service]
Type=forking
User=aphc
Group=aphc
WorkingDirectory=/opt/aphc/backend
EnvironmentFile=/opt/aphc/backend/.env.staging
ExecStart=/opt/aphc/backend/.venv/bin/celery -A config worker --loglevel=INFO --concurrency=2 --pidfile=/run/celery/worker.pid
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**2. Celery Beat Scheduler (`/etc/systemd/system/aphc-celery-beat.service`):**
```ini
[Unit]
Description=APHC Case Tracker Celery Beat Scheduler (SINGLETON - DO NOT DUPLICATE)
After=network.target aphc-celery-worker.service

[Service]
Type=simple
User=aphc
Group=aphc
WorkingDirectory=/opt/aphc/backend
EnvironmentFile=/opt/aphc/backend/.env.staging
# Schedule file placed in persistent /var/lib/ storage (not ephemeral /run tmpfs)
ExecStart=/opt/aphc/backend/.venv/bin/celery -A config beat --loglevel=INFO --pidfile=/run/celery/beat.pid --schedule=/var/lib/aphc/celery/beat-schedule
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

---

## 4. Protected Media Storage & Access Control Architecture

### A. Storage Architecture
- Case documents and voice notes are stored using `SecureDocumentStorage` (`apps/cases/storage.py`) and `SecureVoiceStorage` (`apps/voice/storage.py`), which subclass Django's `FileSystemStorage`.
- **Absolute URL Prohibition:** The storage classes intentionally override `.url(name)` to raise `NotImplementedError("Direct public URLs are prohibited...")`.
- **Location on Disk:**
  - Documents: `SECURE_DOCUMENT_ROOT=/var/data/staging/case_documents`
  - Voice Notes: `SECURE_VOICE_ROOT=/var/data/staging/voice_notes`
- **File System Permissions:** Storage root must be `chown -R aphc:aphc` with `chmod 750` so that files are inaccessible to unauthorized local users and cannot be served by static web server aliases.

### B. Authorized Retrieval Flow
1. Client requests document via `GET /api/cases/{case_id}/documents/{id}/download/`.
2. View validates JWT authentication and checks `case.tracked_by.filter(id=request.user.id).exists()`.
3. If unauthorized: Returns `404 Not Found` (anti-enumeration defense).
4. If authorized: Streams binary file with `FileResponse` and headers `Content-Disposition: attachment; filename="safe_name.ext"`.

### C. Backup, Off-Host Transfer & Restoration Runbook

> [!CAUTION]
> **MEDIA BACKUP CRITICAL REQUIREMENT: OFF-HOST STORAGE & DATABASE CONSISTENCY**  
> Local-only backups leave sensitive legal documents and client voice records vulnerable to single-node disk failures or host corruption. Staging media backups must be encrypted, checksummed, and transferred to an isolated off-host location.  
> **Status Clarification:** The restoration procedure below is a **documented operational runbook ready for verification**; it is NOT an executed test. No claims of executed restoration testing are made without live execution logs.

#### 1. Database and Media Backup Consistency Protocol
Point-in-time skew between the PostgreSQL database dump and the filesystem media archive can cause critical referential inconsistencies:
- **Skew Risk 1 (DB Dump after Media Archive):** An advocate uploads a case document after the media archive completes but before the database dump finishes. The restored database contains a `CaseDocument` row referencing a file that does not exist in the media volume, causing `404 Not Found` errors.
- **Skew Risk 2 (Media Archive after DB Dump):** An upload completes after the DB dump begins. The restored media directory contains orphaned files without database records.
- **Consistency Protocol:**
  1. **Synchronized Snapshot Window:** Automated backup jobs must initiate the media tar archive immediately concurrent with the `pg_dump` transaction snapshot.
  2. **Maintenance / Read-Only Window:** For disaster recovery baselines, place the staging application in read-only mode during the snapshot window to guarantee 100% 1:1 parity between database rows and disk files.
  3. **Post-Restoration Integrity Verification:** Execute an automated script to cross-reference every `casedocument.file_path` and `voicenote.audio_file` row against the filesystem.

#### 2. Daily Encrypted Off-Host Backup Procedure
```bash
#!/usr/bin/env bash
set -euo pipefail
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/media"
STAGING_DIR="/var/data/staging"
ARCHIVE_NAME="staging_media_${BACKUP_DATE}.tar.gz"
ENCRYPTED_ARCHIVE="${ARCHIVE_NAME}.enc"

mkdir -p "${BACKUP_DIR}"

# 1. Create compressed archive of media volumes
tar -czf "${BACKUP_DIR}/${ARCHIVE_NAME}" -C "${STAGING_DIR}" .

# 2. Compute SHA256 checksum of raw archive
sha256sum "${BACKUP_DIR}/${ARCHIVE_NAME}" > "${BACKUP_DIR}/${ARCHIVE_NAME}.sha256"

# 3. Encrypt archive with GPG using dedicated backup passphrase/key
gpg --symmetric --batch --yes --passphrase-file /etc/aphc/backup_passphrase.key \
  -o "${BACKUP_DIR}/${ENCRYPTED_ARCHIVE}" "${BACKUP_DIR}/${ARCHIVE_NAME}"

# 4. Ship encrypted archive and checksum to off-host backup server / isolated bucket
rsync -avz -e "ssh -i /etc/aphc/backup_ssh_key" \
  "${BACKUP_DIR}/${ENCRYPTED_ARCHIVE}" "${BACKUP_DIR}/${ARCHIVE_NAME}.sha256" \
  aphc-backup@backup-host.internal:/remote/backups/aphc-staging/media/

# 5. Clean up unencrypted local archive (keep encrypted locally for 7 days, off-host for 30 days)
rm -f "${BACKUP_DIR}/${ARCHIVE_NAME}"
find "${BACKUP_DIR}" -name "staging_media_*.enc" -mtime +7 -delete
find "${BACKUP_DIR}" -name "staging_media_*.sha256" -mtime +7 -delete
```

#### 3. Documented Step-by-Step Restoration Runbook
*(To be executed during a designated disaster recovery verification exercise)*

1. **Step 1: Retrieve Encrypted Backup from Off-Host Storage:**
   ```bash
   rsync -avz -e "ssh -i /etc/aphc/backup_ssh_key" \
     aphc-backup@backup-host.internal:/remote/backups/aphc-staging/media/staging_media_<target_date>.tar.gz.enc /var/backups/media/
   rsync -avz -e "ssh -i /etc/aphc/backup_ssh_key" \
     aphc-backup@backup-host.internal:/remote/backups/aphc-staging/media/staging_media_<target_date>.tar.gz.sha256 /var/backups/media/
   ```

2. **Step 2: Decrypt Backup Archive:**
   ```bash
   gpg --decrypt --batch --yes --passphrase-file /etc/aphc/backup_passphrase.key \
     -o /var/backups/media/staging_media_<target_date>.tar.gz \
     /var/backups/media/staging_media_<target_date>.tar.gz.enc
   ```

3. **Step 3: Verify Checksum and Archive Integrity:**
   ```bash
   cd /var/backups/media
   sha256sum -c staging_media_<target_date>.tar.gz.sha256
   tar -tzf staging_media_<target_date>.tar.gz > /dev/null && echo "Archive integrity valid"
   ```

4. **Step 4: Extract Media Files to Staging Storage Directory:**
   ```bash
   tar -xzf /var/backups/media/staging_media_<target_date>.tar.gz -C /var/data/staging/
   ```

5. **Step 5: Enforce Secure Ownership and Strict Permissions:**
   ```bash
   chown -R aphc:aphc /var/data/staging
   chmod -R 750 /var/data/staging
   ```

6. **Step 6: Programmatic Restoration Verification:**
   Execute a programmatic test in Django shell to verify storage classes can locate and read the restored files:
   ```bash
   python manage.py shell --settings=config.settings.staging -c "
   from apps.cases.storage import SecureDocumentStorage
   from apps.voice.storage import SecureVoiceStorage
   doc_storage = SecureDocumentStorage()
   voice_storage = SecureVoiceStorage()
   print('Document storage path exists:', doc_storage.exists('.'))
   print('Voice storage path exists:', voice_storage.exists('.'))
   print('Restoration verification successful!')
   "
   ```

---

## 5. Security, Secrets & Operations Configuration

### A. Distinction Between Public Client Config and Server Secrets

| Variable Name | Exposure | Purpose / Scope |
| :--- | :---: | :--- |
| `EXPO_PUBLIC_API_URL` | **PUBLIC** | Baked into frontend static bundle at build time (e.g. `https://staging-api.aphccasetracker.com/api`). Contains no secrets. |
| `DJANGO_SECRET_KEY` | **PRIVATE (SECRET)** | Used for cryptographic session signing and CSRF verification. Minimum 50 random characters. |
| `JWT_SECRET_KEY` | **PRIVATE (SECRET)** | Dedicated key for SimpleJWT token signing; strictly separated from `DJANGO_SECRET_KEY`. |
| `DATABASE_URL` | **PRIVATE (SECRET)** | PostgreSQL connection string including staging user credentials. Strictly non-production. |
| `REDIS_CACHE_URL` | **PRIVATE (SECRET)** | Redis cache and locks connection string (`redis://<host>:6379/2`). |
| `CELERY_BROKER_URL` | **PRIVATE (SECRET)** | Celery queue broker connection string (`redis://<host>:6380/0`). |
| `CELERY_RESULT_BACKEND` | **PRIVATE (SECRET)** | Celery results backend connection string (`redis://<host>:6380/1`). |

### B. Network & Web Security Parameters
- **CORS:** `CORS_ALLOW_ALL_ORIGINS = False`; `CORS_ALLOWED_ORIGINS = ["https://staging.aphccasetracker.com"]`.
- **CSRF:** `CSRF_TRUSTED_ORIGINS = ["https://staging.aphccasetracker.com"]`.
- **Allowed Hosts:** `DJANGO_ALLOWED_HOSTS = ["staging-api.aphccasetracker.com", "127.0.0.1", "localhost"]`. Wildcards (`*`) strictly rejected by `production.py`.
- **HTTPS & Cookie Security:** `SECURE_SSL_REDIRECT = True`, `SESSION_COOKIE_SECURE = True`, `CSRF_COOKIE_SECURE = True`, `SECURE_HSTS_SECONDS = 31536000`.

### C. Database Backup & Rollback Runbook

**1. Staging Database Backup:**
```bash
pg_dump -U aphc_staging_app -h 127.0.0.1 -p 5432 -F c -b -v -f /backups/db/staging_db_$(date +%Y%m%d_%H%M%S).dump aphc_case_tracker_staging
```

**2. Staging Database Restore (Rollback):**
```bash
pg_restore -U aphc_staging_app -h 127.0.0.1 -p 5432 -d aphc_case_tracker_staging --clean --if-exists -v /backups/db/staging_db_<timestamp>.dump
```

**3. Migration Reversal:**
```bash
python manage.py migrate <app_name> <target_migration_number> --settings=config.settings.staging
```

---

## 6. Exact PostgreSQL 18.6 Compatibility Verification Plan

> [!CAUTION]
> **STRICT SAFETY RULE:** Never connect to Neon production for testing. Testing against PostgreSQL 18.6 must occur in an isolated non-production container runner or disposable sandbox.

### Verification Execution Protocol (Using Immutable Patch-Version Image):
1. **Runner Environment:** Host does not currently have Docker installed. This step should execute in an isolated CI/CD runner (e.g. GitHub Actions, GitLab CI, or a remote container runner) where Docker is provisioned.
2. **Immutable Image Specification:**
   - Image Tag: `postgres:18.6`
   - Immutable Digest Pinning: `docker.io/library/postgres@sha256:<exact_immutable_digest>`
3. **Execution Commands in Isolated Runner:**
   ```bash
   # Launch isolated non-production PostgreSQL 18.6 container
   docker run --name aphc-pg18-compat-runner \
     -e POSTGRES_DB=aphc_pg18_verification \
     -e POSTGRES_USER=aphc_test_user \
     -e POSTGRES_PASSWORD=EphemeralTestPassword123! \
     -p 127.0.0.1:5433:5432 -d postgres:18.6

   # Export environment to target sandbox
   export DATABASE_URL="postgresql://aphc_test_user:EphemeralTestPassword123!@127.0.0.1:5433/aphc_pg18_verification"

   # Apply complete migration chain (52 migrations)
   python manage.py migrate

   # Run complete 397-item backend test suite
   pytest backend/

   # Destroy container and volumes immediately
   docker rm -f -v aphc-pg18-compat-runner
   ```
4. **Sign-off Condition:** When 397/397 tests pass against the PostgreSQL 18.6 sandbox, update status from `PostgreSQL 18.6 compatibility pending` to `Verified on PostgreSQL 18.6`.

---

## 7. Remaining Decisions Required Before Staging Deployment

Before initiating any staging deployment operations, the following hosting decisions are required:

1. **Target Staging Hosting Environment:**
   - **Option A (Local Host Staging):** Run Django ASGI (standalone Uvicorn) and Expo Web export on the current Windows host alongside local PostgreSQL 16.15 and Memurai.
   - **Option B (Dedicated Staging Linux VM / VPS):** Deploy to an isolated Linux staging server (e.g. AWS EC2, DigitalOcean, or Hetzner) using the systemd, Gunicorn+`uvicorn_worker.UvicornWorker`, dual-Redis, and Nginx runbooks.
   - **Option C (Containerized Staging):** Containerize the stack (Docker Compose) on an isolated staging server with pinned PostgreSQL and dual-Redis services.
2. **PostgreSQL 18.6 Validation Execution Timing:**
   - Confirm whether to run the exact patch-version container verification (`postgres:18.6`) on an isolated CI/CD runner prior to staging deployment, or proceed with staging deployment on verified PostgreSQL 16.15 first.
3. **Formal Approval to Deploy:**
   - Confirm approval to execute actual staging deployment commands once the hosting environment is selected.
   - *Note:* Production deployment remains strictly unapproved.
