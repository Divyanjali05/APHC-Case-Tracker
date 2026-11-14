import React from 'react';
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Href, useRouter } from 'expo-router';

const PALETTE = {
  bgMain: '#EEF3FA',
  bgSecondary: '#E5EDFA',
  primaryBlue: '#245BEA',
  primaryBlueHover: '#1B49C8',
  primaryBlueSoft: '#F3F7FF',
  navyHeading: '#172B4D',
  bodyText: '#64748B',
  white: '#FFFFFF',
  border: '#DCE5F1',
};

export interface MainHomePageProps {
  onLoginPress?: () => void;
  onRegisterPress?: () => void;
}

type ViewportTier = 'desktop' | 'tablet' | 'mobile';

interface CourthouseIllustrationProps {
  tier: ViewportTier;
}

const CourthouseIllustration: React.FC<CourthouseIllustrationProps> = ({ tier }) => {
  const isMobile = tier === 'mobile';
  const isTablet = tier === 'tablet';

  const frameWidth = isMobile ? 268 : isTablet ? 290 : 390;
  const framePaddingV = isMobile ? 20 : isTablet ? 24 : 32;
  const pedimentWidth = isMobile ? 186 : isTablet ? 204 : 264;
  const entablatureWidth = isMobile ? 194 : isTablet ? 212 : 276;
  const colonnadeWidth = isMobile ? 178 : isTablet ? 194 : 254;
  const columnHeight = isMobile ? 70 : isTablet ? 78 : 104;
  const columnWidth = isMobile ? 16 : isTablet ? 18 : 24;
  const portalWidth = isMobile ? 38 : isTablet ? 42 : 56;
  const portalHeight = isMobile ? 54 : isTablet ? 60 : 80;
  const stepBaseWidth = isMobile ? 214 : isTablet ? 234 : 304;

  return (
    <View
      style={[
        styles.illustrationFrame,
        {
          width: frameWidth,
          maxWidth: '100%',
          paddingVertical: framePaddingV,
        },
        webIllustrationGradientStyle,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Subtle layered circular backdrop inside the architectural frame */}
      <View
        style={[
          styles.illustrationHaloOuter,
          isMobile && styles.illustrationHaloOuterMobile,
        ]}
      />
      <View
        style={[
          styles.illustrationHaloInner,
          isMobile && styles.illustrationHaloInnerMobile,
        ]}
      />

      {/* Minimalist Courthouse Silhouette */}
      <View style={styles.courthouseAssembly}>
        {/* Finial crest */}
        <View style={styles.crestBadge}>
          <MaterialCommunityIcons
            name="scale-balance"
            size={isMobile ? 15 : 18}
            color={PALETTE.white}
          />
        </View>

        {/* Classical Pediment */}
        <View
          style={[
            styles.pedimentOuter,
            {
              width: pedimentWidth,
              height: isMobile ? 28 : 34,
            },
          ]}
        >
          <View style={styles.pedimentInnerBand} />
        </View>

        {/* Entablature / Architrave */}
        <View style={[styles.entablature, { width: entablatureWidth }]}>
          <View style={styles.entablatureAccent} />
        </View>

        {/* Colonnade with 4 pillars and central portal */}
        <View
          style={[
            styles.colonnadeBox,
            { width: colonnadeWidth, height: columnHeight },
          ]}
        >
          <View style={styles.columnUnit}>
            <View style={[styles.columnCap, { width: columnWidth + 4 }]} />
            <View
              style={[
                styles.columnShaft,
                { width: columnWidth, height: columnHeight - 12 },
              ]}
            >
              <View style={styles.columnFlute} />
            </View>
            <View style={[styles.columnBase, { width: columnWidth + 4 }]} />
          </View>

          <View style={styles.columnUnit}>
            <View style={[styles.columnCap, { width: columnWidth + 4 }]} />
            <View
              style={[
                styles.columnShaft,
                { width: columnWidth, height: columnHeight - 12 },
              ]}
            >
              <View style={styles.columnFlute} />
            </View>
            <View style={[styles.columnBase, { width: columnWidth + 4 }]} />
          </View>

          {/* Central Portal */}
          <View
            style={[
              styles.centralPortal,
              { width: portalWidth, height: portalHeight },
            ]}
          >
            <View style={styles.centralPortalArch} />
            <View style={styles.centralPortalDivider} />
          </View>

          <View style={styles.columnUnit}>
            <View style={[styles.columnCap, { width: columnWidth + 4 }]} />
            <View
              style={[
                styles.columnShaft,
                { width: columnWidth, height: columnHeight - 12 },
              ]}
            >
              <View style={styles.columnFlute} />
            </View>
            <View style={[styles.columnBase, { width: columnWidth + 4 }]} />
          </View>

          <View style={styles.columnUnit}>
            <View style={[styles.columnCap, { width: columnWidth + 4 }]} />
            <View
              style={[
                styles.columnShaft,
                { width: columnWidth, height: columnHeight - 12 },
              ]}
            >
              <View style={styles.columnFlute} />
            </View>
            <View style={[styles.columnBase, { width: columnWidth + 4 }]} />
          </View>
        </View>

        {/* Stepped Courthouse Plinth */}
        <View style={[styles.plinthStepTop, { width: entablatureWidth }]} />
        <View style={[styles.plinthStepMid, { width: stepBaseWidth - 14 }]} />
        <View style={[styles.plinthStepBase, { width: stepBaseWidth }]} />
      </View>
    </View>
  );
};

export const MainHomePage: React.FC<MainHomePageProps> = ({
  onLoginPress,
  onRegisterPress,
}) => {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const tier: ViewportTier =
    width >= 1024 ? 'desktop' : width >= 768 ? 'tablet' : 'mobile';
  const isTwoColumn = tier !== 'mobile';
  const isDesktop = tier === 'desktop';
  const isTablet = tier === 'tablet';

  const handleLogin = () => {
    if (onLoginPress) {
      onLoginPress();
      return;
    }
    router.push('/(auth)/login');
  };

  const handleRegister = () => {
    if (onRegisterPress) {
      onRegisterPress();
      return;
    }
    router.push('/(auth)/register' as Href<string>);
  };

  return (
    <SafeAreaView
      style={[styles.container, webBackgroundStyle]}
      testID="main-home-page"
    >
      <StatusBar barStyle="dark-content" backgroundColor={PALETTE.bgMain} />

      {/* Subtle decorative light-blue background shapes */}
      <View style={styles.bgRadialTopLeft} pointerEvents="none" />
      <View style={styles.bgRadialBottomRight} pointerEvents="none" />
      <View style={styles.bgAccentRing} pointerEvents="none" />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isDesktop
            ? styles.scrollContentDesktop
            : isTablet
              ? styles.scrollContentTablet
              : styles.scrollContentMobile,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.card,
            isDesktop
              ? styles.cardDesktop
              : isTablet
                ? styles.cardTablet
                : styles.cardMobile,
          ]}
        >
          <View
            style={[
              styles.heroLayout,
              isTwoColumn ? styles.heroLayoutRow : styles.heroLayoutMobile,
            ]}
          >
            {/* LEFT COLUMN: Branding, Hero Copy & Actions */}
            <View
              style={[
                styles.leftColumn,
                isDesktop
                  ? styles.leftColumnDesktop
                  : isTablet
                    ? styles.leftColumnTablet
                    : styles.leftColumnMobile,
              ]}
            >
              {/* Brand Row */}
              <View
                style={[
                  styles.brandHeader,
                  !isTwoColumn && styles.brandHeaderMobile,
                ]}
              >
                <View
                  style={[styles.logoWrapper, webLogoGradientStyle]}
                  testID="landing-logo"
                >
                  <MaterialCommunityIcons
                    name="bank"
                    size={isTwoColumn ? 28 : 26}
                    color={PALETTE.white}
                  />
                </View>

                <View
                  style={[
                    styles.brandTextGroup,
                    !isTwoColumn && styles.brandTextGroupMobile,
                  ]}
                >
                  <Text
                    style={[
                      styles.appName,
                      !isTwoColumn && styles.textAlignCenter,
                    ]}
                  >
                    APHC Case Tracker
                  </Text>
                  <Text
                    style={[
                      styles.subtitle,
                      !isTwoColumn && styles.textAlignCenter,
                    ]}
                  >
                    High Court of Andhra Pradesh
                  </Text>
                </View>
              </View>

              {/* Small Jurisdictional Badge */}
              <View
                style={[
                  styles.badgePill,
                  !isTwoColumn && styles.badgePillMobile,
                ]}
              >
                <View style={styles.badgeDot} />
                <Text style={styles.badgeText}>APHC AMARAVATI</Text>
              </View>

              {/* Main Hero Heading */}
              <Text
                style={[
                  styles.heroHeading,
                  isDesktop
                    ? styles.heroHeadingDesktop
                    : isTablet
                      ? styles.heroHeadingTablet
                      : styles.heroHeadingMobile,
                ]}
              >
                Your Court Matters, Simplified.
              </Text>

              {/* Tagline */}
              <Text
                style={[
                  styles.tagline,
                  !isTwoColumn && styles.textAlignCenter,
                ]}
              >
                Manage Cases. Track Hearings. Stay Informed.
              </Text>

              {/* Supporting Description */}
              <Text
                style={[
                  styles.description,
                  isTablet && styles.descriptionTablet,
                  !isTwoColumn && styles.descriptionMobile,
                ]}
              >
                Manage your cases, track hearing schedules, receive reminders,
                and stay updated with court information through one convenient
                platform.
              </Text>

              {/* Action Buttons */}
              <View
                style={[
                  styles.buttonGroup,
                  isTwoColumn
                    ? styles.buttonGroupRow
                    : styles.buttonGroupMobile,
                ]}
              >
                <Pressable
                  onPress={handleLogin}
                  testID="landing-login-button"
                  accessibilityRole="button"
                  accessibilityLabel="Login"
                  style={(state) => {
                    const hovered =
                      'hovered' in state && Boolean(state.hovered);
                    return [
                      styles.buttonBase,
                      isTwoColumn && styles.buttonRowItem,
                      styles.loginButton,
                      (hovered || state.pressed) && styles.loginButtonActive,
                      webButtonCursor,
                    ];
                  }}
                >
                  <MaterialCommunityIcons
                    name="login"
                    size={19}
                    color={PALETTE.white}
                  />
                  <Text style={styles.loginButtonText}>Login</Text>
                </Pressable>

                <Pressable
                  onPress={handleRegister}
                  testID="landing-register-button"
                  accessibilityRole="button"
                  accessibilityLabel="Register"
                  style={(state) => {
                    const hovered =
                      'hovered' in state && Boolean(state.hovered);
                    return [
                      styles.buttonBase,
                      isTwoColumn && styles.buttonRowItem,
                      styles.registerButton,
                      (hovered || state.pressed) && styles.registerButtonActive,
                      webButtonCursor,
                    ];
                  }}
                >
                  <MaterialCommunityIcons
                    name="account-plus-outline"
                    size={19}
                    color={PALETTE.primaryBlue}
                  />
                  <Text style={styles.registerButtonText}>Register</Text>
                </Pressable>
              </View>
            </View>

            {/* RIGHT COLUMN: Minimal Courthouse Illustration */}
            <View
              style={[
                styles.rightColumn,
                isDesktop
                  ? styles.rightColumnDesktop
                  : isTablet
                    ? styles.rightColumnTablet
                    : styles.rightColumnMobile,
              ]}
            >
              <CourthouseIllustration tier={tier} />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const webBackgroundStyle: ViewStyle =
  Platform.OS === 'web'
    ? ({
        backgroundImage:
          'radial-gradient(circle at 12% 16%, rgba(36, 91, 234, 0.08) 0%, rgba(36, 91, 234, 0) 42%), radial-gradient(circle at 88% 84%, rgba(23, 43, 77, 0.06) 0%, rgba(23, 43, 77, 0) 44%), linear-gradient(145deg, #EEF3FA 0%, #E5EDFA 52%, #F3F7FD 100%)',
      } as unknown as ViewStyle)
    : {};

const webLogoGradientStyle: ViewStyle =
  Platform.OS === 'web'
    ? ({
        backgroundImage:
          'linear-gradient(135deg, #245BEA 0%, #173F9F 100%)',
      } as unknown as ViewStyle)
    : {};

const webIllustrationGradientStyle: ViewStyle =
  Platform.OS === 'web'
    ? ({
        backgroundImage:
          'radial-gradient(circle at 50% 35%, rgba(255, 255, 255, 0.92) 0%, rgba(238, 243, 250, 0.95) 60%, rgba(229, 237, 250, 1) 100%)',
      } as unknown as ViewStyle)
    : {};

const webButtonCursor: ViewStyle =
  Platform.OS === 'web'
    ? ({
        cursor: 'pointer',
        transition: 'background-color 160ms ease, border-color 160ms ease, transform 140ms ease',
      } as unknown as ViewStyle)
    : {};

const cardShadow: ViewStyle = Platform.select({
  ios: {
    shadowColor: PALETTE.navyHeading,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 28,
  },
  android: {
    elevation: 6,
  },
  default: {
    boxShadow:
      '0px 20px 48px rgba(23, 43, 77, 0.08), 0px 4px 14px rgba(36, 91, 234, 0.05)',
  } as unknown as ViewStyle,
});

const logoShadow: ViewStyle = Platform.select({
  ios: {
    shadowColor: PALETTE.primaryBlue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
  },
  android: {
    elevation: 4,
  },
  default: {
    boxShadow: '0px 8px 18px rgba(36, 91, 234, 0.24)',
  } as unknown as ViewStyle,
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PALETTE.bgMain,
    position: 'relative',
    overflow: 'hidden',
  },
  bgRadialTopLeft: {
    position: 'absolute',
    top: -140,
    left: -140,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: 'rgba(36, 91, 234, 0.07)',
  },
  bgRadialBottomRight: {
    position: 'absolute',
    bottom: -160,
    right: -140,
    width: 460,
    height: 460,
    borderRadius: 230,
    backgroundColor: 'rgba(229, 237, 250, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(220, 229, 241, 0.7)',
  },
  bgAccentRing: {
    position: 'absolute',
    top: '14%',
    right: '8%',
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 1,
    borderColor: 'rgba(36, 91, 234, 0.09)',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContentDesktop: {
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  scrollContentTablet: {
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  scrollContentMobile: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  card: {
    width: '100%',
    maxWidth: 1140,
    backgroundColor: PALETTE.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: PALETTE.border,
    ...cardShadow,
  },
  cardDesktop: {
    paddingHorizontal: 56,
    paddingVertical: 52,
  },
  cardTablet: {
    paddingHorizontal: 32,
    paddingVertical: 36,
  },
  cardMobile: {
    paddingHorizontal: 22,
    paddingVertical: 28,
    borderRadius: 20,
  },
  heroLayout: {
    width: '100%',
  },
  heroLayoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 40,
  },
  heroLayoutMobile: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 28,
  },
  leftColumn: {
    flex: 1,
  },
  leftColumnDesktop: {
    alignItems: 'flex-start',
    maxWidth: 560,
  },
  leftColumnTablet: {
    alignItems: 'flex-start',
  },
  leftColumnMobile: {
    width: '100%',
    alignItems: 'center',
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 22,
  },
  brandHeaderMobile: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  logoWrapper: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: PALETTE.primaryBlue,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    ...logoShadow,
  },
  brandTextGroup: {
    justifyContent: 'center',
  },
  brandTextGroupMobile: {
    alignItems: 'center',
  },
  appName: {
    fontSize: 20,
    fontWeight: '700',
    color: PALETTE.navyHeading,
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13.5,
    fontWeight: '600',
    color: PALETTE.primaryBlue,
    letterSpacing: 0.15,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: PALETTE.bgMain,
    borderWidth: 1,
    borderColor: PALETTE.border,
    marginBottom: 16,
  },
  badgePillMobile: {
    marginBottom: 14,
  },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: PALETTE.primaryBlue,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: PALETTE.navyHeading,
    letterSpacing: 1.1,
  },
  heroHeading: {
    fontWeight: '800',
    color: PALETTE.navyHeading,
    letterSpacing: -0.8,
  },
  heroHeadingDesktop: {
    fontSize: 40,
    lineHeight: 48,
    textAlign: 'left',
  },
  heroHeadingTablet: {
    fontSize: 31,
    lineHeight: 38,
    textAlign: 'left',
  },
  heroHeadingMobile: {
    fontSize: 27,
    lineHeight: 34,
    textAlign: 'center',
  },
  tagline: {
    marginTop: 12,
    fontSize: 15.5,
    fontWeight: '600',
    color: PALETTE.navyHeading,
    letterSpacing: 0.1,
  },
  description: {
    marginTop: 12,
    fontSize: 15.5,
    lineHeight: 24,
    color: PALETTE.bodyText,
    textAlign: 'left',
    maxWidth: 510,
  },
  descriptionTablet: {
    fontSize: 14.5,
    lineHeight: 22,
  },
  descriptionMobile: {
    fontSize: 14.5,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 330,
  },
  textAlignCenter: {
    textAlign: 'center',
  },
  buttonGroup: {
    marginTop: 28,
    width: '100%',
  },
  buttonGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    maxWidth: 420,
  },
  buttonGroupMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
  },
  buttonBase: {
    height: 50,
    borderRadius: 12,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  buttonRowItem: {
    flex: 1,
  },
  loginButton: {
    backgroundColor: PALETTE.primaryBlue,
    borderWidth: 1.5,
    borderColor: PALETTE.primaryBlue,
  },
  loginButtonActive: {
    backgroundColor: PALETTE.primaryBlueHover,
    borderColor: PALETTE.primaryBlueHover,
  },
  loginButtonText: {
    fontSize: 15.5,
    fontWeight: '600',
    color: PALETTE.white,
    letterSpacing: 0.15,
  },
  registerButton: {
    backgroundColor: PALETTE.white,
    borderWidth: 1.5,
    borderColor: PALETTE.primaryBlue,
  },
  registerButtonActive: {
    backgroundColor: PALETTE.primaryBlueSoft,
    borderColor: PALETTE.primaryBlueHover,
  },
  registerButtonText: {
    fontSize: 15.5,
    fontWeight: '600',
    color: PALETTE.primaryBlue,
    letterSpacing: 0.15,
  },
  rightColumn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightColumnDesktop: {
    flexBasis: 400,
    flexShrink: 0,
  },
  rightColumnTablet: {
    flexBasis: 290,
    flexShrink: 0,
  },
  rightColumnMobile: {
    width: '100%',
  },
  illustrationFrame: {
    backgroundColor: PALETTE.bgMain,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PALETTE.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  illustrationHaloOuter: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: PALETTE.bgSecondary,
    borderWidth: 1,
    borderColor: PALETTE.border,
  },
  illustrationHaloOuterMobile: {
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  illustrationHaloInner: {
    position: 'absolute',
    width: 196,
    height: 196,
    borderRadius: 98,
    backgroundColor: PALETTE.white,
    opacity: 0.72,
  },
  illustrationHaloInnerMobile: {
    width: 148,
    height: 148,
    borderRadius: 74,
  },
  courthouseAssembly: {
    alignItems: 'center',
    zIndex: 1,
  },
  crestBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: PALETTE.primaryBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -10,
    zIndex: 2,
    borderWidth: 2,
    borderColor: PALETTE.white,
  },
  pedimentOuter: {
    backgroundColor: PALETTE.navyHeading,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: PALETTE.navyHeading,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 6,
  },
  pedimentInnerBand: {
    width: '72%',
    height: 5,
    borderRadius: 3,
    backgroundColor: PALETTE.primaryBlue,
  },
  entablature: {
    height: 12,
    backgroundColor: PALETTE.bgSecondary,
    borderWidth: 1,
    borderColor: PALETTE.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  entablatureAccent: {
    width: '88%',
    height: 3,
    borderRadius: 2,
    backgroundColor: PALETTE.primaryBlue,
  },
  colonnadeBox: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    backgroundColor: PALETTE.white,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: PALETTE.border,
  },
  columnUnit: {
    alignItems: 'center',
  },
  columnCap: {
    height: 6,
    borderRadius: 2,
    backgroundColor: PALETTE.navyHeading,
  },
  columnShaft: {
    backgroundColor: PALETTE.bgMain,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: PALETTE.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  columnFlute: {
    width: 3,
    height: '76%',
    borderRadius: 2,
    backgroundColor: PALETTE.white,
  },
  columnBase: {
    height: 6,
    borderRadius: 2,
    backgroundColor: PALETTE.border,
  },
  centralPortal: {
    backgroundColor: PALETTE.primaryBlue,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: 10,
    borderWidth: 1,
    borderColor: PALETTE.navyHeading,
  },
  centralPortalArch: {
    width: '56%',
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    marginBottom: 8,
  },
  centralPortalDivider: {
    width: 2,
    height: '58%',
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
  plinthStepTop: {
    height: 7,
    backgroundColor: PALETTE.navyHeading,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  plinthStepMid: {
    height: 8,
    backgroundColor: PALETTE.bgSecondary,
    borderWidth: 1,
    borderColor: PALETTE.border,
  },
  plinthStepBase: {
    height: 9,
    backgroundColor: PALETTE.white,
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
});

export default MainHomePage;
