import React from 'react';
import { View, StyleSheet, ViewStyle, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';

export interface ScreenContainerProps {
  children: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}

export const ScreenContainer: React.FC<ScreenContainerProps> = ({
  children,
  style,
  testID = 'screen-container',
}) => {
  return (
    <SafeAreaView testID={testID} style={[styles.container, style]}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <View style={styles.inner}>{children}</View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
