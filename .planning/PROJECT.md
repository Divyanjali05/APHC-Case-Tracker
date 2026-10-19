# APHC Case Tracker — Project Definition

## Project Overview

APHC Case Tracker is a production-oriented mobile application and backend service tailored specifically for advocates practicing at the High Court of Andhra Pradesh (APHC, Amaravati). The system automates case tracking, cause list monitoring, real-time court hall display board tracking, token movement alerts, hearing reminders, and offline case docket management.

## Core Problem Statement

Advocates practicing at the Andhra Pradesh High Court face daily operational bottlenecks:

1. Manual tracking of daily cause lists and causelist revisions across multiple court halls.
2. Inefficient physical or manual monitoring of court hall display boards (item numbers currently being heard).
3. Missed hearings, delayed interim order compliance, and manual diary maintenance.
4. Limited internet connectivity within certain court halls, requiring resilient offline access to case dockets and notes.

## High-Level Capabilities

- **Advocate Identity & Profile**: Secure onboarding using Bar Council Enrollment Number, dual-role support (Senior Advocate / Junior / Clerk), office team collaboration.
- **Automated Case Docketing**: Search, import, and sync cases directly from APHC public records by case type, number, year, or advocate name.
- **Cause List Intelligence**: Nightly & early-morning scraping/parsing of daily cause lists, supplementaries, and advance lists with push notifications for listed matters.
- **Live Display Board & Token Alerts**: Real-time tracking of item numbers across court halls with predictive push alerts (e.g., "Court Hall 4 is 5 items away from your matter").
- **Smart Reminders & Compliance**: Automated compliance deadlines for affidavits, court fees, memo filings, and personal diary notes.
- **Offline Mode**: Local SQLite / AsyncStorage cache on mobile ensuring advocates can inspect case history, orders, and daily schedule inside courtrooms without connectivity.
- **Bilingual Interface**: Support for English and Telugu (i18n).

## Architecture & Technology Stack

- **Backend**: Python 3.12 / 3.13, Django 5.x, Django REST Framework
- **Authentication**: SimpleJWT with Refresh Token Rotation
- **Database**: PostgreSQL (production/docker), SQLite (local host fallback)
- **Asynchronous Task Queue**: Celery with Redis broker and result backend
- **Mobile Application**: React Native, Expo SDK, TypeScript, Expo Router
- **Client State & Data Fetching**: TanStack Query (React Query)
- **Local / Offline Storage**: AsyncStorage & expo-sqlite
- **Push Notifications**: Expo Push Notification Service
- **Internationalization**: i18next & react-i18next (English & Telugu)
- **Testing**: pytest, pytest-django, Jest, React Native Testing Library
- **Code Quality**: Ruff, ESLint, Prettier, CodeRabbit AI PR Reviews
