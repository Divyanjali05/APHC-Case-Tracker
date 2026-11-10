#!/usr/bin/env bash
# ==============================================================================
# Automated PostgreSQL Daily Backup & Retention Script for APHC Case Tracker
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/aphc_postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP="$(date +'%Y%m%d_%H%M%S')"
CONTAINER_NAME="${DB_CONTAINER:-aphc_prod_db}"
DB_NAME="${DB_NAME:-highcourt_lawyer_db}"
DB_USER="${DB_USER:-aphc_user}"
BACKUP_FILE="${BACKUP_DIR}/aphc_db_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting PostgreSQL backup for ${DB_NAME}..."

# Execute pg_dump inside running Docker container and stream to gzip
docker exec -t "${CONTAINER_NAME}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists --no-owner --no-privileges | gzip -9 > "${BACKUP_FILE}"

# Verify backup archive integrity
if gzip -t "${BACKUP_FILE}"; then
    BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup created successfully: ${BACKUP_FILE} (Size: ${BACKUP_SIZE})"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Backup archive verification failed!" >&2
    rm -f "${BACKUP_FILE}"
    exit 1
fi

# Apply retention policy: remove backups older than RETENTION_DAYS
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Purging backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "aphc_db_*.sql.gz" -mtime +"${RETENTION_DAYS}" -exec rm -f {} \;

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup & retention cycle completed."
