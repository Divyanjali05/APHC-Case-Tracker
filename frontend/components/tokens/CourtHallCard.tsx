import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Colors } from '../../constants/colors';
import { CourtHallItem } from '../../types';

export interface CourtHallCardProps {
  item: CourtHallItem;
}

export const CourtHallCard: React.FC<CourtHallCardProps> = ({ item }) => {
  const currentItem = item.status?.current_item_number ?? 0;
  const stage = item.status?.current_stage ?? 'In Session';

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.hallTitle}>Court Hall {item.hall_number}</Text>
        <Badge label={stage} variant="primary" />
      </View>

      <Text style={styles.bench} numberOfLines={1}>
        {item.bench_name}
      </Text>

      <View style={styles.tokenBox}>
        <Text style={styles.tokenLabel}>CURRENT ITEM</Text>
        <Text style={styles.tokenNumber}>{currentItem > 0 ? currentItem : '—'}</Text>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  hallTitle: {
    color: Colors.text.primary,
    fontSize: 16,
    fontWeight: '800',
  },
  bench: {
    color: Colors.text.secondary,
    fontSize: 12,
    marginBottom: 14,
  },
  tokenBox: {
    backgroundColor: Colors.surfaceSubtle,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tokenLabel: {
    color: Colors.gold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  tokenNumber: {
    color: Colors.text.white,
    fontSize: 28,
    fontWeight: '900',
  },
});
