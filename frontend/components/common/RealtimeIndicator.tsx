import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
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

  const getDotColor = () => {
    switch (effectiveStatus) {
      case 'CONNECTED':
        return '#10B981';
      case 'CONNECTING':
      case 'RECONNECTING':
        return '#F59E0B';
      case 'OFFLINE':
      default:
        return Colors.text.muted;
    }
  };

  const getTextColor = () => {
    switch (effectiveStatus) {
      case 'CONNECTED':
        return Colors.success;
      case 'CONNECTING':
      case 'RECONNECTING':
        return Colors.warning;
      case 'OFFLINE':
      default:
        return Colors.text.secondary;
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
        style={[styles.dot, { backgroundColor: getDotColor() }]}
        testID={`${testID}-dot`}
      />
      {showLabel && (
        <Text
          style={[styles.label, { color: getTextColor() }]}
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
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 12,
    backgroundColor: Colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
