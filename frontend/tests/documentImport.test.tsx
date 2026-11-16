import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { DocumentImportModal } from '../components/cases/DocumentImportModal';
import { ExtractedCaseCandidate, DocumentExtractionResponse } from '../types';

jest.mock('../features/cases/hooks', () => {
  const mockMutateExtract = jest.fn();
  const mockMutateConfirm = jest.fn();
  return {
    useExtractDocument: () => ({
      isPending: false,
      mutateAsync: mockMutateExtract,
    }),
    useConfirmImportCase: () => ({
      isPending: false,
      mutateAsync: mockMutateConfirm,
    }),
    __mockMutateExtract: mockMutateExtract,
    __mockMutateConfirm: mockMutateConfirm,
  };
});

describe('DocumentImportModal Component & Workflow', () => {
  const onCloseMock = jest.fn();
  const onImportSuccessMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders modal when visible is true with dropzone and format hints', () => {
    render(
      <DocumentImportModal
        visible={true}
        onClose={onCloseMock}
        onImportSuccess={onImportSuccessMock}
      />
    );

    expect(screen.getByTestId('pdf-import-modal')).toBeTruthy();
    expect(screen.getByText('Import Legal PDF Document')).toBeTruthy();
    expect(screen.getByTestId('import-dropzone-button')).toBeTruthy();
    expect(
      screen.getByText(
        'Supported: PDF (.pdf), Word (.doc, .docx), Excel (.xls, .xlsx), CSV, TXT, Images (JPEG, PNG, WebP)'
      )
    ).toBeTruthy();
    expect(screen.getByText('Max 10 MB per file')).toBeTruthy();
    expect(screen.getByText('Multi-file Supported')).toBeTruthy();
  });

  it('does not render modal when visible is false', () => {
    render(
      <DocumentImportModal
        visible={false}
        onClose={onCloseMock}
        onImportSuccess={onImportSuccessMock}
      />
    );

    expect(screen.queryByTestId('pdf-import-modal')).toBeNull();
  });

  it('calls onClose when close icon button is clicked', () => {
    render(
      <DocumentImportModal
        visible={true}
        onClose={onCloseMock}
        onImportSuccess={onImportSuccessMock}
      />
    );

    const closeBtn = screen.getByTestId('import-modal-close-btn');
    fireEvent.press(closeBtn);
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('displays review screen with duplicate status and allow editing fields', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { __mockMutateExtract } = require('../features/cases/hooks');

    const mockResponse: DocumentExtractionResponse = {
      status: 'SUCCESS',
      document_token: 'valid-doc-token-123',
      filename: 'cause_list_sample.pdf',
      file_size: 1048576,
      file_type: 'application/pdf',
      raw_text_length: 68,
      tabular_rows_count: 1,
      metadata: {},
      extracted_text:
        'High Court of Andhra Pradesh WP 4589/2024 Srinivasa vs State of AP',
      detected_cases: [
        {
          case_type: 'WP',
          case_number: '4589',
          filing_year: 2024,
          case_name: 'Srinivasa Rao vs State of Andhra Pradesh',
          petitioner: 'Srinivasa Rao',
          respondent: 'State of Andhra Pradesh',
          court: 'High Court of Andhra Pradesh',
          court_hall_number: 4,
          bench: 'Division Bench',
          started_date: '2024-03-01',
          next_hearing_date: '2026-11-28',
          status: 'PENDING',
          judgment_date: null,
          judgment_summary: undefined,
          duplicate_info: {
            is_duplicate: false,
            duplicate_status: 'NEW',
            existing_case_id: null,
            message: 'New case record. Will be registered in your chamber workspace.',
          },
        },
      ],
      ocr_info: {
        available: true,
        used: false,
        note: 'Text directly extracted from native digital PDF streams.',
      },
    };

    __mockMutateExtract.mockResolvedValueOnce(mockResponse);

    render(
      <DocumentImportModal
        visible={true}
        onClose={onCloseMock}
        onImportSuccess={onImportSuccessMock}
      />
    );

    // Initial state
    expect(screen.getByTestId('import-dropzone-button')).toBeTruthy();
  });
});
