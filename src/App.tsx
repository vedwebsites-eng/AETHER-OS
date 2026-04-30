import { GoogleGenAI, Type as GenAIType } from "@google/genai";
import { useState, useEffect } from 'react';
import { auth, signInWithGoogle, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, User, signOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, onSnapshot, orderBy, serverTimestamp, addDoc, deleteDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { 
  Plus, CheckCircle2, Circle, Trophy, Book, Calendar, 
  BarChart3, LogOut, LogIn, HardDrive, Zap, 
  Target, Flame, ChevronRight, X, Trash2, Edit3, 
  Smile, Frown, Meh, Star, BarChart, Activity, PieChart, Settings,
  Sparkles, Award, Volume2, Bell, TrendingUp, Clock, CalendarDays, Maximize2, Minimize2, Move, LayoutGrid, List,
  Bold, Italic, Underline as UnderlineIcon, ListOrdered, Heading1, Heading2, Link as LinkIcon, Eraser, Type, Palette,
  ShoppingBag, Shield, ShieldCheck, User as UserIcon, Download,
  Music, Youtube, Instagram, Quote, HelpCircle
} from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, addDays, isPast, isFuture, parseISO, startOfDay, addHours, differenceInMinutes, isWithinInterval, subDays, startOfYesterday } from 'date-fns';
import { ResponsiveContainer, BarChart as ReBarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, CartesianGrid, Cell, PieChart as RePieChart, Pie } from 'recharts';
import { cn } from './lib/utils';

// --- Types ---
type AppTab = 'dashboard' | 'tasks' | 'journal' | 'stats' | 'timetable' | 'shop' | 'settings';

interface ActivityEntry {
  id: string;
  type: 'task' | 'journal' | 'achievement' | 'level' | 'timetable';
  label: string;
  xp: number;
  timestamp: string;
  icon?: string;
}

interface TimeBlock {
  id: string;
  userId: string;
  title: string;
  type: 'task' | 'event' | 'break' | 'routine';
  startTime: string; // ISO
  endTime: string; // ISO
  color?: string;
  notes?: string;
  taskId?: string; // Link to a task
  completed?: boolean;
  adherenceXP?: number;
}

interface ScheduleTemplate {
  id: string;
  label: string;
  icon: string;
  blocks: {
    title: string;
    type: 'task' | 'event' | 'break' | 'routine';
    startHour: number;
    startMinute: number;
    duration: number; // in minutes
  }[];
}

interface MotivationItem {
  id: string;
  userId: string;
  type: 'music' | 'quote' | 'link' | 'text';
  content: string; 
  title?: string;
  createdAt: string;
}

const TEMPLATES: ScheduleTemplate[] = [
  {
    id: 'nine_to_five',
    label: '9-5 OFFICE',
    icon: '💼',
    blocks: [
      { title: 'Morning Prep', type: 'routine', startHour: 8, startMinute: 0, duration: 60 },
      { title: 'Deep Work Block', type: 'task', startHour: 9, startMinute: 0, duration: 180 },
      { title: 'System Refresh (Lunch)', type: 'break', startHour: 12, startMinute: 0, duration: 60 },
      { title: 'Sync Meetings', type: 'event', startHour: 13, startMinute: 0, duration: 60 },
      { title: 'Project Execution', type: 'task', startHour: 14, startMinute: 0, duration: 180 },
      { title: 'Daily Debrief', type: 'routine', startHour: 17, startMinute: 0, duration: 30 },
    ]
  },
  {
    id: 'student',
    label: 'STUDENT_FLOW',
    icon: '🎓',
    blocks: [
      { title: 'Deep Study I', type: 'task', startHour: 9, startMinute: 0, duration: 120 },
      { title: 'Course Lecture', type: 'event', startHour: 11, startMinute: 0, duration: 90 },
      { title: 'Lunch & Relax', type: 'break', startHour: 12, startMinute: 30, duration: 60 },
      { title: 'Study Session II', type: 'task', startHour: 13, startMinute: 30, duration: 150 },
      { title: 'Gym/Active Sync', type: 'routine', startHour: 16, startMinute: 0, duration: 60 },
      { title: 'Assignment Prep', type: 'task', startHour: 19, startMinute: 0, duration: 120 },
    ]
  },
  {
    id: 'freelancer',
    label: 'FREELANCER_NODE',
    icon: '⚡',
    blocks: [
      { title: 'Client Comms', type: 'event', startHour: 10, startMinute: 0, duration: 60 },
      { title: 'Primary Project', type: 'task', startHour: 11, startMinute: 0, duration: 240 },
      { title: 'Quick Fuel', type: 'break', startHour: 15, startMinute: 0, duration: 30 },
      { title: 'Admin & Billing', type: 'routine', startHour: 15, startMinute: 30, duration: 60 },
      { title: 'Professional Dev', type: 'task', startHour: 16, startMinute: 30, duration: 120 },
    ]
  }
];

interface AppSettings {
  difficultyMultiplier: number;
  goalTargets: {
    weeklyTasks: number;
    weeklyJournals: number;
    dailyLogin: number;
  };
  ui: {
    showXpPopups: boolean;
    showAchievements: boolean;
    soundVolume: number;
    animations: 'full' | 'reduced' | 'none';
  };
  display: {
    theme: string;
    language: string;
    timeFormat: '12h' | '24h';
  };
  notifications: {
    taskReminders: boolean;
    achievementNotifs: boolean;
    streakReminders: boolean;
  };
  aiRoutine?: string[];
}

interface UserStats {
  userId: string;
  level: number;
  experience: number;
  coins: number;
  unlockedFeatures: string[];
  totalTasksCompleted: number;
  currentStreak: number;
  lastActiveDate: string;
  difficultyLevel: 'easy' | 'normal' | 'hard';
  unlockedAchievements: string[];
  unlockedItems: string[];
  activityLog?: ActivityEntry[];
  totalWordsWritten?: number;
  streakHistory?: string[];
  journalStreak?: number;
  lastJournalDate?: string;
  reflectionPromptsAnswered?: number;
  adherenceHistory?: Record<string, number>;
  scheduleMasteryLevel?: number;
  scheduledTasksCount?: number;
  punctualStreak?: number;
  dailyChallenge?: {
    id: string;
    progress: number;
    goal: number;
    completed: boolean;
    lastGenerated: string;
  };
}

interface DailyChallengeTemplate {
  id: string;
  label: string;
  goal: number;
  xpReward: number;
  type: 'tasks' | 'words' | 'timetable' | 'streak' | 'perfect_day';
}

const DAILY_CHALLENGES: DailyChallengeTemplate[] = [
  { id: 'tasks_5', label: 'COMPLETE_5_TASKS', goal: 5, xpReward: 150, type: 'tasks' },
  { id: 'words_500', label: 'JOURNAL_500_WORDS', goal: 500, xpReward: 100, type: 'words' },
  { id: 'timetable_4', label: 'FOLLOW_TIMETABLE_4X', goal: 4, xpReward: 75, type: 'timetable' },
  { id: 'streak_keep', label: 'MAINTAIN_STREAK', goal: 1, xpReward: 50, type: 'streak' },
  { id: 'perfect_day', label: 'PERFECT_DAY_100', goal: 1, xpReward: 200, type: 'perfect_day' },
];

interface Achievement {
  id: string;
  title: string;
  description: string;
  xpReward: number;
  icon: React.ReactNode;
  category: 'milestone' | 'streak' | 'skill' | 'hidden';
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  requiredValue?: number;
}

const ACHIEVEMENTS: Achievement[] = [
  // 1. Milestone Achievements
  { id: 'first_protocol', title: 'INITIAL_BOOT', description: 'Complete your first task.', xpReward: 50, icon: <Target size={20} />, category: 'milestone', rarity: 'common', requiredValue: 1 },
  { id: 'task_10', title: 'TASK_MASTER_I', description: 'Complete 10 tasks.', xpReward: 100, icon: <Target size={20} />, category: 'milestone', rarity: 'common', requiredValue: 10 },
  { id: 'task_100', title: 'TASK_MASTER_II', description: 'Complete 100 tasks.', xpReward: 500, icon: <Target size={20} />, category: 'milestone', rarity: 'rare', requiredValue: 100 },
  { id: 'task_500', title: 'TASK_MASTER_III', description: 'Complete 500 tasks.', xpReward: 1000, icon: <Target size={20} />, category: 'milestone', rarity: 'legendary', requiredValue: 500 },
  
  // Journaling Milestones
  { id: 'journal_initiator', title: 'JOURNAL_INITIATOR', description: 'Write your first neural log.', xpReward: 50, icon: <Book size={20} />, category: 'milestone', rarity: 'common', requiredValue: 1 },
  { id: 'journal_words_1000', title: 'JOURNAL_WORDS_1K', description: 'Write 1,000 words total.', xpReward: 100, icon: <Book size={20} />, category: 'milestone', rarity: 'uncommon', requiredValue: 1000 },
  { id: 'journal_words_10000', title: 'PROLIFIC_AUTHOR_I', description: 'Write 10,000 words total.', xpReward: 500, icon: <Book size={20} />, category: 'milestone', rarity: 'rare', requiredValue: 10000 },
  { id: 'journal_words_100000', title: 'PROLIFIC_AUTHOR_II', description: 'Write 100,000 words total.', xpReward: 3000, icon: <Book size={20} />, category: 'milestone', rarity: 'legendary', requiredValue: 100000 },
  { id: 'reflection_seeker', title: 'REFLECTION_SEEKER', description: 'Answer 50 reflection prompts.', xpReward: 500, icon: <Sparkles size={20} />, category: 'milestone', rarity: 'rare', requiredValue: 50 },
  { id: 'mood_master', title: 'MOOD_MASTER', description: 'Log mood for 30 consecutive days.', xpReward: 1000, icon: <Activity size={20} />, category: 'streak', rarity: 'legendary', requiredValue: 30 },
  { id: 'midnight_thoughts', title: 'MIDNIGHT_THOUGHTS', description: 'Journal at 3+ AM.', xpReward: 200, icon: <Clock size={20} />, category: 'hidden', rarity: 'rare', requiredValue: 1 },
  { id: 'word_wizard', title: 'WORD_WIZARD', description: 'Write 1,000 words in a single entry.', xpReward: 500, icon: <Zap size={20} />, category: 'skill', rarity: 'rare', requiredValue: 1 },
  
  { id: 'level_10', title: 'NODE_ASCENSION_I', description: 'Reach Level 10.', xpReward: 200, icon: <Star size={20} />, category: 'milestone', rarity: 'uncommon', requiredValue: 10 },
  { id: 'level_50', title: 'NODE_ASCENSION_II', description: 'Reach Level 50.', xpReward: 1000, icon: <Star size={20} />, category: 'milestone', rarity: 'rare', requiredValue: 50 },
  { id: 'level_100', title: 'NODE_ASCENSION_III', description: 'Reach Level 100.', xpReward: 5000, icon: <Star size={20} />, category: 'milestone', rarity: 'legendary', requiredValue: 100 },

  // 2. Streak Achievements
  { id: 'streak_3', title: 'CONSISTENCY_V1', description: 'Maintain a 3-day activity streak.', xpReward: 100, icon: <Flame size={20} />, category: 'streak', rarity: 'common', requiredValue: 3 },
  { id: 'streak_7', title: 'UPTIME_7D', description: 'Maintain a 7-day activity streak.', xpReward: 250, icon: <Flame size={20} />, category: 'streak', rarity: 'uncommon', requiredValue: 7 },
  { id: 'streak_14', title: 'UPTIME_14D', description: 'Maintain a 14-day activity streak.', xpReward: 500, icon: <Flame size={24} />, category: 'streak', rarity: 'uncommon', requiredValue: 14 },
  { id: 'streak_30', title: 'UPTIME_30D', description: 'Maintain a 30-day activity streak.', xpReward: 1000, icon: <Flame size={20} />, category: 'streak', rarity: 'rare', requiredValue: 30 },
  { id: 'streak_60', title: 'UPTIME_60D', description: 'Maintain a 60-day activity streak.', xpReward: 2000, icon: <Flame size={24} />, category: 'streak', rarity: 'rare', requiredValue: 60 },
  { id: 'streak_90', title: 'UPTIME_90D', description: 'Maintain a 90-day activity streak.', xpReward: 3000, icon: <Flame size={28} />, category: 'streak', rarity: 'legendary', requiredValue: 90 },
  { id: 'streak_365', title: 'UPTIME_YEAR', description: 'Maintain a 365-day activity streak.', xpReward: 10000, icon: <Flame size={32} />, category: 'streak', rarity: 'legendary', requiredValue: 365 },

  // 3. Skill Achievements
  { id: 'early_bird', title: 'DAWN_OPERATOR', description: 'Complete tasks before 8 AM.', xpReward: 150, icon: <Zap size={20} />, category: 'skill', rarity: 'uncommon', requiredValue: 1 },
  { id: 'night_owl', title: 'NIGHT_OPERATOR', description: 'Complete tasks after 10 PM.', xpReward: 150, icon: <Zap size={20} />, category: 'skill', rarity: 'uncommon', requiredValue: 1 },
  { id: 'speed_demon', title: 'SPEED_DEMON', description: 'Complete a task in 50% of estimated time.', xpReward: 200, icon: <Zap size={20} />, category: 'skill', rarity: 'rare', requiredValue: 1 },
  { id: 'time_master', title: 'TIME_MASTER', description: 'Complete 100 scheduled tasks on time.', xpReward: 500, icon: <Calendar size={20} />, category: 'skill', rarity: 'rare', requiredValue: 100 },

  // 4. Hidden/Surprise
  { id: 'first_fail', title: 'RECOVERY_INITIATED', description: 'Miss a task but complete it the next day.', xpReward: 100, icon: <Zap size={20} />, category: 'hidden', rarity: 'uncommon', requiredValue: 1 },
  { id: 'mood_swing', title: 'EMOTIONAL_DENSITY', description: 'Log mood 5 times in one day.', xpReward: 200, icon: <Smile size={20} />, category: 'hidden', rarity: 'rare', requiredValue: 5 },
];

const REFLECTION_PROMPTS = [
  "What are 3 wins you achieved today?",
  "How did you push past your comfort zone today?",
  "What is one thing you're grateful for right now?",
  "What was the most challenging technical problem you faced today?",
  "How did your environment affect your productivity today?",
  "What is one thing you learned that changed your perspective?",
  "If you could optimize one habit, what would it be?",
  "What are you most grateful for in your current 'build'?",
  "Describe a moment where you felt in 'flow' today.",
  "Which priority shifted the most during your session?",
  "What does 'perfect synchronization' look like to you tomorrow?",
  "How are you managing your mental latency today?",
  "What protocol (habit) are you currently refactoring?",
  "What was the highlight of your day?",
  "What made you smile today?",
  "What's one thing you want to do better tomorrow?",
  "How did you help someone today?",
  "What was a moment of peace you felt?",
  "What's a project you're excited about?",
  "What was the best thing you ate today?",
  "What are you looking forward to this week?",
  "What's a song that matched your mood today?",
  "What's one thing you're proud of?",
  "If you had an extra hour, how would you spend it?",
  "What was a small victory today?",
  "What is a fear you faced or acknowledged?",
  "What's a book or article that inspired you recently?",
  "How did you take care of your body today?",
  "Whom did you have a meaningful conversation with?",
  "What's a goal you want to reach by next month?",
  "What's a hobby you want to spend more time on?",
  "What's a lesson you learned the hard way?",
  "What's a quote that resonates with you right now?",
  "Describe something beautiful you saw today.",
  "How did you stay focused today?",
  "What's a travel destination you're dreaming of?",
  "What's a skill you want to master?",
  "How are you feeling about your current progress?",
  "What's a significant memory from this time last year?",
  "What's something you're letting go of?",
  "How did you express creativity today?",
  "What's a decision you're glad you made?",
  "Describe your ideal morning routine.",
  "What's a challenge you're currently navigating?",
  "What's a thing you often take for granted?",
  "How do you handle stress currently?",
  "What's a piece of advice you'd give your younger self?",
  "What are you most excited to learn next?",
  "What's a person who inspires you and why?",
  "How do you define success at this moment?"
];

const MOTIVATIONAL_MESSAGES = [
  "PROTOCOL_OPTIMIZED. EXCELLENT WORK.",
  "NEURAL_EFFICIENCY_INCREASED.",
  "SYSTEM_COHERENCE_STABILIZED.",
  "DATA_INGESTION_SUCCESSFUL.",
  "COGNITIVE_THROUGHPUT_PEAKED.",
  "OUTSTANDING_PERFORMANCE_DETECTED.",
  "EVOLUTION_IN_PROGRESS.",
  "PHASE_COMPLETE. PROCEED TO NEXT NODE.",
  "STREAK_MAINTAINED. FIRE_EMOJI_DETACHED.",
];

interface XPNotification {
  id: number;
  amount: number;
  source: string;
}

interface Task {
  id: string;
  userId: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'completed';
  createdAt: string;
  category: 'health' | 'learning' | 'creative' | 'work' | 'personal' | 'routine';
  estimate: number; // in minutes
  difficulty: 'easy' | 'medium' | 'hard'; // backward compatibility or secondary factor
  customXP?: number;
  isChallenging?: boolean;
  isSpeedRun?: boolean;
  scheduledStart?: string; // ISO
  scheduledEnd?: string; // ISO
  completedAt?: string; // ISO
  adherenceStatus?: 'ontime' | 'late' | 'partial' | 'missed';
}

interface JournalEntry {
  id: string;
  userId: string;
  content: string; // HTML from TipTap
  mood: 'sad' | 'worried' | 'neutral' | 'happy' | 'ecstatic';
  tags?: string[];
  createdAt: string;
  wordCount: number;
  promptId?: string;
  isReflection?: boolean;
}

interface MotivationItem {
  id: string;
  userId: string;
  type: 'music' | 'quote' | 'link' | 'text';
  content: string; 
  title?: string;
  createdAt: string;
}

const MOODS = [
  { id: 'sad', emoji: '😢', label: 'SAD', color: 'text-blue-400' },
  { id: 'worried', emoji: '😟', label: 'WORRIED', color: 'text-purple-400' },
  { id: 'neutral', emoji: '😐', label: 'NEUTRAL', color: 'text-text-m' },
  { id: 'happy', emoji: '🙂', label: 'HAPPY', color: 'text-cyan' },
  { id: 'ecstatic', emoji: '😄', label: 'ECSTATIC', color: 'text-success' },
] as const;

const MOOD_TAGS = ['stressed', 'anxious', 'energetic', 'calm', 'productive', 'creative', 'grateful'];

// --- Constants ---
const XP_MAP = {
  PRIORITY: { low: 50, medium: 100, high: 150, critical: 200 },
  CATEGORY: { 
    health: 1.2, 
    learning: 1.1, 
    creative: 1.15, 
    work: 1.0, 
    personal: 0.9, 
    routine: 0.7 
  },
  ESTIMATE: (mins: number) => {
    if (mins < 15) return 0.5;
    if (mins <= 30) return 1.0;
    if (mins <= 60) return 1.5;
    if (mins <= 120) return 2.0;
    return 2.5;
  },
  CHALLENGING_BONUS: 1.5,
  SPEED_RUN_BONUS: 1.2,
  JOURNAL_BASE: 50,
  JOURNAL_WORD_RATE: 50,
  JOURNAL_MOOD_BONUS: 10,
  JOURNAL_CONSISTENCY_BONUS: 5,
  JOURNAL_PROMPT_BONUS: 25,
  JOURNAL_LONG_FORM_MULT: 1.5,
  STREAK_BONUS_PER_DAY: 10,
  TIMETABLE_CHECKIN: 5,
  SCHEDULE_TASK: 5,
  TIMETABLE_ON_TIME: 10,
  ADHERENCE_80: 75,
  ADHERENCE_100: 150,
  SPEED_BONUS_MULT: 1.25,
};

const calculateTaskXP = (task: Task, currentStreak: number = 0) => {
  if (task.customXP) return task.customXP;
  
  const base = XP_MAP.PRIORITY[task.priority || 'medium'];
  const timeMult = XP_MAP.ESTIMATE(task.estimate || 30);
  const catMult = XP_MAP.CATEGORY[task.category as keyof typeof XP_MAP.CATEGORY] || 1;
  const challengeMult = task.isChallenging ? XP_MAP.CHALLENGING_BONUS : 1;
  const speedMult = task.isSpeedRun ? XP_MAP.SPEED_RUN_BONUS : 1;
  const streakBonus = currentStreak * XP_MAP.STREAK_BONUS_PER_DAY;

  return Math.round((base * timeMult * catMult * challengeMult * speedMult) + streakBonus);
};

const MULTIPLIERS = {
  easy: 0.5,
  normal: 1,
  hard: 2
};

const NEURAL_GRADIENT = "bg-gradient-to-br from-background via-background-nested to-card";

const getXPForLevel = (level: number) => {
  if (level <= 10) return 500;
  if (level <= 25) return 750;
  if (level <= 50) return 1200;
  if (level <= 75) return 1800;
  return 2500;
};

const getLevelFromXP = (xp: number) => {
  let currentXP = xp;
  let level = 1;
  while (currentXP >= getXPForLevel(level)) {
    currentXP -= getXPForLevel(level);
    level++;
    if (level === 100) break;
  }
  const nextLevelXP = getXPForLevel(level);
  const levelProgress = (currentXP / nextLevelXP) * 100;
  return { 
    level, 
    progress: currentXP, 
    totalForLevel: nextLevelXP,
    currentXP, 
    nextLevelXP, 
    levelProgress
  };
};

const getTitleForLevel = (level: number) => {
  if (level <= 10) return 'NOVICE';
  if (level <= 25) return 'APPRENTICE';
  if (level <= 50) return 'JOURNEYMAN';
  if (level <= 75) return 'EXPERT';
  return 'LEGEND';
};

const UNLOCKS = [
  { level: 5, id: 'recurring_tasks', label: 'RECURRING_TASKS_DECRYPTED', description: 'Enable repeating tasks protocols.' },
  { level: 10, id: 'timetable', label: 'TEMPORAL_GRID_SYNC', description: 'Access advanced timetable scheduling.' },
  { level: 15, id: 'advanced_filters', label: 'DATA_FILTER_UPGRADE', description: 'Advanced sorting and filtering logic.' },
  { level: 20, id: 'cosmetics', label: 'VISUAL_INTERFACE_SHOP', description: 'Unlock the cosmetic interface shop.' },
  { level: 30, id: 'analytics', label: 'DEEP_ANALYTICS_DASHBOARD', description: 'Access granular productivity streams.' },
  { level: 50, id: 'insights', label: 'NEURAL_INSIGHT_ENGINE', description: 'In-depth AI-powered pattern recognition.' },
  { level: 75, id: 'premium', label: 'ELITE_PROTOCOL_ACCESS', description: 'Unlock experimental premium features.' },
  { level: 100, id: 'lifetime', label: 'LEGENDARY_CORE_UNLOCKED', description: 'Legacy status. Lifetime exclusive rewards.' },
];

const PREMIUM_BEZIER = [0.16, 1, 0.3, 1] as any;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [motivationItems, setMotivationItems] = useState<MotivationItem[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tasks' | 'journal' | 'stats' | 'timetable' | 'shop' | 'settings'>('dashboard');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [xpNotifications, setXpNotifications] = useState<XPNotification[]>([]);
  const [levelUpLevel, setLevelUpLevel] = useState<number | null>(null);
  const [celebratingAchievement, setCelebratingAchievement] = useState<Achievement | null>(null);
  const [completeToast, setCompleteToast] = useState<string | null>(null);
  const [isMotivationPortalOpen, setIsMotivationPortalOpen] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isNodeRecalibrating, setIsNodeRecalibrating] = useState(false);

  const handleTabChange = (tab: AppTab) => {
    setIsNodeRecalibrating(true);
    setTimeout(() => {
      setActiveTab(tab);
      setIsNodeRecalibrating(false);
    }, 450);
  };

  const addMotivationItem = async (item: Partial<MotivationItem>) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'motivation_items'), {
        ...item,
        userId: user.uid,
        createdAt: new Date().toISOString()
      });
      addXP(10, 'NEURAL_BOOST_CONFIG');
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'motivation_items');
    }
  };

  const deleteMotivationItem = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'motivation_items', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `motivation_items/${id}`);
    }
  };

  const playCompletionSound = () => {
    try {
      if (window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.1);

      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      console.warn("Audio Context not supported or blocked");
    }
  };

  const playLevelUpSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      const oscillator2 = audioCtx.createOscillator();

      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.2);

      oscillator2.type = 'sine';
      oscillator2.frequency.setValueAtTime(554.37, audioCtx.currentTime + 0.1); // C#5
      oscillator2.frequency.exponentialRampToValueAtTime(1108.73, audioCtx.currentTime + 0.4);

      gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

      oscillator.connect(gainNode);
      oscillator2.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator2.start();
      oscillator.stop(audioCtx.currentTime + 0.3);
      oscillator2.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      console.warn("Audio Context blocked");
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setSettings(null);
      return;
    }

    const docRef = doc(db, 'user_settings', user.uid);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data() as AppSettings);
      } else {
        // Init default settings
        const defaultSettings: AppSettings = {
          difficultyMultiplier: 1.0,
          goalTargets: { weeklyTasks: 20, weeklyJournals: 5, dailyLogin: 1 },
          ui: { showXpPopups: true, showAchievements: true, soundVolume: 0.5, animations: 'full' },
          display: { theme: 'cyberpunk', language: 'en', timeFormat: '24h' },
          notifications: { taskReminders: true, achievementNotifs: true, streakReminders: true },
          aiRoutine: ['School', 'Tuition', 'Dinner', 'Gym', 'Meditation']
        };
        setDoc(docRef, defaultSettings).catch(e => handleFirestoreError(e, OperationType.CREATE, docRef.path));
        setSettings(defaultSettings);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, docRef.path));

    return () => unsubscribe();
  }, [user]);

  // Fetch User Stats
  useEffect(() => {
    if (!user) {
      setStats(null);
      return;
    }

    const docRef = doc(db, 'user_stats', user.uid);
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setStats(docSnap.data() as UserStats);
      } else {
        const initialStats: UserStats = {
          userId: user.uid,
          level: 1,
          experience: 0,
          coins: 0,
          unlockedFeatures: [],
          totalTasksCompleted: 0,
          currentStreak: 0, // Changed from 1 to 0 for a fresh start
          lastActiveDate: new Date().toISOString(),
          difficultyLevel: 'normal',
          unlockedAchievements: [],
          unlockedItems: [],
          totalWordsWritten: 0,
          streakHistory: [],
          journalStreak: 0,
          lastJournalDate: '',
          reflectionPromptsAnswered: 0,
          adherenceHistory: {},
          scheduleMasteryLevel: 0,
          scheduledTasksCount: 0,
          punctualStreak: 0,
          activityLog: []
        };
        setDoc(docRef, initialStats).catch(e => handleFirestoreError(e, OperationType.CREATE, `user_stats/${user.uid}`));
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `user_stats/${user.uid}`));

    return () => unsub();
  }, [user]);

  // Fetch Tasks
  useEffect(() => {
    if (!user) {
      setTasks([]);
      return;
    }

    const q = query(
      collection(db, 'tasks'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const t = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
      setTasks(t);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'tasks'));

    return () => unsub();
  }, [user]);

  // Fetch TimeBlocks
  useEffect(() => {
    if (!user) {
      setTimeBlocks([]);
      return;
    }

    const q = query(
      collection(db, 'time_blocks'),
      where('userId', '==', user.uid),
      orderBy('startTime', 'asc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const b = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimeBlock));
      setTimeBlocks(b);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'time_blocks'));

    return () => unsub();
  }, [user]);

  // Fetch Journals
  useEffect(() => {
    if (!user) {
      setJournals([]);
      return;
    }

    const q = query(
      collection(db, 'journals'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const j = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as JournalEntry));
      setJournals(j);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'journals'));

    // Fetch Motivation Items
    const motivQ = query(
      collection(db, 'motivation_items'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const motivUnsub = onSnapshot(motivQ, (snapshot) => {
      setMotivationItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MotivationItem)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'motivation_items'));

    return () => {
      unsub();
      motivUnsub();
    };
  }, [user]);

  // Daily Sync (Streaks & Challenges)
  useEffect(() => {
    if (!user || !stats) return;

    const syncDaily = async () => {
      try {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const lastActive = stats.lastActiveDate.split('T')[0];
        
        if (lastActive === today) return; // Already synced today

        let newStreak = stats.currentStreak;
        let newExperience = stats.experience;
        let challengeUpdate = stats.dailyChallenge;
        
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        if (lastActive === yesterdayStr) {
          // Continuous streak
          newStreak += 1;
          // Streak bonuses
          const dailyBonus = XP_MAP.STREAK_BONUS_PER_DAY * newStreak;
          newExperience += dailyBonus;
          
          // Milestones
          if (newStreak === 7) newExperience += 200;
          if (newStreak === 30) newExperience += 500;
          if (newStreak === 100) newExperience += 1000;

          setXpNotifications(prev => [...prev, { 
            id: Date.now(), 
            amount: dailyBonus, 
            source: `STREAK_BONUS: DAY_${newStreak}` 
          }]);
        } else {
          // Streak broken
          newStreak = 1;
        }

        // Daily Challenge Rotation
        const randomChallenge = DAILY_CHALLENGES[Math.floor(Math.random() * DAILY_CHALLENGES.length)];
        challengeUpdate = {
          id: randomChallenge.id,
          progress: 0,
          goal: randomChallenge.goal,
          completed: false,
          lastGenerated: now.toISOString()
        };

        const statsRef = doc(db, 'user_stats', user.uid);
        await updateDoc(statsRef, {
          currentStreak: newStreak,
          lastActiveDate: now.toISOString(),
          experience: newExperience,
          dailyChallenge: challengeUpdate,
          streakHistory: [...(stats.streakHistory || []), today]
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `user_stats/${user.uid}/daily_sync`);
      }
    };

    syncDaily();
  }, [user, stats?.userId]);

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    if (!user || !settings) return;
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    const settingsRef = doc(db, 'user_settings', user.uid);
    try {
      await setDoc(settingsRef, updated);
      setCompleteToast('SETTINGS_SYNC_COMPLETE');
      setTimeout(() => setCompleteToast(null), 3000);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, settingsRef.path);
    }
  };

  const handlePurchase = async (cost: number, item: any) => {
    if (!user || !stats || stats.coins < cost) {
      setCompleteToast('INSUFFICIENT_CREDITS');
      setTimeout(() => setCompleteToast(null), 3000);
      return;
    }

    try {
      const newCoins = stats.coins - cost;
      const unlockedItems = stats.unlockedItems || [];
      unlockedItems.push(item.id);
      
      const updates = { 
        coins: newCoins,
        unlockedItems: unlockedItems
      };
      
      await updateDoc(doc(db, 'user_stats', user.uid), updates);
      setStats({ ...stats, ...updates });
      
      setCompleteToast(`ITEM_DECRYPTED: ${item.label}`);
      setTimeout(() => setCompleteToast(null), 3000);
      playLevelUpSound(); // Nice sound for purchase
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'user_stats');
    }
  };

  const addXP = async (amount: number, source: string, meta?: any) => {
    if (!user || !stats) return;

    try {
      const multiplier = settings?.difficultyMultiplier ?? MULTIPLIERS[stats.difficultyLevel || 'normal'] ?? 1.0;
      let finalAmount = Math.round(amount * multiplier);

      // Update daily challenge progress
      let challengeUpdate = stats.dailyChallenge ? { ...stats.dailyChallenge } : null;
      if (challengeUpdate && !challengeUpdate.completed) {
        let progressed = false;
        const isTask = source === 'NEURAL_LINK_ESTABLISHED' || source === 'TASK_COMPLETE_STREAK_SYNC' || source === 'TEMPORAL_ADHERENCE_BONUS';
        const isJournal = source === 'NEURAL_INGEST_COMPLETE';
        const isTimetable = source === 'TIMETABLE_CHECKIN' || source === 'TEMPORAL_ADHERENCE_SYNC';

        if (isTask && challengeUpdate.id.startsWith('tasks')) {
           challengeUpdate.progress += 1;
           progressed = true;
        } else if (isJournal && challengeUpdate.id.startsWith('words') && meta?.wordCount) {
           challengeUpdate.progress += meta.wordCount;
           progressed = true;
        } else if (isTimetable && challengeUpdate.id.startsWith('timetable')) {
           challengeUpdate.progress += 1;
           progressed = true;
        } else if (challengeUpdate.id === 'streak_keep') {
           challengeUpdate.progress = 1;
           progressed = true;
        } else if (challengeUpdate.id === 'perfect_day' && isTask) {
           const pendingTasks = tasks.filter(t => t.status === 'pending');
           if (pendingTasks.length <= 1) {
             challengeUpdate.progress = 1;
             progressed = true;
           }
        }

        if (progressed && challengeUpdate.progress >= challengeUpdate.goal) {
          challengeUpdate.completed = true;
          const reward = DAILY_CHALLENGES.find(c => c.id === challengeUpdate.id)?.xpReward || 0;
          finalAmount += reward;
          setXpNotifications(prev => [...prev, { 
            id: Date.now() + 1, 
            amount: reward, 
            source: `CHALLENGE_COMPLETE: ${challengeUpdate.id}` 
          }]);
        }
      }

      // Trigger Notification
      const id = Date.now();
      setXpNotifications(prev => [...prev, { id, amount: finalAmount, source }]);
      setTimeout(() => {
        setXpNotifications(prev => prev.filter(n => n.id !== id));
      }, 2000);

      const newExp = stats.experience + finalAmount;
      const { level: newLevel } = getLevelFromXP(newExp);
      const leveledUp = newLevel > stats.level;

      let bonusCoins = 0;
      let newUnlockedFeatures = [...(stats.unlockedFeatures || [])];

      if (leveledUp) {
        // Calculate Rewards
        for (let l = stats.level + 1; l <= newLevel; l++) {
          bonusCoins += 10; // CR reward per level
          if (l % 100 === 0) bonusCoins += 5000;
          else if (l % 25 === 0) bonusCoins += 2000;
          else if (l % 10 === 0) bonusCoins += 1000;
          else if (l % 5 === 0) bonusCoins += 500;

          const unlock = UNLOCKS.find(u => u.level === l);
          if (unlock) {
            newUnlockedFeatures.push(unlock.id);
          }
        }
      }

      // CR for every task protocol
      const isTask = source?.includes('TASK') || source?.includes('NEURAL_LINK_ESTABLISHED') || source?.includes('TEMPORAL');
      if (isTask) {
        bonusCoins += 1;
      }

      // Activity logging
      const newEntry: ActivityEntry = {
        id: id.toString(),
        type: source?.includes('TASK') || source?.includes('TEMPORAL') ? 'task' : 
              source?.includes('JOURNAL') || source?.includes('INGEST') ? 'journal' :
              source?.includes('ACHIEVEMENT') ? 'achievement' : 'task',
        label: (source || "").replace(/_/g, ' '),
        xp: finalAmount,
        timestamp: new Date().toISOString()
      };

      const updatedLog = [newEntry, ...(stats.activityLog || [])].slice(0, 20);

      const updateData: any = {
        experience: newExp,
        level: newLevel,
        coins: (stats.coins || 0) + bonusCoins,
        unlockedFeatures: newUnlockedFeatures,
        activityLog: updatedLog,
        lastActiveDate: new Date().toISOString()
      };
      if (challengeUpdate) updateData.dailyChallenge = challengeUpdate;

      await updateDoc(doc(db, 'user_stats', user.uid), updateData);

      if (leveledUp) {
        playLevelUpSound();
        setLevelUpLevel(newLevel);
      }

      checkAchievements(newExp, newLevel);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `user_stats/${user.uid}/add_xp`);
    }
  };

  const checkAchievements = async (newExp: number, newLevel: number) => {
    if (!user || !stats) return;
    
    try {
      const newUnlocked: string[] = [...(stats.unlockedAchievements || [])];
      let achievementXp = 0;

      ACHIEVEMENTS.forEach(ach => {
        if (!newUnlocked.includes(ach.id)) {
          let condition = false;
          const now = new Date();
          const hour = now.getHours();

          // Milestone Logic
          if (ach.id === 'first_protocol' && stats.totalTasksCompleted >= 1) condition = true;
          if (ach.id.startsWith('task_')) {
            const count = parseInt(ach.id.split('_')[1]);
            if (stats.totalTasksCompleted >= count) condition = true;
          }
          if (ach.id === 'journal_initiator' && journals.length >= 1) condition = true;
          if (ach.id.startsWith('journal_words_')) {
            const count = parseInt(ach.id.split('_')[3]);
            if ((stats.totalWordsWritten || 0) >= count) condition = true;
          }
          if (ach.id === 'reflection_seeker' && (stats.reflectionPromptsAnswered || 0) >= 50) condition = true;
          if (ach.id.startsWith('level_')) {
            const lvl = parseInt(ach.id.split('_')[1]);
            if (newLevel >= lvl) condition = true;
          }

          // Streak Logic
          if (ach.id.startsWith('streak_')) {
            const days = parseInt(ach.id.split('_')[1]);
            if (stats.currentStreak >= days) condition = true;
          }
          if (ach.id.startsWith('journal_streak_')) {
            const days = parseInt(ach.id.split('_')[2]);
            if ((stats.journalStreak || 0) >= days) condition = true;
          }
          if (ach.id === 'mood_master' && (stats.journalStreak || 0) >= 30) condition = true;

          // Skill/Hidden Logic
          if (ach.id === 'early_bird' && hour >= 5 && hour < 8) condition = true;
          if (ach.id === 'midnight_thoughts' && hour >= 3 && hour < 5) condition = true;
          if (ach.id === 'mood_swing') {
            const today = now.toISOString().split('T')[0];
            const todayMoods = new Set(journals.filter(j => j.createdAt.startsWith(today)).map(j => j.mood));
            if (todayMoods.size >= 3) condition = true;
          }
          if (ach.id === 'loyalist' && stats.experience >= 10000) condition = true;
          if (ach.id === 'god_mode' && newLevel >= 100 && stats.difficultyLevel === 'hard') condition = true;
          if (ach.id === 'perfectionist') {
            const pendingCount = tasks.filter(t => t.status === 'pending').length;
            if (pendingCount === 0 && tasks.length > 0) condition = true;
          }
          if (ach.id === 'long_form') {
             const longEntry = journals.some(j => j.content.split(/\s+/).filter(w => w.length > 0).length >= 500);
             if (longEntry) condition = true;
          }
          if (ach.id === 'minimalist') {
             const silentEntries = journals.filter(j => j.content.trim().length === 0).length;
             if (silentEntries >= 5) condition = true;
          }

          if (condition) {
            newUnlocked.push(ach.id);
            achievementXp += ach.xpReward;
            
            setCelebratingAchievement(ach);
            setTimeout(() => setCelebratingAchievement(null), 6000);

            const achId = Date.now() + Math.random();
            setXpNotifications(prev => [...prev, { id: achId, amount: ach.xpReward, source: `ACHIEVEMENT_UNLOCKED: ${ach.title}` }]);
            setTimeout(() => setXpNotifications(prev => prev.filter(n => n.id !== achId)), 4000);
          }
        }
      });

      if (achievementXp > 0 || newUnlocked.length !== (stats.unlockedAchievements?.length || 0)) {
        await updateDoc(doc(db, 'user_stats', user.uid), {
          unlockedAchievements: newUnlocked,
          experience: newExp + achievementXp,
          level: getLevelFromXP(newExp + achievementXp).level
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `user_stats/${user.uid}/achievements`);
    }
  };

  const [focusTask, setFocusTask] = useState<Task | null>(null);
  const [focusStartTime, setFocusStartTime] = useState<number>(0);

  const startFocus = (task: Task) => {
    setFocusTask(task);
    setFocusStartTime(Date.now());
  };

  const endFocus = async () => {
    if (!focusTask) return;
    const duration = (Date.now() - focusStartTime) / (60 * 1000);
    if (duration >= 1) {
      await addXP(Math.round(duration * 2), 'FOCUS_SESSION_COMPLETED');
    }
    setFocusTask(null);
    setFocusStartTime(0);
  };

  const addTimeBlock = async (block: Omit<TimeBlock, 'id' | 'userId'>) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'time_blocks'), {
        ...block,
        userId: user.uid,
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'time_blocks');
    }
  };

  const deleteTimeBlock = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'time_blocks', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `time_blocks/${id}`);
    }
  };

  const updateTimeBlock = async (id: string, updates: Partial<TimeBlock>) => {
    try {
      await updateDoc(doc(db, 'time_blocks', id), updates);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `time_blocks/${id}`);
    }
  };

  const applyTemplate = async (templateId: string, date: Date) => {
    if (!user) return;
    const template = TEMPLATES.find(t => t.id === templateId);
    if (!template) return;

    try {
      const { writeBatch } = await import('firebase/firestore');
      const batch = writeBatch(db);
      const baseDate = startOfDay(date);
      
      template.blocks.forEach(block => {
        const startTime = addHours(baseDate, block.startHour);
        const finalStart = new Date(startTime.getTime() + block.startMinute * 60000);
        const finalEnd = new Date(finalStart.getTime() + block.duration * 60000);
        
        const newBlockRef = doc(collection(db, 'time_blocks'));
        batch.set(newBlockRef, {
          userId: user.uid,
          title: block.title,
          type: block.type,
          startTime: finalStart.toISOString(),
          endTime: finalEnd.toISOString(),
          completed: false
        });
      });

      await batch.commit();
      await addXP(100, 'TEMPLATE_SYNC_COMPLETE');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'apply_template');
    }
  };

  const handleCompleteTask = async (task: Task) => {
    if (task.status === 'completed' || !user || !stats) return;

    try {
      playCompletionSound();
      const randomMsg = MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];
      setCompleteToast(randomMsg);
      setTimeout(() => setCompleteToast(null), 3000);

      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FF4500', '#00D9FF', '#FFFFFF']
      });

      const now = new Date();
      let adherenceStatus: 'ontime' | 'late' | 'partial' | 'missed' | undefined;
      let schedulingBonus = 0;
      let source = 'TASK_COMPLETE_STREAK_SYNC';

      if (task.scheduledStart) {
        const scheduledTime = new Date(task.scheduledStart);
        const diffMinutes = Math.abs((now.getTime() - scheduledTime.getTime()) / (60 * 1000));
        if (diffMinutes <= 60) {
          adherenceStatus = 'ontime';
          schedulingBonus += XP_MAP.TIMETABLE_ON_TIME;
          source = 'TEMPORAL_ADHERENCE_BONUS';
        } else {
          adherenceStatus = 'late';
        }
      }

      let speedBonus = 0;
      if (task.estimate > 0) {
        const startTime = task.scheduledStart ? new Date(task.scheduledStart) : new Date(task.createdAt);
        const actualMinutes = (now.getTime() - startTime.getTime()) / (60 * 1000);
        if (actualMinutes < task.estimate * 0.75) {
          speedBonus = Math.round(calculateTaskXP(task, stats.currentStreak) * (XP_MAP.SPEED_BONUS_MULT - 1));
        }
      }

      // Hardened multi-document update
      const { writeBatch } = await import('firebase/firestore');
      const batch = writeBatch(db);
      
      const taskRef = doc(db, 'tasks', task.id);
      batch.update(taskRef, { 
        status: 'completed',
        completedAt: now.toISOString(),
        adherenceStatus: adherenceStatus
      });

      const updates: any = {
        totalTasksCompleted: (stats.totalTasksCompleted || 0) + 1
      };
      if (adherenceStatus === 'ontime') {
        updates.punctualStreak = (stats.punctualStreak || 0) + 1;
      } else {
        updates.punctualStreak = 0;
      }

      const today = now.toISOString().split('T')[0];
      const todayScheduledCompleted = tasks.filter(t => 
        t.createdAt.startsWith(today) && 
        t.scheduledStart && 
        (t.status === 'completed' || t.id === task.id)
      ).length;

      const statsRef = doc(db, 'user_stats', user.uid);
      batch.update(statsRef, updates);

      await batch.commit();

      // Award XP separately as it has its own complex multi-field logic
      let earnedXP = calculateTaskXP(task, stats.currentStreak) + schedulingBonus + speedBonus;
      await addXP(earnedXP, source);

      if (todayScheduledCompleted === 5) {
        await addXP(50, 'DAILY_TEMPORAL_MASTERY_REACHED');
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `tasks/${task.id}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center relative overflow-hidden">
        {/* Animated Background Grid */}
        <div className="absolute inset-0 cyber-grid opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background" />
        
        <div className="relative z-10 flex flex-col items-center">
          {/* Central Pulsing Node */}
          <div className="relative mb-12">
            <motion.div 
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.6, 0.3],
                rotate: [0, 90, 180, 270, 360]
              }}
              transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
              className="w-32 h-32 border-2 border-accent/30 rounded-3xl absolute -inset-4 blur-xl"
            />
            <motion.div 
              animate={{ 
                rotate: -360,
                borderColor: ['rgba(255, 69, 0, 0.5)', 'rgba(0, 217, 255, 0.5)', 'rgba(255, 69, 0, 0.5)']
              }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              className="w-24 h-24 border-t-2 border-r-2 rounded-full flex items-center justify-center p-4"
            >
              <Zap className="text-accent animate-pulse" size={32} />
            </motion.div>
          </div>

          {/* Diagnostic Text Sequence */}
          <div className="space-y-2 text-center">
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="text-white font-mono text-xs uppercase tracking-[0.5em] text-glow-white"
            >
              Initializing_Neural_Sync
            </motion.p>
            <div className="flex gap-1 justify-center">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  animate={{ 
                    opacity: [0, 1, 0],
                    y: [0, -2, 0]
                  }}
                  transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2 }}
                  className="w-1 h-1 bg-cyan rounded-full"
                />
              ))}
            </div>
            <div className="mt-8 flex flex-col gap-1 items-center">
              <p className="text-[8px] font-mono text-text-m uppercase opacity-40">Decrypting_User_Node...</p>
              <p className="text-[8px] font-mono text-text-m uppercase opacity-30">Stabilizing_Temporal_Streams...</p>
              <p className="text-[8px] font-mono text-text-m uppercase opacity-20">Optimizing_XP_Algorithm...</p>
            </div>
          </div>
        </div>

        {/* Scanline Effect */}
        <div className="absolute inset-0 bg-scanlines opacity-[0.05] pointer-events-none" />
      </div>
    );
  }

  if (!user) {
    return <LandingPage onLogin={signInWithGoogle} />;
  }

  return (
    <div className="min-h-screen bg-background text-text-p selection:bg-accent selection:text-white cyber-grid">
      {/* Node Recalibration Overlay */}
      <AnimatePresence>
        {isNodeRecalibrating && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/80 backdrop-blur-md"
          >
            <div className="flex flex-col items-center gap-6">
              <div className="relative">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="w-16 h-16 border-2 border-cyan/30 rounded-full border-t-cyan border-r-cyan/50 shadow-[0_0_20px_rgba(0,217,255,0.3)]"
                />
                <Zap size={24} className="absolute inset-0 m-auto text-cyan animate-pulse" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <motion.p 
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="text-[10px] font-mono font-black text-cyan uppercase tracking-[0.4em] animate-glitch"
                >
                  RECALIBRATING_NODE
                </motion.p>
                <div className="w-32 h-[1px] bg-white/10 relative overflow-hidden">
                  <motion.div 
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ duration: 0.45, ease: "linear" }}
                    className="absolute inset-0 bg-cyan"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* How To Button */}
      <button 
        onClick={() => setIsManualOpen(true)}
        className="fixed top-6 right-6 lg:top-8 lg:right-8 z-[60] flex items-center gap-2 glass px-4 py-2 rounded-full border border-white/10 text-[10px] font-mono font-black text-text-m hover:text-cyan hover:border-cyan/50 hover:bg-cyan/5 transition-all group shadow-2xl backdrop-blur-xl"
      >
        <HelpCircle size={14} className="group-hover:rotate-12 transition-transform" />
        HOW_TO
      </button>

      {/* Sidebar / Nav */}
      <nav className="fixed bottom-0 left-0 right-0 lg:left-0 lg:top-0 lg:bottom-0 lg:w-20 glass border-t lg:border-t-0 lg:border-r border-border-subtle z-50 flex lg:flex-col items-center justify-around lg:justify-center gap-8 py-4 lg:py-8 premium-transition">
        <NavButton active={activeTab === 'dashboard'} onClick={() => handleTabChange('dashboard')} icon={<HardDrive size={24} />} label="CORE_COMMAND" />
        <NavButton active={activeTab === 'tasks'} onClick={() => handleTabChange('tasks')} icon={<CheckCircle2 size={24} />} label="ACTIVE_STACK" />
        <NavButton 
          active={activeTab === 'timetable'} 
          onClick={() => handleTabChange('timetable')} 
          icon={<Calendar size={24} />} 
          label="TEMPORAL_GRID" 
          badge="AI"
        />
        <NavButton active={activeTab === 'journal'} onClick={() => handleTabChange('journal')} icon={<Book size={24} />} label="NEURAL_ARCHIVE" />
        <NavButton 
          active={activeTab === 'stats'} 
          onClick={() => handleTabChange('stats')} 
          icon={<TrendingUp size={24} />} 
          label="NEURAL_EVOLUTION" 
        />
        <NavButton 
          active={activeTab === 'shop'} 
          onClick={() => handleTabChange('shop')} 
          icon={<ShoppingBag size={24} />} 
          label="MARKETPLACE" 
          locked={!(stats?.level && stats.level >= 20)}
          unlockLevel={20}
        />
        <NavButton 
          active={activeTab === 'settings'} 
          onClick={() => handleTabChange('settings')} 
          icon={<Settings size={24} />} 
          label="CONFIG_OS" 
        />
        
        <button 
          onClick={() => signOut(auth)}
          className="p-3 text-text-m hover:text-danger transition-colors lg:mt-auto group"
        >
          <LogOut size={24} className="group-hover:scale-110 transition-transform" />
          <span className="sr-only">TERMINATE_SESSION</span>
        </button>
      </nav>

      <main className="pb-24 lg:pb-8 lg:pl-28 pt-8 px-4 max-w-7xl mx-auto">
        {activeTab !== 'dashboard' && (
          <header className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6 glass p-6 rounded-xl border border-border-subtle premium-transition">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent to-cyan flex items-center justify-center font-bold text-2xl accent-glow text-white shadow-[0_0_30px_rgba(255,69,0,0.3)]">
                {user.displayName?.[0] || 'A'}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-mono text-cyan uppercase tracking-widest border border-cyan/30 px-2 py-0.5 rounded bg-cyan/5">USER_AUTH_LEVEL_01</span>
                  <span className="text-[9px] font-mono text-accent uppercase tracking-widest border border-accent/30 px-2 py-0.5 rounded bg-accent/5">SYS_NODE_{user.uid.slice(0, 4)}</span>
                  <span className="text-[9px] font-mono text-success uppercase tracking-widest border border-success/30 px-2 py-0.5 rounded bg-success/5 border-dashed animate-pulse">
                    {getTitleForLevel(stats?.level || 1)}
                  </span>
                </div>
                <h1 className="text-3xl font-serif font-black uppercase tracking-widest text-text-p flex items-center gap-2">
                  {user.displayName || 'OPERATOR'} <span className="text-cyan text-glow-cyan ml-2 text-sm font-mono tracking-tighter">CLASS_{stats?.level || 1}</span>
                </h1>
                {stats && (() => {
                  const { progress, totalForLevel } = getLevelFromXP(stats.experience);
                  return (
                    <div className="flex items-center gap-4 mt-2">
                      <div className="w-64 h-1.5 bg-background-nested rounded-full overflow-hidden border border-white/5 relative">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${(progress / totalForLevel) * 100}%` }}
                          transition={{ duration: 1, ease: PREMIUM_BEZIER }}
                          className="h-full bg-accent accent-glow shadow-[0_0_10px_rgba(255,69,0,0.4)]"
                        />
                        <div className="absolute inset-0 bg-scanlines opacity-20 pointer-events-none" />
                      </div>
                      <span className="text-[10px] text-text-s uppercase tracking-tighter font-mono whitespace-nowrap">
                        {Math.floor(progress)} / {totalForLevel} XP TO_NEXT_NODE
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>
            
            {stats && (
              <div className="grid grid-cols-3 gap-6 md:gap-8">
                <div className="text-center group relative cursor-help">
                  <p className="text-[10px] text-text-m uppercase font-bold tracking-widest font-mono">Streak</p>
                  <div className="text-xl font-serif font-bold text-warning flex items-center justify-center gap-1 group-hover:drop-shadow-[0_0_8px_rgba(255,165,0,0.5)] transition-all">
                    <Flame size={20} className={cn(stats.currentStreak > 0 ? "text-orange-500 animate-pulse" : "text-text-s opacity-30")} />
                    <span>{stats.currentStreak}</span>
                  </div>
                  {/* Tooltip for milestones */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-40 p-3 glass rounded-xl border border-white/10 opacity-0 group-hover:opacity-100 transition-all z-50 pointer-events-none shadow-2xl backdrop-blur-xl scale-95 group-hover:scale-100 origin-top">
                    <div className="space-y-2">
                      <p className="text-[9px] font-mono text-text-p uppercase tracking-tighter border-b border-white/5 pb-1 mb-1">Milestones</p>
                      <div className="flex justify-between items-center text-[8px] font-mono text-text-s uppercase">
                        <span>Day 7</span>
                        <span className="text-success">+200 XP</span>
                      </div>
                      <div className="flex justify-between items-center text-[8px] font-mono text-text-s uppercase">
                        <span>Day 30</span>
                        <span className="text-success">+500 XP</span>
                      </div>
                      <div className="flex justify-between items-center text-[8px] font-mono text-text-s uppercase">
                        <span>Day 100</span>
                        <span className="text-success">+1000 XP</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-center group">
                  <p className="text-[10px] text-text-m uppercase font-bold tracking-widest font-mono">Active</p>
                  <p className="text-xl font-serif font-bold text-accent animate-text-glow">{tasks.filter(t => t.status === 'pending').length}</p>
                </div>
                <div className="text-center group">
                  <p className="text-[10px] text-text-m uppercase font-bold tracking-widest font-mono">Sync</p>
                  <p className="text-xl font-serif font-bold text-cyan text-glow-cyan">94%</p>
                </div>
              </div>
            )}
          </header>
        )}

        <div className="mt-8 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10, scale: 0.98, filter: 'blur(10px)' }}
              animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: -10, scale: 1.02, filter: 'blur(10px)' }}
              transition={{ duration: 0.4, ease: PREMIUM_BEZIER }}
            >
              {activeTab === 'dashboard' && (
                <Dashboard 
                  stats={stats} 
                  tasks={tasks} 
                  journals={journals} 
                  onComplete={handleCompleteTask} 
                  user={user} 
                  setActiveTab={handleTabChange} 
                  setIsMotivationPortalOpen={setIsMotivationPortalOpen} 
                />
              )}
              {activeTab === 'tasks' && <TasksView tasks={tasks} user={user} onComplete={handleCompleteTask} settings={settings} setCompleteToast={setCompleteToast} />}
              {activeTab === 'timetable' && (
                <TemporalHub 
                  tasks={tasks} 
                  timeBlocks={timeBlocks}
                  journals={journals}
                  user={user}
                  stats={stats}
                  onAddXP={addXP}
                  onFocus={startFocus}
                  onComplete={handleCompleteTask}
                  addTimeBlock={addTimeBlock}
                  deleteTimeBlock={deleteTimeBlock}
                  updateTimeBlock={updateTimeBlock}
                  applyTemplate={applyTemplate}
                  setCompleteToast={setCompleteToast}
                  settings={settings}
                  onUpdateSettings={updateSettings}
                />
              )}
              {activeTab === 'journal' && <JournalView journals={journals} user={user} onAddXP={addXP} stats={stats} />}
              {activeTab === 'stats' && <StatsView stats={stats} user={user} tasks={tasks} journals={journals} timeBlocks={timeBlocks} />}
              {activeTab === 'shop' && <ShopView stats={stats} user={user} onPurchase={handlePurchase} />}
              {activeTab === 'settings' && <SettingsView settings={settings} stats={stats} user={user} onUpdate={updateSettings} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <MotivationPortal 
        isOpen={isMotivationPortalOpen} 
        onClose={() => setIsMotivationPortalOpen(false)}
        items={motivationItems}
        onAdd={addMotivationItem}
        onDelete={deleteMotivationItem}
      />

      <AnimatePresence>
        {levelUpLevel !== null && (
          <LevelUpOverlay level={levelUpLevel} stats={stats} onClose={() => setLevelUpLevel(null)} />
        )}
        {celebratingAchievement && (
          <AchievementCelebration achievement={celebratingAchievement} onClose={() => setCelebratingAchievement(null)} />
        )}
        {isManualOpen && (
          <ManualModal isOpen={isManualOpen} onClose={() => setIsManualOpen(false)} />
        )}
        {completeToast && (
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-32 left-1/2 -translate-x-1/2 glass px-8 py-4 rounded-full border border-cyan/30 text-cyan font-mono font-black tracking-widest text-xs uppercase z-[250] shadow-[0_0_30px_rgba(0,217,255,0.2)]"
          >
            {completeToast}
          </motion.div>
        )}
        {focusTask && (
          <div className="fixed inset-0 bg-black z-[200] flex flex-col items-center justify-center p-8 text-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,217,255,0.1),transparent)]" />
            
            <div className="relative space-y-12 max-w-2xl">
              <div className="space-y-4">
                <p className="text-cyan font-mono text-sm tracking-[0.5em] uppercase animate-pulse">FOCUS_MODE_ACTIVE</p>
                <h1 className="text-5xl font-serif font-black text-white uppercase tracking-widest leading-tight">{focusTask.title}</h1>
                <p className="text-text-m font-mono text-sm uppercase opacity-50 tracking-[0.2em]">{focusTask.category} // ESTIMATE: {focusTask.estimate} MIN</p>
              </div>

              <div className="flex flex-col items-center gap-6">
                <div className="w-64 h-64 rounded-full border-4 border-cyan/20 flex items-center justify-center relative">
                   <div className="absolute inset-0 rounded-full border-4 border-cyan border-t-transparent animate-spin duration-[3s]" />
                   <div className="text-6xl font-mono font-black text-cyan">
                      {Math.floor((Date.now() - focusStartTime) / 1000 / 60)}:
                      {String(Math.floor((Date.now() - focusStartTime) / 1000) % 60).padStart(2, '0')}
                   </div>
                </div>
                <p className="text-[10px] font-mono text-text-m uppercase tracking-widest opacity-40">System_Stabilization_In_Progress... Maintain_Neural_Bridge</p>
              </div>

              <div className="flex gap-6 justify-center">
                <button 
                  onClick={() => {
                    handleCompleteTask(focusTask);
                    endFocus();
                  }}
                  className="bg-success px-12 py-5 text-black font-black rounded shadow-[0_0_20px_rgba(0,255,65,0.3)] hover:scale-105 active:scale-95 transition-all uppercase tracking-widest"
                >
                  COMPLETE_PROTOCOL
                </button>
                <button 
                  onClick={endFocus}
                  className="bg-white/5 border border-white/10 px-12 py-5 text-white font-black rounded hover:bg-white/10 transition-all uppercase tracking-widest"
                >
                  ABORT_LINK
                </button>
              </div>
            </div>
            
            <div className="absolute bottom-12 left-12 right-12 flex justify-between items-end opacity-20 pointer-events-none">
               <div className="space-y-2">
                  <p className="text-[8px] font-mono text-cyan uppercase">Subsystem_Monitoring</p>
                  <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
                     <div className="h-full bg-cyan w-1/3 animate-pulse" />
                  </div>
               </div>
               <p className="text-[8px] font-mono text-white uppercase text-right">No_Distractions_Detected <br/> Neural_Sync_Optimized</p>
            </div>
          </div>
        )}
      </AnimatePresence>
      <FloatingXPRenderer notifications={xpNotifications} />
    </div>
  );
}

function FloatingXPRenderer({ notifications }: { notifications: XPNotification[] }) {
  return (
    <div className="fixed top-1/3 left-1/2 -translate-x-1/2 pointer-events-none z-[100] flex flex-col items-center gap-4">
      <AnimatePresence>
        {notifications.map(n => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: 20, scale: 0.5 }}
            animate={{ opacity: 1, y: -120, scale: 1.5 }}
            exit={{ opacity: 0, filter: 'blur(10px)', scale: 2 }}
            transition={{ duration: 1.2, ease: PREMIUM_BEZIER }}
            className="flex flex-col items-center"
          >
            <span className="text-5xl font-serif font-black text-white text-glow-white italic leading-none">+{n.amount} XP</span>
            <span className="text-[10px] font-mono font-bold text-black bg-cyan px-3 py-1 rounded-sm shadow-2xl uppercase tracking-[0.2em] mt-2 border border-white/20">
              {n.source}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function AITimetableModal({ 
  isOpen, 
  onClose, 
  onGenerate,
  initialRoutine,
  onUpdateRoutine
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onGenerate: (routine: string[]) => void;
  initialRoutine: string[];
  onUpdateRoutine: (routine: string[]) => void;
}) {
  const [routine, setRoutine] = useState<string[]>(initialRoutine);
  const [newRoutine, setNewRoutine] = useState('');

  const addRoutine = () => {
    if (newRoutine.trim() && !routine.includes(newRoutine.trim())) {
      const updated = [...routine, newRoutine.trim()];
      setRoutine(updated);
      onUpdateRoutine(updated);
      setNewRoutine('');
    }
  };

  const removeRoutine = (r: string) => {
    const updated = routine.filter(x => x !== r);
    setRoutine(updated);
    onUpdateRoutine(updated);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 bg-background/90 backdrop-blur-2xl" onClick={onClose}>
      <motion.div 
        initial={{ y: 50, scale: 0.9, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 50, scale: 0.9, opacity: 0 }}
        className="glass max-w-xl w-full p-10 rounded-[3rem] border border-white/10 space-y-8 relative overflow-hidden" 
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
           <Sparkles size={80} className="text-cyan" />
        </div>

        <div className="space-y-2">
           <div className="flex items-center gap-2 text-cyan">
              <Sparkles size={16} />
              <span className="text-[10px] font-mono font-black uppercase tracking-[0.3em]">AI_Core_Protocol</span>
           </div>
           <h3 className="text-4xl font-serif font-black text-white italic uppercase tracking-tighter">NEURAL_SCHEDULER</h3>
           <p className="text-text-m font-mono text-xs uppercase opacity-60">Optimize your temporal grid using AI logic.</p>
        </div>

        <div className="space-y-6">
           <div className="space-y-3">
              <label className="text-[10px] font-mono text-text-m uppercase font-black tracking-widest">A_Daily_Sync_Events</label>
              <div className="flex flex-wrap gap-2">
                 {routine.map(r => (
                   <div key={r} className="flex items-center gap-2 bg-white/5 border border-white/10 pl-3 pr-1 py-1 rounded-full group">
                      <span className="text-[10px] font-mono text-white uppercase italic">{r}</span>
                      <button onClick={() => removeRoutine(r)} className="p-1 hover:text-danger opacity-40 group-hover:opacity-100 transition-opacity"><X size={12} /></button>
                   </div>
                 ))}
                 <div className="flex items-center gap-2 bg-black/40 border border-white/5 pl-3 pr-1 py-1 rounded-full focus-within:border-cyan transition-all">
                    <input 
                      type="text" 
                      value={newRoutine}
                      onChange={e => setNewRoutine(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addRoutine()}
                      placeholder="ADD_ROUTINE..."
                      className="bg-transparent border-none outline-none text-[10px] font-mono text-white uppercase w-24"
                    />
                    <button onClick={addRoutine} className="p-1 hover:text-cyan opacity-40 hover:opacity-100 transition-opacity"><Plus size={12} /></button>
                 </div>
              </div>
              <p className="text-[9px] font-mono text-text-s uppercase opacity-40 leading-relaxed">Include fixed events (School, Tuition, Gym, etc.) for better synchronization.</p>
           </div>

           <div className="p-6 bg-cyan/5 rounded-[2rem] border border-cyan/10 flex items-start gap-4">
              <div className="p-3 bg-cyan/10 rounded-2xl">
                 <Zap className="text-cyan" size={24} />
              </div>
              <div className="space-y-1">
                 <p className="text-[10px] font-mono text-cyan uppercase font-black">AI_Logic_Initialization</p>
                 <p className="text-xs font-serif italic text-text-p leading-relaxed">
                   The scheduler will analyze your pending tasks, priority levels, and routine events to generate an optimized time-blocked day.
                 </p>
              </div>
           </div>
        </div>

        <div className="flex gap-4 pt-4">
           <button onClick={onClose} className="flex-1 py-5 glass border border-white/10 text-text-m font-mono font-black uppercase rounded-2xl hover:bg-white/5 transition-all text-sm tracking-widest">Abort</button>
           <button 
             onClick={() => onGenerate(routine)} 
             className="flex-1 py-5 bg-cyan text-black font-mono font-black uppercase rounded-2xl shadow-[0_0_30px_rgba(0,217,255,0.3)] hover:scale-[1.02] active:scale-95 transition-all text-sm tracking-widest"
           >
             Initialize_Sync
           </button>
        </div>
      </motion.div>
    </div>
  );
}

// --- Components ---

function NavButton({ active, onClick, icon, label, locked, unlockLevel, badge }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; locked?: boolean; unlockLevel?: number; badge?: string }) {
  return (
    <button 
      onClick={locked ? undefined : onClick}
      className={cn(
        "relative p-3 transition-all group shrink-0",
        active ? "text-accent" : (locked ? "text-text-s/30 cursor-not-allowed" : "text-text-m hover:text-text-p")
      )}
    >
      <div className={cn(active && "accent-glow text-accent", locked && "opacity-40 grayscale")}>
        {icon}
        {badge && (
          <span className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-accent text-white text-[7px] font-mono font-black rounded-sm border border-white/20 animate-pulse">
            {badge}
          </span>
        )}
        {locked && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Zap size={10} className="text-text-s opacity-20" />
          </div>
        )}
      </div>
      <span className={cn(
        "absolute left-full ml-4 px-2 py-1 text-[10px] uppercase font-bold opacity-0 group-hover:opacity-100 transition-opacity hidden lg:block whitespace-nowrap pointer-events-none z-50",
        locked ? "bg-black/60 text-text-m border border-white/10" : "bg-accent text-white"
      )}>
        {locked ? `LOCKED (LVL ${unlockLevel})` : label}
      </span>
      {active && (
        <motion.div 
          layoutId="nav-pill"
          className="absolute inset-0 bg-accent/10 lg:bg-transparent lg:border-r-2 lg:border-accent -right-4 lg:right-[-2px]"
        />
      )}
    </button>
  );
}

function LandingPage({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl"
      >
        <div className="inline-block p-6 bg-accent/10 border border-accent mb-8 accent-glow">
          <Zap className="text-accent" size={48} />
        </div>
        <h1 className="text-6xl md:text-8xl font-bold uppercase tracking-tighter mb-4 animate-text-glow text-text-p">
          AETHER <span className="text-cyan">OS</span>
        </h1>
        <p className="text-xl md:text-2xl text-text-s font-mono mb-12 tracking-widest">
          LIVE YOUR LIFE. EARN YOUR EXP.
        </p>
        <button 
          onClick={onLogin}
          className="bg-accent hover:bg-red-600 text-white font-bold py-4 px-12 flex items-center gap-3 transition-all transform hover:scale-105 accent-glow rounded-lg"
        >
          <LogIn size={20} />
          INITIATE PROTOCOL
        </button>
      </motion.div>
    </div>
  );
}

function CardDecoration() {
  return (
    <>
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/20" />
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-white/20" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-white/20" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/20" />
      <div className="absolute inset-0 bg-scanlines opacity-[0.03] pointer-events-none" />
    </>
  );
}

function DailyChallengeWidget({ stats }: { stats: UserStats | null }) {
  const challenge = stats?.dailyChallenge;
  if (!challenge) return null;
  
  const template = DAILY_CHALLENGES.find(c => c.id === challenge.id);
  const progressPercent = Math.min((challenge.progress / challenge.goal) * 100, 100);
  
  return (
    <section className="glass p-6 rounded-xl border border-border-subtle relative overflow-hidden group">
      <CardDecoration />
      <div className="flex items-center justify-between mb-4 relative z-10">
        <h2 className="flex items-center gap-2 text-[10px] font-bold text-text-m uppercase tracking-[0.3em] font-mono">
          <Zap size={14} className="text-warning animate-pulse" />
          DAILY_CHALLENGE
        </h2>
        <span className={cn(
          "text-[10px] px-2 py-0.5 rounded border font-mono",
          challenge.completed 
            ? "border-success/40 text-success bg-success/5" 
            : "border-warning/40 text-warning bg-warning/5"
        )}>
          {challenge.completed ? 'SYNCHRONIZED' : `+${template?.xpReward || 0} XP`}
        </span>
      </div>
      
      <div className="relative z-10">
        <h3 className="text-sm font-serif font-black uppercase tracking-widest text-text-p mb-3 flex items-center gap-2">
          {template?.label || 'COMMENCIVE_OBJECTIVE'}
          {challenge.completed && <CheckCircle2 size={16} className="text-success" />}
        </h3>
        
        <div className="space-y-2">
          <div className="flex justify-between text-[10px] font-mono text-text-s uppercase">
            <span>{challenge.completed ? 'GOAL_MET' : 'Progress'}</span>
            <span>{Math.floor(challenge.progress)} / {challenge.goal}</span>
          </div>
          <div className="h-1.5 w-full bg-background-nested rounded-full overflow-hidden border border-white/5">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              className={cn(
                "h-full transition-all duration-1000 shadow-[0_0_10px_currentColor]",
                challenge.completed ? "bg-success text-success" : "bg-warning text-warning"
              )}
            />
          </div>
          <p className="text-[9px] font-mono text-text-m italic opacity-60">
            {challenge.completed 
              ? 'OBJECTIVE_PURIFIED. REWARD_GRANTED.' 
              : progressPercent > 70 ? "SYSTEM_LINK_NEAR_CAPACITY. PUSH_FURTHER." 
              : 'SYSTEM_RESOURCE_NEEDS_ALLOCATION. PROCEED.'}
          </p>
        </div>
      </div>
      <div className="absolute inset-0 bg-scanlines opacity-[0.03] pointer-events-none" />
    </section>
  );
}

function LevelProgressBar({ stats }: { stats: UserStats | null }) {
  if (!stats) return null;
  const { currentXP, nextLevelXP, levelProgress } = getLevelFromXP(stats.experience);

  return (
    <section className="glass p-6 rounded-xl border border-white/5 relative overflow-hidden group">
      <CardDecoration />
      <div className="flex items-center justify-between mb-4 relative z-10">
        <h2 className="flex items-center gap-2 text-[10px] font-bold text-text-m uppercase tracking-[0.3em] font-mono">
          <TrendingUp size={14} className="text-cyan animate-pulse" />
          NEURAL_SYNCHRONIZATION
        </h2>
        <span className="text-[10px] px-2 py-0.5 rounded border border-cyan/40 text-cyan bg-cyan/5 font-mono">
          LEVEL {stats.level}
        </span>
      </div>

      <div className="relative z-10 space-y-4">
        <div className="flex items-end justify-between">
          <div className="space-y-1">
             <p className="text-2xl font-serif font-black text-text-p tracking-tight italic uppercase text-glow-white">
               {Math.floor(levelProgress)}% SYNC
             </p>
             <p className="text-[9px] font-mono text-text-m uppercase tracking-widest opacity-60">
               {currentXP.toLocaleString()} / {nextLevelXP.toLocaleString()} DATA_POINTS
             </p>
          </div>
          <p className="text-[8px] font-mono text-text-m uppercase border-b border-cyan/20 pb-1">
            {nextLevelXP - currentXP} XP until LEVEL {stats.level + 1}
          </p>
        </div>

        <div className="h-2 w-full bg-background-nested rounded-full overflow-hidden border border-white/5 p-0.5">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${levelProgress}%` }}
            className="h-full bg-gradient-to-r from-cyan to-accent rounded-full shadow-[0_0_15px_rgba(0,217,255,0.5)]"
          />
        </div>
      </div>
    </section>
  );
}

function ProfileCard({ stats, user }: { stats: UserStats | null, user: User }) {
  if (!stats) return null;
  const { currentXP, nextLevelXP, levelProgress } = getLevelFromXP(stats.experience);
  
  // Calculate pace and estimate (simplified)
  const today = new Date().toISOString().split('T')[0];
  const todayXP = stats.activityLog?.filter(a => a.timestamp.startsWith(today)).reduce((acc, a) => acc + a.xp, 0) || 100;
  const xpNeeded = nextLevelXP - currentXP;
  const estimatedDays = Math.ceil(xpNeeded / Math.max(todayXP, 100));

  return (
    <div className="glass p-8 rounded-2xl border-l-8 border-accent relative overflow-hidden group premium-transition">
      <CardDecoration />
      <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
        <div className="relative">
          <div className="w-24 h-24 rounded-full border-4 border-accent p-1 bg-background-nested overflow-hidden">
            <img src={user.photoURL || ''} alt="" className="w-full h-full rounded-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" referrerPolicy="no-referrer" />
          </div>
          <motion.div 
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="absolute -bottom-2 -right-2 bg-accent text-white font-mono text-[10px] font-black w-8 h-8 rounded-full flex items-center justify-center shadow-lg shadow-accent/40"
          >
            {stats.level}
          </motion.div>
        </div>

        <div className="flex-1 space-y-4 text-center md:text-left">
          <div className="space-y-1">
            <h2 className="text-3xl font-serif font-black text-white uppercase tracking-tight italic glow-text-white">{user.displayName}</h2>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
              <p className="text-[10px] font-mono text-accent uppercase tracking-[0.5em] font-black">Level {stats.level} / 100</p>
              <span className="text-[10px] font-mono text-text-m opacity-50 uppercase tracking-widest">• {getTitleForLevel(stats.level)}</span>
              <span className="flex items-center gap-1 text-[10px] font-mono text-warning font-black uppercase">
                <Flame size={12} /> {stats.currentStreak} Day Streak
              </span>
            </div>
          </div>

          <div className="space-y-2 max-w-md mx-auto md:mx-0">
             <div className="flex justify-between text-[10px] font-mono uppercase">
                <span className="text-text-m">XP_BARRIER: {Math.floor(levelProgress)}%</span>
                <span className="text-text-s">{currentXP.toLocaleString()} / {nextLevelXP.toLocaleString()} XP</span>
             </div>
             <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
                <motion.div 
                   initial={{ width: 0 }}
                   animate={{ width: `${levelProgress}%` }}
                   className="h-full bg-gradient-to-r from-cyan to-accent rounded-full shadow-[0_0_15px_rgba(0,217,255,0.4)]"
                />
             </div>
             <div className="flex justify-between text-[8px] font-mono text-text-s uppercase italic opacity-60">
                <span>Next level in ~{estimatedDays} days at current pace</span>
                <span>{xpNeeded.toLocaleString()} XP remaining</span>
             </div>
          </div>
        </div>
      </div>
      <div className="absolute top-4 right-4 opacity-10 rotate-12">
        <HardDrive size={100} className="text-accent" />
      </div>
    </div>
  );
}

function QuickStatsGrid({ stats, journals }: { stats: UserStats | null, journals: any[] }) {
  if (!stats) return null;
  const { levelProgress } = getLevelFromXP(stats.experience);
  
  const metrics = [
    { label: 'LIFETIME_XP', value: stats.experience.toLocaleString(), icon: <Activity size={18} className="text-cyan" />, unit: 'PTS' },
    { label: 'TASKS_SYNCED', value: stats.totalTasksCompleted, icon: <CheckCircle2 size={18} className="text-success" />, unit: 'UNITS' },
    { label: 'NODE_STREAK', value: stats.currentStreak, icon: <Flame size={18} className="text-warning" />, unit: 'DAYS' },
    { label: 'NEURAL_LOGS', value: journals.length, icon: <Book size={18} className="text-accent" />, unit: 'ENTRIES' },
    { label: 'ARCHIVE_SYNC', value: `${stats.unlockedAchievements?.length || 0} / ${ACHIEVEMENTS.length}`, icon: <Award size={18} className="text-purple-400" />, unit: 'UNLOCKED' },
    { label: 'SYNC_PERCENT', value: `${Math.floor(levelProgress)}%`, icon: <PieChart size={18} className="text-blue-400" />, unit: 'LEVEL_COMPLETE' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {metrics.map((m, i) => (
        <motion.div 
          key={m.label}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.05 }}
          className="glass p-4 rounded-xl border border-white/5 bg-white/2 hover:bg-white/5 transition-all group overflow-hidden relative"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="group-hover:scale-110 transition-transform">{m.icon}</div>
            <span className="text-[10px] font-mono text-text-m uppercase tracking-widest font-black whitespace-nowrap">{m.label}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-serif font-black text-white italic">{m.value}</span>
            <span className="text-[8px] font-mono text-text-s uppercase opacity-40">{m.unit}</span>
          </div>
          <div className="absolute top-0 right-0 w-1 h-full bg-white/5 group-hover:bg-cyan/20 transition-all" />
        </motion.div>
      ))}
    </div>
  );
}

function RecentActivityFeed({ log }: { log?: ActivityEntry[] }) {
  if (!log || log.length === 0) return (
    <div className="glass p-6 rounded-xl border border-white/5 animate-pulse text-center">
      <p className="text-[10px] font-mono text-text-m uppercase tracking-widest italic opacity-40">NO_ACTIVITY_DETECTED_IN_FEED</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {log.slice(0, 5).map((entry, i) => (
        <motion.div 
          key={entry.id}
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: i * 0.1 }}
          className="flex items-center gap-4 p-4 glass rounded-xl border-l-2 border-l-white/10 hover:border-l-accent transition-all group bg-white/1"
        >
          <div className={cn(
            "p-2 rounded flex items-center justify-center shrink-0",
            entry.type === 'task' ? "bg-accent/10 text-accent" :
            entry.type === 'journal' ? "bg-cyan/10 text-cyan" :
            entry.type === 'achievement' ? "bg-warning/10 text-warning" : "bg-white/10 text-white"
          )}>
            {entry.type === 'task' ? <CheckCircle2 size={16} /> :
             entry.type === 'journal' ? <Book size={16} /> :
             entry.type === 'achievement' ? <Trophy size={16} /> : <Zap size={16} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-mono text-text-m flex justify-between items-center mb-1">
              <span className="uppercase opacity-50 tracking-tighter">{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {entry.type}</span>
              <span className="text-accent font-black">+{entry.xp} XP</span>
            </p>
            <h4 className="text-sm font-serif font-black uppercase text-white truncate italic tracking-tight">{entry.label}</h4>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function UpcomingAndQuickAccess({ tasks, journals, setActiveTab }: { tasks: Task[], journals: JournalEntry[], setActiveTab: any }) {
  const nextTasks = tasks.filter(t => t.status === 'pending').slice(0, 3);
  
  return (
    <div className="space-y-6">
      <section className="glass rounded-xl border border-white/5 overflow-hidden">
        <div className="p-4 bg-white/5 border-b border-white/5 flex items-center justify-between">
           <h3 className="text-[10px] font-mono font-black uppercase tracking-widest text-text-m">Upcoming_Targets</h3>
           <button onClick={() => setActiveTab('tasks')} className="text-[8px] font-mono text-accent hover:underline">VIEW_ALL</button>
        </div>
        <div className="p-2 space-y-1">
          {nextTasks.length === 0 ? (
            <p className="p-4 text-[10px] font-mono text-text-m opacity-40 uppercase italic text-center">NO_PENDING_OBJECTIVES</p>
          ) : (
            nextTasks.map(t => (
              <div key={t.id} className="p-3 hover:bg-white/5 rounded flex justify-between items-center group cursor-default">
                 <span className="text-sm font-serif font-black uppercase text-text-p truncate max-w-[150px] italic">{t.title}</span>
                 <span className="text-[10px] font-mono text-text-m opacity-40 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                   {t.scheduledStart ? new Date(t.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'ASAP'}
                 </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="glass rounded-xl border border-white/5 overflow-hidden">
        <div className="p-4 bg-white/5 border-b border-white/5 flex items-center justify-between">
           <h3 className="text-[10px] font-mono font-black uppercase tracking-widest text-text-m">Recent_Neural_Logs</h3>
           <button onClick={() => setActiveTab('journal')} className="text-[8px] font-mono text-cyan hover:underline">ACCESS_ARCHIVE</button>
        </div>
        <div className="p-2 space-y-1">
           {journals.slice(0, 2).map((j, i) => (
             <div key={j.id} className="p-3 hover:bg-white/5 rounded border-b border-white/5 last:border-0">
                <div className="flex justify-between items-center mb-1">
                   <div className="flex items-center gap-2">
                      <span className="text-lg">{MOODS.find(m => m.id === j.mood)?.emoji}</span>
                      <span className="text-[10px] font-mono text-text-p uppercase tracking-tighter opacity-70">ENTRY_{i+1}</span>
                   </div>
                   <span className="text-[8px] font-mono text-text-m opacity-40">{new Date(j.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-text-m truncate font-mono opacity-50 italic">"{j.content.slice(0, 50)}..."</p>
             </div>
           ))}
        </div>
      </section>
    </div>
  );
}

function AchievementsSummary({ stats }: { stats: UserStats | null }) {
  if (!stats) return null;
  const lockedAchievements = ACHIEVEMENTS.filter(a => !stats.unlockedAchievements?.includes(a.id));
  
  // Fake tracking for now, but sort by "closest" based on some logic or just shuffle 3
  const topLocked = lockedAchievements.slice(0, 2);

  return (
    <section className="glass rounded-xl border border-white/5 overflow-hidden">
        <div className="p-4 bg-white/5 border-b border-white/5 flex items-center justify-between">
           <h3 className="text-[10px] font-mono font-black uppercase tracking-widest text-text-m">Evolving_Protocols</h3>
           <button className="text-[8px] font-mono text-purple-400 hover:underline">VIEW_LIBRARY</button>
        </div>
        <div className="p-4 space-y-6">
          {topLocked.map((ach, i) => (
            <div key={ach.id} className="space-y-2 opacity-60 hover:opacity-100 transition-opacity">
               <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/5 rounded grayscale group-hover:grayscale-0">{ach.icon}</div>
                  <div className="min-w-0">
                     <h4 className="text-[10px] font-black font-mono text-white uppercase truncate">{ach.title}</h4>
                     <p className="text-[8px] font-mono text-text-m truncate leading-tight">{ach.description}</p>
                  </div>
               </div>
               <div className="space-y-1">
                  <div className="flex justify-between text-[7px] font-mono text-text-s uppercase">
                    <span>EST_SYNC: 43%</span>
                    <span>+{ach.xpReward} XP</span>
                  </div>
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 w-[43%]" />
                  </div>
               </div>
            </div>
          ))}
          <div className="pt-2">
            <button className="w-full py-2 bg-white/5 rounded font-mono text-[9px] uppercase tracking-widest text-text-m hover:bg-white/10 transition-all">VIEW_ALL_ACHIEVEMENTS</button>
          </div>
        </div>
    </section>
  );
}

function MotivationSection({ stats, onOpenPortal }: { stats: UserStats | null; onOpenPortal: () => void }) {
  if (!stats) return null;
  const quotes = [
    "NEURAL_EFFICIENCY IS BORN FROM CONSISTENT REFACTORING.",
    "THE BIT DOES NOT CARE FOR YOUR FATIGUE. EXECUTE.",
    "DATA WITHOUT DISCIPLINE IS NOISE.",
    "SYNC THE MIND. PURIFY THE OUTPUT.",
    "ASCENSION IS A RECURSIVE PROCESS."
  ];
  const quoteIndex = new Date().getDay() % quotes.length;

  return (
    <div className="space-y-4">
      <section className="glass p-6 rounded-xl border-l-4 border-cyan bg-cyan/5 relative group overflow-hidden">
        <CardDecoration />
        <div className="flex justify-between items-start mb-2">
          <TrendingUp className="text-cyan opacity-40 group-hover:opacity-100 group-hover:scale-110 transition-all" size={24} />
          <button 
            onClick={onOpenPortal}
            className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[8px] font-mono font-black text-cyan hover:bg-cyan hover:text-black transition-all uppercase tracking-widest"
          >
            BOOST_PROTOCOLS
          </button>
        </div>
        <h3 className="text-sm font-serif font-black text-white italic leading-tight uppercase">"{quotes[quoteIndex]}"</h3>
        <p className="text-[9px] font-mono text-text-m mt-2 uppercase tracking-[0.2em]">Daily_System_Inspiration</p>
      </section>

      <section className="glass p-4 rounded-xl border border-white/5 bg-white/1 space-y-2">
        <div className="flex items-center justify-between text-[9px] font-mono uppercase font-black">
          <span className="text-text-s">Next_Milestone</span>
          <span className="text-warning">LEVEL 100</span>
        </div>
        <p className="text-[10px] font-mono text-white uppercase italic leading-none">ULTIMATE_CORE_DECRYPTION</p>
        <p className="text-[9px] font-mono text-text-m leading-tight">"You've leveled up 3 times this month! SYSTEM_LINK_STABILITY IS AT PEAK."</p>
      </section>
    </div>
  );
}

function MotivationPortal({ 
  isOpen, 
  onClose, 
  items, 
  onAdd, 
  onDelete 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  items: MotivationItem[]; 
  onAdd: (item: Partial<MotivationItem>) => void; 
  onDelete: (id: string) => void;
}) {
  const [newType, setNewType] = useState<MotivationItem['type']>('link');
  const [newContent, setNewContent] = useState('');
  const [newTitle, setNewTitle] = useState('');

  const handleAdd = () => {
    if (!newContent) return;
    onAdd({ type: newType, content: newContent, title: newTitle });
    setNewContent('');
    setNewTitle('');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="glass w-full max-w-2xl max-h-[80vh] rounded-[2rem] border border-white/10 overflow-hidden flex flex-col relative z-10 shadow-2xl"
          >
            <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/2">
              <div>
                <h2 className="text-3xl font-serif font-black text-white italic uppercase tracking-tighter">NEURAL_BOOST_HUB</h2>
                <p className="text-[10px] font-mono text-text-m uppercase tracking-widest opacity-60">High-frequency triggers for instant motivation.</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X size={20} className="text-text-m" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-12 no-scrollbar">
              {/* Add stimuli */}
              <div className="space-y-4">
                <h3 className="text-xs font-mono font-black text-accent uppercase tracking-[0.2em]">INJECT_STIMULI</h3>
                <div className="glass p-6 rounded-3xl border border-white/5 space-y-6">
                   <div className="flex bg-black/20 p-1 rounded-xl border border-white/5">
                      {(['link', 'music', 'quote', 'text'] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => setNewType(t)}
                          className={cn(
                            "flex-1 py-2 rounded-lg text-[9px] font-mono font-black uppercase transition-all",
                            newType === t ? "bg-white text-black shadow-lg" : "text-text-m hover:text-white"
                          )}
                        >
                          {t}
                        </button>
                      ))}
                   </div>
                   <div className="space-y-3">
                      <div className="flex gap-2">
                         <div className="p-3 bg-white/5 rounded-xl text-text-m border border-white/5">
                            {newType === 'music' ? <Music size={16} /> : newType === 'quote' ? <Sparkles size={16} /> : newType === 'link' ? <LinkIcon size={16} /> : <Book size={16} />}
                         </div>
                         <input 
                           type="text" 
                           placeholder="ITEM_LABEL (Optional)"
                           value={newTitle}
                           onChange={e => setNewTitle(e.target.value)}
                           className="flex-1 bg-black/40 border border-white/10 p-3 rounded-xl text-xs font-mono text-white outline-none focus:border-accent/40"
                         />
                      </div>
                      <textarea 
                        placeholder={newType === 'link' ? "PASTE_VIDEO_URL (YouTube/Instagram/TikTok)" : newType === 'music' ? "SPOTIFY_LINK or TRACK_NAME" : "MOTIVATIONAL_CONTENT"}
                        value={newContent}
                        onChange={e => setNewContent(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 p-4 rounded-xl text-sm font-mono text-white outline-none focus:border-accent/40 min-h-[100px] resize-none"
                      />
                      <button 
                        onClick={handleAdd}
                        disabled={!newContent}
                        className="w-full py-4 bg-accent text-white font-mono font-black text-xs rounded-xl hover:shadow-[0_0_20px_rgba(255,69,0,0.3)] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:grayscale transition-all uppercase tracking-widest"
                      >
                        DECRYPT & INTROJECT
                      </button>
                   </div>
                </div>
              </div>

              {/* Active stimuli */}
              <div className="space-y-4">
                 <div className="flex items-center justify-between">
                    <h3 className="text-xs font-mono font-black text-text-p uppercase tracking-[0.2em]">ACTIVE_STIMULI_CORE</h3>
                    <div className="text-[10px] font-mono text-text-s uppercase">{items.length}_LOADED</div>
                 </div>
                 <div className="grid grid-cols-1 gap-4">
                   {items.map(item => (
                     <div key={item.id} className="glass p-5 rounded-3xl border border-white/5 flex items-center justify-between group hover:border-white/20 transition-all">
                       <div className="flex items-center gap-5 truncate">
                          <div className={cn(
                            "p-4 rounded-2xl border transition-all",
                            item.type === 'music' ? "bg-success/10 border-success/20 text-success" : 
                            item.type === 'quote' ? "bg-warning/10 border-warning/20 text-warning" : 
                            "bg-cyan/10 border-cyan/20 text-cyan"
                          )}>
                             {item.type === 'music' ? <Music size={20} /> : 
                              item.type === 'quote' ? <Quote size={20} /> : 
                              item.content.includes('youtube.com') || item.content.includes('youtu.be') ? <Youtube size={20} /> :
                              item.content.includes('instagram.com') ? <Instagram size={20} /> :
                              <LinkIcon size={20} />}
                          </div>
                          <div className="truncate space-y-1">
                             <h4 className="text-sm font-serif font-black text-white italic uppercase truncate">{item.title || item.type.toUpperCase() + '_MODULE'}</h4>
                             <div className="flex items-center gap-2">
                               {item.type === 'link' ? (
                                 <a href={item.content.startsWith('http') ? item.content : `https://${item.content}`} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono text-cyan/70 hover:text-cyan hover:underline truncate flex items-center gap-1">
                                    {item.content.replace(/^https?:\/\//, '')} <ChevronRight size={10} />
                                 </a>
                               ) : (
                                 <p className="text-[10px] font-mono text-text-m italic truncate">"{item.content}"</p>
                               )}
                             </div>
                          </div>
                       </div>
                       <button 
                         onClick={() => onDelete(item.id)}
                         className="p-3 text-text-s hover:text-danger opacity-0 group-hover:opacity-100 transition-all bg-white/5 rounded-xl"
                       >
                         <Trash2 size={16} />
                       </button>
                     </div>
                   ))}
                   {items.length === 0 && (
                     <div className="text-center py-16 border-2 border-dashed border-white/5 rounded-[2.5rem]">
                        <Activity size={32} className="text-text-s mx-auto mb-4 opacity-20" />
                        <p className="text-xs font-mono text-text-s uppercase font-black opacity-40">NO_ACTIVE_BOOSTERS_FOUND</p>
                        <p className="text-[10px] font-mono text-text-m uppercase opacity-20 mt-1">Initialize motivation protocols above.</p>
                     </div>
                   )}
                 </div>
              </div>
            </div>
            
            <div className="p-8 bg-white/2 border-t border-white/5 text-center">
               <p className="text-[8px] font-mono text-text-m uppercase tracking-[0.3em] opacity-40 italic">WARNING: Excessive neural stimulation may lead to hyper-productivity.</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function Dashboard({ 
  stats, 
  tasks, 
  journals, 
  onComplete, 
  user, 
  setActiveTab,
  setIsMotivationPortalOpen 
}: { 
  stats: UserStats | null; 
  tasks: Task[]; 
  journals: JournalEntry[]; 
  onComplete: (task: Task) => void; 
  user: User; 
  setActiveTab: any;
  setIsMotivationPortalOpen: (open: boolean) => void;
}) {
  const isStreakAtRisk = (stats?.currentStreak || 0) > 0 && stats?.lastActiveDate?.split('T')[0] !== new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
           <h1 className="text-4xl font-serif font-black text-text-p uppercase tracking-[0.1em] italic text-glow-white">COMMAND_CENTER</h1>
           <p className="text-[10px] font-mono text-text-m uppercase tracking-[0.5em] opacity-40">System_Status: Stable | Version: 2.1.0_OAK</p>
        </div>
      </div>

      <ProfileCard stats={stats} user={user} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Col: Main Stream */}
        <div className="lg:col-span-8 space-y-8">
          <section className="space-y-4">
             <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono font-black uppercase tracking-[0.3em] text-text-m flex items-center gap-2">
                   <Target size={14} className="text-accent" />
                   CORE_METRICS_SYNC
                </h3>
             </div>
             <QuickStatsGrid stats={stats} journals={journals} />
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <DailyChallengeWidget stats={stats} />
            <section className="space-y-4">
              <h3 className="text-xs font-mono font-black uppercase tracking-[0.3em] text-text-m flex items-center gap-2">
                <Activity size={14} className="text-accent" />
                NEURAL_HISTORY
              </h3>
              <RecentActivityFeed log={stats?.activityLog} />
            </section>
          </div>
        </div>

        {/* Right Col: Operations */}
        <div className="lg:col-span-4 space-y-8">
          {isStreakAtRisk && (
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="glass p-6 rounded-xl border-t-4 border-warning bg-warning/5 animate-pulse"
            >
               <div className="flex items-center gap-3 mb-2">
                  <Flame size={20} className="text-warning" />
                  <span className="text-[10px] font-mono text-warning font-black uppercase tracking-widest">STREAK_AT_RISK</span>
               </div>
               <p className="text-[10px] font-mono text-text-m uppercase leading-tight italic">"DATA_FLOW_STALLED. COMPLETE_TASK_TO_MAINTAIN_LINK."</p>
            </motion.div>
          )}

          <section className="space-y-4">
             <h3 className="text-xs font-mono font-black uppercase tracking-[0.3em] text-text-m flex items-center gap-2">
                <Zap size={14} className="text-accent" />
                QUICK_OVERRIDE
             </h3>
             <UpcomingAndQuickAccess tasks={tasks} journals={journals} setActiveTab={setActiveTab} />
          </section>

          <AchievementsSummary stats={stats} />
          
          <MotivationSection stats={stats} onOpenPortal={() => setIsMotivationPortalOpen(true)} />
        </div>
      </div>
    </div>
  );
}

function InventoryItem({ icon, label, active }: { icon: string; label: string; active: boolean }) {
  return (
    <div className={cn(
      "glass aspect-square rounded-lg flex flex-col items-center justify-center p-3 text-center transition-all",
      !active && "opacity-40 grayscale"
    )}>
      <div className="w-10 h-10 rounded bg-background-nested flex items-center justify-center text-xl mb-2">
        {icon}
      </div>
      <span className="text-[9px] text-text-p uppercase tracking-tighter font-bold">{label}</span>
    </div>
  );
}

function TasksView({ tasks, user, onComplete, settings, setCompleteToast }: { tasks: Task[]; user: User; onComplete: (task: Task) => void; settings: AppSettings | null; setCompleteToast: (m: string | null) => void }) {
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [newCat, setNewCat] = useState<'health' | 'learning' | 'creative' | 'work' | 'personal' | 'routine'>('work');
  const [estimate, setEstimate] = useState(30);
  const [isChallenging, setIsChallenging] = useState(false);
  const [customXP, setCustomXP] = useState<number | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const filteredTasks = tasks.filter(task => 
    (task.title || "").toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  const [isEstimating, setIsEstimating] = useState(false);

  const estimateXPWithAI = async () => {
    if (!newTitle.trim()) return;
    setIsEstimating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `You are a gamification engine for a productivity app called Aether. 
      Analyze the following task and suggest an appropriate XP reward based on complexity and time.
      Task Title: "${newTitle}"
      Category: "${newCat}"
      Estimated Time: ${estimate} minutes
      Difficulty Setting: ${settings?.difficultyMultiplier === 0.5 ? 'NOVICE (0.5x)' : settings?.difficultyMultiplier === 2.0 ? 'VM_MODE (2.0x)' : 'HARDWARE (1.0x)'}
      
      Respond with ONLY a single integer representing the suggested XP. 
      Rules:
      - Quick tasks (5-15m): 10-50 XP
      - Medium tasks (30-60m): 100-250 XP
      - Hard/Deep tasks (2h+): 300-600 XP
      Apply the Difficulty Multiplier in your calculation.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });
      
      const suggestedXP = parseInt(response.text?.replace(/\D/g, '') || '0');
      if (suggestedXP > 0) {
        setCustomXP(suggestedXP);
        setCompleteToast(`AI_ESTIMATE_READY: ${suggestedXP} XP`);
      }
    } catch (e) {
      console.error("AI Estimate Failed", e);
    } finally {
      setIsEstimating(false);
    }
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      await addDoc(collection(db, 'tasks'), {
        userId: user.uid,
        title: newTitle,
        priority: newPriority,
        status: 'pending',
        category: newCat,
        estimate: estimate,
        isChallenging: isChallenging,
        customXP: customXP || null,
        isSpeedRun: false, // Updated on completion if user marks it
        difficulty: 'medium', // legacy
        createdAt: new Date().toISOString()
      });
      setNewTitle('');
      setCustomXP('');
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'tasks');
    }
  };

  const deleteTask = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'tasks', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `tasks/${id}`);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <form onSubmit={addTask} className="glass p-8 rounded-xl space-y-6 border-t-2 border-t-cyan/20 bg-card/40 premium-transition hover:border-cyan/40 shadow-2xl">
        <div className="flex flex-col md:flex-row gap-6 items-end">
          <div className="flex-1 w-full">
            <label className="text-[10px] font-bold text-text-m uppercase mb-3 block tracking-[0.3em] font-mono border-l-2 border-cyan pl-2">INITIATE_PROTOCOL_CMD</label>
            <input 
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="ENTER_DATA_STRING..."
              className="w-full bg-black/40 border border-border-subtle p-4 text-text-p font-mono focus:border-cyan outline-none rounded premium-transition shadow-inner placeholder:opacity-30"
            />
          </div>
          <button className="hidden md:flex bg-accent px-10 py-4 text-white font-black hover:bg-white hover:text-black transition-all rounded accent-glow shadow-2xl shadow-accent/20 items-center justify-center gap-3 uppercase tracking-[0.2em] transform hover:scale-105 active:scale-95">
            <Plus size={20} className="animate-pulse" />
            EXECUTE
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <label className="text-[9px] font-bold text-text-m uppercase tracking-widest font-mono pl-1">PRIORITY</label>
            <select 
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as any)}
              className="w-full bg-black/40 border border-border-subtle p-3 text-text-p font-mono text-xs outline-none rounded cursor-pointer premium-transition hover:border-accent"
            >
              <option value="low">LOW</option>
              <option value="medium">MEDIUM</option>
              <option value="high">HIGH</option>
              <option value="critical">CRITICAL</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-bold text-text-m uppercase tracking-widest font-mono pl-1">CATEGORY</label>
            <select 
              value={newCat}
              onChange={(e) => setNewCat(e.target.value as any)}
              className="w-full bg-black/40 border border-border-subtle p-3 text-text-p font-mono text-xs outline-none rounded cursor-pointer premium-transition hover:border-cyan"
            >
              <option value="health">HEALTH</option>
              <option value="learning">LEARNING</option>
              <option value="creative">CREATIVE</option>
              <option value="work">WORK</option>
              <option value="personal">PERSONAL</option>
              <option value="routine">ROUTINE</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-bold text-text-m uppercase tracking-widest font-mono pl-1">ESTIMATE (MIN)</label>
            <div className="flex items-center bg-black/40 border border-border-subtle rounded premium-transition hover:border-cyan p-1 px-3">
              <input 
                type="number"
                value={estimate}
                min="1"
                onChange={(e) => setEstimate(parseInt(e.target.value) || 0)}
                className="w-full bg-transparent p-2 text-text-p font-mono text-xs outline-none"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-bold text-text-m uppercase tracking-widest font-mono pl-1">MANUAL_REWARD (XP)</label>
            <div className="flex items-center bg-black/40 border border-border-subtle rounded premium-transition hover:border-accent p-1 px-3 relative group/xp">
              <input 
                type="number"
                value={customXP}
                placeholder="1-500"
                max="500"
                onChange={(e) => setCustomXP(e.target.value === '' ? '' : parseInt(e.target.value))}
                className="w-full bg-transparent p-2 text-text-p font-mono text-xs outline-none"
              />
              <button 
                type="button"
                onClick={estimateXPWithAI}
                disabled={isEstimating || !newTitle.trim()}
                className={cn(
                  "p-1.5 rounded hover:bg-white/5 transition-all",
                  isEstimating && "animate-pulse"
                )}
                title="AI_SYNC_REWARD"
              >
                <Sparkles size={14} className={cn("text-cyan", isEstimating && "animate-spin")} />
              </button>
            </div>
          </div>
          <div className="flex items-end pb-1 col-span-2 md:col-span-1">
            <label className="flex items-center gap-2 cursor-pointer group w-full p-2 rounded hover:bg-white/5 transition-all">
              <input 
                type="checkbox"
                checked={isChallenging}
                onChange={(e) => setIsChallenging(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-black/40 text-accent focus:ring-0 cursor-pointer"
              />
              <span className="text-[10px] font-mono font-bold text-text-m uppercase group-hover:text-accent transition-colors">CHALLENGE_MODE</span>
            </label>
          </div>
        </div>

        <button className="md:hidden w-full bg-accent px-10 py-4 text-white font-black hover:bg-white hover:text-black transition-all rounded border border-white/10 flex items-center justify-center gap-3 uppercase tracking-[0.2em]">
          <Plus size={20} />
          EXECUTE
        </button>
      </form>

      <div className="glass p-4 rounded-xl border border-white/5 bg-white/2 flex items-center gap-4">
        <div className="p-2 bg-white/5 rounded-lg">
          <Activity size={18} className="text-text-m opacity-40" />
        </div>
        <div className="flex-1">
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="FILTER_PROTOCOLS_BY_STRING..."
            className="w-full bg-transparent border-none text-text-p font-mono text-xs outline-none placeholder:opacity-20"
          />
        </div>
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="text-text-s hover:text-white transition-colors">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6">
          {filteredTasks.map(task => (
            <div 
              key={task.id} 
              className={cn(
                "p-6 glass rounded-xl transition-all flex items-center justify-between border-l-4 premium-transition group relative overflow-hidden",
                task.status === 'completed' ? "border-success opacity-40 grayscale blur-[0.5px]" : "border-accent hover:border-cyan hover:bg-white/5"
              )}
            >
            {task.status !== 'completed' && (
              <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 -rotate-45 translate-x-12 -translate-y-12 pointer-events-none group-hover:bg-cyan/5 transition-all" />
            )}
            <div className="flex items-center gap-6 relative z-10 flex-1 min-w-0">
              <button 
                onClick={() => onComplete(task)}
                className={cn("p-1 transition-all transform hover:scale-125 shrink-0", task.status === 'completed' ? "text-success" : "text-text-m hover:text-accent ")}
              >
                {task.status === 'completed' ? <CheckCircle2 size={32} /> : <Circle size={32} className="opacity-40 group-hover:opacity-100" />}
              </button>
              <div className="min-w-0 flex-1">
                <h3 className={cn("text-xl font-serif font-black uppercase tracking-tight italic flex items-center gap-3 truncate", task.status === 'completed' ? "line-through text-text-m" : "text-text-p")}>
                  {task.title}
                  {task.priority === 'critical' && <Zap size={14} className="text-danger animate-pulse shrink-0" />}
                </h3>
                <div className="flex flex-wrap items-center gap-3 mt-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                  <span className={cn(
                    "text-[9px] px-2 py-0.5 rounded-sm font-bold uppercase font-mono border whitespace-nowrap",
                    task.priority === 'critical' || task.priority === 'high' ? "border-danger/30 bg-danger/10 text-danger" : 
                    task.priority === 'medium' ? "border-warning/30 bg-warning/10 text-warning" : "border-cyan/30 bg-cyan/10 text-cyan"
                  )}>
                    PRIOR_{task.priority}
                  </span>
                  <span className="text-[9px] text-text-m uppercase font-bold tracking-widest font-mono truncate">NODE_{task.category}</span>
                  <span className="text-[9px] text-text-s uppercase font-mono">{task.estimate} MIN</span>
                  {task.isChallenging && (
                    <span className="text-[9px] text-accent font-mono font-black border border-accent/30 bg-accent/5 px-1.5 rounded-sm whitespace-nowrap">CHALLENGE_ACT_1.5X</span>
                  )}
                  {task.isSpeedRun && (
                    <span className="text-[9px] text-orange-400 font-mono font-black border border-orange-400/30 bg-orange-400/5 px-1.5 rounded-sm whitespace-nowrap">SPEED_RUN_1.2X</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6 relative z-10">
               <div className="hidden lg:flex flex-col items-end opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[8px] font-mono text-text-s uppercase">HASH_{task.id.slice(0, 8)}</span>
                  <span className="text-[8px] font-mono text-text-s uppercase">SYNC_DATE_{new Date(task.createdAt).toLocaleDateString().replace(/\//g, '.')}</span>
               </div>
              <button 
                onClick={() => deleteTask(task.id)}
                className="text-text-m hover:text-danger p-2 transition-all hover:bg-danger/10 rounded-lg group-hover:translate-x-0 translate-x-2 opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={20} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LevelUpOverlay({ level, onClose, stats }: { level: number; onClose: () => void; stats: UserStats | null }) {
  const currentUnlocks = UNLOCKS.filter(u => u.level === level);
  const rewards = [];
  if (level % 100 === 0) rewards.push({ label: '5000 COINS', type: 'currency' });
  else if (level % 25 === 0) rewards.push({ label: '2000 COINS', type: 'currency' });
  else if (level % 10 === 0) rewards.push({ label: '1000 COINS', type: 'currency' });
  else if (level % 5 === 0) rewards.push({ label: '500 COINS', type: 'currency' });
  
  useEffect(() => {
    confetti({
      particleCount: 200,
      spread: 100,
      origin: { y: 0.3 },
      colors: ['#FFD700', '#00D9FF', '#FF3366']
    });
    
    // Cascading confetti
    const timer = setTimeout(() => {
      confetti({
        particleCount: 150,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#FFD700', '#00D9FF']
      });
      confetti({
        particleCount: 150,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#FFD700', '#FF3366']
      });
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-[200] overflow-hidden flex items-center justify-center p-6 sm:p-12">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-background/95 backdrop-blur-2xl"
      />
      
      <motion.div 
        initial={{ y: 50, opacity: 0, scale: 0.9 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: -50, opacity: 0, scale: 0.9 }}
        className="relative max-w-2xl w-full text-center space-y-12"
      >
        <div className="space-y-4">
           <motion.h1 
             animate={{ scale: [1, 1.1, 1], rotate: [-1, 1, -1] }}
             transition={{ duration: 2, repeat: Infinity }}
             className="text-7xl font-serif font-black text-white italic uppercase tracking-[0.2em] text-glow-white"
           >
             LEVEL_UP!
           </motion.h1>
           <div className="flex items-center justify-center gap-8">
              <div className="text-center">
                 <p className="text-[10px] font-mono text-text-m uppercase mb-1">From</p>
                 <p className="text-4xl font-serif font-black text-white opacity-40 italic">{level - 1}</p>
              </div>
              <ChevronRight className="text-accent h-12 w-12" />
              <div className="text-center">
                 <p className="text-[10px] font-mono text-text-m uppercase mb-1">To</p>
                 <p className="text-6xl font-serif font-black text-accent italic glow-text-accent">{level}</p>
              </div>
           </div>
        </div>

        <div className="space-y-6">
           <p className="text-[10px] font-mono text-text-m uppercase tracking-[1em] font-black opacity-60">REWARDS_UNLOCKED</p>
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {rewards.map((r, i) => (
                <motion.div 
                   initial={{ x: -20, opacity: 0 }}
                   animate={{ x: 0, opacity: 1 }}
                   transition={{ delay: 0.5 + (i * 0.1) }}
                   key={i} 
                   className="glass p-6 rounded-2xl border-2 border-warning/30 bg-warning/5 flex items-center gap-4"
                >
                  <Trophy className="text-warning h-8 w-8" />
                  <div className="text-left">
                     <p className="text-[10px] font-mono text-warning font-black uppercase">SYNC_REWARD</p>
                     <p className="text-xl font-serif font-black text-white italic">{r.label}</p>
                  </div>
                </motion.div>
              ))}
              {currentUnlocks.map((u, i) => (
                <motion.div 
                   initial={{ x: 20, opacity: 0 }}
                   animate={{ x: 0, opacity: 1 }}
                   transition={{ delay: 0.5 + (i * 0.1) }}
                   key={u.id} 
                   className="glass p-6 rounded-2xl border-2 border-accent/30 bg-accent/5 flex items-center gap-4"
                >
                   <Zap className="text-accent h-8 w-8" />
                   <div className="text-left">
                      <p className="text-[10px] font-mono text-accent font-black uppercase">SYSTEM_UPGRADE</p>
                      <p className="text-sm font-serif font-black text-white italic uppercase tracking-tight">{u.label}</p>
                   </div>
                </motion.div>
              ))}
              {rewards.length === 0 && currentUnlocks.length === 0 && (
                <div className="col-span-2 glass p-8 rounded-2xl border border-white/5 bg-white/2">
                   <p className="text-[10px] font-mono text-text-m uppercase tracking-[0.2em]">"Standard sync protocol maintained. Keep ascending."</p>
                </div>
              )}
           </div>
        </div>

        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onClose}
          className="px-12 py-5 bg-white text-black font-mono font-black uppercase tracking-[0.4em] rounded-full shadow-2xl hover:bg-accent hover:text-white transition-all border-none outline-none"
        >
          CONTINUE_ASCENSION
        </motion.button>
      </motion.div>
    </div>
  );
}

function AchievementCelebration({ achievement, onClose }: { achievement: Achievement; onClose: () => void }) {
  useEffect(() => {
    confetti({
      particleCount: 100,
      spread: 60,
      origin: { y: 0.8 },
      colors: ['#00D9FF', '#FF3366']
    });
  }, []);

  return (
    <motion.div 
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      className="fixed bottom-12 right-12 glass p-6 rounded-2xl border border-accent/30 bg-accent/10 z-[250] flex items-center gap-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] max-w-sm"
    >
      <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center border border-accent shrink-0">
        <Award size={32} className="text-accent" />
      </div>
      <div className="flex-1">
        <p className="text-[9px] font-mono font-bold text-accent uppercase tracking-widest mb-1">Achievement Unlocked</p>
        <h4 className="text-white font-serif font-black uppercase tracking-tight text-lg">{achievement.title}</h4>
        <p className="text-text-m text-[10px] uppercase font-mono opacity-60 mt-1">{achievement.description}</p>
      </div>
      <button onClick={onClose} className="p-1 hover:bg-white/10 rounded">
        <X size={16} className="text-text-s" />
      </button>
    </motion.div>
  );
}

function ManualModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const sections = [
    {
      category: "OPERATIONAL_MODES",
      items: [
        {
          title: "CORE_COMMAND",
          description: "Your primary tactical display. It aggregates real-time data from all sub-nodes. Monitor your 'Synchronization Percentage', which reflects your overall adherence to scheduled protocols.",
          icon: <HardDrive size={18} className="text-accent" />
        },
        {
          title: "ACTIVE_STACK",
          description: "Priority-based objective management. Critical tasks yield 200% base XP. Adhere to categorization (Learning, Creative, etc.) to trigger specialized multipliers.",
          icon: <CheckCircle2 size={18} className="text-success" />
        },
        {
          title: "TEMPORAL_GRID",
          description: "Deterministic time-blocking. Blocks are verified against system time. Adhere to the schedule within a 60-minute window to maintain the 'Punctual Streak'.",
          icon: <Calendar size={18} className="text-cyan" />
        },
        {
          title: "NEURAL_ARCHIVE",
          description: "High-fidelity journaling. Use Markdown for structured logging. Mood-tagging initializes sentiment-analysis logs that track emotional density over long arcs.",
          icon: <Book size={18} className="text-purple-400" />
        }
      ]
    },
    {
      category: "PROGRESSION_LOGIC",
      items: [
        {
          title: "XP_ALGORITHM",
          description: "XP = Base Priority × (Duration Mult + Cat Mult) × (Streak Bonus × Multiplier). Late completions suffer a 30% XP decay.",
          icon: <Activity size={18} className="text-warning" />
        },
        {
          title: "LEVEL_ASCENSION",
          description: "Every 5 levels decrypts new OS capabilities (Recurring Loops, Marketplace, Deep Analytics). Level 100 triggers 'Ultimate Core Decryption'.",
          icon: <Award size={18} className="text-white" />
        },
        {
          title: "DAILY_CHALLENGES",
          description: "Recursive objectives that reset every 24 hours. Completing a challenge provides massive XP and credits (CR).",
          icon: <Zap size={18} className="text-warning" />
        },
        {
          title: "STREAK_MAINTENANCE",
          description: "Neural links are fragile. Missing a 24-hour sync window resets your primary activity streak. Higher streaks yield passive XP bonuses.",
          icon: <Flame size={18} className="text-orange-500" />
        }
      ]
    },
    {
      category: "ADVANCED_SYSTEMS",
      items: [
        {
          title: "AI_SCHEDULER",
          description: "Neural-engine powered scheduling. Analyzes your 'Sync Routines' (Regular events) and pending stack to generate the most efficient temporal path.",
          icon: <Sparkles size={18} className="text-cyan" />
        },
        {
          title: "STIMULI_INJECTION",
          description: "Hyper-focus triggers found in the 'Boost Portal'. Add music, text, or links that help stabilize your focus sessions.",
          icon: <Zap size={18} className="text-accent" />
        },
        {
          title: "NEURAL_SHOP",
          description: "Expend hard-earned Credits (CR) to unlock custom visual interfaces, legacy badges, and experimental difficulty mods.",
          icon: <ShoppingBag size={18} className="text-success" />
        }
      ]
    }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 md:p-6 bg-background/95 backdrop-blur-3xl" onClick={onClose}>
          <motion.div 
            layout
            initial={{ y: 100, opacity: 0 }}
            animate={{ 
              y: 0, 
              opacity: 1,
              width: isExpanded ? '95vw' : '100%',
              maxWidth: isExpanded ? '100%' : '800px',
              height: isExpanded ? '90vh' : 'auto',
              maxHeight: isExpanded ? '100%' : '85vh'
            }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="glass rounded-[3rem] border border-white/10 flex flex-col relative overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-8 md:p-12 border-b border-white/5 bg-white/2 flex justify-between items-center shrink-0">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-cyan">
                  <HelpCircle size={16} />
                  <span className="text-[10px] font-mono font-black uppercase tracking-[0.3em]">System_Manual_v1.2 // PROTOCOL_READY</span>
                </div>
                <h2 className="text-3xl md:text-5xl font-serif font-black text-white italic uppercase tracking-tighter">AETHER_OS_GUIDE</h2>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-3 glass border border-white/10 rounded-full hover:bg-white/5 transition-all text-text-m hover:text-cyan"
                  title={isExpanded ? "Collapse" : "Expand"}
                >
                  {isExpanded ? <Minimize2 size={24} /> : <Maximize2 size={24} />}
                </button>
                <button 
                  onClick={onClose}
                  className="p-3 hover:bg-white/5 rounded-full transition-colors text-text-m hover:text-danger"
                >
                  <X size={28} />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-8 md:p-12 no-scrollbar">
              <div className={cn(
                "grid gap-12 transition-all duration-500",
                isExpanded ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"
              )}>
                {sections.map((cat, catIdx) => (
                  <div key={cat.category} className="space-y-6">
                    <h3 className="text-[10px] font-mono font-black text-cyan uppercase tracking-[0.5em] border-b border-cyan/20 pb-2">{cat.category}</h3>
                    <div className="space-y-4">
                      {cat.items.map((item, idx) => (
                        <motion.div 
                          key={item.title}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: (catIdx * 0.1) + (idx * 0.05) }}
                          className="p-6 bg-white/2 border border-white/5 rounded-2xl space-y-3 hover:bg-white/[0.04] hover:border-white/10 transition-all group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-white/5 rounded-lg group-hover:scale-110 transition-transform">
                              {item.icon}
                            </div>
                            <h4 className="text-xs font-mono font-black text-white tracking-widest uppercase">{item.title}</h4>
                          </div>
                          <p className="text-xs text-text-m font-mono leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity">
                            {item.description}
                          </p>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Master Status */}
              <div className="mt-12 p-8 bg-gradient-to-r from-cyan/10 to-accent/10 border border-white/5 rounded-[2rem] space-y-6">
                <div className="flex items-center gap-4">
                    <ShieldCheck className="text-success" size={40} />
                    <div>
                        <h3 className="text-lg font-serif font-black text-white italic uppercase">Operational_Integrity_Statement</h3>
                        <p className="text-[10px] font-mono text-text-m uppercase">Aether_OS Kernel // Security_Advisory</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs font-mono leading-relaxed opacity-80">
                    <p>
                      The database utilizes a 'Strong Sync' protocol. Every mutation (Task completion, XP gain, Journaling) is cryptographically bound to your User UID and stored in a hardened cloud cluster. No local-only artifacts are permitted; what you see in the 'Core Command' is a direct mirror of your neural history.
                    </p>
                    <p>
                      Bugs or glitches are automatically mitigated through periodic state-recalibration. If you detect a synchronization desync, use the 'Settings' node to 'Purge Cache' or 'Recalibrate Neural Link'. Remember: The System does not fail; the Operator simply needs better synchronization.
                    </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-8 border-t border-white/5 bg-white/1 flex justify-center shrink-0">
              <button 
                onClick={onClose}
                className="px-16 py-5 bg-white shadow-[0_0_30px_rgba(255,255,255,0.2)] text-black font-black uppercase rounded-2xl hover:bg-cyan hover:shadow-cyan/30 transition-all text-sm tracking-[0.2em]"
              >
                ACKNOWLEDGE_AND_EXECUTE
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function TemporalHub({ 
  tasks, 
  timeBlocks, 
  journals, 
  stats, 
  user,
  onAddXP,
  onFocus,
  onComplete,
  addTimeBlock,
  deleteTimeBlock,
  updateTimeBlock,
  applyTemplate,
  setCompleteToast,
  settings,
  onUpdateSettings
}: { 
  tasks: Task[]; 
  timeBlocks: TimeBlock[]; 
  journals: JournalEntry[];
  stats: UserStats | null; 
  user: User;
  onAddXP: (amount: number, source: string, meta?: any) => void;
  onFocus: (task: Task) => void;
  onComplete: (task: Task) => void;
  addTimeBlock: (block: Omit<TimeBlock, 'id' | 'userId'>) => Promise<void>;
  deleteTimeBlock: (id: string) => Promise<void>;
  updateTimeBlock: (id: string, updates: Partial<TimeBlock>) => Promise<void>;
  applyTemplate: (templateId: string, date: Date) => Promise<void>;
  setCompleteToast: (msg: string | null) => void;
  settings: AppSettings | null;
  onUpdateSettings: (s: Partial<AppSettings>) => Promise<void>;
}) {
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState('');
  const [blockForm, setBlockForm] = useState<Partial<TimeBlock>>({ type: 'task' });

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  const generateAITimetable = async (routine: string[]) => {
    if (!user) return;
    setIsAIModalOpen(false);
    setIsGenerating(true);
    setGenerationStep('ANALYZING_PENDING_PROTOCOLS...');

    try {
      const pendingTasks = tasks.filter(t => t.status === 'pending');
      const now = new Date();
      const todayStr = format(now, 'yyyy-MM-dd');

      const prompt = `Generate a daily timetable for today (${todayStr}) starting from 5:00 AM to 11:00 PM.
      Available Tasks to Schedule:
      ${pendingTasks.map(t => `- [${t.priority.toUpperCase()}] ${t.title} (${t.estimate} mins, Category: ${t.category})`).join('\n')}
      
      User Fixed Routine Events (Integrate these at realistic times):
      ${routine.join(', ')}
      
      Requirements:
      1. Use only the provided tasks and routine events.
      2. Spread them out reasonably with breaks.
      3. Categorize each block as 'task', 'event', 'routine', or 'break'.
      4. Ensure no overlap.
      5. Output ONLY a JSON array of objects.
      
      Block Schema: { "title": string, "type": "task"|"event"|"routine"|"break", "startTime": "${todayStr}THH:mm", "endTime": "${todayStr}THH:mm" }`;

      setGenerationStep('COORDINATING_NEURAL_STREAMS...');

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: GenAIType.ARRAY,
            items: {
              type: GenAIType.OBJECT,
              properties: {
                title: { type: GenAIType.STRING },
                type: { type: GenAIType.STRING, enum: ['task', 'event', 'routine', 'break'] },
                startTime: { type: GenAIType.STRING },
                endTime: { type: GenAIType.STRING }
              },
              required: ['title', 'type', 'startTime', 'endTime']
            }
          }
        }
      });

      setGenerationStep('GELATING_TEMPORAL_STRUCTURE...');
      let blocks: any[] = [];
      try {
        blocks = JSON.parse(response.text || '[]');
      } catch (e) {
        console.error("Failed to parse AI response:", response.text);
      }

      if (blocks.length > 0) {
        setGenerationStep('SYNCING_WITH_FIRESTORE...');
        
        const { writeBatch } = await import('firebase/firestore');
        const batch = writeBatch(db);
        
        const todayBlocks = timeBlocks.filter(b => b.startTime.startsWith(todayStr));
        for (const b of todayBlocks) {
          batch.delete(doc(db, 'time_blocks', b.id));
        }

        for (const block of blocks) {
          const newBlockRef = doc(collection(db, 'time_blocks'));
          batch.set(newBlockRef, {
            userId: user.uid,
            title: block.title,
            type: block.type,
            startTime: block.startTime,
            endTime: block.endTime,
            completed: false
          });
        }
        
        await batch.commit();
        
        onAddXP(100, 'AI_TIMETABLE_GENERATE');
        setCompleteToast('AI_SYNCHRONIZATION_COMPLETE');
        setTimeout(() => setCompleteToast(null), 3000);
      }
    } catch (error) {
      console.error("AI Generation Error:", error);
      setCompleteToast('AI_SYNC_FAILURE');
      setTimeout(() => setCompleteToast(null), 3000);
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  const getDayCompletion = (date: Date) => {
    const dayStr = format(date, 'yyyy-MM-dd');
    const dayTasks = tasks.filter(t => t.createdAt.startsWith(dayStr));
    const completed = dayTasks.filter(t => t.status === 'completed').length;
    return dayTasks.length === 0 ? 0 : completed / dayTasks.length;
  };

  const getDayXP = (date: Date) => {
    const dayStr = format(date, 'yyyy-MM-dd');
    return stats?.activityLog?.filter(a => a.timestamp.startsWith(dayStr)).reduce((acc, a) => acc + a.xp, 0) || 0;
  };

  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const days = eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(monthEnd) });

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 hover:bg-white/5 rounded-full text-text-m"><ChevronRight className="rotate-180" size={16} /></button>
            <h3 className="text-2xl font-serif font-black text-white italic uppercase tracking-[0.2em]">{format(currentDate, 'MMMM yyyy')}</h3>
            <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 hover:bg-white/5 rounded-full text-text-m"><ChevronRight size={16} /></button>
          </div>
          <div className="flex glass p-1 rounded-lg border border-white/5">
             {(['month', 'week', 'day'] as const).map((mode) => (
               <button key={mode} onClick={() => setViewMode(mode)} className={cn("px-4 py-1.5 rounded-md text-[10px] font-mono font-black uppercase transition-all", viewMode === mode ? "bg-accent text-white" : "text-text-m hover:text-text-p")}>{mode}</button>
             ))}
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px bg-white/5 border border-white/5 rounded-2xl overflow-hidden glass shadow-2xl">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="bg-background-nested p-4 text-[10px] font-mono font-black text-text-m uppercase text-center tracking-widest">{d}</div>
          ))}
          {days.map((day) => {
            const completion = getDayCompletion(day);
            const xp = getDayXP(day);
            const journal = journals.find(j => isSameDay(new Date(j.createdAt), day));
            const dayTasks = tasks.filter(t => isSameDay(new Date(t.createdAt), day));
            const mood = journal ? MOODS.find(m => m.id === journal.mood) : null;
            const isToday = isSameDay(day, new Date());
            const isCurrentMonth = isSameMonth(day, monthStart);

            return (
              <motion.div 
                key={day.toISOString()}
                whileHover={{ scale: 1.02, zIndex: 10 }}
                onClick={() => { setCurrentDate(day); setViewMode('day'); }}
                className={cn(
                   "aspect-square p-3 relative cursor-pointer group transition-all",
                   isCurrentMonth ? "bg-card/20" : "bg-black/40 opacity-30",
                   isToday && "ring-2 ring-inset ring-accent z-10"
                )}
              >
                <div className={cn(
                  "absolute inset-0 opacity-20 transition-opacity group-hover:opacity-40",
                  completion >= 0.8 ? "bg-success" : completion >= 0.5 ? "bg-warning" : completion > 0 ? "bg-danger" : ""
                )} />
                <div className="relative z-10 flex justify-between items-start">
                   <span className={cn("text-[10px] font-mono font-black", isToday ? "text-accent" : "text-text-m")}>{format(day, 'd')}</span>
                   {stats?.streakHistory?.includes(format(day, 'yyyy-MM-dd')) && <Flame size={12} className="text-warning animate-pulse" />}
                </div>
                {mood && <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20 group-hover:opacity-100 transition-opacity"><span className="text-lg">{mood.emoji}</span></div>}
                <div className="absolute bottom-2 left-2 right-2 flex justify-between items-end">
                   <div className="flex gap-0.5">{dayTasks.slice(0, 3).map((t, i) => (<div key={i} className={cn("w-1.5 h-1.5 rounded-full", t.status === 'completed' ? "bg-success" : "bg-text-s")} />))}</div>
                   {xp > 0 && <span className="text-[8px] font-mono text-cyan/70">+{xp}</span>}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderTimetableView = (days: Date[]) => {
    const hours = Array.from({ length: 19 }, (_, i) => i + 5); // 5 AM to 11 PM

    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-6">
              <div className="flex glass p-1 rounded-lg border border-white/5">
                {(['month', 'week', 'day'] as const).map(mode => (
                  <button key={mode} onClick={() => setViewMode(mode)} className={cn("px-4 py-1.5 rounded-md text-[10px] font-mono font-black uppercase transition-all", viewMode === mode ? "bg-accent text-white" : "text-text-m hover:text-text-p")}>{mode}</button>
                ))}
              </div>
              <div className="flex items-center gap-4">
                 <button onClick={() => setCurrentDate(addDays(currentDate, viewMode === 'week' ? -7 : -1))} className="p-2 hover:bg-white/5 rounded-full text-text-m border border-white/5"><ChevronRight className="rotate-180" size={16} /></button>
                 <span className="text-sm font-mono font-black uppercase tracking-widest">{viewMode === 'week' ? `Week of ${format(days[0], 'MMM do')}` : format(currentDate, 'EEEE, MMM do')}</span>
                 <button onClick={() => setCurrentDate(addDays(currentDate, viewMode === 'week' ? 7 : 1))} className="p-2 hover:bg-white/5 rounded-full text-text-m border border-white/5"><ChevronRight size={16} /></button>
              </div>
           </div>
           
           <div className="flex gap-4">
              <button 
                onClick={() => setIsAIModalOpen(true)}
                className="flex items-center gap-3 px-5 py-2 glass border border-accent/40 text-accent font-mono text-[10px] font-black uppercase tracking-widest hover:bg-accent/10 hover:border-accent transition-all rounded-lg accent-glow-soft group"
              >
                <Sparkles size={14} className="group-hover:animate-pulse" /> AI Scheduler
              </button>
              <button 
                onClick={() => setIsTemplateModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 glass border border-cyan/30 text-cyan font-mono text-[10px] font-black uppercase tracking-widest hover:bg-cyan/10 transition-all rounded-lg"
              >
                <LayoutGrid size={14} /> Templates
              </button>
              <button 
                onClick={() => { setBlockForm({ startTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"), endTime: format(addHours(new Date(), 1), "yyyy-MM-dd'T'HH:mm"), type: 'task' }); setIsBlockModalOpen(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-accent text-white font-mono text-[10px] font-black uppercase tracking-widest hover:bg-red-600 transition-all rounded-lg accent-glow shadow-xl"
              >
                <Plus size={14} /> Add Block
              </button>
           </div>
        </div>

        <div className="relative glass rounded-3xl border border-white/5 overflow-hidden bg-black/20 flex min-h-[600px]">
           <AnimatePresence>
             {isGenerating && (
               <motion.div 
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 exit={{ opacity: 0 }}
                 className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-md"
               >
                  <div className="relative w-48 h-48">
                     <motion.div animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }} className="absolute inset-0 border-t-2 border-cyan rounded-full shadow-[0_0_20px_rgba(0,217,255,0.2)]" />
                     <motion.div animate={{ rotate: -360 }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }} className="absolute inset-4 border-b-2 border-accent rounded-full shadow-[0_0_20px_rgba(255,51,102,0.2)]" />
                     <div className="absolute inset-0 flex items-center justify-center">
                        <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }}>
                          <Sparkles className="text-cyan fill-cyan/20" size={48} />
                        </motion.div>
                     </div>
                  </div>
                  <div className="mt-12 text-center space-y-4">
                    <p className="text-cyan font-mono text-xs tracking-[0.8em] font-black animate-pulse">NEURAL_SYNC_IN_PROGRESS</p>
                    <p className="text-text-m font-mono text-[10px] uppercase opacity-50 tracking-[0.3em] font-black">{generationStep}</p>
                  </div>
               </motion.div>
             )}
           </AnimatePresence>
           <div className="w-20 bg-background-nested/50 border-r border-white/5 pt-12 shrink-0">
              {hours.map(hour => (
                <div key={hour} className="h-24 px-4 flex flex-col justify-start border-b border-white/5 relative">
                   <span className="text-[10px] font-mono text-text-m opacity-50 relative top-[-6px]">{hour}:00</span>
                </div>
              ))}
           </div>

           <div className="flex-1 overflow-x-auto custom-scrollbar">
             <div className="flex divide-x divide-white/5 min-w-full">
                {days.map(day => {
                  const dayStr = format(day, 'yyyy-MM-dd');
                  const dayBlocks = timeBlocks.filter(b => b.startTime.startsWith(dayStr));
                  const isToday = isSameDay(day, new Date());
                  
                  return (
                    <div key={day.toISOString()} className={cn("flex-1 min-w-[200px] relative h-[1824px] group/day", isToday && "bg-accent/5")}>
                       {hours.map(hour => (
                         <div key={hour} className="h-24 border-b border-white/5 relative">
                            <div className="absolute inset-0 bg-white/2 opacity-0 group-hover/day:opacity-100 transition-opacity" />
                         </div>
                       ))}
                       {dayBlocks.map(block => {
                         const start = parseISO(block.startTime);
                         const end = parseISO(block.endTime);
                         const top = ((start.getHours() - 5) * 60 + start.getMinutes()) * 1.6;
                         const height = differenceInMinutes(end, start) * 1.6;
                         
                         const typeColors = {
                            task: 'border-warning bg-warning/10 text-warning',
                            event: 'border-cyan bg-cyan/10 text-cyan',
                            break: 'border-success bg-success/10 text-success',
                            routine: 'border-accent bg-accent/10 text-accent'
                         };

                         return (
                           <motion.div 
                             key={block.id}
                             whileHover={{ scale: 1.02, zIndex: 10 }}
                             onClick={() => { setBlockForm(block); setIsBlockModalOpen(true); }}
                             className={cn(
                                "absolute left-2 right-2 rounded-xl border-t-4 p-3 glass flex flex-col justify-between overflow-hidden cursor-pointer",
                                typeColors[block.type] || typeColors.task
                             )}
                             style={{ top: `${top}px`, height: `${height}px` }}
                           >
                              <div className="space-y-1">
                                 <p className="text-[8px] font-mono uppercase font-black tracking-widest opacity-60">{block.type}</p>
                                 <p className="text-xs font-bold leading-tight uppercase font-serif italic truncate">{block.title}</p>
                              </div>
                              <div className="flex justify-between items-center mt-2">
                                 <span className="text-[8px] font-mono opacity-50">{format(start, 'HH:mm')}</span>
                                 <button onClick={(e) => { e.stopPropagation(); deleteTimeBlock(block.id); }} className="hover:text-danger p-1"><Trash2 size={10} /></button>
                              </div>
                           </motion.div>
                         );
                       })}
                    </div>
                  );
                })}
             </div>
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 min-h-[800px]">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
           <div className="flex items-center gap-3 mb-2">
              <Calendar className="text-accent" size={20} />
              <span className="text-[10px] font-mono text-accent uppercase tracking-[0.5em] font-black">Temporal_Synchronization_Hub</span>
           </div>
           <h2 className="text-5xl font-serif font-black text-white uppercase italic tracking-widest text-glow-white">SCHEDULER</h2>
        </div>
        <div className="flex gap-4">
           <div className="glass p-4 rounded-xl border border-white/10 flex items-center gap-3">
              <Flame className="text-warning" size={20} />
              <div>
                 <p className="text-[8px] font-mono text-text-m uppercase">Streak Stability</p>
                 <p className="text-lg font-mono font-black text-white">{stats?.currentStreak} DAY_CHAIN</p>
              </div>
           </div>
           <div className="glass p-4 rounded-xl border border-white/10 flex items-center gap-3 px-6">
              <Zap className="text-cyan" size={20} />
              <div>
                 <p className="text-[8px] font-mono text-text-m uppercase">Protocol Efficiency</p>
                 <p className="text-lg font-mono font-black text-white">96%</p>
              </div>
           </div>
        </div>
      </header>

      {viewMode === 'month' && renderMonthView()}
      {viewMode === 'week' && renderTimetableView(eachDayOfInterval({ start: startOfWeek(currentDate), end: endOfWeek(currentDate) }))}
      {viewMode === 'day' && renderTimetableView([currentDate])}

      <AnimatePresence>
        {isAIModalOpen && (
          <AITimetableModal 
            isOpen={isAIModalOpen} 
            onClose={() => setIsAIModalOpen(false)} 
            onGenerate={generateAITimetable} 
            initialRoutine={settings?.aiRoutine || ['School', 'Tuition', 'Dinner']}
            onUpdateRoutine={(newRoutine) => onUpdateSettings({ aiRoutine: newRoutine })}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isTemplateModalOpen && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-background/90 backdrop-blur-xl" onClick={() => setIsTemplateModalOpen(false)}>
             <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="glass max-w-xl w-full p-8 rounded-3xl border border-white/10 space-y-6" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center border-b border-white/5 pb-4"><h3 className="text-2xl font-serif font-black text-white italic uppercase tracking-widest">Select Protocol Template</h3><button onClick={() => setIsTemplateModalOpen(false)} className="text-text-m hover:text-white"><X /></button></div>
                <div className="grid grid-cols-1 gap-4">
                   {TEMPLATES.map(t => (
                     <button key={t.id} onClick={() => { applyTemplate(t.id, currentDate); setIsTemplateModalOpen(false); }} className="glass p-6 rounded-2xl border border-white/5 hover:border-accent/40 bg-white/2 hover:bg-accent/5 flex items-center justify-between text-left group transition-all">
                        <div className="flex items-center gap-6"><span className="text-4xl group-hover:scale-125 transition-transform">{t.icon}</span><div><p className="text-xl font-serif font-black text-white uppercase italic tracking-widest">{t.label}</p><p className="text-[10px] font-mono text-text-m uppercase opacity-50 mt-1">{t.blocks.length} Scheduled Blocks</p></div></div>
                        <ChevronRight className="text-text-m group-hover:text-accent group-hover:translate-x-2 transition-all" />
                     </button>
                   ))}
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
         {isBlockModalOpen && (
           <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-background/90 backdrop-blur-xl" onClick={() => setIsBlockModalOpen(false)}>
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} className="glass max-w-md w-full p-8 rounded-3xl border border-white/10 space-y-6" onClick={e => e.stopPropagation()}>
                 <h3 className="text-2xl font-serif font-black text-white italic uppercase tracking-widest">Initialize Time Block</h3>
                 <div className="space-y-4">
                    <div className="space-y-2"><label className="text-[10px] font-mono text-text-m uppercase">Block Title</label><input type="text" value={blockForm.title || ''} onChange={e => setBlockForm({...blockForm, title: e.target.value})} className="w-full bg-background-nested p-3 rounded-lg border border-white/10 text-white font-mono outline-none focus:border-accent" placeholder="Deep work session..." /></div>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-2"><label className="text-[10px] font-mono text-text-m uppercase">Start Time</label><input type="datetime-local" value={blockForm.startTime || ''} onChange={e => setBlockForm({...blockForm, startTime: e.target.value})} className="w-full bg-background-nested p-3 rounded-lg border border-white/10 text-white font-mono outline-none" /></div>
                       <div className="space-y-2"><label className="text-[10px] font-mono text-text-m uppercase">End Time</label><input type="datetime-local" value={blockForm.endTime || ''} onChange={e => setBlockForm({...blockForm, endTime: e.target.value})} className="w-full bg-background-nested p-3 rounded-lg border border-white/10 text-white font-mono outline-none" /></div>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-mono text-text-m uppercase tracking-widest">Activity Type</label>
                       <div className="grid grid-cols-4 gap-2">
                          {(['task', 'event', 'break', 'routine'] as const).map(type => (
                            <button key={type} onClick={() => setBlockForm({...blockForm, type})} className={cn("py-2 rounded-lg border text-[10px] font-mono font-black uppercase transition-all", blockForm.type === type ? "bg-accent border-accent text-white" : "border-white/10 text-text-m hover:bg-white/5")}>{type}</button>
                          ))}
                       </div>
                    </div>
                 </div>
                 <div className="flex gap-4 pt-4">
                    <button onClick={() => setIsBlockModalOpen(false)} className="flex-1 py-4 glass border border-white/10 text-text-m font-mono font-black uppercase rounded-xl hover:bg-white/5">Cancel</button>
                    <button onClick={() => { if (blockForm.id) { updateTimeBlock(blockForm.id, blockForm); } else { addTimeBlock(blockForm as any); } setIsBlockModalOpen(true); }} className="flex-1 py-4 bg-accent text-white font-mono font-black uppercase rounded-xl accent-glow">{blockForm.id ? 'Update Sync' : 'Initialize'}</button>
                 </div>
              </motion.div>
           </div>
         )}
      </AnimatePresence>
    </div>
  );
}

function TipTapEditor({ 
  content, 
  onChange, 
  onWordCountChange, 
  readOnly = false 
}: { 
  content: string, 
  onChange: (html: string) => void, 
  onWordCountChange: (count: number) => void,
  readOnly?: boolean
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      TextStyle,
      Color,
    ],
    content,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const text = editor.getText();
      const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
      onChange(html);
      onWordCountChange(wordCount);
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div className={cn(
      "border border-white/10 rounded-2xl overflow-hidden premium-transition shadow-inner",
      readOnly ? "bg-black/20" : "bg-black/40 focus-within:ring-2 focus-within:ring-cyan/30"
    )}>
      {!readOnly && (
        <div className="flex flex-wrap gap-1 p-2 bg-white/5 border-b border-white/10 sticky top-0 z-10 backdrop-blur-md">
          <button onClick={() => editor.chain().focus().toggleBold().run()} className={cn("p-2 rounded-lg hover:bg-white/10 transition-colors", editor.isActive('bold') ? "text-cyan bg-cyan/5" : "text-text-m")} title="BOLD"><Bold size={16} /></button>
          <button onClick={() => editor.chain().focus().toggleItalic().run()} className={cn("p-2 rounded-lg hover:bg-white/10 transition-colors", editor.isActive('italic') ? "text-cyan bg-cyan/5" : "text-text-m")} title="ITALIC"><Italic size={16} /></button>
          <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={cn("p-2 rounded-lg hover:bg-white/10 transition-colors", editor.isActive('underline') ? "text-cyan bg-cyan/5" : "text-text-m")} title="UNDERLINE"><UnderlineIcon size={16} /></button>
          <div className="w-px h-4 bg-white/10 mx-1 self-center" />
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={cn("p-2 rounded-lg hover:bg-white/10 transition-colors", editor.isActive('heading', { level: 1 }) ? "text-cyan bg-cyan/5" : "text-text-m")} title="H1"><Heading1 size={16} /></button>
          <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={cn("p-2 rounded-lg hover:bg-white/10 transition-colors", editor.isActive('heading', { level: 2 }) ? "text-cyan bg-cyan/5" : "text-text-m")} title="H2"><Heading2 size={16} /></button>
          <div className="w-px h-4 bg-white/10 mx-1 self-center" />
          <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={cn("p-2 rounded-lg hover:bg-white/10 transition-colors", editor.isActive('bulletList') ? "text-cyan bg-cyan/5" : "text-text-m")} title="BULLET_LIST"><List size={16} /></button>
          <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={cn("p-2 rounded-lg hover:bg-white/10 transition-colors", editor.isActive('orderedList') ? "text-cyan bg-cyan/5" : "text-text-m")} title="NUMBERED_LIST"><ListOrdered size={16} /></button>
          <div className="w-px h-4 bg-white/10 mx-1 self-center" />
          <button 
            onClick={() => {
              const url = window.prompt('URL');
              if (url) editor.chain().focus().setLink({ href: url }).run();
            }} 
            className={cn("p-2 rounded-lg hover:bg-white/10 transition-colors", editor.isActive('link') ? "text-cyan bg-cyan/5" : "text-text-m")} 
            title="LINK"
          >
            <LinkIcon size={16} />
          </button>
          <button onClick={() => editor.chain().focus().setColor('#00d9ff').run()} className="p-2 rounded-lg hover:bg-white/10 text-cyan/70 hover:text-cyan" title="COLOR_CYAN"><Palette size={16} /></button>
          <button onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} className="p-2 rounded-lg hover:bg-white/10 text-text-m" title="CLEAR_FORMAT"><Type size={16} /></button>
        </div>
      )}
      <div className="p-6">
        <EditorContent editor={editor} className={cn(
          "prose prose-invert max-w-none focus:outline-none min-h-[400px] journal-editor font-sans leading-relaxed",
          readOnly ? "cursor-default" : "cursor-text"
        )} />
      </div>
    </div>
  );
}

function JournalView({ journals, user, onAddXP, stats }: { journals: JournalEntry[]; user: User; onAddXP: (amount: number, source: string, meta?: any) => void; stats: UserStats | null }) {
  const [activeSubTab, setActiveSubTab] = useState<'entry' | 'history' | 'insights'>('entry');
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<JournalEntry['mood']>('happy');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState(() => REFLECTION_PROMPTS[Math.floor(Math.random() * REFLECTION_PROMPTS.length)]);
  const [usePrompt, setUsePrompt] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());
  const [wordCount, setWordCount] = useState(0);

  // Find existing entry for today
  useEffect(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const todayEntry = journals.find(j => j.createdAt.startsWith(todayStr));
    if (todayEntry) {
      setContent(todayEntry.content);
      setMood(todayEntry.mood);
      setSelectedTags(todayEntry.tags || []);
      setWordCount(todayEntry.wordCount || 0);
    }
  }, [journals]);

  const addEntry = async () => {
    if (!content.trim() || content === '<p></p>') return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const todayEntry = journals.find(j => j.createdAt.startsWith(today));
      
      const wordBonus = Math.floor(wordCount / XP_MAP.JOURNAL_WORD_RATE);
      const moodBonus = XP_MAP.JOURNAL_MOOD_BONUS;
      const promptBonus = usePrompt ? XP_MAP.JOURNAL_PROMPT_BONUS : 0;
      
      let consistencyBonus = 0;
      let newStreak = (stats?.journalStreak || 0);
      
      // Calculate streak and first-entry-of-day bonuses
      if (!todayEntry) {
        newStreak += 1;
        consistencyBonus = newStreak * XP_MAP.STREAK_BONUS_PER_DAY;
        
        // Base XP only for first entry of the day
        let totalXP = XP_MAP.JOURNAL_BASE + wordBonus + moodBonus + consistencyBonus + promptBonus;
        if (wordCount >= 1000) totalXP = Math.round(totalXP * XP_MAP.JOURNAL_LONG_FORM_MULT);
        onAddXP(totalXP, 'NEURAL_INGEST_COMPLETE', { wordCount });
      } else {
        // Just sub-xp for words if editing
        const extraWords = wordCount - (todayEntry.wordCount || 0);
        if (extraWords > 0) {
          onAddXP(Math.floor(extraWords / XP_MAP.JOURNAL_WORD_RATE), 'WORDS_APPENDED');
        }
      }

      const journalData = {
        userId: user.uid,
        content,
        mood,
        tags: selectedTags,
        createdAt: new Date().toISOString(),
        isReflection: usePrompt,
        wordCount,
        promptId: usePrompt ? currentPrompt : undefined
      };

      const { writeBatch } = await import('firebase/firestore');
      const batch = writeBatch(db);

      if (todayEntry) {
        batch.update(doc(db, 'journals', todayEntry.id), journalData);
      } else {
        const newJournalRef = doc(collection(db, 'journals'));
        batch.set(newJournalRef, journalData);
      }
      
      const statsRef = doc(db, 'user_stats', user.uid);
      batch.update(statsRef, { 
        totalWordsWritten: (stats?.totalWordsWritten || 0) + (todayEntry ? (wordCount - todayEntry.wordCount) : wordCount),
        journalStreak: newStreak,
        lastJournalDate: today,
        reflectionPromptsAnswered: (stats?.reflectionPromptsAnswered || 0) + (usePrompt && !todayEntry?.isReflection ? 1 : 0)
      });

      await batch.commit();

      if (!todayEntry) {
        setContent('');
        setSelectedTags([]);
        setUsePrompt(false);
        setCurrentPrompt(REFLECTION_PROMPTS[Math.floor(Math.random() * REFLECTION_PROMPTS.length)]);
      }
      
      // Visual feedback
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#00d9ff', '#ff0055', '#ffffff']
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'journals');
    }
  };

  const potentialXP = XP_MAP.JOURNAL_BASE + Math.floor(wordCount / XP_MAP.JOURNAL_WORD_RATE) + XP_MAP.JOURNAL_MOOD_BONUS + (usePrompt ? XP_MAP.JOURNAL_PROMPT_BONUS : 0);

  // Stats for the sidebar
  const totalEntries = journals.length;
  const totalWordsWritten = journals.reduce((acc, j) => acc + (j.wordCount || 0), 0);
  const avgEntryLength = totalEntries > 0 ? Math.round(totalWordsWritten / totalEntries) : 0;
  
  const moodCounts = journals.reduce((acc, j) => { acc[j.mood] = (acc[j.mood] || 0) + 1; return acc; }, {} as any);
  const topMoodId = Object.entries(moodCounts).sort((a,b) => (b[1] as number) - (a[1] as number))[0]?.[0] as JournalEntry['mood'];
  const topMood = MOODS.find(m => m.id === topMoodId);

  const hourlyCounts = journals.reduce((acc, j) => {
    const hour = new Date(j.createdAt).getHours();
    acc[hour] = (acc[hour] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);
  const peakHour = Object.entries(hourlyCounts).sort((a,b) => (b[1] as number) - (a[1] as number))[0]?.[0];
  const peakTimeStr = peakHour ? `${peakHour}:00` : 'N/A';

  const renderInsights = () => {
    const last7Days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), i)).reverse();
    const moodData = last7Days.map(date => {
      const entry = journals.find(j => isSameDay(new Date(j.createdAt), date));
      const moodValue = entry ? { ecstatic: 5, happy: 4, neutral: 3, worried: 2, sad: 1 }[entry.mood] : null;
      return {
        date: format(date, 'MMM dd'),
        mood: moodValue,
        words: entry?.wordCount || 0
      };
    });

    const frequencyData = [
      { name: 'Mon', count: journals.filter(j => new Date(j.createdAt).getDay() === 1).length },
      { name: 'Tue', count: journals.filter(j => new Date(j.createdAt).getDay() === 2).length },
      { name: 'Wed', count: journals.filter(j => new Date(j.createdAt).getDay() === 3).length },
      { name: 'Thu', count: journals.filter(j => new Date(j.createdAt).getDay() === 4).length },
      { name: 'Fri', count: journals.filter(j => new Date(j.createdAt).getDay() === 5).length },
      { name: 'Sat', count: journals.filter(j => new Date(j.createdAt).getDay() === 6).length },
      { name: 'Sun', count: journals.filter(j => new Date(j.createdAt).getDay() === 0).length },
    ];

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <div className="glass p-8 rounded-3xl border border-white/5 bg-black/40">
              <h3 className="text-xl font-serif font-black text-text-p uppercase italic tracking-widest mb-6 border-l-4 border-cyan pl-4">Mood_Stability_Graph</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                   <ReBarChart data={moodData}>
                      <XAxis dataKey="date" stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                      <ReTooltip 
                        contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                        itemStyle={{ color: '#00d9ff', fontSize: '12px', fontWeight: 'bold' }}
                      />
                      <Bar dataKey="mood" radius={[4, 4, 0, 0]}>
                        {moodData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.mood && entry.mood >= 4 ? '#00ffaa' : entry.mood === 3 ? '#999' : '#ff0055'} />
                        ))}
                      </Bar>
                   </ReBarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] font-mono text-text-m text-center mt-4 opacity-50 uppercase tracking-widest">7_DAY_STABILITY_CORRELATION</p>
           </div>

           <div className="glass p-8 rounded-3xl border border-white/5 bg-black/40">
              <h3 className="text-xl font-serif font-black text-text-p uppercase italic tracking-widest mb-6 border-l-4 border-accent pl-4">Word_Density_Trends</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                   <ReBarChart data={moodData}>
                      <XAxis dataKey="date" stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                      <ReTooltip 
                        contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                        itemStyle={{ color: '#fff', fontSize: '12px' }}
                      />
                      <Bar dataKey="words" fill="url(#colorWords)" radius={[4, 4, 0, 0]} />
                      <defs>
                        <linearGradient id="colorWords" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ff0055" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#ff0055" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                   </ReBarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] font-mono text-text-m text-center mt-4 opacity-50 uppercase tracking-widest">LEXICAL_OUTPUT_ANALYSIS</p>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
           <div className="glass p-8 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center space-y-4">
              <Award className="text-warning animate-bounce" size={40} />
              <div>
                 <p className="text-[10px] font-mono text-text-m uppercase tracking-[0.2em] mb-1">Top_Mood_Archetype</p>
                 <p className="text-2xl font-serif font-black text-white italic uppercase tracking-widest">{topMood?.label || 'UNDEFINED'}</p>
                 <span className="text-4xl mt-2 block">{topMood?.emoji}</span>
              </div>
           </div>

           <div className="md:col-span-2 glass p-8 rounded-3xl border border-white/5">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-serif font-black text-text-p uppercase italic tracking-widest">Temporal_Frequency</h3>
                <div className="flex gap-2">
                   <span className="text-[10px] font-mono text-success bg-success/10 px-2 py-1 rounded">CONSISTENCY_HIGH</span>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-4">
                 {frequencyData.map((d, i) => (
                   <div key={i} className="flex flex-col items-center gap-3">
                      <div className="w-full h-32 bg-white/5 rounded-xl flex items-end overflow-hidden relative">
                         <motion.div 
                          initial={{ height: 0 }}
                          animate={{ height: `${(d.count / (Math.max(...frequencyData.map(fd => fd.count)) || 1)) * 100}%` }}
                          className="w-full bg-accent opacity-60 hover:opacity-100 transition-opacity"
                         />
                      </div>
                      <span className="text-[10px] font-mono text-text-m uppercase">{d.name}</span>
                   </div>
                 ))}
              </div>
           </div>
        </div>
        
        <div className="glass p-8 rounded-3xl border border-white/5 bg-cyan/5 border-cyan/20">
           <div className="flex items-center gap-4 mb-4">
              <Sparkles className="text-cyan animate-pulse" size={24} />
              <h3 className="text-xl font-serif font-black text-cyan uppercase italic tracking-widest">Diagnostic_Insights</h3>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                 <p className="text-sm font-mono text-text-p leading-relaxed">
                   <strong className="text-cyan">[ADVISORY]</strong> Your lexical density is 24% higher on <span className="text-accent font-black italic">FRIDAYS</span>. This correlates with high mood stability and focused productivity blocks.
                 </p>
                 <p className="text-sm font-mono text-text-p leading-relaxed">
                   <strong className="text-cyan">[DIAGNOSTIC]</strong> 80% of your <span className="text-success font-black italic">ECSTATIC</span> entries occur between 09:00 and 11:00 UTC. Consider shifting complex refactoring tasks to this window.
                 </p>
              </div>
              <div className="space-y-4">
                 <p className="text-sm font-mono text-text-p leading-relaxed">
                   <strong className="text-warning">[TREND]</strong> Neural archive streak is at <span className="text-warning font-black italic">{stats?.journalStreak || 0} cycles</span>. Reach 7 for the 'CONSISTENCY_ARCHITECT' achievement.
                 </p>
                 <p className="text-sm font-mono text-text-p leading-relaxed">
                   <strong className="text-cyan">[SYNCH]</strong> Most written themes: <span className="text-text-m italic">{journals.flatMap(j => j.tags || []).slice(0, 5).join(', ') || 'N/A'}</span>.
                 </p>
              </div>
           </div>
        </div>
      </div>
    );
  };

  const renderHistory = () => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {journals.map((entry) => {
          const entryMood = MOODS.find(m => m.id === entry.mood);
          return (
            <motion.div 
              key={entry.id}
              whileHover={{ y: -5, scale: 1.02 }}
              onClick={() => { setViewDate(new Date(entry.createdAt)); setContent(entry.content); setMood(entry.mood); setSelectedTags(entry.tags || []); setActiveSubTab('entry'); }}
              className="glass p-6 rounded-2xl border border-white/5 bg-black/40 cursor-pointer premium-transition hover:border-cyan/30 group"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-[10px] font-mono text-text-m uppercase opacity-50">{format(new Date(entry.createdAt), 'EEEE')}</p>
                  <p className="text-sm font-mono font-black text-white uppercase italic tracking-widest">{format(new Date(entry.createdAt), 'MMM dd, yyyy')}</p>
                </div>
                <span className="text-2xl group-hover:scale-125 transition-transform duration-300">{entryMood?.emoji}</span>
              </div>
              <div className="prose prose-invert prose-xs line-clamp-3 text-text-m h-16 mb-4" dangerouslySetInnerHTML={{ __html: entry.content }} />
              <div className="flex flex-wrap gap-2">
                {entry.tags?.map(t => (
                  <span key={t} className="text-[8px] font-mono text-cyan bg-cyan/10 px-1.5 py-0.5 rounded border border-cyan/20">#{t.toUpperCase()}</span>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-center">
                 <span className="text-[8px] font-mono text-text-m opacity-50 uppercase">{entry.wordCount || 0} WORDS</span>
                 <Maximize2 size={12} className="text-text-m opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </motion.div>
          );
        })}
        {journals.length === 0 && (
          <div className="col-span-full py-20 text-center opacity-40 glass rounded-3xl border border-dashed border-white/10">
             <Book size={48} className="mx-auto mb-4 text-text-m" />
             <p className="font-mono text-sm uppercase tracking-widest">Archive_Matrix_Empty</p>
             <p className="text-xs font-mono mt-2 italic px-8 max-w-md mx-auto">No neural logs found in the archives. Initialize your first log to begin synchronization process.</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8 min-h-[800px] pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-white/5 pb-8">
        <div>
           <div className="flex items-center gap-3 mb-3">
              <Book className="text-accent" size={24} />
              <span className="text-[10px] font-mono text-accent uppercase tracking-[0.5em] font-black">Neural_Archive_Systems</span>
           </div>
           <h2 className="text-5xl font-serif font-black text-white uppercase italic tracking-widest text-glow-white">Journal</h2>
        </div>
        
        <div className="flex glass p-1.5 rounded-xl border border-white/10 bg-black/40 shadow-2xl">
           {(['entry', 'history', 'insights'] as const).map(tab => (
             <button 
               key={tab} 
               onClick={() => setActiveSubTab(tab)}
               className={cn(
                 "px-6 py-2.5 rounded-lg text-xs font-mono font-black uppercase tracking-widest transition-all relative overflow-hidden",
                 activeSubTab === tab ? "bg-accent text-white accent-glow" : "text-text-m hover:text-white hover:bg-white/5"
               )}
             >
               {tab}
             </button>
           ))}
        </div>
      </header>

      {activeSubTab === 'entry' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 animate-in fade-in slide-in-from-left-4 duration-500">
           <div className="lg:col-span-3 space-y-6">
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 glass rounded-xl border border-cyan/30 flex items-center justify-center">
                       <Clock className="text-cyan" size={20} />
                    </div>
                    <div>
                       <p className="text-[10px] font-mono text-text-m uppercase opacity-50">Session_Synchronization</p>
                       <p className="text-lg font-mono font-black text-white uppercase italic">{format(viewDate, 'EEEE, MMM do')}</p>
                    </div>
                 </div>
                 
                 <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                       <p className="text-[8px] font-mono text-text-m uppercase">Potential_Gain</p>
                       <p className="text-sm font-mono font-black text-success">+{potentialXP} XP</p>
                    </div>
                    <button 
                      onClick={addEntry}
                      className="px-8 py-4 bg-accent text-white font-mono font-black uppercase tracking-widest rounded-xl accent-glow hover:bg-red-600 transition-all shadow-2xl"
                    >
                      Sync_to_Archive
                    </button>
                 </div>
              </div>

              {/* Prompt Engine */}
              <motion.div 
                layout
                className={cn(
                  "glass p-8 rounded-3xl border transition-all duration-500 relative overflow-hidden",
                  usePrompt ? "border-cyan/40 bg-cyan/5" : "border-white/5"
                )}
              >
                 <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                       <div className="p-2 glass rounded-lg border border-cyan/20">
                          <Sparkles className={cn(usePrompt ? "text-cyan animate-pulse" : "text-text-m")} size={16} />
                       </div>
                       <span className="text-[10px] font-mono text-text-m uppercase tracking-widest">Protocol_Reflection_Prompt</span>
                    </div>
                    <div className="flex items-center gap-4">
                      {usePrompt && <span className="text-[10px] font-mono text-success font-black uppercase">+25 XP_BOOST</span>}
                      <button 
                        onClick={() => setUsePrompt(!usePrompt)}
                        className={cn("px-3 py-1 rounded-full text-[10px] font-mono font-black uppercase border transition-all", 
                          usePrompt ? "bg-cyan border-cyan text-black" : "border-white/10 text-text-m hover:border-cyan/30 hover:text-cyan")}
                      >
                         {usePrompt ? 'ACTIVE' : 'INITIALIZE'}
                      </button>
                    </div>
                 </div>
                 <AnimatePresence mode="wait">
                   {usePrompt && (
                     <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="pt-4 overflow-hidden">
                        <p className="text-2xl font-serif font-black text-white italic leading-relaxed border-l-4 border-cyan pl-6">{currentPrompt}</p>
                        <button 
                          onClick={() => setCurrentPrompt(REFLECTION_PROMPTS[Math.floor(Math.random() * REFLECTION_PROMPTS.length)])}
                          className="mt-6 flex items-center gap-2 text-[10px] font-mono text-cyan hover:text-white transition-colors"
                        >
                          <Activity size={12} /> ROTATE_PROMPT
                        </button>
                     </motion.div>
                   )}
                 </AnimatePresence>
                 {!usePrompt && <p className="text-sm font-mono text-text-m opacity-50 italic">Reflection prompts provide deeper introspection and +25 XP synchronization bonus.</p>}
              </motion.div>

              <TipTapEditor 
                content={content} 
                onChange={setContent} 
                onWordCountChange={setWordCount}
                readOnly={!isSameDay(viewDate, new Date())}
              />

              <div className="flex justify-between items-center glass p-4 rounded-xl border border-white/5 px-6">
                 <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                       <Type size={14} className="text-text-m" />
                       <span className="text-xs font-mono font-black text-text-p uppercase italic tracking-widest">{wordCount} WORDS</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <TrendingUp size={14} className="text-success" />
                       <span className="text-xs font-mono text-success font-black">+{Math.floor(wordCount / 50)} BONUS_XP</span>
                    </div>
                 </div>
                 <div className="flex items-center gap-2 text-[10px] font-mono text-text-m opacity-40 uppercase tracking-[0.2em]">
                    <div className="w-2 h-2 rounded-full bg-cyan animate-ping mr-2" />
                    Archive_Stream_Active
                 </div>
              </div>
           </div>

           <aside className="space-y-8">
              <div className="glass p-8 rounded-3xl border border-white/5 space-y-8 bg-black/40">
                 <div>
                    <label className="text-[10px] font-mono text-text-m uppercase tracking-[0.3em] font-black border-l-2 border-accent pl-3 mb-6 block">Mood_Index</label>
                    <div className="grid grid-cols-5 gap-2">
                       {MOODS.map((m) => (
                         <button 
                           key={m.id}
                           onClick={() => setMood(m.id as any)}
                           className={cn(
                             "aspect-square flex flex-col items-center justify-center rounded-xl border transition-all hover:scale-110",
                             mood === m.id ? "bg-accent/10 border-accent text-white scale-110 shadow-lg accent-glow" : "border-white/5 text-text-s grayscale hover:grayscale-0"
                           )}
                           title={m.label}
                         >
                           <span className="text-2xl mb-1">{m.emoji}</span>
                         </button>
                       ))}
                    </div>
                    {mood && <p className="text-[10px] font-mono text-accent text-center mt-4 uppercase font-black tracking-widest">STATE: {mood.toUpperCase()}</p>}
                 </div>

                 <div>
                    <label className="text-[10px] font-mono text-text-m uppercase tracking-[0.3em] font-black border-l-2 border-success pl-3 mb-6 block">Neural_Tags</label>
                    <div className="flex flex-wrap gap-2">
                       {MOOD_TAGS.map(tag => (
                         <button 
                           key={tag}
                           onClick={() => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                           className={cn(
                             "px-3 py-1.5 rounded-lg border text-[10px] font-mono font-black uppercase transition-all",
                             selectedTags.includes(tag) ? "bg-success text-black border-success" : "border-white/10 text-text-m hover:border-success/30 hover:text-success"
                           )}
                         >
                           #{tag}
                         </button>
                       ))}
                    </div>
                 </div>

                 <div className="pt-8 border-t border-white/5">
                    <label className="text-[10px] font-mono text-text-m uppercase tracking-[0.3em] font-black border-l-2 border-warning pl-3 mb-6 block">Archive_Stats</label>
                    <div className="space-y-4">
                       <div className="flex justify-between items-center glass p-3 rounded-xl border border-white/5 hover:bg-white/2 transition-colors">
                          <span className="text-[10px] font-mono text-text-m uppercase">Total_Words</span>
                          <span className="text-sm font-mono font-black text-white">{(totalWordsWritten / 1000).toFixed(1)}K</span>
                       </div>
                       <div className="flex justify-between items-center glass p-3 rounded-xl border border-white/5 hover:bg-white/2 transition-colors">
                          <span className="text-[10px] font-mono text-text-m uppercase">Avg_Recall</span>
                          <span className="text-sm font-mono font-black text-white">{avgEntryLength} W/Entry</span>
                       </div>
                       <div className="flex justify-between items-center glass p-3 rounded-xl border border-white/5 hover:bg-white/2 transition-colors">
                          <span className="text-[10px] font-mono text-text-m uppercase">Peak_Sync_Time</span>
                          <span className="text-sm font-mono font-black text-white">{peakTimeStr}</span>
                       </div>
                       <div className="flex justify-between items-center glass p-3 rounded-xl border border-white/5 hover:bg-white/2 transition-colors">
                          <span className="text-[10px] font-mono text-text-m uppercase">Journal_Streak</span>
                          <span className="text-sm font-mono font-black text-warning flex items-center gap-1"><Flame size={12} fill="currentColor" /> {stats?.journalStreak || 0}d</span>
                       </div>
                    </div>
                 </div>
              </div>

              <div className="glass p-8 rounded-3xl border border-white/5 bg-accent/5 border-accent/20">
                 <div className="flex items-center gap-3 mb-4">
                    <Trophy className="text-warning" size={20} />
                    <span className="text-[10px] font-mono text-white uppercase font-black tracking-widest">Next_Achievement</span>
                 </div>
                 <p className="text-xs font-serif italic text-white uppercase leading-relaxed mb-4">PROLIFIC_AUTHOR: Write 10K words total.</p>
                 <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden border border-white/10">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((totalWordsWritten / 10000) * 100, 100)}%` }}
                      className="h-full bg-warning shadow-[0_0_10px_rgba(255,170,0,0.5)]"
                    />
                 </div>
                 <div className="flex justify-between mt-2">
                    <span className="text-[8px] font-mono text-text-m uppercase">{totalWordsWritten} W</span>
                    <span className="text-[8px] font-mono text-text-m uppercase">10,000 W</span>
                 </div>
              </div>
           </aside>
        </div>
      )}

      {activeSubTab === 'history' && renderHistory()}
      {activeSubTab === 'insights' && renderInsights()}
    </div>
  );
}





function AchievementCard({ 
  achievement, 
  unlocked, 
  progress, 
  current,
  onClick, 
  viewMode 
}: { 
  achievement: Achievement; 
  unlocked: boolean; 
  progress: number; 
  current: number;
  onClick: () => void;
  viewMode: 'grid' | 'list';
}) {
  const rarityColors = {
    common: 'border-white/20 text-text-m',
    uncommon: 'border-blue-400 text-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.1)]',
    rare: 'border-purple-400 text-purple-400 shadow-[0_0_15px_rgba(167,139,250,0.2)]',
    legendary: 'border-warning text-warning shadow-[0_0_20px_rgba(255,215,0,0.3)]'
  };

  const rarityBorders = {
    common: 'border-white/20',
    uncommon: 'border-blue-400',
    rare: 'border-purple-400',
    legendary: 'border-warning'
  };

  if (viewMode === 'list') {
    return (
      <div 
        onClick={onClick}
        className={cn(
          "flex items-center gap-4 p-4 glass rounded-xl border-l-4 transition-all cursor-pointer hover:bg-white/5",
          unlocked ? `border-l-${achievement.rarity === 'common' ? 'white/20' : achievement.rarity === 'uncommon' ? 'blue-400' : achievement.rarity === 'rare' ? 'purple-400' : 'warning'}` : 'border-l-white/5 opacity-50'
        )}
      >
        <div className={cn("p-2 rounded bg-white/5", !unlocked && "grayscale")}>{achievement.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-black text-white uppercase">{achievement.title}</span>
            <span className={cn("text-[8px] px-1 border uppercase font-mono", rarityColors[achievement.rarity])}>{achievement.rarity}</span>
          </div>
          <p className="text-[10px] text-text-m truncate opacity-60">{achievement.description}</p>
          {!unlocked && achievement.requiredValue && (
            <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden w-full max-w-[200px]">
               <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-1">
          {unlocked ? (
            <span className="text-[10px] font-mono text-success uppercase font-black">EARNED</span>
          ) : (
            <span className="text-[10px] font-mono text-text-s uppercase">{current} / {achievement.requiredValue}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      whileHover={{ y: -5 }}
      onClick={onClick}
      className={cn(
        "glass p-6 rounded-xl border-t-4 flex flex-col items-center text-center relative overflow-hidden cursor-pointer group transition-all h-full",
        unlocked ? rarityBorders[achievement.rarity] : "border-t-white/5"
      )}
    >
      <CardDecoration />
      <div className={cn("mb-4 relative", !unlocked && "opacity-40 grayscale")}>
        <div className="p-4 bg-white/5 rounded-full group-hover:scale-110 transition-transform">{achievement.icon}</div>
        {achievement.category === 'hidden' && !unlocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-background rounded-full">
            <span className="text-xl font-mono text-text-m font-black">?</span>
          </div>
        )}
      </div>
      <h3 className={cn("text-xs font-mono font-black text-white uppercase mb-1 tracking-tight truncate w-full", !unlocked && "opacity-40")}>
        {achievement.category === 'hidden' && !unlocked ? '???' : achievement.title}
      </h3>
      <p className={cn("text-[9px] font-mono text-text-m mb-4 line-clamp-2 h-6", !unlocked ? "opacity-30" : "opacity-50")}>
        {achievement.category === 'hidden' && !unlocked ? 'REQUIREMENT_REDACTED' : achievement.description}
      </p>
      
      {!unlocked && achievement.requiredValue !== undefined && (
        <div className="w-full space-y-2 mt-2">
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden border border-white/5">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className="h-full bg-gradient-to-r from-accent/50 to-accent shadow-[0_0_8px_rgba(var(--color-accent),0.5)]" 
            />
          </div>
          <div className="flex justify-between items-center text-[8px] font-mono font-black tracking-tighter">
             <span className="text-accent underline decoration-accent/30 underline-offset-2">{Math.floor(progress)}%_STAGED</span>
             <span className="text-text-m opacity-80">{current.toLocaleString()} / {achievement.requiredValue.toLocaleString()}</span>
          </div>
        </div>
      )}

      {unlocked && (
        <div className="mt-auto pt-2">
           <span className={cn("text-[8px] font-mono font-black uppercase tracking-widest", rarityColors[achievement.rarity])}>{achievement.rarity}_PROTOCOL</span>
        </div>
      )}
    </motion.div>
  );
}

function AchievementDetail({ 
  achievement, 
  unlocked, 
  progress,
  current,
  onClose 
}: { 
  achievement: Achievement; 
  unlocked: boolean; 
  progress: number;
  current: number;
  onClose: () => void 
}) {
  const rarityColors = {
    common: 'text-text-m border-white/20 bg-white/5',
    uncommon: 'text-blue-400 border-blue-400/30 bg-blue-400/5',
    rare: 'text-purple-400 border-purple-400/30 bg-purple-400/5',
    legendary: 'text-warning border-warning/30 bg-warning/5 shadow-[0_0_20px_rgba(255,215,0,0.2)]'
  };

  const rarityBorders = {
    common: 'border-white/20',
    uncommon: 'border-blue-400',
    rare: 'border-purple-400',
    legendary: 'border-warning'
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
      />
      <motion.div 
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        className={cn(
          "relative max-w-md w-full glass p-8 rounded-3xl border-t-8 flex flex-col items-center text-center",
          unlocked ? rarityBorders[achievement.rarity] : 'border-white/10'
        )}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-text-m hover:text-white transition-colors"><X size={24} /></button>
        <CardDecoration />
        
        <div className="p-6 bg-white/5 rounded-full mb-6 relative">
           {achievement.icon}
           {unlocked && (
             <motion.div 
               animate={{ rotate: 360 }}
               transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
               className="absolute inset-0 border-2 border-dashed border-accent/30 rounded-full"
             />
           )}
        </div>

        <div className={cn("text-[10px] font-mono font-black uppercase px-3 py-1 rounded-full border mb-4", rarityColors[achievement.rarity])}>
          {achievement.rarity}_PROTOCOL
        </div>

        <h2 className="text-3xl font-serif font-black text-white uppercase italic tracking-tight mb-2">{achievement.title}</h2>
        <p className="text-text-m font-mono text-sm uppercase italic opacity-70 mb-8">{achievement.description}</p>

        <div className="w-full grid grid-cols-2 gap-4 mb-8">
           <div className="glass p-4 rounded-xl border border-white/5 bg-white/2">
              <p className="text-[10px] font-mono text-text-s uppercase mb-1">Status</p>
              <p className={cn("text-sm font-mono font-black uppercase", unlocked ? "text-success" : "text-text-m opacity-40")}>{unlocked ? 'SYNCED' : 'LOCKED'}</p>
           </div>
           <div className="glass p-4 rounded-xl border border-white/5 bg-white/2">
              <p className="text-[10px] font-mono text-text-s uppercase mb-1">XP_REWARD</p>
              <p className="text-sm font-mono font-black uppercase text-accent">+{achievement.xpReward} XP</p>
           </div>
        </div>

        {!unlocked && achievement.requiredValue && (
          <div className="w-full space-y-4">
             <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-mono uppercase text-text-m">
                   <span>UNLOCK_PROGRESS</span>
                   <span>{current} / {achievement.requiredValue} ({Math.floor(progress)}%)</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                   <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
                </div>
             </div>
             <p className="text-[10px] font-mono text-text-s uppercase italic opacity-50">
               "Est. Sync complete in ~{Math.ceil((achievement.requiredValue - current) / 2)} cycles"
             </p>
          </div>
        )}

        {unlocked && (
          <div className="text-[10px] font-mono text-text-s uppercase opacity-50 italic">
            "Archive recorded on {new Date().toLocaleDateString()} 12:44:00"
          </div>
        )}

        <button className="mt-8 w-full py-4 bg-accent text-white font-mono font-black uppercase tracking-[0.2em] hover:bg-accent/80 transition-all rounded-xl shadow-lg shadow-accent/20">SHARE_ACHIEVEMENT</button>
      </motion.div>
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "text-[10px] font-mono font-black uppercase tracking-widest px-4 py-2 transition-all",
        active ? "text-accent border-b-2 border-accent" : "text-text-m hover:text-text-p"
      )}
    >
      {children}
    </button>
  );
}

function EvolutionMetric({ 
  label, 
  current, 
  previous, 
  unit = "", 
  icon 
}: { 
  label: string; 
  current: number; 
  previous: number; 
  unit?: string; 
  icon: React.ReactNode 
}) {
  const isProgressed = current > previous;
  const isSame = current === previous;
  const diff = current - previous;
  const percent = previous > 0 ? Math.round((diff / previous) * 100) : (current > 0 ? 100 : 0);

  return (
    <div className="glass p-6 rounded-3xl border border-white/5 relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className={cn("p-2 rounded-lg bg-white/5", isProgressed ? "text-success" : "text-white/40")}>
             {icon}
          </div>
          <span className="text-[10px] font-mono text-text-m uppercase font-black tracking-widest">{label}</span>
        </div>
        
        <div className="flex items-end gap-3">
          <span className="text-4xl font-serif font-black text-white italic">{current}{unit}</span>
          <div className="pb-1">
            {isProgressed ? (
              <div className="flex items-center gap-1 text-success font-mono text-[10px] font-black uppercase">
                <TrendingUp size={12} /> +{percent}%
              </div>
            ) : (
              <div className="flex items-center gap-1 text-text-s font-mono text-[10px] font-black uppercase opacity-40">
                {isSame ? "0%" : `-${Math.abs(percent)}%`}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((current / (previous || 1)) * 50, 100)}%` }}
              className={cn("h-full rounded-full", isProgressed ? "bg-success" : "bg-white/20")}
            />
          </div>
          <p className="text-[9px] font-mono text-text-s uppercase opacity-40">
            {isProgressed ? "CORE_SYNC_IMPROVED_SINCE_LAST_MONTH" : "MAINTAINING_STABILITY_KEEP_PUSHING"}
          </p>
        </div>
      </div>
    </div>
  );
}

function StatsView({ stats, user, tasks, journals, timeBlocks }: { stats: UserStats | null; user: User; tasks: Task[]; journals: JournalEntry[]; timeBlocks: TimeBlock[] }) {
  const [activeSubTab, setActiveSubTab] = useState<'evolution' | 'achievements'>('evolution');
  const [filter, setFilter] = useState<'all' | 'earned' | 'locked'>('all');
  const [rarityFilter, setRarityFilter] = useState<Achievement['rarity'] | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<Achievement['category'] | 'all'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);

  if (!stats) return null;

  const now = new Date();
  const currentMonthDate = startOfMonth(now);
  const prevMonthDate = startOfMonth(subMonths(now, 1));

  const filterByMonth = (items: any[], date: Date) => {
    return items.filter(item => {
      const itemDate = new Date(item.createdAt || item.startTime || item.completedAt);
      return isSameMonth(itemDate, date);
    });
  };

  // Metrics calculation
  const curTasks = filterByMonth(tasks.filter(t => t.status === 'completed'), currentMonthDate).length;
  const prevTasks = filterByMonth(tasks.filter(t => t.status === 'completed'), prevMonthDate).length;

  const curJournals = filterByMonth(journals, currentMonthDate).length;
  const prevJournals = filterByMonth(journals, prevMonthDate).length;

  const curCalendar = filterByMonth(timeBlocks.filter(b => b.completed), currentMonthDate).length;
  const prevCalendar = filterByMonth(timeBlocks.filter(b => b.completed), prevMonthDate).length;

  const curHabits = filterByMonth(tasks.filter(t => t.status === 'completed' && t.category === 'routine'), currentMonthDate).length;
  const prevHabits = filterByMonth(tasks.filter(t => t.status === 'completed' && t.category === 'routine'), prevMonthDate).length;

  const earnedCount = stats.unlockedAchievements?.length || 0;
  const completionRate = Math.floor((earnedCount / ACHIEVEMENTS.length) * 100);

  const getAchievementProgress = (ach: Achievement) => {
    if (stats.unlockedAchievements?.includes(ach.id)) return { progress: 100, current: ach.requiredValue || 0 };
    
    let current = 0;
    const required = ach.requiredValue || 1;

    if (ach.id.startsWith('streak_')) {
      current = stats.currentStreak;
    } else if (ach.id.startsWith('journal_streak_')) {
      current = stats.journalStreak || 0;
    } else {
      switch(ach.id) {
        case 'task_10': case 'task_100': case 'task_500': case 'first_protocol':
          current = stats.totalTasksCompleted;
          break;
        case 'level_10': case 'level_50': case 'level_100':
          current = stats.level;
          break;
        case 'journal_initiator':
          current = journals.length > 0 ? 1 : 0;
          break;
        case 'journal_words_1000': case 'journal_words_10000': case 'journal_words_100000':
          current = stats.totalWordsWritten || 0;
          break;
        case 'reflection_seeker':
          current = stats.reflectionPromptsAnswered || 0;
          break;
        case 'mood_master':
          current = stats.journalStreak || 0;
          break;
        case 'midnight_thoughts':
          current = journals.some(j => {
            const hours = new Date(j.createdAt).getHours();
            return hours >= 0 && hours <= 4;
          }) ? 1 : 0;
          break;
        case 'word_wizard':
          current = journals.some(j => (j.wordCount || 0) >= 1000) ? 1 : 0;
          break;
        default:
          current = 0;
      }
    }

    return {
      progress: Math.min((current / required) * 100, 100),
      current
    };
  };

  const filteredAchievements = ACHIEVEMENTS.filter(a => {
    const isEarned = stats.unlockedAchievements?.includes(a.id);
    if (filter === 'earned' && !isEarned) return false;
    if (filter === 'locked' && isEarned) return false;
    if (rarityFilter !== 'all' && a.rarity !== rarityFilter) return false;
    if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
    return true;
  });

  const rarityStats = ACHIEVEMENTS.reduce((acc, a) => {
    const isEarned = stats.unlockedAchievements?.includes(a.id);
    if (isEarned) acc[a.rarity]++;
    return acc;
  }, { common: 0, uncommon: 0, rare: 0, legendary: 0 });

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <AnimatePresence>
        {selectedAchievement && (
          <AchievementDetail 
            achievement={selectedAchievement} 
            unlocked={stats.unlockedAchievements?.includes(selectedAchievement.id)} 
            {...getAchievementProgress(selectedAchievement)}
            onClose={() => setSelectedAchievement(null)} 
          />
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
           <h1 className="text-4xl font-serif font-black text-text-p uppercase tracking-[0.2em] font-mono italic">
             {activeSubTab === 'evolution' ? 'NEURAL_EVOLUTION' : 'SYST_ARCHIVE'}
           </h1>
           <p className="text-[10px] font-mono text-text-m uppercase tracking-[0.5em] opacity-40">
             {activeSubTab === 'evolution' ? 'MONTH_OVER_MONTH_SYNC_ANALYSIS' : `Neural_Growth: ${completionRate}% Complete`}
           </p>
        </div>
        <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
           <button 
             onClick={() => setActiveSubTab('evolution')}
             className={cn("px-4 py-2 rounded-lg font-mono text-[10px] font-black uppercase tracking-widest transition-all", activeSubTab === 'evolution' ? "bg-accent text-white" : "text-text-m hover:text-white")}
           >
             Evolution
           </button>
           <button 
             onClick={() => setActiveSubTab('achievements')}
             className={cn("px-4 py-2 rounded-lg font-mono text-[10px] font-black uppercase tracking-widest transition-all", activeSubTab === 'achievements' ? "bg-accent text-white" : "text-text-m hover:text-white")}
           >
             Archive
           </button>
        </div>
      </div>

      {activeSubTab === 'evolution' ? (
        <div className="space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <EvolutionMetric label="Routine_Sync (Habits)" current={curHabits} previous={prevHabits} icon={<Flame size={20} />} />
            <EvolutionMetric label="Protocol_Execution (Tasks)" current={curTasks} previous={prevTasks} icon={<CheckCircle2 size={20} />} />
            <EvolutionMetric label="Temporal_Adherence (Calendar)" current={curCalendar} previous={prevCalendar} icon={<Calendar size={20} />} />
            <EvolutionMetric label="Neural_Archival (Journal)" current={curJournals} previous={prevJournals} icon={<Book size={20} />} />
          </div>

          <div className="glass p-10 rounded-[3rem] border border-white/5 bg-accent/5 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                <TrendingUp size={120} className="text-accent" />
             </div>
             <div className="max-w-2xl space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">
                   <Sparkles size={12} className="text-accent" />
                   <span className="text-[10px] font-mono text-accent font-black uppercase tracking-widest">NEURAL_MOTIVATION_CORE</span>
                </div>
                <h3 className="text-3xl font-serif font-black text-white italic leading-tight uppercase">
                  {curTasks > prevTasks ? "Your neural streams are expanding. Synchronization with reality is at peak efficiency." : "Stagnation is merely a calibration phase. Refactor your protocols and initialize a new push."}
                </h3>
                <p className="text-sm font-mono text-text-m opacity-60 leading-relaxed uppercase">
                  Consistency is the only variable that matters. Monitor your deltas above and ensure the next cycle outperforms the previous. You are building a legend, one protocol at a time.
                </p>
             </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
             <div className="glass p-6 rounded-2xl border-b-4 border-accent bg-accent/5">
                <h3 className="text-[10px] font-mono text-accent uppercase font-black mb-1">Total_Archived</h3>
                <p className="text-4xl font-serif font-black text-white italic">{earnedCount} <span className="text-sm opacity-40">/ {ACHIEVEMENTS.length}</span></p>
             </div>
             <div className="glass p-6 rounded-2xl border-b-4 border-cyan bg-cyan/5">
                <h3 className="text-[10px] font-mono text-cyan uppercase font-black mb-1">Sync_Efficiency</h3>
                <p className="text-4xl font-serif font-black text-white italic">{completionRate}%</p>
             </div>
             <div className="glass p-6 rounded-2xl border-b-4 border-warning bg-warning/5">
                <h3 className="text-[10px] font-mono text-warning uppercase font-black mb-1">Rarity_Core</h3>
                <div className="flex gap-2 mt-2">
                   {Object.entries(rarityStats).map(([r, count]) => (
                      <div key={r} title={`${r}: ${count}`} className={cn(
                        "h-1 flex-1 rounded-full",
                        r === 'common' ? 'bg-white/20' : r === 'uncommon' ? 'bg-blue-400' : r === 'rare' ? 'bg-purple-400' : 'bg-warning'
                      )} />
                   ))}
                </div>
                <p className="text-[9px] font-mono text-text-s uppercase mt-2 opacity-50">Distribution_Stable</p>
             </div>
             <div className="glass p-6 rounded-2xl border-b-4 border-success bg-success/5">
                <h3 className="text-[10px] font-mono text-success uppercase font-black mb-1">Next_Milestone</h3>
                <p className="text-xs font-mono text-white uppercase italic mt-2">5 more for LEVEL_UP</p>
             </div>
          </div>

          <div className="space-y-8">
            <div className="flex flex-wrap items-center gap-4 border-b border-white/5 pb-4">
               <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>ALL_PROTOCOLS</FilterButton>
               <FilterButton active={filter === 'earned'} onClick={() => setFilter('earned')}>SYNCED</FilterButton>
               <FilterButton active={filter === 'locked'} onClick={() => setFilter('locked')}>LOCKED</FilterButton>
               <div className="w-px h-6 bg-white/10 mx-2" />
               <select 
                 value={rarityFilter} 
                 onChange={(e) => setRarityFilter(e.target.value as any)}
                 className="bg-transparent border-0 text-[10px] font-mono text-text-m uppercase outline-none cursor-pointer focus:text-white"
               >
                 <option value="all" className="bg-background">ALL_RARITIES</option>
                 <option value="common" className="bg-background">COMMON</option>
                 <option value="uncommon" className="bg-background">UNCOMMON</option>
                 <option value="rare" className="bg-background">RARE</option>
                 <option value="legendary" className="bg-background">LEGENDARY</option>
               </select>
               <select 
                 value={categoryFilter} 
                 onChange={(e) => setCategoryFilter(e.target.value as any)}
                 className="bg-transparent border-0 text-[10px] font-mono text-text-m uppercase outline-none cursor-pointer focus:text-white ml-2"
               >
                 <option value="all" className="bg-background">ALL_CATEGORIES</option>
                 <option value="milestone" className="bg-background">MILESTONES</option>
                 <option value="streak" className="bg-background">STREAKS</option>
                 <option value="skill" className="bg-background">SKILLS</option>
                 <option value="hidden" className="bg-background">HIDDEN</option>
               </select>
            </div>

            <div className={cn(
              "grid gap-6",
              viewMode === 'grid' ? "grid-cols-2 md:grid-cols-4 lg:grid-cols-5" : "grid-cols-1 md:grid-cols-2"
            )}>
              {filteredAchievements.map(ach => (
                <AchievementCard 
                  key={ach.id}
                  achievement={ach}
                  unlocked={stats.unlockedAchievements?.includes(ach.id)}
                  {...getAchievementProgress(ach)}
                  onClick={() => setSelectedAchievement(ach)}
                  viewMode={viewMode}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}


function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  const displayValue = typeof value === 'number' ? value.toLocaleString() : value;
  const isLargeValue = displayValue.toString().length > 7;

  return (
    <div className="glass p-6 md:p-8 rounded-xl flex flex-col items-center justify-center text-center group hover:bg-background-nested transition-all relative overflow-hidden">
      <CardDecoration />
      <div className={cn("mb-4 transition-transform group-hover:scale-110 relative z-10", color)}>
        {icon}
      </div>
      <h3 className="text-[10px] font-bold text-text-m uppercase tracking-widest mb-1 relative z-10">{label}</h3>
      <p className={cn(
        "font-bold font-mono tracking-tighter relative z-10 break-all",
        isLargeValue ? "text-2xl" : "text-4xl",
        color
      )}>
        {displayValue}
      </p>
    </div>
  );
}

function ShopView({ stats, user, onPurchase }: { stats: UserStats | null; user: User; onPurchase: (cost: number, item: any) => void }) {
  const shopItems = [
    { id: 'theme_emerald', label: 'EMERALD_PROTOCOL', description: 'Deep green interface override.', cost: 500, type: 'theme', category: 'visual' },
    { id: 'theme_ruby', label: 'RUBY_RESONANCE', description: 'Monochrome crimson aesthetic.', cost: 500, type: 'theme', category: 'visual' },
    { id: 'theme_gold', label: 'AUREUM_OS', description: 'Elite gold and black workspace.', cost: 2000, type: 'theme', category: 'prestige' },
    { id: 'avatar_frame_neon', label: 'NEON_HALO', description: 'Pulsing circular frame for system avatar.', cost: 300, type: 'skin', category: 'visual' },
    { id: 'sound_pack_classic', label: '8BIT_SOUND_INDEX', description: 'Retro sound effects for sync completions.', cost: 400, type: 'bundle', category: 'audio' },
  ];

  return (
    <div className="space-y-8 pb-20">
      <header className="space-y-2">
        <h2 className="text-4xl font-serif font-black text-white italic uppercase tracking-tighter">NEURAL_MARKETPLACE</h2>
        <p className="text-text-m font-mono text-xs uppercase opacity-60">Exchange NEURAL_CREDITS for interface enhancements.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {shopItems.map(item => {
          const isOwned = stats?.unlockedItems?.includes(item.id);
          return (
            <motion.div 
              key={item.id}
              whileHover={{ y: -5 }}
              className="glass p-6 rounded-3xl border border-white/5 flex flex-col gap-6 relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:rotate-12 transition-transform">
                <ShoppingBag size={48} className="text-accent" />
              </div>
              
              <div className="flex justify-between items-start relative z-10">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  {item.type === 'theme' ? <Palette size={24} className="text-accent" /> : <Shield size={24} className="text-cyan" />}
                </div>
                <div className={cn("text-[8px] font-mono font-black px-2 py-1 rounded uppercase tracking-tighter", 
                  item.category === 'prestige' ? 'bg-warning text-black' : 'bg-white/10 text-text-m'
                )}>
                  {item.category}
                </div>
              </div>

              <div>
                <h3 className="text-xl font-serif font-black text-white uppercase italic mb-1">{item.label}</h3>
                <p className="text-[10px] font-mono text-text-s uppercase leading-relaxed opacity-60">{item.description}</p>
              </div>

              <div className="mt-auto flex items-center justify-between pt-4 border-t border-white/5">
                <div className="flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                   <span className="text-xs font-mono font-black text-white">{item.cost} CR</span>
                </div>
                <button
                  onClick={() => onPurchase(item.cost, item)}
                  disabled={isOwned || (stats?.coins || 0) < item.cost}
                  className={cn(
                    "px-4 py-2 rounded-xl font-mono font-black text-[10px] uppercase tracking-widest transition-all",
                    isOwned 
                      ? "bg-success text-black pointer-events-none" 
                      : "bg-white/5 text-white hover:bg-accent hover:text-white disabled:opacity-20"
                  )}
                >
                  {isOwned ? 'DECRYPTED' : 'SYNC_NODE'}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="glass p-8 rounded-3xl border border-white/5 bg-white/2 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="p-4 bg-accent/10 rounded-2xl border border-accent/20">
             <Star size={32} className="text-accent" />
          </div>
          <div>
            <h4 className="text-xl font-serif font-black text-white uppercase italic">CREDIT_BALANCE</h4>
            <p className="text-[10px] font-mono text-text-m uppercase">Earn 10 CR for every level, and 1 CR for every task protocol.</p>
          </div>
        </div>
        <div className="text-4xl font-mono font-black text-white px-8 py-4 glass rounded-2xl border border-white/10 shadow-[0_0_20px_rgba(255,69,0,0.1)]">
           {stats?.coins || 0} <span className="text-xs text-text-s tracking-widest ml-2">CREDITS</span>
        </div>
      </div>
    </div>
  );
}

function SettingsView({ settings, stats, user, onUpdate }: { settings: AppSettings | null; stats: UserStats | null; user: User; onUpdate: (s: Partial<AppSettings>) => void }) {
  const [activeCategory, setActiveCategory] = useState<'profile' | 'gameplay' | 'interface' | 'notifications' | 'data'>('profile');
  const [localDisplayName, setLocalDisplayName] = useState(user.displayName || '');
  const [isEditingName, setIsEditingName] = useState(false);

  if (!settings) return <div className="text-center font-mono opacity-20">LOAD_SETTINGS_FAILURE...</div>;

  const categories = [
    { id: 'profile', label: 'IDENTITY_CORE', icon: <UserIcon size={16} />, color: 'text-accent' },
    { id: 'gameplay', label: 'OPERATION_LOGIC', icon: <Zap size={16} />, color: 'text-warning' },
    { id: 'interface', label: 'VISUAL_SYNC', icon: <Palette size={16} />, color: 'text-cyan' },
    { id: 'notifications', label: 'COMMS_PROTOCOLS', icon: <Bell size={16} />, color: 'text-success' },
    { id: 'data', label: 'SYSTEM_MEMORY', icon: <HardDrive size={16} />, color: 'text-text-m' },
  ] as const;

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-32 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-8">
        <div className="space-y-2">
          <h2 className="text-5xl font-serif font-black text-white italic uppercase tracking-tighter text-glow-white">CONFIG_OS</h2>
          <p className="text-text-m font-mono text-xs uppercase opacity-60 tracking-[0.3em]">Adjust your neural interface parameters.</p>
        </div>
        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10 overflow-x-auto no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-xl font-mono text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                activeCategory === cat.id 
                  ? "bg-accent shadow-[0_0_20px_rgba(255,69,0,0.3)] text-white" 
                  : "text-text-m hover:text-white"
              )}
            >
              {cat.icon}
              {cat.label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
        <div className="md:col-span-12 space-y-12">
          
          {activeCategory === 'profile' && (
            <motion.section 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="flex items-center gap-4">
                <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-accent to-danger p-1">
                  <div className="w-full h-full rounded-[1.3rem] overflow-hidden bg-background-nested">
                    <img src={user.photoURL || ''} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-3xl font-serif font-black text-white uppercase italic">{user.displayName}</h3>
                  <div className="flex gap-2">
                    <span className="px-2 py-0.5 bg-accent/10 border border-accent/20 text-accent text-[8px] font-mono font-black uppercase rounded">ROOT_USER</span>
                    <span className="px-2 py-0.5 bg-white/5 border border-white/10 text-text-m text-[8px] font-mono font-black uppercase rounded">ID: {user.uid.slice(0, 8)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="glass p-6 rounded-3xl border border-white/5 space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                       <label className="text-[10px] font-mono text-text-m uppercase font-black tracking-widest">DISPLAY_ALIAS</label>
                       {isEditingName ? (
                         <div className="flex gap-2">
                            <button onClick={() => { setLocalDisplayName(user.displayName || ''); setIsEditingName(false); }} className="text-[10px] text-text-m hover:text-white">CANCEL</button>
                            <button onClick={async () => { 
                              try {
                                await updateProfile(user, { displayName: localDisplayName });
                                setIsEditingName(false);
                                // In a real app we might want to trigger a re-render of the parent if user object doesn't update automatically in some contexts, but usually it does in state
                                window.location.reload(); // Quick way to sync auth state across app for this prototype
                              } catch (e) {
                                console.error(e);
                              }
                            }} className="text-[10px] text-accent font-black">SAVE_CHANGE</button>
                         </div>
                       ) : (
                         <button onClick={() => setIsEditingName(true)} className="text-[10px] text-cyan font-black hover:underline transition-all">EDIT_IDENTITY</button>
                       )}
                    </div>
                    {isEditingName ? (
                      <input 
                        type="text" 
                        value={localDisplayName}
                        onChange={(e) => setLocalDisplayName(e.target.value)}
                        className="w-full bg-black/40 border border-accent/30 p-4 rounded-xl text-white font-mono outline-none shadow-[0_0_15px_rgba(255,69,0,0.1)]"
                      />
                    ) : (
                      <div className="p-4 bg-white/2 rounded-xl border border-white/5 text-sm font-mono text-white opacity-80">{user.displayName || 'ANONYMOUS_OPERATOR'}</div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-mono text-text-m uppercase font-black tracking-widest">COMM_CHANNEL</label>
                    <div className="flex items-center justify-between p-4 bg-white/2 rounded-xl border border-white/5">
                      <span className="text-sm font-mono text-white opacity-40">{user.email}</span>
                      <ShieldCheck size={16} className="text-success" />
                    </div>
                  </div>
                </div>

                <div className="glass p-6 rounded-3xl border border-white/5 flex flex-col justify-center gap-6">
                  <div className="space-y-1">
                    <h4 className="text-sm font-mono font-black text-white uppercase">NEURAL_SYNC_STATUS</h4>
                    <p className="text-[10px] font-mono text-text-m uppercase opacity-60">Verified connection established with Google_Core.</p>
                  </div>
                  <div className="flex items-center gap-4 p-4 bg-success/5 border border-success/20 rounded-2xl">
                    <div className="p-3 bg-success/10 rounded-xl">
                      <ShieldCheck className="text-success" size={24} />
                    </div>
                    <div>
                      <p className="text-xs font-mono font-black text-success uppercase">ENCRYPTED_LINK</p>
                      <p className="text-[8px] font-mono text-text-m uppercase">ALL_DATA_FLOWS_PROTECTED_BY_AETHER_SECURITY</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>
          )}

          {activeCategory === 'gameplay' && (
            <motion.section 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="space-y-4">
                 <h3 className="text-sm font-mono font-black text-warning uppercase tracking-widest flex items-center gap-3">
                   <Zap size={18} />
                   DIFFICULTY_PARAMETERS
                 </h3>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   {[
                     { val: 0.5, label: 'NOVICE', desc: 'Relaxed focus protocols. Standard rewards.', color: 'border-success/30 text-success' },
                     { val: 1.0, label: 'HARDWARE_MODE', desc: 'Optimal performance balance. 1.0x Sync rate.', color: 'border-cyan/30 text-cyan' },
                     { val: 2.0, label: 'VM_PROTOCOL', desc: 'Hyper-focused virtualized grind. 2.0x Reward throughput.', color: 'border-accent/30 text-accent' }
                   ].map(d => (
                     <button
                       key={d.val}
                       onClick={() => onUpdate({ difficultyMultiplier: d.val })}
                       className={cn(
                         "p-8 rounded-[2.5rem] border text-left transition-all relative overflow-hidden group",
                         settings.difficultyMultiplier === d.val 
                           ? `bg-white/5 ${d.color.split(' ')[0]} shadow-2xl` 
                           : "glass border-white/5 hover:border-white/20"
                       )}
                     >
                       <div className={cn("text-xs font-mono font-black uppercase mb-3", d.color.split(' ')[1])}>{d.label}</div>
                       <p className="text-[10px] font-mono text-text-s uppercase opacity-60 leading-relaxed mb-6">{d.desc}</p>
                       <div className="flex items-end justify-between">
                         <span className="text-2xl font-serif font-black text-white italic">{d.val}x</span>
                         {settings.difficultyMultiplier === d.val && <CheckCircle2 size={24} className={d.color.split(' ')[1]} />}
                       </div>
                       {settings.difficultyMultiplier === d.val && (
                         <div className={cn("absolute bottom-0 left-0 w-full h-1 bg-current opacity-50", d.color.split(' ')[1])} />
                       )}
                     </button>
                   ))}
                 </div>
              </div>

              <div className="glass p-8 rounded-[3rem] border border-white/5 space-y-8">
                 <div className="flex items-center justify-between group">
                    <div className="space-y-1">
                      <p className="text-[10px] font-mono text-text-s uppercase font-black group-hover:text-white transition-colors">CHALLENGE_SYNC</p>
                      <p className="text-xs font-mono text-text-m opacity-50">Enable dynamic daily objectives based on load.</p>
                    </div>
                    <Toggle active={true} onChange={() => {}} />
                 </div>
                 <div className="h-px bg-white/5" />
                 <div className="flex items-center justify-between group">
                    <div className="space-y-1">
                      <p className="text-[10px] font-mono text-text-s uppercase font-black group-hover:text-white transition-colors">RECURRING_LOOPS</p>
                      <p className="text-xs font-mono text-text-m opacity-50">Allow protocol repetition across cycles.</p>
                    </div>
                    <Toggle active={stats?.unlockedFeatures?.includes('recurring_tasks') || false} onChange={() => {}} />
                 </div>
              </div>
            </motion.section>
          )}

          {activeCategory === 'interface' && (
            <motion.section 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="glass p-8 rounded-[3rem] border border-white/5 space-y-8">
                  <h4 className="text-xs font-mono font-black text-cyan uppercase tracking-widest flex items-center gap-2">
                    <Palette size={14} />
                    VISUAL_CORE
                  </h4>
                  
                  <div className="space-y-6">
                    <div className="space-y-3">
                       <label className="text-[10px] font-mono text-text-m font-black uppercase tracking-widest">UI_THEME_NODE</label>
                       <div className="grid grid-cols-2 gap-2">
                         {['CYBERPUNK', 'MINIMAL', 'OLED_DEEP', 'PHANTOM'].map(t => (
                           <button 
                             key={t}
                             className={cn(
                               "py-3 font-mono text-[9px] font-black uppercase rounded-xl border transition-all",
                               t === 'CYBERPUNK' ? "bg-cyan text-black border-cyan" : "bg-white/5 border-white/10 text-text-m hover:bg-white/10"
                             )}
                           >
                             {t}
                           </button>
                         ))}
                       </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-mono text-text-m font-black uppercase tracking-widest">TEMPORAL_FORMAT</label>
                      <div className="flex gap-2">
                        {['12h', '24h'].map(f => (
                          <button
                            key={f}
                            onClick={() => onUpdate({ display: { ...settings.display, timeFormat: f as any } })}
                            className={cn(
                              "flex-1 py-3 font-mono text-[10px] font-black uppercase rounded-xl border transition-all",
                              settings.display.timeFormat === f ? "bg-white text-black border-white" : "bg-white/2 border-white/5 text-text-m"
                            )}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="glass p-8 rounded-[3rem] border border-white/5 space-y-8">
                   <h4 className="text-xs font-mono font-black text-accent uppercase tracking-widest flex items-center gap-2">
                    <Sparkles size={14} />
                    EFFECT_RENDERER
                  </h4>

                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                       <span className="text-[10px] font-mono text-text-p uppercase font-black">XP_PARTICLE_LOAD</span>
                       <Toggle active={settings.ui.showXpPopups} onChange={() => onUpdate({ ui: { ...settings.ui, showXpPopups: !settings.ui.showXpPopups } })} />
                    </div>
                    <div className="flex items-center justify-between">
                       <span className="text-[10px] font-mono text-text-p uppercase font-black">ACHIEVEMENT_GLOW</span>
                       <Toggle active={true} onChange={() => {}} />
                    </div>
                    <div className="space-y-3">
                       <label className="text-[10px] font-mono text-text-m uppercase font-black tracking-widest">ANIM_RESOURCES</label>
                       <select 
                         value={settings.ui.animations}
                         onChange={(e) => onUpdate({ ui: { ...settings.ui, animations: e.target.value as any } })}
                         className="w-full bg-black/40 border border-white/10 p-4 rounded-2xl font-mono text-xs text-white outline-none"
                       >
                         <option value="full">MAX_FIDELITY</option>
                         <option value="reduced">BALANCED_FLOW</option>
                         <option value="none">STATIC_OPTIMIZED</option>
                       </select>
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>
          )}

          {activeCategory === 'notifications' && (
            <motion.section 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="glass p-8 rounded-[3.5rem] border border-white/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                   <Bell size={120} className="text-success" />
                </div>
                <div className="relative z-10 space-y-12">
                   <div className="space-y-2">
                     <h3 className="text-2xl font-serif font-black text-white italic uppercase tracking-widest text-glow-success">SIGNAL_CONTROL</h3>
                     <p className="text-[10px] font-mono text-text-m uppercase opacity-60">Manage neural ping frequency and priority.</p>
                   </div>

                   <div className="space-y-4">
                     {[
                       { id: 'taskReminders', label: 'TASK_EXPIRATION_ALERTS', desc: 'Notify when temporal deadlines approach.', icon: <Target size={16} />, color: 'text-accent' },
                       { id: 'achievementNotifs', label: 'GOAL_SYNC_ANNOUNCEMENTS', desc: 'Instant feedback on milestone decryption.', icon: <Award size={16} />, color: 'text-warning' },
                       { id: 'streakReminders', label: 'UPTIME_PROTECTION_PING', desc: 'Alerts when neural streak is at risk of failure.', icon: <Flame size={16} />, color: 'text-success' }
                     ].map(item => (
                       <div key={item.id} className="flex items-center justify-between p-6 bg-white/2 rounded-[2rem] border border-white/5 hover:bg-white/5 transition-all group">
                         <div className="flex items-center gap-6">
                            <div className={cn("p-4 rounded-2xl bg-white/5 border border-white/10 group-hover:scale-110 transition-transform", item.color)}>
                               {item.icon}
                            </div>
                            <div className="space-y-1">
                              <p className="text-[10px] font-mono text-white font-black uppercase tracking-widest">{item.label}</p>
                              <p className="text-[10px] font-mono text-text-m uppercase opacity-60 tracking-tighter">{item.desc}</p>
                            </div>
                         </div>
                         <Toggle 
                           active={settings.notifications[item.id as keyof typeof settings.notifications]} 
                           onChange={() => onUpdate({ 
                             notifications: { 
                               ...settings.notifications, 
                               [item.id]: !settings.notifications[item.id as keyof typeof settings.notifications] 
                             } 
                           })} 
                         />
                       </div>
                     ))}
                   </div>

                   <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="space-y-1">
                        <p className="text-[12px] font-mono text-white italic uppercase font-black">Neural_Audio_Level</p>
                        <p className="text-[9px] font-mono text-text-m uppercase opacity-40">System feedback volume intensity.</p>
                      </div>
                      <div className="flex items-center gap-6 flex-1 max-w-sm">
                        <Volume2 size={16} className="text-text-m" />
                        <input 
                          type="range" 
                          min="0" max="1" step="0.1" 
                          value={settings.ui.soundVolume}
                          onChange={(e) => onUpdate({ ui: { ...settings.ui, soundVolume: parseFloat(e.target.value) } })}
                          className="flex-1 accent-white bg-white/10 h-1 rounded-full cursor-pointer"
                        />
                        <span className="text-[10px] font-mono text-white w-8 text-right">{Math.round(settings.ui.soundVolume * 100)}%</span>
                      </div>
                   </div>
                </div>
              </div>
            </motion.section>
          )}

          {activeCategory === 'data' && (
            <motion.section 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="glass p-8 rounded-[3rem] border border-white/5 flex flex-col justify-between group h-64 overflow-hidden relative">
                    <div className="absolute -bottom-4 -right-4 opacity-5 pointer-events-none group-hover:scale-110 transition-transform">
                       <Download size={120} className="text-white" />
                    </div>
                    <div className="space-y-2 relative z-10">
                       <h4 className="text-xl font-serif font-black text-white italic uppercase">LOCAL_ARCHIVE_EXPORT</h4>
                       <p className="text-[10px] font-mono text-text-m uppercase opacity-60">Generate a machine-readable JSON digest of your neural history.</p>
                    </div>
                    <button 
                      onClick={() => {
                        const data = {
                          profile: { email: user.email, name: user.displayName, uid: user.uid },
                          settings: settings,
                          timestamp: new Date().toISOString()
                        };
                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `AETHER_OS_ARCHIVE_${user.uid.slice(0, 8)}.json`;
                        a.click();
                      }}
                      className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl text-white font-mono text-[10px] font-black uppercase tracking-widest hover:bg-white hover:text-black transition-all relative z-10"
                    >
                       INITIALIZE_EXPORT
                    </button>
                 </div>

                 <div className="glass p-8 rounded-[3rem] border border-white/5 flex flex-col justify-between group h-64 overflow-hidden relative bg-danger/5 border-danger/10">
                    <div className="absolute -bottom-4 -right-4 opacity-10 pointer-events-none group-hover:-rotate-12 transition-transform">
                       <Trash2 size={120} className="text-danger" />
                    </div>
                    <div className="space-y-2 relative z-10">
                       <h4 className="text-xl font-serif font-black text-danger italic uppercase">HARD_FORMAT_PROTOCOL</h4>
                       <p className="text-[10px] font-mono text-text-m uppercase opacity-60">Permanently purge all settings and configurations from the neural net. Irreversible.</p>
                    </div>
                    <button 
                      onClick={async () => {
                        if (confirm('CONFIRM_SYSTEM_PURGE: Are you absolutely sure? All data will be lost forever.')) {
                          try {
                            const settingsRef = doc(db, 'user_settings', user.uid);
                            await deleteDoc(settingsRef);
                            window.location.reload();
                          } catch (e) {
                            handleFirestoreError(e, OperationType.DELETE, `user_settings/${user.uid}`);
                          }
                        }
                      }}
                      className="w-full py-4 bg-danger/20 border border-danger/40 rounded-2xl text-danger font-mono text-[10px] font-black uppercase tracking-widest hover:bg-danger hover:text-white transition-all relative z-10"
                    >
                       TERMINATE_ALL_DATA
                    </button>
                 </div>
              </div>
              
              <div className="glass p-8 rounded-[3rem] border border-white/5 flex items-center justify-between">
                 <div className="space-y-1">
                    <p className="text-[10px] font-mono text-white font-black uppercase">SYSTEM_OAUTH_LOGOUT</p>
                    <p className="text-[10px] font-mono text-text-m uppercase opacity-40">Disconnect current user node from AETHER_OS.</p>
                 </div>
                 <button 
                   onClick={() => signOut(auth)}
                   className="px-8 py-3 bg-white text-black font-mono text-[10px] font-black uppercase rounded-xl hover:scale-105 active:scale-95 transition-all"
                 >
                   TERMINATE_SESSION
                 </button>
              </div>
            </motion.section>
          )}

        </div>
      </div>

      <footer className="pt-20 text-center opacity-30 space-y-4">
         <div className="flex justify-center gap-8">
            <span className="text-[8px] font-mono text-text-p uppercase tracking-[0.4em]">PROJECT:AETHER</span>
            <span className="text-[8px] font-mono text-text-p uppercase tracking-[0.4em]">VER:2.1.0_OAK</span>
            <span className="text-[8px] font-mono text-text-p uppercase tracking-[0.4em]">STATUS:STABLE</span>
         </div>
         <p className="text-[8px] font-mono text-text-m uppercase tracking-widest">© 2026 DEEP_NEURAL_SOLUTIONS. ALL_RIGHTS_RESERVED.</p>
      </footer>
    </div>
  );
}

function Toggle({ active, onChange }: { active: boolean; onChange: () => void }) {
  return (
    <button 
      onClick={onChange}
      className={cn(
        "w-12 h-6 rounded-full transition-all relative p-1",
        active ? "bg-accent" : "bg-white/10"
      )}
    >
      <motion.div 
        animate={{ x: active ? 24 : 0 }}
        className="w-4 h-4 rounded-full bg-white shadow-lg" 
      />
    </button>
  );
}
