import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { CaseDocumentsSection } from '../components/cases/CaseDocumentsSection';
import { CaseNotesSection } from '../components/cases/CaseNotesSection';
import {
  useCaseDocuments,
  useUploadCaseDocument,
  useDeleteCaseDocument,
  useCaseNotes,
  useCreateCaseNote,
  useUpdateCaseNote,
  useDeleteCaseNote,
} from '../features/cases/hooks';
import { CaseDocumentItem, CaseNoteItem } from '../types';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  useLocalSearchParams: () => ({
    id: '1',
  }),
}));

jest.mock('@tanstack/react-query', () => {
  const original = jest.requireActual('@tanstack/react-query');
  return {
    ...original,
    useQuery: jest.fn(),
    useMutation: jest.fn(),
    useQueryClient: () => ({
      invalidateQueries: jest.fn(),
    }),
  };
});

jest.mock('react-i18next', () => {
  const enTranslations = require('../i18n/locales/en.json');
  return {
    useTranslation: () => ({
      t: (key: string, fallback?: string) => {
        const parts = key.split('.');
        let current: unknown = enTranslations;
        for (const part of parts) {
          if (current && typeof current === 'object' && part in current) {
            current = (current as Record<string, unknown>)[part];
          } else {
            return fallback || key;
          }
        }
        return typeof current === 'string' ? current : fallback || key;
      },
      i18n: {
        language: 'en',
        changeLanguage: jest.fn(),
      },
    }),
  };
});

jest.mock('../features/cases/hooks', () => ({
  useCaseDocuments: jest.fn(),
  useUploadCaseDocument: jest.fn(),
  useDeleteCaseDocument: jest.fn(),
  useCaseNotes: jest.fn(),
  useCreateCaseNote: jest.fn(),
  useUpdateCaseNote: jest.fn(),
  useDeleteCaseNote: jest.fn(),
}));

const mockDocuments: CaseDocumentItem[] = [
  {
    id: 1,
    case: 101,
    uploaded_by: 2,
    uploaded_by_name: 'Advocate Rao',
    title: 'Writ Petition Affidavit',
    document_type: 'PETITION',
    document_type_display: 'Petition',
    description: 'Main writ petition filed in High Court',
    original_filename: 'petition.pdf',
    file_size: 1048576, // 1 MB
    mime_type: 'application/pdf',
    download_url: '/api/cases/101/documents/1/download/',
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z',
  },
  {
    id: 2,
    case: 101,
    uploaded_by: 2,
    uploaded_by_name: 'Advocate Rao',
    title: 'Interim Injunction Order',
    document_type: 'COURT_ORDER',
    document_type_display: 'Court Order',
    description: 'Order granted by Division Bench',
    original_filename: 'interim_order.pdf',
    file_size: 512000,
    mime_type: 'application/pdf',
    download_url: '/api/cases/101/documents/2/download/',
    created_at: '2026-11-03T14:30:00Z',
    updated_at: '2026-11-03T14:30:00Z',
  },
];

const mockNotes: CaseNoteItem[] = [
  {
    id: 10,
    case: 101,
    advocate: 2,
    title: 'Key Arguments for Bench',
    content: 'Emphasize non-compliance of Section 45 statutory requirement.',
    is_pinned: true,
    created_at: '2026-11-02T09:00:00Z',
    updated_at: '2026-11-05T12:00:00Z',
  },
  {
    id: 11,
    case: 101,
    advocate: 2,
    title: 'Client Instructions',
    content: 'Petitioner agreed to file rejoinder affidavit by next Monday.',
    is_pinned: false,
    created_at: '2026-11-04T11:00:00Z',
    updated_at: '2026-11-04T11:00:00Z',
  },
];

describe('Phase 3: Case Documents & Private Notes Frontend Components', () => {
  const mockUploadDoc = jest.fn();
  const mockDeleteDoc = jest.fn();
  const mockCreateNote = jest.fn();
  const mockUpdateNote = jest.fn();
  const mockDeleteNote = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useUploadCaseDocument as jest.Mock).mockReturnValue({
      mutate: mockUploadDoc,
      isPending: false,
    });
    (useDeleteCaseDocument as jest.Mock).mockReturnValue({
      mutate: mockDeleteDoc,
      isPending: false,
    });
    (useCreateCaseNote as jest.Mock).mockReturnValue({
      mutate: mockCreateNote,
      isPending: false,
    });
    (useUpdateCaseNote as jest.Mock).mockReturnValue({
      mutate: mockUpdateNote,
      isPending: false,
    });
    (useDeleteCaseNote as jest.Mock).mockReturnValue({
      mutate: mockDeleteNote,
      isPending: false,
    });
  });

  describe('CaseDocumentsSection', () => {
    it('renders document items and details correctly', () => {
      (useCaseDocuments as jest.Mock).mockReturnValue({
        data: mockDocuments,
        isLoading: false,
        refetch: jest.fn(),
      });

      render(<CaseDocumentsSection caseId={101} />);

      expect(screen.getByTestId('case-documents-section')).toBeTruthy();
      expect(screen.getByText('Writ Petition Affidavit')).toBeTruthy();
      expect(screen.getByText('Interim Injunction Order')).toBeTruthy();
      expect(screen.getByTestId('upload-document-button')).toBeTruthy();
      expect(screen.getByTestId('download-doc-1')).toBeTruthy();
      expect(screen.getByTestId('delete-doc-1')).toBeTruthy();
    });

    it('displays empty state when no documents exist', () => {
      (useCaseDocuments as jest.Mock).mockReturnValue({
        data: [],
        isLoading: false,
        refetch: jest.fn(),
      });

      render(<CaseDocumentsSection caseId={101} />);
      expect(screen.getByText('No documents uploaded for this case yet.')).toBeTruthy();
    });

    it('opens upload modal and submits simulated upload', () => {
      (useCaseDocuments as jest.Mock).mockReturnValue({
        data: mockDocuments,
        isLoading: false,
        refetch: jest.fn(),
      });

      render(<CaseDocumentsSection caseId={101} />);

      // Open modal
      fireEvent.press(screen.getByTestId('upload-document-button'));

      // Enter document title
      fireEvent.changeText(
        screen.getByTestId('upload-doc-title-input'),
        'Counter Affidavit by Respondent'
      );

      // Confirm upload
      fireEvent.press(screen.getByTestId('confirm-upload-button'));

      expect(mockUploadDoc).toHaveBeenCalledWith(
        expect.objectContaining({
          caseId: 101,
          formData: expect.any(Object),
        }),
        expect.any(Object)
      );
    });
  });

  describe('CaseNotesSection', () => {
    it('renders private notes with pinned badge and sorting', () => {
      (useCaseNotes as jest.Mock).mockReturnValue({
        data: mockNotes,
        isLoading: false,
        refetch: jest.fn(),
      });

      render(<CaseNotesSection caseId={101} />);

      expect(screen.getByTestId('case-notes-section')).toBeTruthy();
      expect(screen.getByText('Key Arguments for Bench')).toBeTruthy();
      expect(screen.getByText('Pinned')).toBeTruthy();
      expect(screen.getByText('Client Instructions')).toBeTruthy();
      expect(screen.getByTestId('add-note-button')).toBeTruthy();
    });

    it('displays empty state when no notes exist', () => {
      (useCaseNotes as jest.Mock).mockReturnValue({
        data: [],
        isLoading: false,
        refetch: jest.fn(),
      });

      render(<CaseNotesSection caseId={101} />);
      expect(screen.getByText('No private notes recorded for this case.')).toBeTruthy();
    });

    it('allows searching notes via search input', () => {
      (useCaseNotes as jest.Mock).mockReturnValue({
        data: mockNotes,
        isLoading: false,
        refetch: jest.fn(),
      });

      render(<CaseNotesSection caseId={101} />);

      const searchInput = screen.getByTestId('notes-search-input');
      fireEvent.changeText(searchInput, 'Arguments');

      expect(searchInput.props.value).toBe('Arguments');
    });

    it('opens modal to create note and submits payload', () => {
      (useCaseNotes as jest.Mock).mockReturnValue({
        data: mockNotes,
        isLoading: false,
        refetch: jest.fn(),
      });

      render(<CaseNotesSection caseId={101} />);

      // Open create note
      fireEvent.press(screen.getByTestId('add-note-button'));

      // Fill in note form
      fireEvent.changeText(screen.getByTestId('note-title-input'), 'Cross-Examination Prep');
      fireEvent.changeText(
        screen.getByTestId('note-content-input'),
        'Questions regarding survey report.'
      );

      // Save
      fireEvent.press(screen.getByTestId('save-note-button'));

      expect(mockCreateNote).toHaveBeenCalledWith(
        expect.objectContaining({
          caseId: 101,
          payload: {
            title: 'Cross-Examination Prep',
            content: 'Questions regarding survey report.',
            is_pinned: false,
          },
        }),
        expect.any(Object)
      );
    });

    it('toggles pin status on a note', () => {
      (useCaseNotes as jest.Mock).mockReturnValue({
        data: mockNotes,
        isLoading: false,
        refetch: jest.fn(),
      });

      render(<CaseNotesSection caseId={101} />);

      // Toggle pin on note 10 (currently pinned -> should toggle to false)
      fireEvent.press(screen.getByTestId('toggle-pin-10'));

      expect(mockUpdateNote).toHaveBeenCalledWith(
        expect.objectContaining({
          caseId: 101,
          noteId: 10,
          payload: {
            is_pinned: false,
          },
        }),
        expect.any(Object)
      );
    });
  });
});

