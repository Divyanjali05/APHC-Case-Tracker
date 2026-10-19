import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Colors } from '../../constants/colors';
import { ReminderItem as ReminderType } from '../../types';
import { formatDate } from '../../utils/formatters';

export interface ReminderItemProps {
  item: ReminderType;
}

export const ReminderItemComponent: React.FC<ReminderItemProps> = ({ item }) => {
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{item.title}</Text>
        <Badge
          label={item.reminder_type}
          variant={item.is_completed ? 'success' : 'warning'}
        />
      </View>
      {item.description ? (
        <Text style={styles.description}>{item.description}</Text>
      ) : null}
      <Text style={styles.date}>Due: {formatDate(item.due_date)}</Text>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 14,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    color: Colors.text.primary,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  description: {
    color: Colors.text.secondary,
    fontSize: 13,
    marginBottom: 8,
    lineHeight: 18,
  },
  date: {
    color: Colors.primaryLight,
    fontSize: 12,
    fontWeight: '600',
  },
});
