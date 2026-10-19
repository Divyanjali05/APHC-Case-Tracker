import React from 'react';
import { View, StyleSheet, ViewStyle, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
      <StatusBar barStyle="light-content" backgroundColor="#0B132B" />
      <View style={styles.inner}>{children}</View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B132B',
  },
  inner: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
});
