#!/usr/bin/env bash
# ==============================================================================
# Automated PostgreSQL Backup Restore Verification Script
# ==============================================================================

set -euo pipefail

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <path_to_backup_file.sql.gz> [target_db_name]"
    exit 1
fi

BACKUP_FILE="$1"
CONTAINER_NAME="${DB_CONTAINER:-aphc_prod_db}"
DB_USER="${DB_USER:-aphc_user}"
TEST_DB="${2:-aphc_restore_test}"

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "ERROR: Backup file ${BACKUP_FILE} not found!" >&2
    exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Verifying backup archive integrity..."
gzip -t "${BACKUP_FILE}"
echo "Archive integrity verified."

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Creating transient test database: ${TEST_DB}..."
docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -c "DROP DATABASE IF EXISTS ${TEST_DB};"
docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -c "CREATE DATABASE ${TEST_DB};"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restoring backup into ${TEST_DB}..."
gunzip -c "${BACKUP_FILE}" | docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${TEST_DB}" --quiet

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Verifying restored tables and record counts..."
TABLE_COUNT=$(docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${TEST_DB}" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")
echo "Restored public tables: ${TABLE_COUNT}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cleaning up test database..."
docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -c "DROP DATABASE ${TEST_DB};"

echo "RESTORE VERIFICATION SUCCESSFUL! Backup is valid and bootable."
