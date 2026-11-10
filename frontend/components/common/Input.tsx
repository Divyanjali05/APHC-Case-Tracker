import React, { useState, forwardRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
  NativeSyntheticEvent,
  TextInputFocusEventData,
} from 'react-native';
import { Colors } from '../../constants/colors';
import { Radius, Spacing, Typography } from '../../constants/theme';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightAction?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  labelStyle?: StyleProp<TextStyle>;
  errorStyle?: StyleProp<TextStyle>;
  testID?: string;
  errorTestID?: string;
}

export const Input = forwardRef<TextInput, InputProps>(
  (
    {
      label,
      error,
      helperText,
      leftIcon,
      rightAction,
      containerStyle,
      inputStyle,
      labelStyle,
      errorStyle,
      testID,
      errorTestID,
      onFocus,
      onBlur,
      editable = true,
      multiline = false,
      placeholderTextColor = Colors.text.muted,
      ...restProps
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);

    const handleFocus = (e: NativeSyntheticEvent<TextInputFocusEventData>) => {
      setIsFocused(true);
      if (onFocus) onFocus(e);
    };

    const handleBlur = (e: NativeSyntheticEvent<TextInputFocusEventData>) => {
      setIsFocused(false);
      if (onBlur) onBlur(e);
    };

    const hasError = Boolean(error);

    return (
      <View style={[styles.container, containerStyle]}>
        {label ? <Text style={[styles.label, labelStyle]}>{label}</Text> : null}

        <View
          style={[
            styles.inputWrapper,
            multiline && styles.multilineWrapper,
            isFocused && styles.focusedWrapper,
            hasError && styles.errorWrapper,
            !editable && styles.disabledWrapper,
          ]}
        >
          {leftIcon ? <View style={styles.leftIconSlot}>{leftIcon}</View> : null}

          <TextInput
            ref={ref}
            testID={testID}
            editable={editable}
            multiline={multiline}
            placeholderTextColor={placeholderTextColor}
            onFocus={handleFocus}
            onBlur={handleBlur}
            style={[
              styles.input,
              multiline && styles.multilineInput,
              !editable && styles.disabledInput,
              inputStyle,
            ]}
            {...restProps}
          />

          {rightAction ? <View style={styles.rightActionSlot}>{rightAction}</View> : null}
        </View>

        {hasError ? (
          <Text
            style={[styles.errorText, errorStyle]}
            testID={errorTestID || (testID ? `${testID}-error` : undefined)}
          >
            {error}
          </Text>
        ) : helperText ? (
          <Text style={styles.helperText}>{helperText}</Text>
        ) : null}
      </View>
    );
  }
);

Input.displayName = 'Input';

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
    width: '100%',
  },
  label: {
    ...Typography.label,
    color: Colors.text.primary,
    marginBottom: Spacing.xs,
  },
  inputWrapper: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.md,
  },
  multilineWrapper: {
    minHeight: 88,
    alignItems: 'flex-start',
    paddingVertical: Spacing.sm,
  },
  focusedWrapper: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surface,
  },
  errorWrapper: {
    borderColor: Colors.danger,
    backgroundColor: '#FEF2F2',
  },
  disabledWrapper: {
    backgroundColor: Colors.surfaceSubtle,
    borderColor: Colors.border,
  },
  input: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: 15,
    fontWeight: '400',
    paddingVertical: Spacing.sm,
  },
  multilineInput: {
    textAlignVertical: 'top',
    minHeight: 72,
  },
  disabledInput: {
    color: Colors.text.muted,
  },
  leftIconSlot: {
    marginRight: Spacing.sm,
  },
  rightActionSlot: {
    marginLeft: Spacing.sm,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.danger,
    marginTop: Spacing.xs,
  },
  helperText: {
    fontSize: 12,
    color: Colors.text.muted,
    marginTop: Spacing.xs,
  },
});
