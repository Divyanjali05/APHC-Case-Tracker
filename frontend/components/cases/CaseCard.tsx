import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Colors } from '../../constants/colors';
import { CaseItem } from '../../types';
import { formatCaseNumber, formatDate } from '../../utils/formatters';

export interface CaseCardProps {
  item: CaseItem;
  onPress: (id: number) => void;
}

export const CaseCard: React.FC<CaseCardProps> = ({ item, onPress }) => {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={() => onPress(item.id)}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.caseNumber}>
            {formatCaseNumber(item.case_type, item.case_number, item.filing_year)}
          </Text>
          <Badge label={item.current_stage} variant="gold" />
        </View>

        <Text style={styles.parties} numberOfLines={2}>
          {item.petitioner} vs {item.respondent}
        </Text>

        <View style={styles.footer}>
          <Text style={styles.bench}>
            {item.court_hall_number
              ? `Court Hall ${item.court_hall_number}`
              : 'Bench unassigned'}
          </Text>
          <Text style={styles.date}>Next: {formatDate(item.next_hearing_date)}</Text>
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  caseNumber: {
    color: Colors.text.primary,
    fontSize: 16,
    fontWeight: '800',
  },
  parties: {
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
  },
  bench: {
    color: Colors.primaryLight,
    fontSize: 12,
    fontWeight: '600',
  },
  date: {
    color: Colors.text.muted,
    fontSize: 12,
  },
});
