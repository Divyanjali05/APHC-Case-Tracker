import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Pressable,
  Animated,
  Easing,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppIcon, AppIconName } from '../common/AppIcon';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Colors } from '../../constants/colors';
import { Radius, Shadows, Spacing } from '../../constants/theme';

export interface CaseFilters {
  status: 'ALL' | 'PENDING' | 'UPCOMING' | 'ADJOURNED' | 'DISPOSED';
  hearing:
    | 'ALL'
    | 'UPCOMING'
    | 'TODAY'
    | 'THIS_WEEK'
    | 'THIS_MONTH'
    | 'PAST'
    | 'NOT_SCHEDULED';
  judgment: 'ALL' | 'AVAILABLE' | 'PENDING' | 'NOT_AVAILABLE';
  filingDateFrom?: string;
  filingDateTo?: string;
  hearingDateFrom?: string;
  hearingDateTo?: string;
  closedDateFrom?: string;
  closedDateTo?: string;
  court?: string;
  courtHallNumber?: string;
  caseType?: string;
  caseYear?: string;
}

export const DEFAULT_FILTERS: CaseFilters = {
  status: 'ALL',
  hearing: 'ALL',
  judgment: 'ALL',
  filingDateFrom: '',
  filingDateTo: '',
  hearingDateFrom: '',
  hearingDateTo: '',
  closedDateFrom: '',
  closedDateTo: '',
  court: '',
  courtHallNumber: '',
  caseType: '',
  caseYear: '',
};

export interface CaseFilterModalProps {
  visible: boolean;
  onClose: () => void;
  filters: CaseFilters;
  onApplyFilters: (newFilters: CaseFilters) => void;
  onClearAll: () => void;
  availableCaseTypes?: string[];
  availableCourts?: string[];
  availableYears?: string[];
  testID?: string;
}

export const countActiveFilters = (filters: CaseFilters): number => {
  let count = 0;
  if (filters.status !== 'ALL') count++;
  if (filters.caseType?.trim()) count++;
  if (filters.court?.trim()) count++;
  if (filters.courtHallNumber?.trim()) count++;
  if (filters.filingDateFrom?.trim() || filters.filingDateTo?.trim()) count++;
  if (filters.caseYear?.trim()) count++;
  if (filters.hearing !== 'ALL') count++;
  if (filters.hearingDateFrom?.trim() || filters.hearingDateTo?.trim()) count++;
  if (filters.closedDateFrom?.trim() || filters.closedDateTo?.trim()) count++;
  if (filters.judgment !== 'ALL') count++;
  return count;
};

type FilterCategoryId =
  | 'status'
  | 'caseType'
  | 'court'
  | 'filingDate'
  | 'hearingDate'
  | 'closedDate'
  | 'judgment';

interface CategoryDescriptor {
  id: FilterCategoryId;
  label: string;
  icon: AppIconName;
}

interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

const FILTER_CATEGORIES: CategoryDescriptor[] = [
  { id: 'status', label: 'Status', icon: 'activity' },
  { id: 'caseType', label: 'Case Type', icon: 'tag' },
  { id: 'court', label: 'Court', icon: 'landmark' },
  { id: 'filingDate', label: 'Filing Date', icon: 'calendar' },
  { id: 'hearingDate', label: 'Hearing Date', icon: 'calendar-clock' },
  { id: 'closedDate', label: 'Closed Date', icon: 'calendar-check' },
  { id: 'judgment', label: 'Judgment Availability', icon: 'file-text' },
];

const CASE_TYPE_LABELS: Record<string, string> = {
  WP: 'WP — Writ Petition',
  WA: 'WA — Writ Appeal',
  CRLP: 'CRLP — Criminal Petition',
  CRP: 'CRP — Civil Revision Petition',
  MACMA: 'MACMA — Motor Accident Appeal',
  CC: 'CC — Contempt Case',
  EP: 'EP — Election Petition',
  CMA: 'CMA — Civil Misc Appeal',
  OTHER: 'OTHER — Other Matter',
};

const STATUS_OPTIONS: SelectOption[] = [
  { value: 'ALL', label: 'All', sublabel: 'Show cases of every status' },
  { value: 'PENDING', label: 'Pending', sublabel: 'Active & awaiting hearing or order' },
  { value: 'DISPOSED', label: 'Disposed', sublabel: 'Closed or final order passed' },
  { value: 'ADJOURNED', label: 'Adjourned', sublabel: 'Deferred to a later date' },
];

const HEARING_SCHEDULE_OPTIONS: SelectOption[] = [
  { value: 'ALL', label: 'All', sublabel: 'Any hearing schedule' },
  { value: 'UPCOMING', label: 'Upcoming', sublabel: 'Scheduled today or in the future' },
  { value: 'PAST', label: 'Past', sublabel: 'Hearing date before today' },
  { value: 'TODAY', label: 'Today', sublabel: 'Listed for today' },
  { value: 'THIS_WEEK', label: 'This Week', sublabel: 'Next 7 days' },
  {
    value: 'NOT_SCHEDULED',
    label: 'Not Scheduled',
    sublabel: 'No hearing date assigned',
  },
];

const JUDGMENT_OPTIONS: SelectOption[] = [
  { value: 'ALL', label: 'All', sublabel: 'With or without judgment' },
  {
    value: 'AVAILABLE',
    label: 'Available',
    sublabel: 'Certified judgment/order attached',
  },
  {
    value: 'NOT_AVAILABLE',
    label: 'Not Available',
    sublabel: 'No judgment recorded yet',
  },
  {
    value: 'PENDING',
    label: 'Pending (Disposed)',
    sublabel: 'Disposed cases awaiting judgment upload',
  },
];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isValidIsoDate = (value: string): boolean => {
  if (!ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

const validateDateRange = (
  fromVal: string | undefined,
  toVal: string | undefined,
  rangeLabel: string
): string | null => {
  const from = (fromVal || '').trim();
  const to = (toVal || '').trim();
  if (!from && !to) return null;
  if (from && !isValidIsoDate(from)) {
    return `Enter a valid From date (YYYY-MM-DD) for ${rangeLabel}.`;
  }
  if (to && !isValidIsoDate(to)) {
    return `Enter a valid To date (YYYY-MM-DD) for ${rangeLabel}.`;
  }
  if (from && to && from > to) {
    return `From date must be on or before To date for ${rangeLabel}.`;
  }
  return null;
};

const formatDateOffset = (daysOffset: number): string => {
  const dt = new Date();
  dt.setDate(dt.getDate() + daysOffset);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const formatRangeSummary = (from?: string, to?: string): string => {
  const f = (from || '').trim();
  const t = (to || '').trim();
  if (f && t) return `${f} → ${t}`;
  if (f) return `From ${f}`;
  if (t) return `Up to ${t}`;
  return '';
};

interface DrawerDateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hasError?: boolean;
  testID: string;
}

const DrawerDateField: React.FC<DrawerDateFieldProps> = ({
  label,
  value,
  onChange,
  hasError = false,
  testID,
}) => {
  const [nativeExpanded, setNativeExpanded] = useState(false);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.dateFieldBlock}>
        <Text style={styles.dateLabel}>{label}</Text>
        <View
          style={[
            styles.dateInputBox,
            hasError && styles.dateInputBoxError,
            Boolean(value) && styles.dateInputBoxFilled,
          ]}
        >
          <input
            type="date"
            value={value}
            onChange={e => onChange(e.target.value)}
            aria-label={label}
            data-testid={testID}
            style={{
              flex: 1,
              width: '100%',
              minWidth: 0,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 14,
              color: value ? '#0F172A' : '#64748B',
              fontFamily: 'inherit',
              height: '100%',
              cursor: 'pointer',
            }}
          />
          {Boolean(value) && (
            <TouchableOpacity
              onPress={() => onChange('')}
              style={styles.inlineClearBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={`Clear ${label}`}
            >
              <AppIcon name="x" size={14} color={Colors.text.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.dateFieldBlock}>
      <Text style={styles.dateLabel}>{label}</Text>
      <TouchableOpacity
        style={[
          styles.dateInputBox,
          hasError && styles.dateInputBoxError,
          Boolean(value) && styles.dateInputBoxFilled,
        ]}
        onPress={() => setNativeExpanded(prev => !prev)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <AppIcon
          name="calendar"
          size={15}
          color={value ? Colors.primary : Colors.text.muted}
        />
        <Text
          style={[styles.nativeDateText, !value && styles.placeholderText]}
          numberOfLines={1}
        >
          {value || 'YYYY-MM-DD'}
        </Text>
        {Boolean(value) && (
          <TouchableOpacity
            onPress={e => {
              e.stopPropagation?.();
              onChange('');
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <AppIcon name="x" size={14} color={Colors.text.muted} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {nativeExpanded && (
        <View style={styles.nativeDatePopover}>
          <TextInput
            style={styles.nativeDateInput}
            value={value}
            onChangeText={txt => onChange(txt.trim())}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={Colors.text.muted}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            testID={testID}
          />
          <View style={styles.nativePresetRow}>
            {[
              { label: 'Today', offset: 0 },
              { label: '+7d', offset: 7 },
              { label: '+30d', offset: 30 },
              { label: '-30d', offset: -30 },
            ].map(preset => (
              <TouchableOpacity
                key={preset.label}
                style={styles.nativePresetBtn}
                onPress={() => {
                  onChange(formatDateOffset(preset.offset));
                  setNativeExpanded(false);
                }}
              >
                <Text style={styles.nativePresetText}>{preset.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

export const CaseFilterModal: React.FC<CaseFilterModalProps> = ({
  visible,
  onClose,
  filters,
  onApplyFilters,
  onClearAll,
  availableCaseTypes = ['WP', 'WA', 'CRLP', 'CRP', 'MACMA', 'CC', 'EP', 'OTHER'],
  availableCourts = [],
  availableYears = [
    '2026',
    '2025',
    '2024',
    '2023',
    '2022',
    '2021',
    '2020',
    '2019',
    '2018',
  ],
  testID = 'case-filter-modal',
}) => {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const isWideScreen = width >= 768;

  const drawerWidth = isWideScreen
    ? Math.min(Math.round(width * 0.84), 660)
    : Math.min(Math.round(width * 0.88), 360);

  const [isMounted, setIsMounted] = useState(visible);
  const [draftFilters, setDraftFilters] = useState<CaseFilters>(filters);
  const [activeCategory, setActiveCategory] = useState<FilterCategoryId | null>(
    isWideScreen ? 'status' : null
  );
  const [categorySearch, setCategorySearch] = useState('');
  const [rangeErrors, setRangeErrors] = useState<{
    filing?: string | null;
    hearing?: string | null;
    closed?: string | null;
  }>({});

  const slideAnim = useRef(new Animated.Value(-drawerWidth)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const isMountedRef = useRef(visible);
  const prevVisibleRef = useRef(false);

  // Sync draft state & slide-in/slide-out animation from the LEFT
  useEffect(() => {
    const useNativeDriver = Platform.OS !== 'web';
    const wasVisible = prevVisibleRef.current;
    prevVisibleRef.current = visible;

    if (visible && !wasVisible) {
      isMountedRef.current = true;
      setIsMounted(true);
      setDraftFilters(filters);
      setRangeErrors({});
      setCategorySearch('');
      setActiveCategory(isWideScreen ? 'status' : null);

      if (process.env.NODE_ENV === 'test') {
        slideAnim.setValue(0);
        overlayAnim.setValue(1);
        return;
      }

      slideAnim.setValue(-drawerWidth);
      overlayAnim.setValue(0);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver,
        }),
        Animated.timing(overlayAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver,
        }),
      ]).start();
    } else if (!visible && isMountedRef.current) {
      if (process.env.NODE_ENV === 'test') {
        slideAnim.setValue(-drawerWidth);
        overlayAnim.setValue(0);
        isMountedRef.current = false;
        setIsMounted(false);
        return;
      }

      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -drawerWidth,
          duration: 190,
          easing: Easing.in(Easing.cubic),
          useNativeDriver,
        }),
        Animated.timing(overlayAnim, {
          toValue: 0,
          duration: 170,
          useNativeDriver,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          isMountedRef.current = false;
          setIsMounted(false);
        }
      });
    }
  }, [visible, filters, isWideScreen, drawerWidth, slideAnim, overlayAnim]);

  // Ensure wide-screen always displays a category submenu on the right column
  useEffect(() => {
    if (visible && isWideScreen && !activeCategory) {
      setActiveCategory('status');
    }
  }, [visible, isWideScreen, activeCategory]);

  // Web: lock background scroll and listen for Escape key while open
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const prevOverflow =
      typeof document !== 'undefined' ? document.body.style.overflow : '';
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      if (typeof document !== 'undefined') {
        document.body.style.overflow = prevOverflow;
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', handleKeyDown);
      }
    };
  }, [visible, onClose]);

  const caseTypeOptions: SelectOption[] = useMemo(() => {
    const uniqueTypes = Array.from(
      new Set(availableCaseTypes.map(ct => ct.trim().toUpperCase()).filter(Boolean))
    );
    return [
      {
        value: '',
        label: 'All Case Types',
        sublabel: 'Include every petition & appeal type',
      },
      ...uniqueTypes.map(ct => ({
        value: ct,
        label: CASE_TYPE_LABELS[ct] || ct,
      })),
    ];
  }, [availableCaseTypes]);

  const courtOptions: SelectOption[] = useMemo(() => {
    const defaults = ['High Court of Andhra Pradesh', 'Division Bench', 'Single Bench'];
    const merged = Array.from(
      new Set([...availableCourts.map(c => c.trim()).filter(Boolean), ...defaults])
    );
    return [
      { value: '', label: 'All Courts / Benches', sublabel: 'Include every bench' },
      ...merged.map(c => ({ value: c, label: c })),
    ];
  }, [availableCourts]);

  const yearOptions: string[] = useMemo(() => {
    return Array.from(new Set(availableYears.map(y => y.trim()).filter(Boolean))).sort(
      (a, b) => Number(b) - Number(a)
    );
  }, [availableYears]);

  const activeCount = countActiveFilters(draftFilters);

  // Per-category summary & active flag for the vertical category list
  const getCategoryMeta = useCallback(
    (catId: FilterCategoryId): { summary: string; isActive: boolean } => {
      switch (catId) {
        case 'status': {
          if (draftFilters.status === 'ALL') return { summary: 'All', isActive: false };
          const found = STATUS_OPTIONS.find(o => o.value === draftFilters.status);
          return {
            summary:
              found?.label ||
              draftFilters.status.charAt(0) + draftFilters.status.slice(1).toLowerCase(),
            isActive: true,
          };
        }
        case 'caseType': {
          const val = draftFilters.caseType?.trim();
          return val
            ? { summary: val, isActive: true }
            : { summary: 'All', isActive: false };
        }
        case 'court': {
          const parts: string[] = [];
          if (draftFilters.court?.trim()) parts.push(draftFilters.court.trim());
          if (draftFilters.courtHallNumber?.trim()) {
            parts.push(`Hall ${draftFilters.courtHallNumber.trim()}`);
          }
          return parts.length > 0
            ? { summary: parts.join(' • '), isActive: true }
            : { summary: 'All', isActive: false };
        }
        case 'filingDate': {
          const parts: string[] = [];
          const range = formatRangeSummary(
            draftFilters.filingDateFrom,
            draftFilters.filingDateTo
          );
          if (range) parts.push(range);
          if (draftFilters.caseYear?.trim()) {
            parts.push(`Year ${draftFilters.caseYear.trim()}`);
          }
          return parts.length > 0
            ? { summary: parts.join(' • '), isActive: true }
            : { summary: 'Any date', isActive: false };
        }
        case 'hearingDate': {
          const parts: string[] = [];
          if (draftFilters.hearing !== 'ALL') {
            const opt = HEARING_SCHEDULE_OPTIONS.find(
              o => o.value === draftFilters.hearing
            );
            parts.push(opt?.label || draftFilters.hearing);
          }
          const range = formatRangeSummary(
            draftFilters.hearingDateFrom,
            draftFilters.hearingDateTo
          );
          if (range) parts.push(range);
          return parts.length > 0
            ? { summary: parts.join(' • '), isActive: true }
            : { summary: 'Any date', isActive: false };
        }
        case 'closedDate': {
          const range = formatRangeSummary(
            draftFilters.closedDateFrom,
            draftFilters.closedDateTo
          );
          return range
            ? { summary: range, isActive: true }
            : { summary: 'Any date', isActive: false };
        }
        case 'judgment': {
          if (draftFilters.judgment === 'ALL') {
            return { summary: 'All', isActive: false };
          }
          const opt = JUDGMENT_OPTIONS.find(o => o.value === draftFilters.judgment);
          return { summary: opt?.label || draftFilters.judgment, isActive: true };
        }
      }
    },
    [draftFilters]
  );

  const resetCategory = (catId: FilterCategoryId) => {
    setRangeErrors({});
    switch (catId) {
      case 'status':
        setDraftFilters(p => ({ ...p, status: 'ALL' }));
        break;
      case 'caseType':
        setDraftFilters(p => ({ ...p, caseType: '' }));
        break;
      case 'court':
        setDraftFilters(p => ({ ...p, court: '', courtHallNumber: '' }));
        break;
      case 'filingDate':
        setDraftFilters(p => ({
          ...p,
          filingDateFrom: '',
          filingDateTo: '',
          caseYear: '',
        }));
        break;
      case 'hearingDate':
        setDraftFilters(p => ({
          ...p,
          hearing: 'ALL',
          hearingDateFrom: '',
          hearingDateTo: '',
        }));
        break;
      case 'closedDate':
        setDraftFilters(p => ({ ...p, closedDateFrom: '', closedDateTo: '' }));
        break;
      case 'judgment':
        setDraftFilters(p => ({ ...p, judgment: 'ALL' }));
        break;
    }
  };

  const handleSelectCategory = (catId: FilterCategoryId) => {
    setCategorySearch('');
    setActiveCategory(catId);
  };

  const handleApply = () => {
    const filingErr = validateDateRange(
      draftFilters.filingDateFrom,
      draftFilters.filingDateTo,
      'Filing Date'
    );
    const hearingErr = validateDateRange(
      draftFilters.hearingDateFrom,
      draftFilters.hearingDateTo,
      'Hearing Date'
    );
    const closedErr = validateDateRange(
      draftFilters.closedDateFrom,
      draftFilters.closedDateTo,
      'Closed Date'
    );

    if (filingErr || hearingErr || closedErr) {
      setRangeErrors({
        filing: filingErr,
        hearing: hearingErr,
        closed: closedErr,
      });
      // Navigate directly to the first category with an error on mobile
      if (filingErr) setActiveCategory('filingDate');
      else if (hearingErr) setActiveCategory('hearingDate');
      else if (closedErr) setActiveCategory('closedDate');
      return;
    }

    setRangeErrors({});
    onApplyFilters(draftFilters);
    onClose();
  };

  const handleResetAll = () => {
    setDraftFilters(DEFAULT_FILTERS);
    setRangeErrors({});
    setCategorySearch('');
    onClearAll();
  };

  const renderRadioList = (
    options: SelectOption[],
    selectedValue: string,
    onSelect: (value: string) => void,
    testIDPrefix: string,
    searchable = false,
    allowCustom = false,
    searchPlaceholder = 'Search...'
  ) => {
    const q = searchable ? categorySearch.trim().toLowerCase() : '';
    const filtered = q
      ? options.filter(
          o =>
            o.label.toLowerCase().includes(q) ||
            o.value.toLowerCase().includes(q) ||
            (o.sublabel || '').toLowerCase().includes(q)
        )
      : options;

    const trimmedCustom = categorySearch.trim();
    const showCustom =
      searchable &&
      allowCustom &&
      Boolean(trimmedCustom) &&
      !filtered.some(o => o.value.toLowerCase() === trimmedCustom.toLowerCase());

    return (
      <View style={styles.submenuSection}>
        {searchable && (
          <View style={styles.submenuSearchWrap}>
            <AppIcon name="search" size={15} color={Colors.text.muted} />
            <TextInput
              style={styles.submenuSearchInput}
              value={categorySearch}
              onChangeText={setCategorySearch}
              placeholder={searchPlaceholder}
              placeholderTextColor={Colors.text.muted}
              autoCorrect={false}
              testID={`${testIDPrefix}-search`}
            />
            {Boolean(categorySearch) && (
              <TouchableOpacity
                onPress={() => setCategorySearch('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <AppIcon name="x" size={14} color={Colors.text.muted} />
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.optionList}>
          {filtered.map(opt => {
            const isSelected = selectedValue === opt.value;
            const safeSlug = (opt.value || 'all')
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-');
            return (
              <TouchableOpacity
                key={opt.value || '__all__'}
                style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                onPress={() => onSelect(opt.value)}
                activeOpacity={0.75}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected, checked: isSelected }}
                testID={`${testIDPrefix}-option-${safeSlug}`}
              >
                <View style={styles.optionTextCol}>
                  <Text
                    style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}
                  >
                    {opt.label}
                  </Text>
                  {opt.sublabel ? (
                    <Text style={styles.optionSublabel}>{opt.sublabel}</Text>
                  ) : null}
                </View>
                <View
                  style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}
                >
                  {isSelected && <AppIcon name="check" size={12} color="#FFFFFF" />}
                </View>
              </TouchableOpacity>
            );
          })}

          {showCustom && (
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => onSelect(trimmedCustom)}
              testID={`${testIDPrefix}-option-custom`}
            >
              <Text style={styles.customOptionText}>
                Use &ldquo;{trimmedCustom}&rdquo;
              </Text>
              <AppIcon name="plus" size={16} color={Colors.primary} />
            </TouchableOpacity>
          )}

          {filtered.length === 0 && !showCustom && (
            <Text style={styles.emptySearchText}>No matching options</Text>
          )}
        </View>
      </View>
    );
  };

  const renderSubmenuContent = (catId: FilterCategoryId) => {
    switch (catId) {
      case 'status':
        return renderRadioList(
          STATUS_OPTIONS,
          draftFilters.status,
          val =>
            setDraftFilters(p => ({
              ...p,
              status: (val || 'ALL') as CaseFilters['status'],
            })),
          'filter-status'
        );

      case 'caseType':
        return renderRadioList(
          caseTypeOptions,
          draftFilters.caseType || '',
          val => setDraftFilters(p => ({ ...p, caseType: val })),
          'filter-type',
          true,
          false,
          'Search case type (WP, WA, CRLP...)'
        );

      case 'court':
        return (
          <View style={styles.submenuSection}>
            {renderRadioList(
              courtOptions,
              draftFilters.court || '',
              val => setDraftFilters(p => ({ ...p, court: val })),
              'filter-court',
              true,
              true,
              'Search court or bench...'
            )}
            <View style={styles.subDivider} />
            <Text style={styles.subSectionHeading}>Court Hall No. (Optional)</Text>
            <View style={styles.plainInputWrap}>
              <TextInput
                style={styles.plainInput}
                placeholder="e.g. 4, 12"
                placeholderTextColor={Colors.text.muted}
                keyboardType="number-pad"
                value={draftFilters.courtHallNumber || ''}
                onChangeText={txt =>
                  setDraftFilters(p => ({
                    ...p,
                    courtHallNumber: txt.replace(/\D/g, ''),
                  }))
                }
                testID="filter-court-hall-input"
              />
              {Boolean(draftFilters.courtHallNumber) && (
                <TouchableOpacity
                  onPress={() => setDraftFilters(p => ({ ...p, courtHallNumber: '' }))}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <AppIcon name="x" size={14} color={Colors.text.muted} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        );

      case 'filingDate':
        return (
          <View style={styles.submenuSection}>
            <Text style={styles.subSectionHeading}>Filing Date Range</Text>
            <DrawerDateField
              label="From date"
              value={draftFilters.filingDateFrom || ''}
              onChange={val => {
                setDraftFilters(p => ({ ...p, filingDateFrom: val }));
                if (rangeErrors.filing) {
                  setRangeErrors(p => ({ ...p, filing: null }));
                }
              }}
              hasError={Boolean(rangeErrors.filing)}
              testID="filter-filing-date-from"
            />
            <DrawerDateField
              label="To date"
              value={draftFilters.filingDateTo || ''}
              onChange={val => {
                setDraftFilters(p => ({ ...p, filingDateTo: val }));
                if (rangeErrors.filing) {
                  setRangeErrors(p => ({ ...p, filing: null }));
                }
              }}
              hasError={Boolean(rangeErrors.filing)}
              testID="filter-filing-date-to"
            />
            {rangeErrors.filing ? (
              <Text style={styles.errorText} testID="filter-filing-date-error">
                {rangeErrors.filing}
              </Text>
            ) : null}

            <View style={styles.subDivider} />
            <Text style={styles.subSectionHeading}>Filing Year</Text>
            <View style={styles.yearGrid}>
              <TouchableOpacity
                style={[styles.yearBtn, !draftFilters.caseYear && styles.yearBtnActive]}
                onPress={() => setDraftFilters(p => ({ ...p, caseYear: '' }))}
                testID="filter-year-option-all"
              >
                <Text
                  style={[
                    styles.yearBtnText,
                    !draftFilters.caseYear && styles.yearBtnTextActive,
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              {yearOptions.map(yr => {
                const isSelected = draftFilters.caseYear === yr;
                return (
                  <TouchableOpacity
                    key={yr}
                    style={[styles.yearBtn, isSelected && styles.yearBtnActive]}
                    onPress={() => setDraftFilters(p => ({ ...p, caseYear: yr }))}
                    testID={`filter-year-option-${yr}`}
                  >
                    <Text
                      style={[styles.yearBtnText, isSelected && styles.yearBtnTextActive]}
                    >
                      {yr}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );

      case 'hearingDate':
        return (
          <View style={styles.submenuSection}>
            <Text style={styles.subSectionHeading}>Quick Hearing Filter</Text>
            {renderRadioList(
              HEARING_SCHEDULE_OPTIONS,
              draftFilters.hearing,
              val =>
                setDraftFilters(p => ({
                  ...p,
                  hearing: (val || 'ALL') as CaseFilters['hearing'],
                })),
              'filter-hearing'
            )}

            <View style={styles.subDivider} />
            <Text style={styles.subSectionHeading}>Custom Hearing Date Range</Text>
            <DrawerDateField
              label="From date"
              value={draftFilters.hearingDateFrom || ''}
              onChange={val => {
                setDraftFilters(p => ({ ...p, hearingDateFrom: val }));
                if (rangeErrors.hearing) {
                  setRangeErrors(p => ({ ...p, hearing: null }));
                }
              }}
              hasError={Boolean(rangeErrors.hearing)}
              testID="filter-hearing-date-from"
            />
            <DrawerDateField
              label="To date"
              value={draftFilters.hearingDateTo || ''}
              onChange={val => {
                setDraftFilters(p => ({ ...p, hearingDateTo: val }));
                if (rangeErrors.hearing) {
                  setRangeErrors(p => ({ ...p, hearing: null }));
                }
              }}
              hasError={Boolean(rangeErrors.hearing)}
              testID="filter-hearing-date-to"
            />
            {rangeErrors.hearing ? (
              <Text style={styles.errorText} testID="filter-hearing-date-error">
                {rangeErrors.hearing}
              </Text>
            ) : null}
          </View>
        );

      case 'closedDate':
        return (
          <View style={styles.submenuSection}>
            <Text style={styles.subSectionHeading}>Closed / Disposal Date Range</Text>
            <Text style={styles.helperText}>
              Filters disposed or closed cases by their recorded disposal/judgment date.
            </Text>
            <DrawerDateField
              label="From date"
              value={draftFilters.closedDateFrom || ''}
              onChange={val => {
                setDraftFilters(p => ({ ...p, closedDateFrom: val }));
                if (rangeErrors.closed) {
                  setRangeErrors(p => ({ ...p, closed: null }));
                }
              }}
              hasError={Boolean(rangeErrors.closed)}
              testID="filter-closed-date-from"
            />
            <DrawerDateField
              label="To date"
              value={draftFilters.closedDateTo || ''}
              onChange={val => {
                setDraftFilters(p => ({ ...p, closedDateTo: val }));
                if (rangeErrors.closed) {
                  setRangeErrors(p => ({ ...p, closed: null }));
                }
              }}
              hasError={Boolean(rangeErrors.closed)}
              testID="filter-closed-date-to"
            />
            {rangeErrors.closed ? (
              <Text style={styles.errorText} testID="filter-closed-date-error">
                {rangeErrors.closed}
              </Text>
            ) : null}
          </View>
        );

      case 'judgment':
        return renderRadioList(
          JUDGMENT_OPTIONS,
          draftFilters.judgment,
          val =>
            setDraftFilters(p => ({
              ...p,
              judgment: (val || 'ALL') as CaseFilters['judgment'],
            })),
          'filter-judgment'
        );
    }
  };

  if (!isMounted && !visible) return null;

  const activeCategoryDescriptor = activeCategory
    ? FILTER_CATEGORIES.find(c => c.id === activeCategory)
    : null;
  const activeCategoryMeta = activeCategory ? getCategoryMeta(activeCategory) : null;

  return (
    <Modal
      visible={isMounted || visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.drawerRoot}>
        {/* Animated Semi-Transparent Backdrop (Outside Click Closes) */}
        <Animated.View style={[styles.backdrop, { opacity: overlayAnim }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityLabel="Close filter drawer"
            testID="filter-drawer-backdrop"
          />
        </Animated.View>

        {/* Left-Side Slide-In Drawer Panel */}
        <Animated.View
          style={[
            styles.drawerPanel,
            {
              width: drawerWidth,
              transform: [{ translateX: slideAnim }],
            },
          ]}
          testID="filter-drawer-panel"
        >
          {/* Main Drawer Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconBadge}>
                <AppIcon name="filter" size={16} color={Colors.primary} />
              </View>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {t('cases.filtersTitle', 'Filter Cases')}
              </Text>
              {activeCount > 0 && (
                <Badge
                  label={`${activeCount}`}
                  variant="primary"
                  style={styles.countBadge}
                  testID="filter-active-count-badge"
                />
              )}
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Close filter drawer"
              testID="filter-close-btn"
            >
              <AppIcon name="x" size={18} color={Colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* Body: Single-Panel Navigation (Mobile) OR Two-Column Split (Desktop/Tablet) */}
          {isWideScreen ? (
            <View style={styles.desktopBody} testID="filter-drawer-desktop-split">
              {/* Left Column: Vertical Filter Categories */}
              <ScrollView
                style={styles.desktopCategoriesCol}
                contentContainerStyle={styles.categoryListContent}
                showsVerticalScrollIndicator
              >
                {FILTER_CATEGORIES.map(cat => {
                  const meta = getCategoryMeta(cat.id);
                  const isFocused = activeCategory === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.desktopCategoryRow,
                        isFocused && styles.desktopCategoryRowFocused,
                      ]}
                      onPress={() => handleSelectCategory(cat.id)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isFocused }}
                      testID={`filter-category-${cat.id}`}
                    >
                      <View style={styles.categoryRowTop}>
                        <AppIcon
                          name={cat.icon}
                          size={15}
                          color={
                            isFocused || meta.isActive
                              ? Colors.primary
                              : Colors.text.secondary
                          }
                        />
                        <Text
                          style={[
                            styles.categoryTitle,
                            isFocused && styles.categoryTitleFocused,
                          ]}
                          numberOfLines={1}
                        >
                          {cat.label}
                        </Text>
                        {meta.isActive && <View style={styles.activeDot} />}
                      </View>
                      <Text
                        style={[
                          styles.categorySummary,
                          meta.isActive && styles.categorySummaryActive,
                        ]}
                        numberOfLines={1}
                      >
                        {meta.summary}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Right Column: Active Category Submenu */}
              <View style={styles.desktopSubmenuCol}>
                {activeCategory && activeCategoryDescriptor && (
                  <>
                    <View style={styles.desktopSubmenuHeader}>
                      <Text style={styles.submenuTitle}>
                        {activeCategoryDescriptor.label}
                      </Text>
                      {activeCategoryMeta?.isActive && (
                        <TouchableOpacity
                          onPress={() => resetCategory(activeCategory)}
                          style={styles.categoryResetBtn}
                          testID={`filter-reset-${activeCategory}`}
                        >
                          <Text style={styles.categoryResetText}>Reset</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <ScrollView
                      style={styles.scrollBody}
                      contentContainerStyle={styles.submenuScrollContent}
                      showsVerticalScrollIndicator
                      keyboardShouldPersistTaps="handled"
                    >
                      {renderSubmenuContent(activeCategory)}
                    </ScrollView>
                  </>
                )}
              </View>
            </View>
          ) : activeCategory === null ? (
            /* Mobile Panel 1: Vertical Category List */
            <ScrollView
              style={styles.scrollBody}
              contentContainerStyle={styles.mobileCategoryListContent}
              showsVerticalScrollIndicator
              testID="filter-drawer-category-list"
            >
              <Text style={styles.mobileHelperHeading}>Select a filter category</Text>
              {FILTER_CATEGORIES.map(cat => {
                const meta = getCategoryMeta(cat.id);
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.mobileCategoryRow,
                      meta.isActive && styles.mobileCategoryRowActive,
                    ]}
                    onPress={() => handleSelectCategory(cat.id)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`${cat.label}: ${meta.summary}`}
                    testID={`filter-category-${cat.id}`}
                  >
                    <View
                      style={[
                        styles.categoryIconCircle,
                        meta.isActive && styles.categoryIconCircleActive,
                      ]}
                    >
                      <AppIcon
                        name={cat.icon}
                        size={16}
                        color={meta.isActive ? Colors.primary : Colors.text.secondary}
                      />
                    </View>
                    <View style={styles.mobileCategoryTextCol}>
                      <Text style={styles.categoryTitle}>{cat.label}</Text>
                      <Text
                        style={[
                          styles.categorySummary,
                          meta.isActive && styles.categorySummaryActive,
                        ]}
                        numberOfLines={1}
                      >
                        {meta.summary}
                      </Text>
                    </View>
                    <View style={styles.categoryRowRight}>
                      {meta.isActive && <View style={styles.activeDot} />}
                      <AppIcon
                        name="chevron-right"
                        size={18}
                        color={meta.isActive ? Colors.primary : Colors.text.muted}
                      />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            /* Mobile Panel 2: Active Category Submenu with Back Action */
            <View
              style={styles.mobileSubmenuContainer}
              testID={`filter-submenu-${activeCategory}`}
            >
              <View style={styles.mobileSubmenuBar}>
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => {
                    setCategorySearch('');
                    setActiveCategory(null);
                  }}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel="Back to filter categories"
                  testID="filter-submenu-back-btn"
                >
                  <AppIcon name="arrow-left" size={16} color={Colors.primary} />
                  <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>

                <Text style={styles.mobileSubmenuTitle} numberOfLines={1}>
                  {activeCategoryDescriptor?.label}
                </Text>

                {activeCategoryMeta?.isActive ? (
                  <TouchableOpacity
                    onPress={() => resetCategory(activeCategory)}
                    style={styles.categoryResetBtn}
                    testID={`filter-reset-${activeCategory}`}
                  >
                    <Text style={styles.categoryResetText}>Reset</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.resetPlaceholder} />
                )}
              </View>

              <ScrollView
                style={styles.scrollBody}
                contentContainerStyle={styles.submenuScrollContent}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
              >
                {renderSubmenuContent(activeCategory)}
              </ScrollView>
            </View>
          )}

          {/* Sticky Footer: Clear All & Apply Filters */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.clearAllBtn}
              onPress={handleResetAll}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
              testID="filter-clear-all-btn"
            >
              <AppIcon name="refresh" size={14} color={Colors.text.secondary} />
              <Text style={styles.clearAllBtnText}>
                {t('common.clearAll', 'Clear All')}
              </Text>
            </TouchableOpacity>

            <Button
              title={
                activeCount > 0
                  ? `${t('common.applyFilters', 'Apply Filters')} (${activeCount})`
                  : t('common.applyFilters', 'Apply Filters')
              }
              variant="primary"
              onPress={handleApply}
              style={styles.applyBtn}
              testID="filter-apply-btn"
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  drawerRoot: {
    flex: 1,
    flexDirection: 'row',
    position: 'relative',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
  },
  drawerPanel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Colors.surface,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    flexDirection: 'column',
    ...Shadows.card,
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  headerIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceBlue,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    flexShrink: 1,
  },
  countBadge: {
    marginLeft: 2,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.surfaceSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollBody: {
    flex: 1,
  },
  mobileCategoryListContent: {
    padding: Spacing.md,
    gap: 8,
    paddingBottom: Spacing.xl,
  },
  mobileHelperHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  mobileCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  mobileCategoryRowActive: {
    backgroundColor: Colors.surfaceBlue,
    borderColor: Colors.primary,
  },
  categoryIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.surfaceSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryIconCircleActive: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  mobileCategoryTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  categoryRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
    flexShrink: 1,
  },
  categoryTitleFocused: {
    color: Colors.primary,
    fontWeight: '700',
  },
  categorySummary: {
    fontSize: 12,
    color: Colors.text.muted,
  },
  categorySummaryActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  mobileSubmenuContainer: {
    flex: 1,
  },
  mobileSubmenuBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.surfaceBlue,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  mobileSubmenuTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
    textAlign: 'center',
  },
  categoryResetBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  categoryResetText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.danger,
  },
  resetPlaceholder: {
    width: 44,
  },
  desktopBody: {
    flex: 1,
    flexDirection: 'row',
  },
  desktopCategoriesCol: {
    width: 224,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: Colors.background,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  categoryListContent: {
    padding: 8,
    gap: 4,
  },
  desktopCategoryRow: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 10,
    gap: 3,
  },
  desktopCategoryRowFocused: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary,
    ...Shadows.subtle,
  },
  desktopSubmenuCol: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  desktopSubmenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  submenuTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  submenuScrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  submenuSection: {
    gap: 10,
  },
  subSectionHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  helperText: {
    fontSize: 12,
    color: Colors.text.muted,
    lineHeight: 17,
  },
  subDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 6,
  },
  submenuSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: Radius.input,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.background,
  },
  submenuSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: Colors.text.primary,
    height: '100%',
  },
  optionList: {
    gap: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.input,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  optionRowSelected: {
    backgroundColor: Colors.surfaceBlue,
    borderColor: Colors.primary,
  },
  optionTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text.primary,
  },
  optionLabelSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
  optionSublabel: {
    fontSize: 11.5,
    color: Colors.text.muted,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  radioCircleSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  customOptionText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  emptySearchText: {
    fontSize: 13,
    color: Colors.text.muted,
    textAlign: 'center',
    paddingVertical: 16,
  },
  dateFieldBlock: {
    gap: 5,
  },
  dateLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  dateInputBox: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.input,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
  },
  dateInputBoxFilled: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surfaceBlue,
  },
  dateInputBoxError: {
    borderColor: Colors.danger,
    backgroundColor: Colors.dangerSurface,
  },
  nativeDateText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text.primary,
  },
  placeholderText: {
    color: Colors.text.muted,
    fontWeight: '400',
  },
  inlineClearBtn: {
    padding: 4,
  },
  nativeDatePopover: {
    marginTop: 6,
    padding: 10,
    borderRadius: Radius.input,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.background,
    gap: 8,
  },
  nativeDateInput: {
    height: 40,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    color: Colors.text.primary,
    backgroundColor: Colors.surface,
  },
  nativePresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  nativePresetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  nativePresetText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.danger,
  },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  yearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
    minWidth: 64,
    alignItems: 'center',
  },
  yearBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  yearBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  yearBtnTextActive: {
    color: Colors.text.white,
    fontWeight: '700',
  },
  plainInputWrap: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: Radius.input,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surface,
    gap: 8,
  },
  plainInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    color: Colors.text.primary,
    height: '100%',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  clearAllBtn: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: Colors.surfaceSubtle,
  },
  clearAllBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  applyBtn: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 10,
  },
});
