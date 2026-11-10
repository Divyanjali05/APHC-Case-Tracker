# APHC Case Tracker — Official Judgment PDF Link Fix Report

**Role:** Senior React Native / Expo / Django Engineer
**Project:** APHC Case Tracker
**Working Directory:** `C:\Users\divya\OneDrive\Documents\Lawyerr`
**Git Branch:** `phase-4-7-backup` (HEAD: `af58b6c`)
**Date:** 2026-11-09

---

## 1. Executive Summary & Trace Analysis

### A. End-to-End PDF URL Trace

We traced the judgment document URL lifecycle across all layers of the application stack:

```mermaid
flowchart TD
    A["CasesScreen / CaseDetailScreen"] -->|"Tap 'View Judgment' or Case Card"| B["JudgmentDetailsModal / CaseDetail"]
    B -->|"Button 'Open Official Judgment (PDF)'"| C["handleOpenDocument() / handleOpenDoc()"]
    C -->|"Linking.canOpenURL() & Linking.openURL()"| D["Native OS / System Browser"]

    subgraph Data Origin
        E["Database: cases_judgment.document_link"] --> F["Django REST API: CaseSerializer / JudgmentSerializer"]
        F --> G["HTTP Response: document_link field"]
        G --> H["Frontend React Query: useCases() / useCaseDetail()"]
        H --> B
    end

    subgraph Seed & Persistence
        I["backend/scripts/seed_e2e_data.py"] -->|"Judgment.objects.get_or_create()"| E
    end
```

1. **User Action:**
   - In `CasesScreen` (`frontend/app/(tabs)/cases.tsx`), case `WP 2002/2024` has a recorded judgment. Tapping `View Judgment ↗` opens `JudgmentDetailsModal` (`frontend/components/cases/JudgmentDetailsModal.tsx`).
   - In `CaseDetailScreen` (`frontend/app/cases/[id].tsx`), under the Judgment Section, the user sees `Open Official Judgment (PDF)`.
2. **Frontend Service & Invocation:**
   - When the user tapped `Open Official Judgment (PDF)`, `handleOpenDocument` executed:
     ```typescript
     const supported = await Linking.canOpenURL(
       effectiveJudgment.document_link,
     );
     if (supported) {
       await Linking.openURL(effectiveJudgment.document_link);
     }
     ```
3. **API Serialization:**
   - The frontend queries `GET /api/cases/` and `GET /api/cases/2/`.
   - Django REST Framework serializes `Judgment` using `JudgmentSerializer` (`backend/apps/cases/serializers.py`), returning `document_link`.
4. **Backend Model:**
   - `backend/apps/cases/models.py`:
     ```python
     class Judgment(models.Model):
         ...
         document_link = models.URLField(max_length=500, blank=True)
     ```
5. **Seed & Database Origin:**
   - `backend/scripts/seed_e2e_data.py` (line 112) populated case 2 (`WP 2002/2024`) with:
     ```python
     "document_link": "https://example.com/judgments/wp2002_2024.pdf"
     ```
   - When initial database migrations and seeding ran, this placeholder link was committed to the SQLite database `cases_judgment` table (`id=1, case_id=2`).
   - Consequently, tapping the button redirected to the IANA placeholder domain `example.com`, which failed to load an official High Court judgment.

---

## 2. Integrity & High Court Compliance Requirements

Per strict High Court legal tech guidelines:

1. **No Fabricated Content:** Never generate, mock, or present artificial PDF documents as official sealed High Court judgments.
2. **Explicit Unuploaded Notice:** When an official certified PDF has not been uploaded to the court docket, the action button is hidden/disabled, and a clear status is shown:
   > **"Official judgment PDF has not been uploaded yet."**
3. **Sanitization of External Placeholders:** Any links referencing `example.com`, `example.org`, `placeholder`, or empty/whitespace strings are treated as unuploaded/missing documents and will never trigger an external browser launch.

---

## 3. Files Modified & Changes Implemented

| File Path                                            | Nature of Modification                                                                                      | Rationale                                                                                                                   |
| :--------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------- |
| `backend/scripts/seed_e2e_data.py`                   | Removed `https://example.com/judgments/wp2002_2024.pdf` → set `"document_link": ""`                         | Eliminates placeholder external URLs from seed data generation.                                                             |
| `backend/db.sqlite3` (`cases_judgment`)              | Executed SQL update to set `document_link = ''` where `document_link LIKE '%example.com%'`                  | Cleans the active database row for case `WP 2002/2024`.                                                                     |
| `backend/tests/integration/test_judgments.py`        | Replaced `https://court-documents.example.com/...` with `https://aphc.gov.in/judgments/WP4501_2024.pdf`     | Eliminates placeholder domain references from backend tests.                                                                |
| `frontend/components/cases/JudgmentDetailsModal.tsx` | Added `isOfficialJudgmentDocumentAvailable()` validator, safe `handleOpenDocument()`, and updated UI notice | Hides action button and renders `Official judgment PDF has not been uploaded yet.` when URL is absent or a placeholder.     |
| `frontend/app/cases/[id].tsx`                        | Integrated `isOfficialJudgmentDocumentAvailable()`, safe `handleOpenDoc()`                                  | Hides action button and renders `Official judgment PDF has not been uploaded yet.` on case detail view.                     |
| `frontend/i18n/locales/en.json`                      | Added `judgment.docNotUploaded`                                                                             | Localized string: `"Official judgment PDF has not been uploaded yet."`                                                      |
| `frontend/i18n/locales/te.json`                      | Added `judgment.docNotUploaded` in Telugu                                                                   | Localized string: `"అధికారిక తీర్పు PDF ఇంకా అప్‌లోడ్ చేయబడలేదు."`                                                          |
| `frontend/i18n/locales/hi.json`                      | Added `judgment.docNotUploaded` in Hindi                                                                    | Localized string: `"आधिकारिक निर्णय पीडीएफ अभी तक अपलोड नहीं किया गया है।"`                                                 |
| `frontend/tests/casesTable.test.tsx`                 | Updated mock judgment URL to `https://aphc.gov.in/orders/ORD-2002.pdf`                                      | Removes placeholder URL from table tests.                                                                                   |
| `frontend/tests/judgmentPdfLink.test.tsx`            | **NEW TEST SUITE** (5 tests)                                                                                | Verifies valid PDF opens correctly, missing PDF shows not uploaded notice, and placeholder `example.com` URLs are rejected. |

---

## 4. Verification & Test Results

### A. Backend Pytest

Ran backend judgment tests via Python virtual environment:

```bash
$ backend/.venv/Scripts/pytest backend/tests/integration/test_judgments.py
============================= 14 passed in 11.33s =============================
```

### B. Frontend TypeScript Check

```bash
$ cd frontend; npx tsc --noEmit
# Exit code 0 (Zero errors)
```

### C. Frontend ESLint

```bash
$ cd frontend; npm run lint
# Exit code 0 (0 warnings, 0 errors)
```

### D. Frontend Jest Test Suite

```bash
$ cd frontend; npx jest --runInBand --forceExit
Test Suites: 29 passed, 29 total
Tests:       319 passed, 319 total
Snapshots:   0 total
Time:        22.746 s
```

### E. Detailed Unit Test Execution: `frontend/tests/judgmentPdfLink.test.tsx`

- `isOfficialJudgmentDocumentAvailable helper: returns true for genuine official URLs` -> **PASS**
- `isOfficialJudgmentDocumentAvailable helper: returns false for null, undefined, or empty URLs` -> **PASS**
- `isOfficialJudgmentDocumentAvailable helper: returns false for placeholder URLs like example.com or example.org` -> **PASS**
- `JudgmentDetailsModal - Valid PDF URL: renders the open official judgment button and opens valid URL` -> **PASS**
- `JudgmentDetailsModal - Missing PDF URL: shows 'Official judgment PDF has not been uploaded yet.' and hides PDF open button` -> **PASS**
- `JudgmentDetailsModal - Placeholder example.com URL Rejected: rejects example.com URL, shows not uploaded notice, and never opens placeholder link` -> **PASS**

---

## 5. Remaining Limitations & Operating Notes

1. **APHC Registry Sync:** When real certified copies are published by the High Court Registry, the sync adapter or court master upload will populate `document_link` with the authenticated court repository endpoint (e.g., `https://aphc.gov.in/judgments/...`). The UI will automatically detect the valid link and display the "Open Official Judgment (PDF)" action button without requiring any frontend code changes.
2. **Git Working Tree:** Branch remains `phase-4-7-backup` (no commits, no branch resets, all existing uncommitted modifications preserved).
