import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Colors } from '../../constants/colors';
import { Radius, Shadows, Spacing } from '../../constants/theme';
import { AppIcon, AppIconName } from './AppIcon';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  message: string;
  title?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastState extends ToastOptions {
  id: number;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (options: ToastOptions | string, variant?: ToastVariant) => void;
  hideToast: () => void;
}

const NOOP_TOAST_CONTEXT: ToastContextValue = {
  showToast: () => {},
  hideToast: () => {},
};

const ToastContext = createContext<ToastContextValue>(NOOP_TOAST_CONTEXT);

export const useToast = (): ToastContextValue => {
  return useContext(ToastContext);
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  const hideToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (process.env.NODE_ENV === 'test') {
      opacity.setValue(0);
      setToast(null);
      return;
    }
    Animated.timing(opacity, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start(() => {
      setToast(null);
    });
  }, [opacity]);

  const showToast = useCallback(
    (options: ToastOptions | string, fallbackVariant: ToastVariant = 'info') => {
      const normalized: ToastOptions =
        typeof options === 'string'
          ? { message: options, variant: fallbackVariant }
          : options;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      const nextVariant: ToastVariant = normalized.variant || fallbackVariant;
      setToast({
        id: Date.now(),
        title: normalized.title,
        message: normalized.message,
        variant: nextVariant,
        durationMs: normalized.durationMs,
      });

      if (process.env.NODE_ENV === 'test') {
        opacity.setValue(1);
      } else {
        opacity.setValue(0);
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }).start();
      }

      const delay = normalized.durationMs ?? 3600;
      timerRef.current = setTimeout(() => {
        hideToast();
      }, delay);
    },
    [hideToast, opacity]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const getVisuals = (
    variant: ToastVariant
  ): {
    bg: string;
    border: string;
    accent: string;
    icon: AppIconName;
  } => {
    switch (variant) {
      case 'success':
        return {
          bg: Colors.successSurface,
          border: Colors.successBorder,
          accent: Colors.success,
          icon: 'check-circle',
        };
      case 'error':
        return {
          bg: Colors.dangerSurface,
          border: Colors.dangerBorder,
          accent: Colors.danger,
          icon: 'alert-circle',
        };
      case 'warning':
        return {
          bg: Colors.goldSurface,
          border: Colors.goldBorder,
          accent: Colors.gold,
          icon: 'alert-triangle',
        };
      case 'info':
      default:
        return {
          bg: Colors.infoSurface,
          border: Colors.infoBorder,
          accent: Colors.primary,
          icon: 'info',
        };
    }
  };

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      <View style={styles.root}>
        {children}
        {toast ? (
          <Animated.View
            style={[styles.overlay, { opacity }]}
            pointerEvents="box-none"
            testID="app-toast"
          >
            {(() => {
              const visuals = getVisuals(toast.variant);
              return (
                <View
                  style={[
                    styles.banner,
                    {
                      backgroundColor: visuals.bg,
                      borderColor: visuals.border,
                    },
                  ]}
                  accessibilityRole="alert"
                >
                  <View style={styles.iconWrap}>
                    <AppIcon name={visuals.icon} size={20} color={visuals.accent} />
                  </View>
                  <View style={styles.textWrap}>
                    {toast.title ? (
                      <Text style={[styles.title, { color: visuals.accent }]}>
                        {toast.title}
                      </Text>
                    ) : null}
                    <Text style={styles.message}>{toast.message}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={hideToast}
                    style={styles.closeBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss notification"
                  >
                    <AppIcon name="x" size={16} color={Colors.text.secondary} />
                  </TouchableOpacity>
                </View>
              );
            })()}
          </Animated.View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 48,
    left: Spacing.screenHorizontal,
    right: Spacing.screenHorizontal,
    zIndex: 9999,
    alignItems: 'center',
  },
  banner: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: Radius.card,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    ...Shadows.card,
  },
  iconWrap: {
    marginRight: Spacing.sm,
    marginTop: 1,
  },
  textWrap: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  message: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.text.primary,
    lineHeight: 18,
  },
  closeBtn: {
    padding: 2,
  },
});
