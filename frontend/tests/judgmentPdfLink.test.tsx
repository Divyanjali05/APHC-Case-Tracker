import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking, Alert } from 'react-native';
import {
  JudgmentDetailsModal,
  isOfficialJudgmentDocumentAvailable,
} from '../components/cases/JudgmentDetailsModal';
import { CaseItem, JudgmentItem } from '../types';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const translations: Record<string, string> = {
        'judgment.title': 'Judgment Details',
        'judgment.summary': 'Judgment Summary',
        'judgment.document': 'Official Order Document',
        'judgment.downloadDoc': 'Open Official Judgment (PDF)',
        'judgment.noDocTitle': 'No Document Attached',
        'judgment.docNotUploaded': 'Official judgment PDF has not been uploaded yet.',
        'judgment.docPendingRegistry':
          'Official sealed copy pending dispatch from APHC registry.',
        'cases.judgmentAvailable': 'Judgment Available',
        'common.close': 'Close',
        'common.error': 'Error',
      };
      return translations[key] || fallback || key;
    },
  }),
}));

describe('Official Judgment PDF Functionality & Safety Tests', () => {
  const mockCanOpenURL = jest.spyOn(Linking, 'canOpenURL');
  const mockOpenURL = jest.spyOn(Linking, 'openURL');
  const mockAlert = jest.spyOn(Alert, 'alert');

  beforeEach(() => {
    jest.clearAllMocks();
    mockCanOpenURL.mockResolvedValue(true);
    mockOpenURL.mockResolvedValue(undefined as never);
  });

  const baseCase: CaseItem = {
    id: 2,
    case_type: 'WP',
    case_number: '2002',
    filing_year: 2024,
    petitioner: 'Sita Devi',
    respondent: 'Tirupati Municipal Corporation',
    current_stage: 'DISPOSED',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  describe('isOfficialJudgmentDocumentAvailable helper', () => {
    it('returns true for genuine official URLs', () => {
      expect(
        isOfficialJudgmentDocumentAvailable(
          'https://aphc.gov.in/judgments/wp2002_2024.pdf'
        )
      ).toBe(true);
      expect(
        isOfficialJudgmentDocumentAvailable('https://highcourt.ap.nic.in/orders/2002.pdf')
      ).toBe(true);
    });

    it('returns false for null, undefined, or empty URLs', () => {
      expect(isOfficialJudgmentDocumentAvailable(null)).toBe(false);
      expect(isOfficialJudgmentDocumentAvailable(undefined)).toBe(false);
      expect(isOfficialJudgmentDocumentAvailable('')).toBe(false);
      expect(isOfficialJudgmentDocumentAvailable('   ')).toBe(false);
    });

    it('returns false for placeholder URLs like example.com or example.org', () => {
      expect(
        isOfficialJudgmentDocumentAvailable(
          'https://example.com/judgments/wp2002_2024.pdf'
        )
      ).toBe(false);
      expect(
        isOfficialJudgmentDocumentAvailable('http://court.example.com/order.pdf')
      ).toBe(false);
      expect(isOfficialJudgmentDocumentAvailable('https://example.org/wp2002.pdf')).toBe(
        false
      );
      expect(
        isOfficialJudgmentDocumentAvailable('https://placeholder.court.in/order.pdf')
      ).toBe(false);
    });
  });

  describe('JudgmentDetailsModal - Valid PDF URL', () => {
    const validJudgment: JudgmentItem = {
      id: 1,
      case: 2,
      judgment_date: '2024-10-15',
      order_number: 'ORD-2024-2002',
      bench: 'Hon Sri Justice K. Sharma',
      summary: 'Municipal assessment quashed for lack of notice.',
      document_link: 'https://aphc.gov.in/judgments/wp2002_2024.pdf',
      created_at: '2024-10-15T00:00:00Z',
      updated_at: '2024-10-15T00:00:00Z',
    };

    it('renders the open official judgment button and opens valid URL', async () => {
      render(
        <JudgmentDetailsModal
          visible={true}
          onClose={jest.fn()}
          caseItem={baseCase}
          judgment={validJudgment}
        />
      );

      const openBtn = screen.getByTestId('open-judgment-doc-button');
      expect(openBtn).toBeTruthy();
      expect(screen.queryByTestId('no-judgment-doc-notice')).toBeNull();

      fireEvent.press(openBtn);

      await waitFor(() => {
        expect(mockCanOpenURL).toHaveBeenCalledWith(
          'https://aphc.gov.in/judgments/wp2002_2024.pdf'
        );
        expect(mockOpenURL).toHaveBeenCalledWith(
          'https://aphc.gov.in/judgments/wp2002_2024.pdf'
        );
      });
      expect(mockAlert).not.toHaveBeenCalled();
    });
  });

  describe('JudgmentDetailsModal - Missing PDF URL', () => {
    const missingDocJudgment: JudgmentItem = {
      id: 1,
      case: 2,
      judgment_date: '2024-10-15',
      order_number: 'ORD-2024-2002',
      bench: 'Hon Sri Justice K. Sharma',
      summary: 'Municipal assessment quashed.',
      document_link: '',
      created_at: '2024-10-15T00:00:00Z',
      updated_at: '2024-10-15T00:00:00Z',
    };

    it('shows "Official judgment PDF has not been uploaded yet." and hides PDF open button', () => {
      render(
        <JudgmentDetailsModal
          visible={true}
          onClose={jest.fn()}
          caseItem={baseCase}
          judgment={missingDocJudgment}
        />
      );

      expect(screen.queryByTestId('open-judgment-doc-button')).toBeNull();
      expect(screen.getByTestId('no-judgment-doc-notice')).toBeTruthy();
      expect(
        screen.getByText('Official judgment PDF has not been uploaded yet.')
      ).toBeTruthy();

      expect(mockOpenURL).not.toHaveBeenCalled();
    });
  });

  describe('JudgmentDetailsModal - Placeholder example.com URL Rejected', () => {
    const placeholderJudgment: JudgmentItem = {
      id: 1,
      case: 2,
      judgment_date: '2024-10-15',
      order_number: 'ORD-2024-2002',
      bench: 'Hon Sri Justice K. Sharma',
      summary: 'Municipal assessment quashed.',
      document_link: 'https://example.com/judgments/wp2002_2024.pdf',
      created_at: '2024-10-15T00:00:00Z',
      updated_at: '2024-10-15T00:00:00Z',
    };

    it('rejects example.com URL, shows not uploaded notice, and never opens placeholder link', () => {
      render(
        <JudgmentDetailsModal
          visible={true}
          onClose={jest.fn()}
          caseItem={baseCase}
          judgment={placeholderJudgment}
        />
      );

      // Button must NOT be rendered for placeholder link
      expect(screen.queryByTestId('open-judgment-doc-button')).toBeNull();

      // Displays the official "not uploaded yet" notice
      expect(screen.getByTestId('no-judgment-doc-notice')).toBeTruthy();
      expect(
        screen.getByText('Official judgment PDF has not been uploaded yet.')
      ).toBeTruthy();

      // Ensure Linking is never called with example.com
      expect(mockCanOpenURL).not.toHaveBeenCalled();
      expect(mockOpenURL).not.toHaveBeenCalled();
    });
  });
});
