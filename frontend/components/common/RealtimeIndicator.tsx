import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRealtimeStatus } from '../../features/realtime/hooks';
import { RealtimeConnectionStatus } from '../../features/realtime/types';

interface RealtimeIndicatorProps {
  status?: RealtimeConnectionStatus;
  showLabel?: boolean;
  testID?: string;
}

export const RealtimeIndicator: React.FC<RealtimeIndicatorProps> = ({
  status: propStatus,
  showLabel = true,
  testID = 'realtime-indicator',
}) => {
  const currentStatus = useRealtimeStatus();
  const effectiveStatus = propStatus || currentStatus;

  const getStatusColor = () => {
    switch (effectiveStatus) {
      case 'CONNECTED':
        return '#10B981'; // Emerald Green
      case 'CONNECTING':
      case 'RECONNECTING':
        return '#F59E0B'; // Amber
      case 'OFFLINE':
      default:
        return '#6B7280'; // Slate Gray
    }
  };

  const getStatusLabel = () => {
    switch (effectiveStatus) {
      case 'CONNECTED':
        return 'Live Sync';
      case 'CONNECTING':
        return 'Connecting...';
      case 'RECONNECTING':
        return 'Reconnecting...';
      case 'OFFLINE':
      default:
        return 'Offline';
    }
  };

  return (
    <View style={styles.container} testID={testID}>
      <View
        style={[styles.dot, { backgroundColor: getStatusColor() }]}
        testID={`${testID}-dot`}
      />
      {showLabel && (
        <Text
          style={[styles.label, { color: getStatusColor() }]}
          testID={`${testID}-label`}
        >
          {getStatusLabel()}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
