import React from 'react';
import {
  Activity,
  AlarmClock,
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowRight,
  Award,
  Bell,
  BellOff,
  BellRing,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Copy,
  Database,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Files,
  Filter,
  FolderOpen,
  Gavel,
  Globe,
  Hash,
  Home,
  Info,
  KeyRound,
  Landmark,
  Languages,
  LayoutGrid,
  Lock,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Mic,
  MicOff,
  MoreHorizontal,
  MoreVertical,
  Pause,
  Pencil,
  Phone,
  Play,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Scale,
  Search,
  Server,
  Settings,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Star,
  Tag,
  Ticket,
  Trash2,
  Unlock,
  Upload,
  User,
  UserCheck,
  UserCog,
  UserPlus,
  UserX,
  Users,
  Volume2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react-native';
import { Colors } from '../../constants/colors';

type IconComponentProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  testID?: string;
  accessibilityLabel?: string;
  'aria-hidden'?: boolean;
  'aria-label'?: string;
};

const ICON_MAP = {
  home: Home,
  briefcase: Briefcase,
  calendar: Calendar,
  'layout-grid': LayoutGrid,
  'more-horizontal': MoreHorizontal,
  menu: Menu,
  'chevron-right': ChevronRight,
  'chevron-left': ChevronLeft,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  x: X,
  plus: Plus,
  check: Check,
  'check-circle': CheckCircle2,
  circle: Circle,
  'alert-circle': AlertCircle,
  'alert-triangle': AlertTriangle,
  info: Info,
  search: Search,
  filter: Filter,
  sliders: SlidersHorizontal,
  refresh: RefreshCw,
  'external-link': ExternalLink,
  download: Download,
  upload: Upload,
  share: Share2,
  copy: Copy,
  'more-vertical': MoreVertical,
  scale: Scale,
  gavel: Gavel,
  landmark: Landmark,
  'file-text': FileText,
  files: Files,
  'folder-open': FolderOpen,
  'book-open': BookOpen,
  'clipboard-list': ClipboardList,
  'clipboard-check': ClipboardCheck,
  shield: Shield,
  'shield-check': ShieldCheck,
  'shield-alert': ShieldAlert,
  lock: Lock,
  unlock: Unlock,
  key: KeyRound,
  eye: Eye,
  'eye-off': EyeOff,
  award: Award,
  tag: Tag,
  hash: Hash,
  archive: Archive,
  clock: Clock,
  'calendar-days': CalendarDays,
  'calendar-clock': CalendarClock,
  'calendar-check': CalendarCheck2,
  bell: Bell,
  'bell-ring': BellRing,
  'bell-off': BellOff,
  'alarm-clock': AlarmClock,
  ticket: Ticket,
  radio: Radio,
  wifi: Wifi,
  'wifi-off': WifiOff,
  activity: Activity,
  server: Server,
  database: Database,
  volume: Volume2,
  mic: Mic,
  'mic-off': MicOff,
  play: Play,
  pause: Pause,
  square: Square,
  'rotate-ccw': RotateCcw,
  edit: Edit3,
  pencil: Pencil,
  trash: Trash2,
  star: Star,
  languages: Languages,
  globe: Globe,
  mail: Mail,
  phone: Phone,
  'map-pin': MapPin,
  user: User,
  users: Users,
  'user-check': UserCheck,
  'user-x': UserX,
  'user-plus': UserPlus,
  'user-cog': UserCog,
  building: Building2,
  'log-in': LogIn,
  'log-out': LogOut,
  settings: Settings,
} as const;

export type AppIconName = keyof typeof ICON_MAP;

export interface AppIconProps {
  name: AppIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  testID?: string;
  accessibilityLabel?: string;
}

export const AppIcon: React.FC<AppIconProps> = ({
  name,
  size = 20,
  color = Colors.text.primary,
  strokeWidth = 1.9,
  testID,
  accessibilityLabel,
}) => {
  const IconComponent = ICON_MAP[name] as React.ComponentType<IconComponentProps>;
  const a11yProps: Partial<IconComponentProps> = {};
  if (testID || accessibilityLabel) {
    a11yProps['aria-hidden'] = false;
  }
  if (accessibilityLabel) {
    a11yProps.accessibilityLabel = accessibilityLabel;
    a11yProps['aria-label'] = accessibilityLabel;
  }
  return (
    <IconComponent
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      testID={testID}
      {...a11yProps}
    />
  );
};
