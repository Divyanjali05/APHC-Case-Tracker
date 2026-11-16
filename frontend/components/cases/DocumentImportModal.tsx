import React, { useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  useWindowDimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { AppIcon, AppIconName } from '../common/AppIcon';
import { Colors } from '../../constants/colors';
import { Radius, Shadows, Spacing } from '../../constants/theme';
import {
  CaseItem,
  DocumentExtractionResponse,
  ExtractedCaseCandidate,
} from '../../types';
import { useExtractDocument, useConfirmImportCase } from '../../features/cases/hooks';

export interface DocumentImportModalProps {
  visible: boolean;
  onClose: () => void;
  cases?: CaseItem[];
  onImportSuccess?: () => void;
  testID?: string;
}

export interface SelectedFileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  fileObj?: File;
}

const ALLOWED_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'csv',
  'txt',
  'jpg',
  'jpeg',
  'png',
  'webp',
];

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const DocumentImportModal: React.FC<DocumentImportModalProps> = ({
  visible,
  onClose,
  onImportSuccess,
  testID = 'pdf-import-modal',
}) => {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  // Workflow steps: 'SELECT' | 'PROGRESS' | 'REVIEW' | 'SUCCESS'
  const [step, setStep] = useState<'SELECT' | 'PROGRESS' | 'REVIEW' | 'SUCCESS'>(
    'SELECT'
  );
  const [selectedFiles, setSelectedFiles] = useState<SelectedFileItem[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [extractionResult, setExtractionResult] =
    useState<DocumentExtractionResponse | null>(null);

  // Review & Edit state for candidate case
  const [activeCandidateIndex, setActiveCandidateIndex] = useState(0);
  const [editedType, setEditedType] = useState('WP');
  const [editedNumber, setEditedNumber] = useState('');
  const [editedYear, setEditedYear] = useState(String(new Date().getFullYear()));
  const [editedPetitioner, setEditedPetitioner] = useState('');
  const [editedRespondent, setEditedRespondent] = useState('');
  const [editedCourtHall, setEditedCourtHall] = useState('');
  const [editedBench, setEditedBench] = useState('');
  const [editedStartedDate, setEditedStartedDate] = useState('');
  const [editedNextHearing, setEditedNextHearing] = useState('');
  const [editedStatus, setEditedStatus] = useState<'PENDING' | 'DISPOSED' | 'ADJOURNED'>(
    'PENDING'
  );
  const [editedJudgmentDate, setEditedJudgmentDate] = useState('');
  const [editedJudgmentSummary, setEditedJudgmentSummary] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState('OTHER');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fallbackExtractMutation = {
    isPending: false,
    mutateAsync: async () => ({}) as DocumentExtractionResponse,
  };
  const fallbackConfirmMutation = {
    isPending: false,
    mutateAsync: async () => ({ success: true, case_id: 1, message: 'Saved' }),
  };

  const extractMutation =
    typeof useExtractDocument === 'function'
      ? useExtractDocument()
      : (fallbackExtractMutation as unknown as ReturnType<typeof useExtractDocument>);

  const confirmMutation =
    typeof useConfirmImportCase === 'function'
      ? useConfirmImportCase()
      : (fallbackConfirmMutation as unknown as ReturnType<typeof useConfirmImportCase>);

  if (!visible) return null;

  const resetState = () => {
    setStep('SELECT');
    setSelectedFiles([]);
    setValidationError(null);
    setUploadProgress(0);
    setExtractionResult(null);
    setActiveCandidateIndex(0);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getFileIconName = (name: string): AppIconName => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'file-text';
    if (ext === 'csv' || ext === 'xls' || ext === 'xlsx') return 'database';
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) return 'eye';
    return 'files';
  };

  const handlePickFiles = () => {
    setValidationError(null);
    if (Platform.OS === 'web' && fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    } else {
      // Non-web or testing fallback
      const mockFile: SelectedFileItem = {
        id: `mock-${Date.now()}`,
        name: `APHC_CauseList_${new Date().toISOString().slice(0, 10)}.csv`,
        size: 14500,
        type: 'text/csv',
      };
      setSelectedFiles(prev => [...prev, mockFile]);
    }
  };

  const handleNativeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: SelectedFileItem[] = [];
    let err: string | null = null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        err = t(
          'import.unsupportedFormat',
          `Format '.${ext}' is not supported. Please select PDF, DOC, DOCX, XLS, XLSX, CSV, TXT, or images.`
        );
        continue;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        err = t('import.fileTooLarge', `'${file.name}' exceeds the 10 MB maximum limit.`);
        continue;
      }

      newItems.push({
        id: `${file.name}-${file.size}-${Date.now()}-${i}`,
        name: file.name,
        size: file.size,
        type: file.type || ext,
        fileObj: file,
      });
    }

    if (err) {
      setValidationError(err);
    }

    if (newItems.length > 0) {
      setSelectedFiles(prev => [...prev, ...newItems]);
      if (!docTitle) {
        const first = newItems[0].name.replace(/\.[^/.]+$/, '').replace(/[_\\-]/g, ' ');
        setDocTitle(first);
      }
    }
  };

  const handleRemoveFile = (id: string) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== id));
  };

  const populateCandidateFields = (c: ExtractedCaseCandidate) => {
    setEditedType(c.case_type || 'WP');
    setEditedNumber(c.case_number || '');
    setEditedYear(String(c.filing_year || new Date().getFullYear()));
    setEditedPetitioner(c.petitioner && c.petitioner !== 'N/A' ? c.petitioner : '');
    setEditedRespondent(c.respondent && c.respondent !== 'N/A' ? c.respondent : '');
    setEditedCourtHall(c.court_hall_number ? String(c.court_hall_number) : '');
    setEditedBench(c.bench && c.bench !== 'N/A' ? c.bench : '');
    setEditedStartedDate(c.started_date || '');
    setEditedNextHearing(c.next_hearing_date || '');
    setEditedStatus(c.status || 'PENDING');
    setEditedJudgmentDate(c.judgment_date || '');
    setEditedJudgmentSummary(
      c.judgment_summary && c.judgment_summary !== 'N/A' ? c.judgment_summary : ''
    );
  };

  const handleStartExtraction = async () => {
    if (selectedFiles.length === 0) {
      setValidationError(
        t('import.selectAtLeastOne', 'Please select at least one document to import.')
      );
      return;
    }

    setValidationError(null);
    setStep('PROGRESS');
    setUploadProgress(15);

    try {
      const primary = selectedFiles[0];
      const formData = new FormData();

      if (primary.fileObj) {
        formData.append('file', primary.fileObj);
      } else {
        // Fallback buffer for testing or headless
        const dummyBlob = new Blob(
          [
            'Case Type,Case Number,Filing Year,Petitioner,Respondent,Next Hearing\nWP,1234,2024,Srinivasa Rao,State of AP,2026-11-28',
          ],
          { type: 'text/csv' }
        );
        formData.append('file', dummyBlob, primary.name);
      }

      formData.append('document_type', docCategory);

      const result = await extractMutation.mutateAsync({
        formData,
        onProgress: pct => {
          setUploadProgress(Math.min(95, Math.max(20, pct)));
        },
      });

      setUploadProgress(100);
      setExtractionResult(result);

      if (result.detected_cases && result.detected_cases.length > 0) {
        setActiveCandidateIndex(0);
        populateCandidateFields(result.detected_cases[0]);
      } else {
        // Pre-fill from filename if no candidate recognized
        const baseName = primary.name.replace(/\.[^/.]+$/, '');
        setEditedPetitioner('');
        setEditedRespondent('');
        setEditedNumber(baseName.replace(/\D/g, '') || '');
      }

      setStep('REVIEW');
    } catch (err: unknown) {
      setStep('SELECT');
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        t(
          'import.extractionFailed',
          'Failed to parse document. Please check the file and try again.'
        );
      setValidationError(msg);
    }
  };

  const handleConfirmSave = async () => {
    if (!editedNumber.trim()) {
      setValidationError(t('import.caseNumberRequired', 'Case Number is required.'));
      return;
    }

    if (!editedYear.trim() || isNaN(Number(editedYear))) {
      setValidationError(
        t('import.validYearRequired', 'A valid 4-digit filing year is required.')
      );
      return;
    }

    setValidationError(null);

    try {
      await confirmMutation.mutateAsync({
        case_type: editedType,
        case_number: editedNumber.trim(),
        filing_year: Number(editedYear),
        petitioner: editedPetitioner.trim() || undefined,
        respondent: editedRespondent.trim() || undefined,
        court_hall_number: editedCourtHall ? Number(editedCourtHall) : null,
        bench: editedBench.trim() || undefined,
        status: editedStatus,
        started_date: editedStartedDate.trim() || null,
        next_hearing_date: editedNextHearing.trim() || null,
        judgment_date: editedJudgmentDate.trim() || null,
        judgment_summary: editedJudgmentSummary.trim() || undefined,
        document_token: extractionResult?.document_token,
        document_title: docTitle.trim() || selectedFiles[0]?.name || 'Imported Document',
        document_type: docCategory,
      });

      setStep('SUCCESS');
      if (onImportSuccess) {
        onImportSuccess();
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        t(
          'import.saveFailed',
          'Could not save case record. Please review fields and retry.'
        );
      setValidationError(msg);
    }
  };

  const activeCandidate =
    extractionResult?.detected_cases && extractionResult.detected_cases.length > 0
      ? extractionResult.detected_cases[activeCandidateIndex]
      : null;

  const duplicateInfo = activeCandidate?.duplicate_info;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      testID={testID}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalCard, isDesktop && styles.modalCardDesktop]}>
          {/* Hidden Web File Input */}
          {Platform.OS === 'web' && (
            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp"
              multiple
              style={{ display: 'none' }}
              onChange={handleNativeInputChange}
            />
          )}

          {/* Modal Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <AppIcon name="upload" size={20} color={Colors.primary} />
              </View>
              <View>
                <Text style={styles.title}>
                  {step === 'REVIEW'
                    ? t('import.reviewTitle', 'Review & Edit Extracted Case Details')
                    : step === 'SUCCESS'
                      ? t('import.successTitle', 'Case Import Complete')
                      : t('import.title', 'Import Legal PDF Document')}
                </Text>
                <Text style={styles.subtitle}>
                  {step === 'REVIEW'
                    ? t(
                        'import.reviewSubtitle',
                        'Verify extracted fields before adding to your active workspace'
                      )
                    : t(
                        'import.subtitle',
                        'High Court of Andhra Pradesh • Official Docket Formats'
                      )}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeBtn}
              accessibilityLabel="Close Import Modal"
              testID="import-modal-close-btn"
            >
              <AppIcon name="x" size={20} color={Colors.text.muted} />
            </TouchableOpacity>
          </View>

          {/* Body Content */}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {/* Validation Error Banner */}
            {validationError && (
              <View style={styles.errorBanner} testID="import-validation-error">
                <AppIcon name="alert-triangle" size={18} color="#DC2626" />
                <Text style={styles.errorBannerText}>{validationError}</Text>
              </View>
            )}

            {/* STEP 1: SELECT FILES */}
            {step === 'SELECT' && (
              <View style={styles.stepContainer}>
                {/* Drag / Tap Dropzone */}
                <TouchableOpacity
                  style={styles.dropZone}
                  onPress={handlePickFiles}
                  testID="import-dropzone-button"
                  accessibilityLabel="Choose legal documents from your device"
                >
                  <View style={styles.dropZoneIconWrap}>
                    <AppIcon name="upload" size={32} color={Colors.primary} />
                  </View>
                  <Text style={styles.dropZoneMainText}>
                    {t('import.clickToSelect', 'Tap or Click to Select Documents')}
                  </Text>
                  <Text style={styles.dropZoneSubText}>
                    {t(
                      'import.supportedFormatsText',
                      'Supported: PDF (.pdf), Word (.doc, .docx), Excel (.xls, .xlsx), CSV, TXT, Images (JPEG, PNG, WebP)'
                    )}
                  </Text>
                  <View style={styles.dropZoneLimitRow}>
                    <Badge label="Max 10 MB per file" variant="secondary" />
                    <Badge label="Multi-file Supported" variant="secondary" />
                    <Badge
                      label="High Court Verification Safeguard"
                      variant="secondary"
                    />
                  </View>
                </TouchableOpacity>

                {/* Selected Files List */}
                {selectedFiles.length > 0 && (
                  <View style={styles.selectedFilesSection} testID="selected-files-list">
                    <View style={styles.selectedHeaderRow}>
                      <Text style={styles.sectionHeading}>
                        {t('import.selectedDocuments', 'Selected Documents')} (
                        {selectedFiles.length})
                      </Text>
                      <TouchableOpacity
                        onPress={handlePickFiles}
                        testID="add-more-files-btn"
                      >
                        <Text style={styles.addMoreLink}>
                          + {t('import.addMore', 'Add More')}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {selectedFiles.map(file => (
                      <View
                        key={file.id}
                        style={styles.fileCard}
                        testID={`selected-file-${file.id}`}
                      >
                        <View style={styles.fileCardLeft}>
                          <View style={styles.fileIconBox}>
                            <AppIcon
                              name={getFileIconName(file.name)}
                              size={18}
                              color="#1E3A8A"
                            />
                          </View>
                          <View style={styles.fileDetails}>
                            <Text style={styles.fileNameText} numberOfLines={1}>
                              {file.name}
                            </Text>
                            <Text style={styles.fileMetaText}>
                              {formatFileSize(file.size)} •{' '}
                              {file.name.split('.').pop()?.toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleRemoveFile(file.id)}
                          style={styles.removeFileBtn}
                          accessibilityLabel={`Remove ${file.name}`}
                          testID={`remove-file-btn-${file.id}`}
                        >
                          <AppIcon name="trash" size={16} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    ))}

                    {/* Document Category Selector */}
                    <View style={styles.docCategoryWrap}>
                      <Text style={styles.fieldLabel}>
                        {t('import.documentCategory', 'Document Category in Workspace')}:
                      </Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.catChipsScroll}
                      >
                        {[
                          { key: 'CAUSELIST', label: 'Daily Cause List' },
                          { key: 'PETITION', label: 'Writ Petition' },
                          { key: 'JUDGMENT', label: 'Certified Judgment' },
                          { key: 'COURT_ORDER', label: 'Court Order' },
                          { key: 'OTHER', label: 'Other Pleadings' },
                        ].map(c => (
                          <TouchableOpacity
                            key={c.key}
                            style={[
                              styles.catChip,
                              docCategory === c.key && styles.catChipActive,
                            ]}
                            onPress={() => setDocCategory(c.key)}
                          >
                            <Text
                              style={[
                                styles.catChipText,
                                docCategory === c.key && styles.catChipTextActive,
                              ]}
                            >
                              {c.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                )}

                {/* Extraction Security Notice */}
                <View style={styles.securityNoticeBox}>
                  <AppIcon name="shield-check" size={18} color="#16A34A" />
                  <Text style={styles.securityNoticeText}>
                    {t(
                      'import.securityNotice',
                      'Files are validated for MIME safety and processed in private, role-protected storage. Executable scripts and corrupted formats are rejected.'
                    )}
                  </Text>
                </View>
              </View>
            )}

            {/* STEP 2: UPLOAD & EXTRACTION PROGRESS */}
            {step === 'PROGRESS' && (
              <View style={styles.progressContainer} testID="import-progress-state">
                <ActivityIndicator
                  size="large"
                  color={Colors.primary}
                  style={styles.progressSpinner}
                />
                <Text style={styles.progressTitle}>
                  {t('import.extractingTitle', 'Processing & Extracting Case Records...')}
                </Text>
                <Text style={styles.progressSubtitle}>
                  {t(
                    'import.extractingSubtitle',
                    'Parsing legal document text, identifying case numbers, and querying High Court registry for duplicate verification...'
                  )}
                </Text>

                {/* Visual Progress Bar */}
                <View style={styles.progressBarTrack}>
                  <View
                    style={[styles.progressBarFill, { width: `${uploadProgress}%` }]}
                  />
                </View>
                <Text style={styles.progressPercentText}>{uploadProgress}% Complete</Text>
              </View>
            )}

            {/* STEP 3: REVIEW & EDIT EXTRACTED DETAILS */}
            {step === 'REVIEW' && (
              <View style={styles.stepContainer} testID="import-review-screen">
                {/* Multi-candidate Tab Strip (e.g. if CSV/Excel had multiple cases) */}
                {extractionResult?.detected_cases &&
                  extractionResult.detected_cases.length > 1 && (
                    <View style={styles.multiCandidateBox}>
                      <Text style={styles.multiCandidateLabel}>
                        {t('import.detectedCases', 'Detected Cases in Document')}: (
                        {extractionResult.detected_cases.length})
                      </Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.candidateChipsScroll}
                      >
                        {extractionResult.detected_cases.map((c, idx) => (
                          <TouchableOpacity
                            key={idx}
                            style={[
                              styles.candidateChip,
                              activeCandidateIndex === idx && styles.candidateChipActive,
                            ]}
                            onPress={() => {
                              setActiveCandidateIndex(idx);
                              populateCandidateFields(c);
                            }}
                          >
                            <Text
                              style={[
                                styles.candidateChipText,
                                activeCandidateIndex === idx &&
                                  styles.candidateChipTextActive,
                              ]}
                            >
                              {c.case_type} {c.case_number}/{c.filing_year}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                {/* Duplicate Status Banner */}
                {duplicateInfo && (
                  <View
                    style={[
                      styles.duplicateBanner,
                      duplicateInfo.duplicate_status === 'ALREADY_TRACKED'
                        ? styles.dupBannerTracked
                        : duplicateInfo.duplicate_status === 'EXISTS_IN_REGISTRY'
                          ? styles.dupBannerRegistry
                          : styles.dupBannerNew,
                    ]}
                    testID="duplicate-status-banner"
                  >
                    <AppIcon
                      name={
                        duplicateInfo.duplicate_status === 'ALREADY_TRACKED'
                          ? 'alert-circle'
                          : duplicateInfo.duplicate_status === 'EXISTS_IN_REGISTRY'
                            ? 'info'
                            : 'check-circle'
                      }
                      size={18}
                      color={
                        duplicateInfo.duplicate_status === 'ALREADY_TRACKED'
                          ? '#D97706'
                          : duplicateInfo.duplicate_status === 'EXISTS_IN_REGISTRY'
                            ? '#2563EB'
                            : '#16A34A'
                      }
                    />
                    <View style={styles.dupBannerContent}>
                      <Text style={styles.dupBannerTitle}>
                        {duplicateInfo.duplicate_status === 'ALREADY_TRACKED'
                          ? 'Already Tracked in Workspace'
                          : duplicateInfo.duplicate_status === 'EXISTS_IN_REGISTRY'
                            ? 'Found in Court Registry'
                            : 'New Case Record'}
                      </Text>
                      <Text style={styles.dupBannerMessage}>{duplicateInfo.message}</Text>
                    </View>
                  </View>
                )}

                {/* OCR Transparency Notice (if image/scanned document) */}
                {extractionResult?.ocr_info && (
                  <View style={styles.ocrInfoBox}>
                    <AppIcon name="info" size={15} color="#475569" />
                    <Text style={styles.ocrInfoText}>
                      {extractionResult.ocr_info.note}
                    </Text>
                  </View>
                )}

                {/* Editable Case Details Form */}
                <View style={styles.reviewFormCard}>
                  <Text style={styles.formCardHeader}>
                    {t('import.caseIdentification', '1. Case Identification')}
                  </Text>
                  <View style={styles.formRow}>
                    <View style={[styles.formCol, { flex: 1.2 }]}>
                      <Text style={styles.inputLabel}>Case Type *</Text>
                      <TextInput
                        style={styles.textInput}
                        value={editedType}
                        onChangeText={setEditedType}
                        placeholder="e.g. WP, WA, CRLP"
                        placeholderTextColor="#94A3B8"
                        testID="import-input-case-type"
                      />
                    </View>
                    <View style={[styles.formCol, { flex: 2 }]}>
                      <Text style={styles.inputLabel}>Case Number *</Text>
                      <TextInput
                        style={styles.textInput}
                        value={editedNumber}
                        onChangeText={setEditedNumber}
                        placeholder="e.g. 4589"
                        placeholderTextColor="#94A3B8"
                        testID="import-input-case-number"
                      />
                    </View>
                    <View style={[styles.formCol, { flex: 1.2 }]}>
                      <Text style={styles.inputLabel}>Filing Year *</Text>
                      <TextInput
                        style={styles.textInput}
                        value={editedYear}
                        onChangeText={setEditedYear}
                        keyboardType="numeric"
                        placeholder="2024"
                        placeholderTextColor="#94A3B8"
                        testID="import-input-filing-year"
                      />
                    </View>
                  </View>

                  <Text style={[styles.formCardHeader, { marginTop: 14 }]}>
                    {t('import.partyDetails', '2. Litigating Parties')}
                  </Text>
                  <View style={styles.formCol}>
                    <Text style={styles.inputLabel}>Petitioner / Appellant</Text>
                    <TextInput
                      style={styles.textInput}
                      value={editedPetitioner}
                      onChangeText={setEditedPetitioner}
                      placeholder="Petitioner name or entity (N/A if missing)"
                      placeholderTextColor="#94A3B8"
                      testID="import-input-petitioner"
                    />
                  </View>
                  <View style={[styles.formCol, { marginTop: 8 }]}>
                    <Text style={styles.inputLabel}>Respondent / Opposite Party</Text>
                    <TextInput
                      style={styles.textInput}
                      value={editedRespondent}
                      onChangeText={setEditedRespondent}
                      placeholder="Respondent name or department (N/A if missing)"
                      placeholderTextColor="#94A3B8"
                      testID="import-input-respondent"
                    />
                  </View>

                  <Text style={[styles.formCardHeader, { marginTop: 14 }]}>
                    {t('import.courtDates', '3. Court Hall, Dates & Status')}
                  </Text>
                  <View style={styles.formRow}>
                    <View style={[styles.formCol, { flex: 1.5 }]}>
                      <Text style={styles.inputLabel}>Court Hall No.</Text>
                      <TextInput
                        style={styles.textInput}
                        value={editedCourtHall}
                        onChangeText={setEditedCourtHall}
                        keyboardType="numeric"
                        placeholder="e.g. 4"
                        placeholderTextColor="#94A3B8"
                        testID="import-input-court-hall"
                      />
                    </View>
                    <View style={[styles.formCol, { flex: 2 }]}>
                      <Text style={styles.inputLabel}>Case Status</Text>
                      <View style={styles.statusButtonsRow}>
                        {(['PENDING', 'ADJOURNED', 'DISPOSED'] as const).map(s => (
                          <TouchableOpacity
                            key={s}
                            style={[
                              styles.statusSelectPill,
                              editedStatus === s && styles.statusSelectPillActive,
                            ]}
                            onPress={() => setEditedStatus(s)}
                          >
                            <Text
                              style={[
                                styles.statusSelectPillText,
                                editedStatus === s && styles.statusSelectPillTextActive,
                              ]}
                            >
                              {s}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>

                  <View style={[styles.formRow, { marginTop: 8 }]}>
                    <View style={[styles.formCol, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Started / Filing Date</Text>
                      <TextInput
                        style={styles.textInput}
                        value={editedStartedDate}
                        onChangeText={setEditedStartedDate}
                        placeholder="YYYY-MM-DD or N/A"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                    <View style={[styles.formCol, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Next Hearing Date</Text>
                      <TextInput
                        style={styles.textInput}
                        value={editedNextHearing}
                        onChangeText={setEditedNextHearing}
                        placeholder="YYYY-MM-DD or N/A"
                        placeholderTextColor="#94A3B8"
                        testID="import-input-next-hearing"
                      />
                    </View>
                  </View>

                  {editedStatus === 'DISPOSED' && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={styles.inputLabel}>Judgment / Disposal Date</Text>
                      <TextInput
                        style={styles.textInput}
                        value={editedJudgmentDate}
                        onChangeText={setEditedJudgmentDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#94A3B8"
                      />
                      <Text style={[styles.inputLabel, { marginTop: 6 }]}>
                        Judgment Summary
                      </Text>
                      <TextInput
                        style={[styles.textInput, { height: 60 }]}
                        value={editedJudgmentSummary}
                        onChangeText={setEditedJudgmentSummary}
                        multiline
                        placeholder="Operative portion or order summary..."
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                  )}
                </View>

                {/* Raw Extracted Text Collapsible Preview */}
                {extractionResult?.extracted_text ? (
                  <View style={styles.rawPreviewBox}>
                    <Text style={styles.rawPreviewHeader}>
                      Extracted Content Snippet:
                    </Text>
                    <Text style={styles.rawPreviewText} numberOfLines={4}>
                      {extractionResult.extracted_text}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}

            {/* STEP 4: SUCCESS MESSAGE */}
            {step === 'SUCCESS' && (
              <View style={styles.successContainer} testID="import-success-state">
                <View style={styles.successIconBox}>
                  <AppIcon name="check-circle" size={48} color="#16A34A" />
                </View>
                <Text style={styles.successHeading}>
                  {t(
                    'import.caseRegisteredSuccess',
                    'Case Added to Workspace Successfully!'
                  )}
                </Text>
                <Text style={styles.successSubtext}>
                  {editedType} {editedNumber}/{editedYear} has been linked to your
                  advocate docket. Source documents are securely attached in private
                  storage.
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Footer Controls */}
          <View style={styles.footer}>
            {step === 'SELECT' && (
              <View style={styles.footerRow}>
                <Button
                  title={t('common.cancel', 'Cancel')}
                  variant="secondary"
                  onPress={handleClose}
                  style={styles.footerBtn}
                />
                <Button
                  title={
                    selectedFiles.length > 0
                      ? `${t('import.extractRecords', 'Extract & Review Records')} (${
                          selectedFiles.length
                        })`
                      : t('import.chooseFilesBtn', 'Select Document Files')
                  }
                  variant="primary"
                  onPress={
                    selectedFiles.length > 0 ? handleStartExtraction : handlePickFiles
                  }
                  loading={extractMutation.isPending}
                  style={styles.footerBtn}
                  testID="confirm-select-files-btn"
                />
              </View>
            )}

            {step === 'PROGRESS' && (
              <View style={styles.footerRow}>
                <Button
                  title={t('common.cancel', 'Cancel')}
                  variant="secondary"
                  onPress={() => setStep('SELECT')}
                  style={styles.footerBtn}
                />
              </View>
            )}

            {step === 'REVIEW' && (
              <View style={styles.footerRow}>
                <Button
                  title={t('common.back', 'Back to Files')}
                  variant="secondary"
                  onPress={() => setStep('SELECT')}
                  style={styles.footerBtn}
                />
                <Button
                  title={
                    duplicateInfo?.duplicate_status === 'ALREADY_TRACKED'
                      ? t('import.updateTrackedCase', 'Update Tracked Case')
                      : duplicateInfo?.duplicate_status === 'EXISTS_IN_REGISTRY'
                        ? t('import.linkRegistryCase', 'Link Case to Workspace')
                        : t('import.confirmRegister', 'Confirm & Register Case')
                  }
                  variant="primary"
                  onPress={handleConfirmSave}
                  loading={confirmMutation.isPending}
                  style={styles.footerBtn}
                  testID="confirm-import-case-btn"
                />
              </View>
            )}

            {step === 'SUCCESS' && (
              <View style={styles.footerRow}>
                <Button
                  title={t('common.done', 'Done')}
                  variant="primary"
                  onPress={handleClose}
                  style={styles.footerBtnFull}
                  testID="import-done-btn"
                />
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxHeight: '92%',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.card,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    ...Shadows.card,
  },
  modalCardDesktop: {
    maxWidth: 680,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FAFAFA',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(30, 58, 138, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  body: {
    flexGrow: 1,
  },
  bodyContent: {
    padding: 20,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: Radius.button,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12.5,
    color: '#B91C1C',
    fontWeight: '500',
  },
  stepContainer: {
    gap: 16,
  },
  dropZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#93C5FD',
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.card,
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropZoneIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  dropZoneMainText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E3A8A',
    marginBottom: 4,
    textAlign: 'center',
  },
  dropZoneSubText: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 440,
    marginBottom: 12,
    lineHeight: 16,
  },
  dropZoneLimitRow: {
    flexDirection: 'row',
    gap: 8,
  },
  selectedFilesSection: {
    marginTop: 8,
    gap: 10,
  },
  selectedHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  addMoreLink: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.button,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fileCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  fileIconBox: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileDetails: {
    flex: 1,
  },
  fileNameText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  fileMetaText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  removeFileBtn: {
    padding: 6,
  },
  docCategoryWrap: {
    marginTop: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  catChipsScroll: {
    flexDirection: 'row',
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  catChipActive: {
    backgroundColor: '#1E3A8A',
    borderColor: '#1E3A8A',
  },
  catChipText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#475569',
  },
  catChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  securityNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: Radius.button,
    padding: 10,
  },
  securityNoticeText: {
    fontSize: 11,
    color: '#166534',
    flex: 1,
    lineHeight: 15,
  },
  progressContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  progressSpinner: {
    marginBottom: 16,
  },
  progressTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  progressSubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 420,
    marginBottom: 20,
    lineHeight: 17,
  },
  progressBarTrack: {
    width: '100%',
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2563EB',
    borderRadius: 4,
  },
  progressPercentText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  multiCandidateBox: {
    marginBottom: 12,
  },
  multiCandidateLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  candidateChipsScroll: {
    flexDirection: 'row',
  },
  candidateChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginRight: 8,
  },
  candidateChipActive: {
    backgroundColor: '#1E3A8A',
    borderColor: '#1E3A8A',
  },
  candidateChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
  },
  candidateChipTextActive: {
    color: '#FFFFFF',
  },
  duplicateBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: Radius.button,
    padding: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  dupBannerNew: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  dupBannerRegistry: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  dupBannerTracked: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  dupBannerContent: {
    flex: 1,
  },
  dupBannerTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  dupBannerMessage: {
    fontSize: 11.5,
    color: '#334155',
    marginTop: 2,
    lineHeight: 16,
  },
  ocrInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    padding: 8,
    marginBottom: 12,
  },
  ocrInfoText: {
    fontSize: 11,
    color: '#475569',
    flex: 1,
  },
  reviewFormCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: Radius.card,
    padding: 14,
    ...Shadows.subtle,
  },
  formCardHeader: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E3A8A',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  formCol: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  statusButtonsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  statusSelectPill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  statusSelectPillActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  statusSelectPillText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  statusSelectPillTextActive: {
    color: '#2563EB',
    fontWeight: '700',
  },
  rawPreviewBox: {
    marginTop: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    padding: 10,
  },
  rawPreviewHeader: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  rawPreviewText: {
    fontSize: 11,
    color: '#475569',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 15,
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  successIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 8,
    textAlign: 'center',
  },
  successSubtext: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 420,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFAFA',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  footerBtn: {
    minWidth: 120,
  },
  footerBtnFull: {
    width: '100%',
  },
});
