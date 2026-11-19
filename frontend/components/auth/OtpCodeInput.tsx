import React, { useRef, useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native';
import { Colors } from '../../constants/colors';
import { Radius, Spacing } from '../../constants/theme';

export const OTP_LENGTH = 6;

export interface OtpCodeInputProps {
  value: string;
  onChange: (otp: string) => void;
  disabled?: boolean;
  hasError?: boolean;
  digitAccessibilityLabel?: (index: number) => string;
  testIDPrefix?: string;
}

export const OtpCodeInput: React.FC<OtpCodeInputProps> = ({
  value,
  onChange,
  disabled = false,
  hasError = false,
  digitAccessibilityLabel,
  testIDPrefix = 'register-otp-digit',
}) => {
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const digits = Array.from({ length: OTP_LENGTH }, (_, idx) => value[idx] || '');

  const commitDigits = (nextDigits: string[]) => {
    onChange(nextDigits.join('').slice(0, OTP_LENGTH));
  };

  const handleChangeText = (rawText: string, index: number) => {
    if (disabled) return;
    const numericOnly = rawText.replace(/\D/g, '');

    if (numericOnly.length === 0) {
      const next = [...digits];
      next[index] = '';
      commitDigits(next);
      return;
    }

    // Full 6-digit paste (or longer string containing a 6-digit OTP)
    if (numericOnly.length >= OTP_LENGTH) {
      const oldDigit = digits[index];
      const extracted =
        oldDigit &&
        numericOnly.length === OTP_LENGTH + 1 &&
        numericOnly.startsWith(oldDigit)
          ? numericOnly.slice(1, OTP_LENGTH + 1)
          : numericOnly.slice(0, OTP_LENGTH);
      const next = Array.from({ length: OTP_LENGTH }, (_, idx) => extracted[idx] || '');
      commitDigits(next);
      inputRefs.current[OTP_LENGTH - 1]?.focus();
      return;
    }

    // Typing a new digit into a box that already held one digit
    const oldDigit = digits[index];
    if (numericOnly.length === 2 && oldDigit) {
      const nextChar = numericOnly[0] === oldDigit ? numericOnly[1] : numericOnly[0];
      const next = [...digits];
      next[index] = nextChar;
      commitDigits(next);
      if (index < OTP_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
      return;
    }

    // Multi-digit partial paste starting at current box
    if (numericOnly.length > 1) {
      const next = [...digits];
      for (
        let offset = 0;
        offset < numericOnly.length && index + offset < OTP_LENGTH;
        offset++
      ) {
        next[index + offset] = numericOnly[offset];
      }
      commitDigits(next);
      const targetFocus = Math.min(index + numericOnly.length, OTP_LENGTH - 1);
      inputRefs.current[targetFocus]?.focus();
      return;
    }

    // Single digit entry
    const next = [...digits];
    next[index] = numericOnly;
    commitDigits(next);
    if (index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number
  ) => {
    if (disabled) return;
    if (event.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      commitDigits(next);
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <View style={styles.container} testID="register-otp-input-group">
      {digits.map((digit, index) => {
        const isFocused = focusedIndex === index;
        const isFilled = digit.length > 0;
        return (
          <TextInput
            key={index}
            ref={el => {
              inputRefs.current[index] = el;
            }}
            value={digit}
            onChangeText={text => handleChangeText(text, index)}
            onKeyPress={event => handleKeyPress(event, index)}
            onFocus={() => setFocusedIndex(index)}
            onBlur={() => setFocusedIndex(prev => (prev === index ? null : prev))}
            editable={!disabled}
            keyboardType="number-pad"
            inputMode="numeric"
            textContentType="oneTimeCode"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            selectTextOnFocus
            caretHidden={false}
            textAlign="center"
            accessibilityLabel={
              digitAccessibilityLabel
                ? digitAccessibilityLabel(index + 1)
                : `OTP digit ${index + 1} of ${OTP_LENGTH}`
            }
            testID={`${testIDPrefix}-${index}`}
            style={[
              styles.digitBox,
              isFilled && styles.digitBoxFilled,
              isFocused && styles.digitBoxFocused,
              hasError && styles.digitBoxError,
              disabled && styles.digitBoxDisabled,
            ]}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    width: '100%',
  },
  digitBox: {
    flex: 1,
    minWidth: 42,
    maxWidth: 56,
    height: 54,
    borderRadius: Radius.button,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surfaceSubtle,
    color: Colors.text.primary,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  digitBoxFilled: {
    backgroundColor: Colors.surface,
    borderColor: Colors.primary,
  },
  digitBoxFocused: {
    backgroundColor: Colors.surface,
    borderColor: Colors.accent,
    borderWidth: 2,
  },
  digitBoxError: {
    borderColor: Colors.danger,
    backgroundColor: Colors.dangerSurface,
  },
  digitBoxDisabled: {
    opacity: 0.6,
  },
});
