import React, { useState } from 'react';
import { View, StyleSheet, FlatList, TextInput, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '../../components/common/ScreenContainer';
import { CaseCard } from '../../components/cases/CaseCard';
import { LoadingIndicator } from '../../components/common/LoadingIndicator';
import { EmptyState } from '../../components/common/EmptyState';
import { Colors } from '../../constants/colors';
import { useCases } from '../../features/cases/hooks';
import { CaseItem } from '../../types';

export default function CasesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: cases, isLoading, isError, refetch, isRefetching } = useCases();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCases = (cases || []).filter((item: CaseItem) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const caseNumber =
      `${item.case_type} ${item.case_number}/${item.filing_year}`.toLowerCase();
    const petitioner = item.petitioner.toLowerCase();
    const respondent = item.respondent.toLowerCase();
    return (
      caseNumber.includes(query) ||
      petitioner.includes(query) ||
      respondent.includes(query)
    );
  });

  const handleSelectCase = (id: number) => {
    router.push(`/cases/${id}`);
  };

  return (
    <ScreenContainer testID="cases-screen">
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={t('cases.searchPlaceholder')}
          placeholderTextColor={Colors.text.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
          testID="cases-search-input"
        />
      </View>

      {isLoading ? (
        <LoadingIndicator message={t('common.loading')} />
      ) : isError ? (
        <EmptyState
          title="Could Not Load Cases"
          description="Unable to connect to the APHC docket service. Please verify your connection."
          actionLabel={t('common.retry')}
          onAction={() => refetch()}
          testID="cases-error-state"
        />
      ) : filteredCases.length === 0 ? (
        <EmptyState
          title={t('cases.empty')}
          description="Search returned no matching cases, or no cases are currently linked to your enrollment number."
          testID="cases-empty-state"
        />
      ) : (
        <FlatList
          data={filteredCases}
          keyExtractor={item => item.id.toString()}
          renderItem={({ item }) => <CaseCard item={item} onPress={handleSelectCase} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.primaryLight}
              colors={[Colors.primary]}
            />
          }
          testID="cases-list"
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.text.primary,
    fontSize: 14,
  },
  listContent: {
    paddingBottom: 24,
  },
});
