import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Colors } from '../../constants/colors';
import {
  useCaseDocuments,
  useUploadCaseDocument,
  useDeleteCaseDocument,
} from '../../features/cases/hooks';
import { CaseDocumentCategory, CaseDocumentItem } from '../../types';
import { formatDate } from '../../utils/formatters';
import { API_BASE_URL } from '../../services/api/client';
import { tokenStorage } from '../../services/auth/tokenStorage';

interface CaseDocumentsSectionProps {
  caseId: number;
}

const CATEGORIES: { key: string; labelKey: string }[] = [
  { key: '', labelKey: 'documents.categories.ALL' },
  { key: 'PETITION', labelKey: 'documents.categories.PETITION' },
  { key: 'COUNTER_AFFIDAVIT', labelKey: 'documents.categories.COUNTER_AFFIDAVIT' },
  { key: 'REJOINDER', labelKey: 'documents.categories.REJOINDER' },
  { key: 'COURT_ORDER', labelKey: 'documents.categories.COURT_ORDER' },
  { key: 'JUDGMENT', labelKey: 'documents.categories.JUDGMENT' },
  { key: 'WRITTEN_SUBMISSIONS', labelKey: 'documents.categories.WRITTEN_SUBMISSIONS' },
  { key: 'EVIDENCE', labelKey: 'documents.categories.EVIDENCE' },
  { key: 'OTHER', labelKey: 'documents.categories.OTHER' },
];

export const CaseDocumentsSection: React.FC<CaseDocumentsSectionProps> = ({ caseId }) => {
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [isUploadModalVisible, setIsUploadModalVisible] = useState(false);

  // Upload Form State
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState<CaseDocumentCategory>('PETITION');
  const [uploadDescription, setUploadDescription] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('petition_docket.pdf');

  const {
    data: documents = [],
    isLoading,
    refetch,
  } = useCaseDocuments(caseId, selectedCategory);
  const { mutate: uploadDoc, isPending: isUploading } = useUploadCaseDocument();
  const { mutate: deleteDoc, isPending: isDeleting } = useDeleteCaseDocument();

  const handleDownload = async (doc: CaseDocumentItem) => {
    try {
      const token = await tokenStorage.getAccessToken();
      const url = `${API_BASE_URL}${doc.download_url}?token=${token || ''}`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert(
          t('export.exportSuccess', 'Document Available'),
          `${doc.title} (${doc.original_filename})`
        );
      }
    } catch {
      Alert.alert(
        t('common.error', 'Error'),
        t('judgment.docOpenError', 'Unable to open document.')
      );
    }
  };

  const handleDelete = (doc: CaseDocumentItem) => {
    Alert.alert(
      t('documents.deleteConfirm', 'Delete Document'),
      t('documents.deleteMessage', { title: doc.title }),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.delete', 'Delete'),
          style: 'destructive',
          onPress: () => {
            deleteDoc(
              { caseId, documentId: doc.id },
              {
                onSuccess: () => refetch(),
                onError: () =>
                  Alert.alert(
                    t('common.error', 'Error'),
                    'Failed to delete document. Ensure proper permissions.'
                  ),
              }
            );
          },
        },
      ]
    );
  };

  const handleSimulatedFileUpload = () => {
    if (!uploadTitle.trim()) {
      Alert.alert(t('common.error', 'Error'), 'Please provide a document title.');
      return;
    }

    const formData = new FormData();
    formData.append('title', uploadTitle.trim());
    formData.append('document_type', uploadCategory);
    formData.append('description', uploadDescription.trim());

    // Minimal valid PDF binary data with %PDF- header for safe upload
    const mockPdfBlob = new Blob(
      ['%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'],
      {
        type: 'application/pdf',
      }
    );
    formData.append('file', mockPdfBlob as unknown as Blob, selectedFileName);

    uploadDoc(
      { caseId, formData },
      {
        onSuccess: () => {
          setIsUploadModalVisible(false);
          setUploadTitle('');
          setUploadDescription('');
          refetch();
        },
        onError: () => {
          Alert.alert(
            t('common.error', 'Error'),
            'Failed to upload document. Please check file format.'
          );
        },
      }
    );
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card style={styles.container} testID="case-documents-section">
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.sectionTitle}>
            {t('documents.title', 'Case Documents')}
          </Text>
          <Text style={styles.sectionSubtitle}>
            {t('documents.subtitle', 'Secure, encrypted court docket repository')}
          </Text>
        </View>
        <Button
          title={t('documents.uploadButton', 'Upload')}
          variant="primary"
          onPress={() => setIsUploadModalVisible(true)}
          style={styles.uploadBtn}
          testID="upload-document-button"
        />
      </View>

      {/* Category Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
      >
        {CATEGORIES.map(cat => {
          const isSelected = selectedCategory === cat.key;
          return (
            <TouchableOpacity
              key={cat.key || 'ALL'}
              style={[styles.filterChip, isSelected && styles.filterChipActive]}
              onPress={() => setSelectedCategory(cat.key)}
              testID={`doc-filter-${cat.key || 'ALL'}`}
            >
              <Text
                style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}
              >
                {t(cat.labelKey, cat.key || 'All')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator size="small" color={Colors.primary} style={styles.loader} />
      ) : documents.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            {t('documents.empty', 'No documents uploaded for this case yet.')}
          </Text>
        </View>
      ) : (
        <View style={styles.documentsList}>
          {documents.map(doc => (
            <View key={doc.id} style={styles.docItem} testID={`document-item-${doc.id}`}>
              <View style={styles.docHeader}>
                <Text style={styles.docTitle} numberOfLines={1}>
                  {doc.title}
                </Text>
                <Badge
                  label={doc.document_type_display || doc.document_type}
                  variant="secondary"
                />
              </View>

              {doc.description ? (
                <Text style={styles.docDesc} numberOfLines={2}>
                  {doc.description}
                </Text>
              ) : null}

              <View style={styles.docMetaRow}>
                <Text style={styles.docMeta}>
                  {doc.original_filename} • {formatFileSize(doc.file_size)}
                </Text>
                <Text style={styles.docMeta}>{formatDate(doc.created_at)}</Text>
              </View>

              <View style={styles.actionsRow}>
                <Button
                  title={t('documents.download', 'Download')}
                  variant="outline"
                  onPress={() => handleDownload(doc)}
                  style={styles.actionBtn}
                  testID={`download-doc-${doc.id}`}
                />
                <Button
                  title={t('documents.delete', 'Delete')}
                  variant="danger"
                  onPress={() => handleDelete(doc)}
                  style={styles.actionBtn}
                  testID={`delete-doc-${doc.id}`}
                  disabled={isDeleting}
                />
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Upload Document Modal */}
      <Modal visible={isUploadModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {t('documents.uploadTitle', 'Upload Case Document')}
            </Text>

            <Text style={styles.inputLabel}>
              {t('documents.docTitle', 'Document Title')}
            </Text>
            <TextInput
              style={styles.input}
              value={uploadTitle}
              onChangeText={setUploadTitle}
              placeholder={t(
                'documents.docTitlePlaceholder',
                'e.g. Writ Petition Affidavit'
              )}
              placeholderTextColor={Colors.text.muted}
              testID="upload-doc-title-input"
            />

            <Text style={styles.inputLabel}>
              {t('documents.docCategory', 'Document Category')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.catPickerScroll}
            >
              {(
                [
                  'PETITION',
                  'COUNTER_AFFIDAVIT',
                  'REJOINDER',
                  'COURT_ORDER',
                  'JUDGMENT',
                  'WRITTEN_SUBMISSIONS',
                  'EVIDENCE',
                  'OTHER',
                ] as CaseDocumentCategory[]
              ).map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catChip, uploadCategory === cat && styles.catChipActive]}
                  onPress={() => setUploadCategory(cat)}
                >
                  <Text
                    style={[
                      styles.catChipText,
                      uploadCategory === cat && styles.catChipTextActive,
                    ]}
                  >
                    {cat.replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>
              {t('documents.docDescription', 'Description')}
            </Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={uploadDescription}
              onChangeText={setUploadDescription}
              placeholder={t(
                'documents.docDescriptionPlaceholder',
                'Brief details about this document'
              )}
              placeholderTextColor={Colors.text.muted}
              multiline
              numberOfLines={3}
              testID="upload-doc-desc-input"
            />

            <View style={styles.filePickerRow}>
              <Text style={styles.filePickerLabel}>
                {t('documents.fileSelected', { filename: selectedFileName })}
              </Text>
              <TouchableOpacity
                onPress={() =>
                  setSelectedFileName(
                    selectedFileName === 'petition_docket.pdf'
                      ? 'counter_affidavit.pdf'
                      : 'petition_docket.pdf'
                  )
                }
              >
                <Text style={styles.switchFileText}>[Change File]</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <Button
                title={t('common.cancel', 'Cancel')}
                variant="outline"
                onPress={() => setIsUploadModalVisible(false)}
                style={styles.modalBtn}
              />
              <Button
                title={
                  isUploading
                    ? t('documents.uploading', 'Uploading...')
                    : t('documents.uploadButton', 'Upload')
                }
                variant="primary"
                onPress={handleSimulatedFileUpload}
                style={styles.modalBtn}
                disabled={isUploading}
                testID="confirm-upload-button"
              />
            </View>
          </View>
        </View>
      </Modal>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  uploadBtn: {
    minHeight: 36,
    paddingHorizontal: 14,
  },
  filterScroll: {
    flexDirection: 'row',
    paddingVertical: 6,
    gap: 8,
  },
  filterChip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: Colors.text.white,
    fontWeight: '600',
  },
  loader: {
    marginVertical: 16,
  },
  emptyState: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  documentsList: {
    marginTop: 10,
    gap: 10,
  },
  docItem: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  docHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  docTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
    flex: 1,
    marginRight: 8,
  },
  docDesc: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginBottom: 6,
  },
  docMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  docMeta: {
    fontSize: 12,
    color: Colors.text.muted,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  actionBtn: {
    minHeight: 32,
    paddingHorizontal: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.text.primary,
    backgroundColor: Colors.surface,
    marginBottom: 10,
  },
  textArea: {
    height: 64,
    textAlignVertical: 'top',
  },
  catPickerScroll: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  catChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: Colors.background,
    marginRight: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  catChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  catChipText: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  catChipTextActive: {
    color: Colors.text.white,
    fontWeight: '600',
  },
  filePickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 14,
  },
  filePickerLabel: {
    fontSize: 12,
    color: Colors.text.primary,
    fontWeight: '500',
  },
  switchFileText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalBtn: {
    minHeight: 38,
    paddingHorizontal: 16,
  },
});
