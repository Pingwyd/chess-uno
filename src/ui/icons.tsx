/**
 * The app's icon set: Lucide only (no emoji or Unicode symbol glyphs in the UI).
 * Icons are imported one by one (tree-shaken), and data that needs an icon (badges, lessons,
 * avatars, notices) stores a name from `IconName` so shared/server code stays React-free.
 */
import type { CSSProperties } from 'react';
import {
  ArrowDown, ArrowLeftRight, ArrowRight, ArrowUpDown, ArrowUpRight, Award, Ban, Bell, BellOff, Bird, Bot, BookOpen, Calendar, CalendarCheck,
  Castle, Cat, Check, ChessBishop, ChessKing, ChessKnight, ChessPawn, ChessQueen, ChessRook, ChevronDown, ChevronLeft,
  ChevronRight, ChevronUp, CloudCheck, CodeXml, Crown, Ellipsis, ExternalLink, Eye, FastForward, Flag, FlaskConical, Flame, Footprints, Frown,
  Gem, Gift, Globe, GraduationCap, Hand, Handshake, Hourglass, House, KeyRound, Laugh, Layers, Lightbulb, Link, Lock, Medal,
  Menu, MessageCircle, Monitor, Moon, PartyPopper, Pause, Pencil, Play, Radio, Recycle, Rewind, Rocket, RotateCcw, RotateCw, Scale, Scissors,
  ScanSearch, ScrollText, Search, Settings, Shield, SkipBack, SkipForward, Smartphone, Snowflake, Spade, Sparkles, Star, StepBack,
  StepForward, Sun, Swords, Target, ThumbsUp, Timer, Trash2, TrendingDown, TrendingUp, Trophy, Undo2, User, Users, Waves, WifiOff,
  X, Zap, type LucideIcon,
} from 'lucide-react';

export const ICONS = {
  'arrow-down': ArrowDown, 'arrow-right': ArrowRight, 'arrow-up-right': ArrowUpRight, 'arrow-up-down': ArrowUpDown,
  reverse: ArrowLeftRight, skip: Ban, award: Award, bell: Bell, 'bell-off': BellOff, bird: Bird, bot: Bot, book: BookOpen, calendar: Calendar, 'calendar-check': CalendarCheck,
  castle: Castle, cat: Cat, check: Check, bishop: ChessBishop, king: ChessKing, knight: ChessKnight, pawn: ChessPawn, queen: ChessQueen,
  rook: ChessRook, 'chevron-down': ChevronDown, 'chevron-left': ChevronLeft, 'chevron-right': ChevronRight, 'chevron-up': ChevronUp,
  'cloud-check': CloudCheck, code: CodeXml, crown: Crown, more: Ellipsis, external: ExternalLink, eye: Eye, 'fast-forward': FastForward,
  flag: Flag, flask: FlaskConical, flame: Flame, footprints: Footprints, frown: Frown, gem: Gem, gift: Gift, globe: Globe, 'graduation-cap': GraduationCap,
  hand: Hand, handshake: Handshake, hourglass: Hourglass, house: House, key: KeyRound, laugh: Laugh, layers: Layers, lightbulb: Lightbulb,
  link: Link, lock: Lock, medal: Medal, menu: Menu, monitor: Monitor, sun: Sun, chat: MessageCircle, moon: Moon, party: PartyPopper, pause: Pause, pencil: Pencil,
  play: Play, radio: Radio, recycle: Recycle, rewind: Rewind, rocket: Rocket, 'rotate-ccw': RotateCcw, 'rotate-cw': RotateCw, scale: Scale,
  review: ScanSearch, scissors: Scissors, scroll: ScrollText, search: Search, settings: Settings, shield: Shield, 'skip-back': SkipBack,
  'skip-forward': SkipForward, smartphone: Smartphone, snowflake: Snowflake, spade: Spade, sparkles: Sparkles, star: Star,
  'step-back': StepBack, 'step-forward': StepForward, swords: Swords, target: Target, 'thumbs-up': ThumbsUp, timer: Timer,
  trash: Trash2, 'trend-down': TrendingDown, 'trend-up': TrendingUp, trophy: Trophy, undo: Undo2, user: User, users: Users,
  waves: Waves, offline: WifiOff, x: X, zap: Zap,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;
export const isIconName = (v: unknown): v is IconName => typeof v === 'string' && Object.prototype.hasOwnProperty.call(ICONS, v);

/**
 * One Lucide icon at a consistent stroke. Decorative by default (aria-hidden); pass `label`
 * when the icon carries meaning on its own (no visible text next to it).
 */
export function Icon({ name, size = 18, label, className = '', strokeWidth = 2.25, style }: {
  name: IconName; size?: number | string; label?: string; className?: string; strokeWidth?: number; style?: CSSProperties;
}) {
  const C = ICONS[name] ?? Sparkles;
  return (
    <C
      size={size}
      strokeWidth={strokeWidth}
      className={`icon icon-${name} ${className}`}
      style={style}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable="false"
    />
  );
}

/** Data icons (badges, lessons, avatars) are plain strings; fall back to a neutral icon if unknown. */
export const asIcon = (v: string | null | undefined): IconName => (isIconName(v) ? v : 'sparkles');
