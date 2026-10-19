# Environment Configuration Guide

This document outlines the required and optional environment variables for the APHC Case Tracker monorepo.

> [!IMPORTANT]
> Never commit real secrets, private keys, database passwords, or production API tokens to source control. Use `.env.example` as a template and configure local `.env` files locally.

---

## 1. Backend Environment Variables (`backend/.env`)

| Variable                | Description                                                                                            | Default / Example                                          | Required             |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | -------------------- |
| `DJANGO_DEBUG`          | Enables Django debug mode (`True`/`False`)                                                             | `True`                                                     | No                   |
| `DJANGO_SECRET_KEY`     | Secret key used for cryptographic signing                                                              | `django-insecure-phase0-placeholder`                       | Yes                  |
| `DJANGO_ALLOWED_HOSTS`  | Comma-separated list of permitted hostnames                                                            | `localhost,127.0.0.1`                                      | Yes                  |
| `DATABASE_URL`          | PostgreSQL connection URL. If unset or unavailable, system falls back to SQLite for local development. | `postgres://postgres:postgres@localhost:5432/aphc_tracker` | No (SQLite fallback) |
| `CELERY_BROKER_URL`     | Redis URL for Celery message broker                                                                    | `redis://localhost:6379/0`                                 | No                   |
| `CELERY_RESULT_BACKEND` | Redis URL for Celery task results                                                                      | `redis://localhost:6379/1`                                 | No                   |
| `JWT_SECRET_KEY`        | Secret key for signing SimpleJWT tokens                                                                | `jwt-secret-placeholder-key`                               | Yes                  |
| `JWT_ACCESS_MINUTES`    | Lifetime of JWT access token in minutes                                                                | `60`                                                       | No                   |
| `JWT_REFRESH_DAYS`      | Lifetime of JWT refresh token in days                                                                  | `14`                                                       | No                   |
| `CORS_ALLOWED_ORIGINS`  | Permitted origins for mobile/web CORS                                                                  | `http://localhost:8081,http://localhost:19006`             | No                   |
| `EXPO_ACCESS_TOKEN`     | Token for Expo push notification delivery                                                              | `placeholder_expo_token`                                   | No (in Phase 0/1)    |

---

## 2. Mobile Environment Variables (`mobile/.env`)

| Variable                     | Description                                                     | Default / Example                                                                        | Required |
| ---------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------- |
| `EXPO_PUBLIC_API_URL`        | Base URL for Django REST Framework API                          | `http://10.0.2.2:8000/api` (Android emulator) or `http://localhost:8000/api` (iOS / Web) | Yes      |
| `EXPO_PUBLIC_ENV`            | Environment identifier (`development`, `staging`, `production`) | `development`                                                                            | Yes      |
| `EXPO_PUBLIC_APP_NAME`       | Display name of the mobile application                          | `APHC Case Tracker`                                                                      | No       |
| `EXPO_PUBLIC_DEFAULT_LOCALE` | Default language (`en` or `te`)                                 | `en`                                                                                     | No       |

---

## 3. Docker Compose Environment Variables (`.env` at root)

| Variable            | Description                    | Default        |
| ------------------- | ------------------------------ | -------------- |
| `POSTGRES_DB`       | PostgreSQL database name       | `aphc_tracker` |
| `POSTGRES_USER`     | PostgreSQL user                | `postgres`     |
| `POSTGRES_PASSWORD` | PostgreSQL password            | `postgres`     |
| `POSTGRES_PORT`     | Host port mapped to PostgreSQL | `5432`         |
| `REDIS_PORT`        | Host port mapped to Redis      | `6379`         |
