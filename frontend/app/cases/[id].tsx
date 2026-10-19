import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { LoadingIndicator } from '../../components/common/LoadingIndicator';
import { EmptyState } from '../../components/common/EmptyState';
import { Colors } from '../../constants/colors';
import { useCaseDetail } from '../../features/cases/hooks';
import { formatCaseNumber, formatDate } from '../../utils/formatters';
import { speechService } from '../../services/speech/ttsService';
import { HearingItem } from '../../types';

export default function CaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { data: caseItem, isLoading, isError, refetch } = useCaseDetail(id || '');

  if (isLoading) {
    return (
      <ScreenContainer testID="case-detail-loading">
        <LoadingIndicator message="Loading docket details..." />
      </ScreenContainer>
    );
  }

  if (isError || !caseItem) {
    return (
      <ScreenContainer testID="case-detail-error">
        <EmptyState
          title="Case Not Found"
          description="Could not load the requested court matter or the case is not synced."
          actionLabel={t('common.retry')}
          onAction={() => refetch()}
        />
      </ScreenContainer>
    );
  }

  const handleSpeakSummary = () => {
    const summary = `${caseItem.case_type} ${caseItem.case_number} of ${
      caseItem.filing_year
    }. ${caseItem.petitioner} versus ${caseItem.respondent}. Stage: ${
      caseItem.current_stage
    }. Next hearing on ${formatDate(caseItem.next_hearing_date)}.`;
    speechService.speak(summary, i18n.language);
  };

  return (
    <ScreenContainer testID="case-detail-screen">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Case Title Banner */}
        <Card style={styles.bannerCard}>
          <View style={styles.headerRow}>
            <Text style={styles.caseNumber}>
              {formatCaseNumber(
                caseItem.case_type,
                caseItem.case_number,
                caseItem.filing_year
              )}
            </Text>
            <Badge label={caseItem.current_stage} variant="gold" />
          </View>

          <Text style={styles.parties}>
            {caseItem.petitioner}
            {'\n'}
            <Text style={styles.vsText}>VERSUS</Text>
            {'\n'}
            {caseItem.respondent}
          </Text>

          <Button
            title="Listen to Case Summary"
            variant="outline"
            onPress={handleSpeakSummary}
            style={styles.voiceButton}
            testID="speak-case-button"
          />
        </Card>

        {/* Docket Information */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t('cases.details')}</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Filing Year</Text>
            <Text style={styles.detailValue}>{caseItem.filing_year}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Court Hall</Text>
            <Text style={styles.detailValue}>
              {caseItem.court_hall_number
                ? `Hall ${caseItem.court_hall_number}`
                : 'Not assigned'}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Bench</Text>
            <Text style={styles.detailValue}>{caseItem.bench || 'Regular Bench'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Petitioner Advocate</Text>
            <Text style={styles.detailValue}>{caseItem.petitioner_advocate || '—'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Respondent Advocate</Text>
            <Text style={styles.detailValue}>{caseItem.respondent_advocate || '—'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Next Hearing Date</Text>
            <Text style={[styles.detailValue, styles.highlightDate]}>
              {formatDate(caseItem.next_hearing_date)}
            </Text>
          </View>
        </Card>

        {/* Hearing History */}
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t('cases.hearings')}</Text>

          {caseItem.hearings && caseItem.hearings.length > 0 ? (
            caseItem.hearings.map((hearing: HearingItem) => (
              <View key={hearing.id} style={styles.hearingItem}>
                <View style={styles.hearingHeader}>
                  <Text style={styles.hearingDate}>
                    {formatDate(hearing.hearing_date)}
                  </Text>
                  <Badge
                    label={
                      hearing.item_number ? `Item #${hearing.item_number}` : 'Listed'
                    }
                    variant="primary"
                  />
                </View>
                {hearing.business_conducted ? (
                  <Text style={styles.hearingBusiness}>{hearing.business_conducted}</Text>
                ) : null}
                {hearing.next_date ? (
                  <Text style={styles.hearingNextDate}>
                    Next Date: {formatDate(hearing.next_date)}
                  </Text>
                ) : null}
              </View>
            ))
          ) : (
            <Text style={styles.emptyHearings}>
              No previous hearing records synced for this matter.
            </Text>
          )}
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
  },
  bannerCard: {
    padding: 18,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  caseNumber: {
    color: Colors.text.primary,
    fontSize: 20,
    fontWeight: '800',
  },
  parties: {
    color: Colors.text.primary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 22,
    marginVertical: 10,
  },
  vsText: {
    color: Colors.gold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  voiceButton: {
    marginTop: 10,
  },
  sectionCard: {
    padding: 18,
    marginBottom: 16,
  },
  sectionTitle: {
    color: Colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailLabel: {
    color: Colors.text.secondary,
    fontSize: 13,
  },
  detailValue: {
    color: Colors.text.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  highlightDate: {
    color: Colors.gold,
    fontWeight: '700',
  },
  hearingItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  hearingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  hearingDate: {
    color: Colors.primaryLight,
    fontSize: 13,
    fontWeight: '700',
  },
  hearingBusiness: {
    color: Colors.text.secondary,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  hearingNextDate: {
    color: Colors.text.muted,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  emptyHearings: {
    color: Colors.text.muted,
    fontSize: 13,
    paddingVertical: 8,
  },
});
