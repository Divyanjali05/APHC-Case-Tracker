# APHC CASE TRACKER — PHASE 3: GITHUB ACTIONS CI AUTOMATION REPORT

**Date:** 2026-11-04
**Project:** Andhra Pradesh High Court (APHC) Case Tracker
**Scope:** Phase 3 GitHub Actions CI/CD Pipeline Implementation, Dependency Resolution & Remote Verification
**Status:** **IN PROGRESS (Fix Committed, Remote Run Triggered)**

---

## 1. OBJECTIVE & ARCHITECTURAL OVERVIEW

The objective of Phase 3 was to design, construct, validate locally, and verify remotely the GitHub Actions Continuous Integration (CI) workflows for the APHC Case Tracker repository (`https://github.com/Divyanjali05/APHC-Case-Tracker.git`).

The CI architecture reflects the dual-stack nature of the project:

1. **Django REST Framework API (`backend/`)**: Python 3.12, PostgreSQL/SQLite support, Celery async task workers, and Redis distributed locking / pub-sub messaging.
2. **React Native Expo Application (`frontend/`)**: Node.js 20.x, React Native 0.74.5, Expo SDK 51.0.28, TypeScript, Jest, and ESLint.

To prevent wasteful compute usage and avoid unnecessary CI runs, independent, path-filtered workflows were created for Backend and Frontend pipelines, equipped with automatic concurrency cancellation.

---

## 2. WORKFLOW FILES & TRIGGER CONFIGURATION

Two dedicated workflow files exist under `.github/workflows/`:

| File Path                                                                                                                  | Workflow Name | Target Subsystem                             | Runner          |
| :------------------------------------------------------------------------------------------------------------------------- | :------------ | :------------------------------------------- | :-------------- |
| [`.github/workflows/backend-ci.yml`](file:///c:/Users/divya/OneDrive/Documents/Lawyerr/.github/workflows/backend-ci.yml)   | `Backend CI`  | Django Backend, Celery, Redis & Pytest       | `ubuntu-latest` |
| [`.github/workflows/frontend-ci.yml`](file:///c:/Users/divya/OneDrive/Documents/Lawyerr/.github/workflows/frontend-ci.yml) | `Frontend CI` | Expo React Native, Jest, TypeScript & ESLint | `ubuntu-latest` |

### Concurrency & Paths

- **Backend CI Paths:** `backend/**`, `.github/workflows/backend-ci.yml`, `docker-compose.yml`
- **Frontend CI Paths:** `frontend/**`, `.github/workflows/frontend-ci.yml`
- **Concurrency:** `cancel-in-progress: true` keyed by `${{ github.workflow }}-${{ github.ref }}`

---

## 3. INITIAL RUN ANALYSIS & DEPENDENCY CONFLICT

### Initial Run Metrics

- **Initial Commit:** `1a49d509fd190ef4ae8b6792dc18674ed25a33f1`
- **Backend CI Run:** [Run 41845084179](https://github.com/Divyanjali05/APHC-Case-Tracker/actions/runs/41845084179) — **SUCCESS** :white_check_mark:
- **Frontend CI Run:** [Run 41845084176](https://github.com/Divyanjali05/APHC-Case-Tracker/actions/runs/41845084176) — **FAILURE** :x: (Halted at `npm ci`)

### Root Cause Analysis

During clean execution of `npm ci` on the Ubuntu runner with Node.js 20.x, npm 10 enforced strict peer dependency resolution.

- `react-native@0.74.5` relies on `@react-native/codegen@0.74.87`.
- `@react-native/codegen@0.74.87` declares `"peerDependencies": { "@babel/preset-env": "^7.1.6" }`.
- `@babel/preset-env` was omitted from the root `frontend/package.json` devDependencies.
- Without `@babel/preset-env` declared at root, npm 10 encountered `ERESOLVE could not resolve peer dependency` on clean environments.

---

## 4. DEPENDENCY RESOLUTION & SYNCHRONIZATION

### Fix Implementation

Rather than using fragile workarounds like `--legacy-peer-deps` or `--force`:

1. Added compatible `@babel/preset-env` (`^7.29.7` matching project `@babel/core@7.29.7`) directly to `devDependencies` in `frontend/package.json`.
2. Synchronized `frontend/package-lock.json` cleanly, registering the exact sub-dependencies and metadata required by npm 10 without breaking lockfile integrity.
3. Preserved all Expo SDK 51 and React Native 0.74.5 packages without modification.

### Local Verification Results

| Step                             | Command                            | Local Result                                    | Exit Code |
| :------------------------------- | :--------------------------------- | :---------------------------------------------- | :-------: |
| 1. Clean Dependency Installation | `npm ci`                           | `added 1466 packages in 1m` (0 ERESOLVE errors) |    `0`    |
| 2. Jest Test Suite               | `npm test -- --watchAll=false`     | **17 suites passed, 177 tests passed**          |    `0`    |
| 3. TypeScript Typecheck          | `npx tsc --noEmit`                 | Clean compilation (0 type errors)               |    `0`    |
| 4. ESLint Static Analysis        | `npm run lint -- --max-warnings=0` | Clean analysis (0 errors, 0 warnings)           |    `0`    |

---

## 5. REMOTE CI EXECUTION VERIFICATION

_(Updated automatically upon remote GitHub Actions run completion)_

- **Fix Commit:** `fix: resolve frontend CI dependency installation`
- **Pushed Branch:** `origin/main` (`https://github.com/Divyanjali05/APHC-Case-Tracker.git`)
- **Backend CI Run Status:** Retains green status.
- **Frontend CI Run Status:** Pending remote execution tracking.

---

## 6. VERDICT

- **Local Validation:** **PASS**
- **Remote CI Run:** Awaiting completion and confirmation.
