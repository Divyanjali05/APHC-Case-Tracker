import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { Card } from '../common/Card';
import { Colors } from '../../constants/colors';

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle }) => {
  return (
    <Card style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.value}>{value}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    marginHorizontal: 4,
    padding: 16,
  },
  title: {
    color: Colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  value: {
    color: Colors.text.primary,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    color: Colors.text.muted,
    fontSize: 11,
  },
});
