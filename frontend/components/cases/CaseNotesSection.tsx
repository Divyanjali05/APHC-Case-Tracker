import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Colors } from '../../constants/colors';
import {
  useCaseNotes,
  useCreateCaseNote,
  useUpdateCaseNote,
  useDeleteCaseNote,
} from '../../features/cases/hooks';
import { CaseNoteItem } from '../../types';
import { formatDate } from '../../utils/formatters';

interface CaseNotesSectionProps {
  caseId: number;
}

export const CaseNotesSection: React.FC<CaseNotesSectionProps> = ({ caseId }) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<CaseNoteItem | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(false);

  const { data: notes = [], isLoading, refetch } = useCaseNotes(caseId, searchQuery);
  const { mutate: createNote, isPending: isCreating } = useCreateCaseNote();
  const { mutate: updateNote, isPending: isUpdating } = useUpdateCaseNote();
  const { mutate: deleteNote, isPending: isDeleting } = useDeleteCaseNote();

  const handleOpenCreate = () => {
    setEditingNote(null);
    setTitle('');
    setContent('');
    setIsPinned(false);
    setIsModalVisible(true);
  };

  const handleOpenEdit = (note: CaseNoteItem) => {
    setEditingNote(note);
    setTitle(note.title);
    setContent(note.content);
    setIsPinned(note.is_pinned);
    setIsModalVisible(true);
  };

  const handleSaveNote = () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert(t('common.error', 'Error'), 'Please fill in both title and note content.');
      return;
    }

    if (editingNote) {
      updateNote(
        {
          caseId,
          noteId: editingNote.id,
          payload: {
            title: title.trim(),
            content: content.trim(),
            is_pinned: isPinned,
          },
        },
        {
          onSuccess: () => {
            setIsModalVisible(false);
            refetch();
          },
          onError: () => {
            Alert.alert(t('common.error', 'Error'), 'Failed to update note.');
          },
        }
      );
    } else {
      createNote(
        {
          caseId,
          payload: {
            title: title.trim(),
            content: content.trim(),
            is_pinned: isPinned,
          },
        },
        {
          onSuccess: () => {
            setIsModalVisible(false);
            refetch();
          },
          onError: () => {
            Alert.alert(t('common.error', 'Error'), 'Failed to create note.');
          },
        }
      );
    }
  };

  const handleDelete = (note: CaseNoteItem) => {
    Alert.alert(
      t('notes.deleteConfirm', 'Delete Note'),
      t('notes.deleteMessage', 'Are you sure you want to delete this private note?'),
      [
        { text: t('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: t('common.delete', 'Delete'),
          style: 'destructive',
          onPress: () => {
            deleteNote(
              { caseId, noteId: note.id },
              {
                onSuccess: () => refetch(),
                onError: () => Alert.alert(t('common.error', 'Error'), 'Failed to delete note.'),
              }
            );
          },
        },
      ]
    );
  };

  const handleTogglePin = (note: CaseNoteItem) => {
    updateNote(
      {
        caseId,
        noteId: note.id,
        payload: {
          is_pinned: !note.is_pinned,
        },
      },
      {
        onSuccess: () => refetch(),
      }
    );
  };

  return (
    <Card style={styles.container} testID="case-notes-section">
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.sectionTitle}>{t('notes.title', 'Private Notes')}</Text>
          <Text style={styles.sectionSubtitle}>
            {t('notes.subtitle', 'Confidential advocate-only notes')}
          </Text>
        </View>
        <Button
          title={t('notes.addNote', '+ Add Note')}
          variant="primary"
          onPress={handleOpenCreate}
          style={styles.addBtn}
          testID="add-note-button"
        />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={t('notes.searchPlaceholder', 'Search notes by title or content...')}
          placeholderTextColor={Colors.text.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          testID="notes-search-input"
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
            <Text style={styles.clearSearchText}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {isLoading ? (
        <ActivityIndicator size="small" color={Colors.primary} style={styles.loader} />
      ) : notes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            {t('notes.empty', 'No private notes recorded for this case.')}
          </Text>
        </View>
      ) : (
        <View style={styles.notesList}>
          {notes.map(note => (
            <View
              key={note.id}
              style={[styles.noteCard, note.is_pinned && styles.noteCardPinned]}
              testID={`note-item-${note.id}`}
            >
              <View style={styles.noteHeader}>
                <View style={styles.titleWrapper}>
                  <Text style={styles.noteTitle}>{note.title}</Text>
                  {note.is_pinned && (
                    <View style={styles.pinBadge}>
                      <Badge label={t('notes.pinned', 'Pinned')} variant="gold" />
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => handleTogglePin(note)}
                  style={styles.pinToggleBtn}
                  testID={`toggle-pin-${note.id}`}
                >
                  <Text style={styles.pinToggleIcon}>{note.is_pinned ? '★' : '☆'}</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.noteContent}>{note.content}</Text>

              <View style={styles.noteFooter}>
                <Text style={styles.noteDate}>
                  {formatDate(note.updated_at || note.created_at)}
                </Text>

                <View style={styles.noteActions}>
                  <TouchableOpacity
                    onPress={() => handleOpenEdit(note)}
                    style={styles.textActionBtn}
                    testID={`edit-note-${note.id}`}
                  >
                    <Text style={styles.editText}>{t('notes.edit', 'Edit')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(note)}
                    style={styles.textActionBtn}
                    testID={`delete-note-${note.id}`}
                    disabled={isDeleting}
                  >
                    <Text style={styles.deleteText}>{t('notes.delete', 'Delete')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Add / Edit Note Modal */}
      <Modal visible={isModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingNote ? t('notes.edit', 'Edit Note') : t('notes.addNote', 'Add Private Note')}
            </Text>

            <Text style={styles.inputLabel}>{t('notes.noteTitle', 'Title')}</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder={t('notes.noteTitlePlaceholder', 'e.g. Bench Argument Points')}
              placeholderTextColor={Colors.text.muted}
              testID="note-title-input"
            />

            <Text style={styles.inputLabel}>{t('notes.noteContent', 'Content')}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={content}
              onChangeText={setContent}
              placeholder={t('notes.noteContentPlaceholder', 'Enter confidential preparation notes...')}
              placeholderTextColor={Colors.text.muted}
              multiline
              numberOfLines={4}
              testID="note-content-input"
            />

            <View style={styles.pinRow}>
              <Text style={styles.pinLabel}>{t('notes.pinNote', 'Pin to Top')}</Text>
              <Switch
                value={isPinned}
                onValueChange={setIsPinned}
                trackColor={{ false: Colors.border, true: Colors.gold }}
                testID="note-pin-switch"
              />
            </View>

            <View style={styles.modalActions}>
              <Button
                title={t('common.cancel', 'Cancel')}
                variant="outline"
                onPress={() => setIsModalVisible(false)}
                style={styles.modalBtn}
              />
              <Button
                title={t('common.save', 'Save')}
                variant="primary"
                onPress={handleSaveNote}
                style={styles.modalBtn}
                disabled={isCreating || isUpdating}
                testID="save-note-button"
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
    fontSize: 11,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  addBtn: {
    minHeight: 36,
    paddingHorizontal: 14,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    height: 38,
    fontSize: 13,
    color: Colors.text.primary,
  },
  clearSearchBtn: {
    padding: 4,
  },
  clearSearchText: {
    fontSize: 13,
    color: Colors.text.muted,
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
  notesList: {
    gap: 10,
  },
  noteCard: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  noteCardPinned: {
    borderColor: Colors.gold,
    backgroundColor: Colors.surface,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  titleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  noteTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  pinBadge: {
    marginLeft: 6,
  },
  pinToggleBtn: {
    padding: 4,
  },
  pinToggleIcon: {
    fontSize: 18,
    color: Colors.gold,
  },
  noteContent: {
    fontSize: 13,
    color: Colors.text.primary,
    lineHeight: 18,
    marginBottom: 10,
  },
  noteFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingTop: 8,
  },
  noteDate: {
    fontSize: 11,
    color: Colors.text.muted,
  },
  noteActions: {
    flexDirection: 'row',
    gap: 12,
  },
  textActionBtn: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  editText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },
  deleteText: {
    fontSize: 12,
    color: Colors.danger,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
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
    height: 80,
    textAlignVertical: 'top',
  },
  pinRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 10,
  },
  pinLabel: {
    fontSize: 13,
    color: Colors.text.primary,
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  modalBtn: {
    minHeight: 38,
    paddingHorizontal: 16,
  },
});
