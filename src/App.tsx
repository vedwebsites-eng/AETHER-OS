import { GoogleGenAI, Type as GenAIType } from "@google/genai";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import React, { useState, useEffect, useMemo } from 'react';
import { auth, signInWithGoogle, loginWithEmail, registerWithEmail, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, User, signOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, onSnapshot, orderBy, serverTimestamp, addDoc, deleteDoc, getDocFromServer, writeBatch, limit } from 'firebase/firestore';
import { analyzeJournalEntry, breakdownBossTask, generateDailyBriefing, generateLifeInsight, analyzeLifeBalance } from './services/geminiService';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { 
  Plus, CheckCircle2, Circle, Trophy, Book, Calendar, 
  BarChart3, LogOut, LogIn, HardDrive, Zap, Database,
  Target, Flame, ChevronRight, X, Trash2, Edit3, 
  Smile, Frown, Meh, Star, BarChart, Activity, PieChart, Settings,
  Sparkles, Award, Volume2, Bell, TrendingUp, Clock, CalendarDays, Maximize2, Minimize2, Move, LayoutGrid, List,
  Bold, Italic, Underline as UnderlineIcon, ListOrdered, Heading1, Heading2, Link as LinkIcon, Eraser, Type, Palette,
  ShoppingBag, Shield, ShieldCheck, User as UserIcon, Download, Briefcase,
  Music, Youtube, Instagram, Quote, HelpCircle, Command, Terminal,
  Mail, Lock, Users, Globe, Network, Cpu, Brain
} from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, addDays, isPast, isFuture, parseISO, startOfDay, addHours, addMinutes, differenceInMinutes, isWithinInterval, subDays, startOfYesterday } from 'date-fns';
import { ResponsiveContainer, BarChart as ReBarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, CartesianGrid, Cell, PieChart as RePieChart, Pie } from 'recharts';
import { cn } from './lib/utils';

// --- Types ---
type AppTab = 'dashboard' | 'tasks' | 'lifeSync' | 'journal' | 'stats' | 'timetable' | 'routineMatrix' | 'shop' | 'settings';

interface Habit {
  id: string;
  userId: string;
  name: string;
  category: 'health' | 'learning' | 'creative' | 'work' | 'personal' | 'routine';
  frequency: string;
  createdAt: string;
  targetStreak: number;
  color: string;
  isArchived: boolean;
}

interface HabitLog {
  id: string;
  userId: string;
  habitId: string;
  date: string;
  completed: boolean;
  timestamp: string;
}

interface LifeSnapshot {
  id: string;
  userId: string;
  date: string;
  values: Record<string, number>;
  balanceScore: number;
}

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
  unlockedPerks: string[]; // IDEA 1
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
  pomodoroSessions?: number;
  pomodoroToday?: number;
  dailyChallenge?: {
    id: string;
    progress: number;
    goal: number;
    completed: boolean;
    lastGenerated: string;
  };
  dailyBriefing?: {
    content: string;
    lastGenerated: string;
  };
  lifeSync?: {
    current: Record<string, number>;
    lastSaved?: string;
    syncMode?: 'manual' | 'ai';
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

const LIFE_CATEGORIES = [
  { id: 'GYM', label: 'GYM', color: '#ef4444' }, 
  { id: 'DIET', label: 'DIET', color: '#f97316' }, 
  { id: 'LOVE', label: 'LOVE', color: '#ec4899' }, 
  { id: 'STUDIES', label: 'STUDIES', color: '#6366f1' }, 
  { id: 'FINANCE', label: 'FINANCE', color: '#22c55e' }, 
  { id: 'SLEEP', label: 'SLEEP', color: '#3b82f6' }, 
  { id: 'SOCIAL', label: 'SOCIAL', color: '#f59e0b' }, 
  { id: 'MENTAL_HEALTH', label: 'MENTAL HEALTH', color: '#14b8a6' }, 
];

function RadarChart({ values }: { values: Record<string, number> }) {
  const size = 300;
  const center = size / 2;
  const radius = (size / 2) * 0.75;
  const levels = 5;
  const categories = LIFE_CATEGORIES;

  const points = categories.map((cat, i) => {
    const angle = (Math.PI * 2 * i) / categories.length - Math.PI / 2;
    const value = values[cat.id] || 1;
    const r = (value / 10) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
      angle
    };
  });

  const polygonPath = points.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <div className="w-full aspect-square relative flex items-center justify-center p-2">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full max-w-[400px] overflow-visible">
        {/* Grid lines (Octagon rings) */}
        {[...Array(levels)].map((_, i) => {
          const r = ((i + 1) / levels) * radius;
          const gridPoints = categories.map((_, j) => {
            const angle = (Math.PI * 2 * j) / categories.length - Math.PI / 2;
            return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
          }).join(' ');
          return (
            <polygon 
              key={i} 
              points={gridPoints} 
              fill="none" 
              stroke="currentColor" 
              className="text-white/5" 
              strokeWidth="1" 
            />
          );
        })}

        {/* Axes */}
        {categories.map((cat, i) => {
          const angle = (Math.PI * 2 * i) / categories.length - Math.PI / 2;
          return (
            <line
              key={cat.id}
              x1={center}
              y1={center}
              x2={center + radius * Math.cos(angle)}
              y2={center + radius * Math.sin(angle)}
              stroke="currentColor"
              className="text-white/5"
              strokeWidth="1"
            />
          );
        })}

        {/* Filled polygon */}
        <motion.polygon
          animate={{ points: polygonPath }}
          transition={{ duration: 0.5, ease: "circOut" }}
          fill="rgba(99, 102, 241, 0.3)" // indigo-500 semi-transparent
          stroke="#6366f1"
          strokeWidth="2"
        />

        {/* Labels and Color Dots */}
        {categories.map((cat, i) => {
          const angle = (Math.PI * 2 * i) / categories.length - Math.PI / 2;
          const labelDist = radius + 25;
          const x = center + labelDist * Math.cos(angle);
          const y = center + labelDist * Math.sin(angle);
          
          return (
            <g key={cat.id}>
              <circle 
                cx={center + radius * Math.cos(angle)} 
                cy={center + radius * Math.sin(angle)} 
                r="3" 
                fill={cat.color} 
              />
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-[9px] font-mono font-bold uppercase tracking-widest"
                fill={cat.color}
              >
                {cat.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function LifeSyncView({ stats, user, onAddXP, tasks, journals, addToTerminal }: { stats: UserStats | null, user: User, onAddXP: any, tasks: Task[], journals: JournalEntry[], addToTerminal: any }) {
  const [syncMode, setSyncMode] = useState<'manual' | 'ai'>(stats?.lifeSync?.syncMode || 'manual');
  const [values, setValues] = useState<Record<string, number>>(
    stats?.lifeSync?.current || {
      GYM: 10, DIET: 10, LOVE: 4, STUDIES: 10, FINANCE: 10, SLEEP: 10, SOCIAL: 10, MENTAL_HEALTH: 10
    }
  );
  const [history, setHistory] = useState<LifeSnapshot[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isSyncingAI, setIsSyncingAI] = useState(false);

  useEffect(() => {
    if (user) {
      const q = query(
        collection(db, 'life_snapshots'),
        where('userId', '==', user.uid),
        orderBy('date', 'desc'),
        limit(7)
      );
      return onSnapshot(q, (snapshot) => {
        setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LifeSnapshot)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'life_snapshots'));
    }
  }, [user]);

  const balanceScore = Number((Object.values(values).reduce((a, b) => a + b, 0) / 8).toFixed(1));
  
  const sortedCategories = [...LIFE_CATEGORIES].sort((a, b) => values[a.id] - values[b.id]);
  const needsFocus = sortedCategories[0];
  const strongest = sortedCategories[sortedCategories.length - 1];

  const handleSliderChange = (id: string, val: number) => {
    if (syncMode === 'ai') return; // Prevent manual change in AI mode
    setValues(prev => ({ ...prev, [id]: val }));
  };

  const saveSnapshot = async () => {
    setIsSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      await addDoc(collection(db, 'life_snapshots'), {
        userId: user.uid,
        date: today,
        values,
        balanceScore,
        createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'user_stats', user.uid), {
        'lifeSync.current': values,
        'lifeSync.lastSaved': today,
        'lifeSync.syncMode': syncMode
      });
      onAddXP(75, 'LIFE_SYNC_LOG');
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#6366f1', '#ec4899', '#22c55e']
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAiSync = async () => {
    setIsSyncingAI(true);
    try {
      const aiValues = await analyzeLifeBalance(tasks, journals, stats);
      setValues(aiValues);
      addToTerminal("LIFE_SYNC_AI: RECALIBRATION_COMPLETE", "success");
    } catch (e) {
      console.error(e);
      addToTerminal("LIFE_SYNC_AI: SYNC_FAILED", "error");
    } finally {
      setIsSyncingAI(false);
    }
  };

  const getAiPlan = async () => {
    setIsAiLoading(true);
    try {
      const plan = await generateLifeInsight(needsFocus.label, values);
      setAiInsight(plan);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAiLoading(false);
    }
  };

  const alreadySavedToday = stats?.lifeSync?.lastSaved === new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-4xl font-serif font-black text-text-p uppercase tracking-[0.1em] italic text-glow-white">LIFE_SYNC</h1>
          <p className="text-[10px] font-mono text-text-m uppercase tracking-[0.5em] opacity-40">Holistic_State_Alignment // Reality_Interface</p>
        </div>
        
        {/* Sync Mode Selector */}
        <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 self-start md:self-center">
          <button 
            onClick={() => setSyncMode('manual')}
            className={cn(
              "px-4 py-2 rounded-lg text-[10px] font-mono font-black uppercase tracking-widest transition-all",
              syncMode === 'manual' ? "bg-white/10 text-text-p shadow-xl" : "text-text-m opacity-50 hover:opacity-100"
            )}
          >
            MANUAL_SETTING
          </button>
          <button 
            onClick={() => setSyncMode('ai')}
            className={cn(
              "px-4 py-2 rounded-lg text-[10px] font-mono font-black uppercase tracking-widest transition-all flex items-center gap-2",
              syncMode === 'ai' ? "bg-indigo-500/20 text-indigo-400 shadow-xl" : "text-text-m opacity-50 hover:opacity-100"
            )}
          >
            <Sparkles size={12} className={syncMode === 'ai' ? "animate-pulse" : ""} />
            AI_GENERATED
          </button>
        </div>
      </div>

      {/* Top Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass p-6 rounded-2xl border border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Activity size={40} className="text-indigo-400" />
          </div>
          <p className="text-[10px] font-mono font-black text-text-m uppercase tracking-widest mb-1">BALANCE_SCORE</p>
          <div className="text-4xl font-serif font-black text-indigo-400 italic">{balanceScore}</div>
          <div className="mt-2 h-1 w-full bg-white/5 rounded-full overflow-hidden">
             <motion.div 
               animate={{ width: `${(balanceScore / 10) * 100}%` }}
               className="h-full bg-indigo-500"
             />
          </div>
        </div>

        <div className="glass p-6 rounded-2xl border border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Zap size={40} className={cn("", needsFocus.id === 'GYM' ? "text-red-400" : "text-white/40")} />
          </div>
          <p className="text-[10px] font-mono font-black text-text-m uppercase tracking-widest mb-1">NEEDS_FOCUS</p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: needsFocus.color }} />
            <div className="text-2xl font-serif font-black uppercase italic" style={{ color: needsFocus.color }}>{needsFocus.label}</div>
          </div>
        </div>

        <div className="glass p-6 rounded-2xl border border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Trophy size={40} style={{ color: strongest.color }} />
          </div>
          <p className="text-[10px] font-mono font-black text-text-m uppercase tracking-widest mb-1">STRONGEST_NODE</p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: strongest.color }} />
            <div className="text-2xl font-serif font-black uppercase italic" style={{ color: strongest.color }}>{strongest.label}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
        {/* Left: Radar Chart */}
        <div className="glass p-8 lg:p-12 rounded-[2rem] border border-white/5 flex flex-col items-center justify-center min-h-[400px]">
          <RadarChart values={values} />
          
          <div className="mt-12 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
               <p className="text-[10px] font-mono text-text-m uppercase tracking-widest">HISTORY — LAST 7 SNAPSHOTS</p>
            </div>
            <div className="flex gap-3">
              {[...Array(7)].map((_, i) => {
                const saved = i < history.length;
                return (
                  <div 
                    key={i}
                    className={cn(
                      "w-4 h-4 rounded-sm border transition-all",
                      saved ? "bg-indigo-500 border-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.5)]" : "border-white/10 bg-white/5"
                    )}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Sliders */}
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xs font-mono font-black uppercase tracking-[0.3em] text-text-m">RATE EACH AREA (1–10)</h3>
            <span className="text-[10px] font-mono text-success bg-success/5 border border-success/20 px-2 py-1 rounded">+75 XP REWARD</span>
          </div>

          <div className="space-y-6 glass p-8 rounded-2xl border border-white/5 relative overflow-hidden">
            {syncMode === 'ai' && (
              <div className="absolute inset-0 z-10 bg-background/40 backdrop-blur-[2px] flex items-center justify-center p-6 text-center">
                <div className="max-w-[200px] space-y-4">
                   <Brain size={32} className="mx-auto text-indigo-400 mb-2 animate-pulse" />
                   <p className="text-[10px] font-mono font-black uppercase tracking-widest text-text-p">AI_SYNC_PROTOCOL_ACTIVE</p>
                   <p className="text-[8px] font-mono lowercase tracking-[0.2em] text-text-m opacity-60">system analyzing tasks, logs, and behavior patterns to calculate balance nodes.</p>
                   <button 
                    onClick={handleAiSync}
                    disabled={isSyncingAI}
                    className="w-full py-2 bg-indigo-500 text-white rounded-lg text-[9px] font-mono font-black uppercase tracking-widest hover:bg-indigo-600 transition-all flex items-center justify-center gap-2"
                   >
                     {isSyncingAI ? "RECALIBRATING..." : <><Activity size={10} /> RE-SYNC NOW</>}
                   </button>
                </div>
              </div>
            )}
            {LIFE_CATEGORIES.map(cat => (
              <div key={cat.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                    <span className="text-[10px] font-mono font-black uppercase tracking-widest text-text-p">{cat.label}</span>
                  </div>
                  <span className="text-xs font-mono font-black" style={{ color: cat.color }}>{values[cat.id] || 10}</span>
                </div>
                <input 
                  type="range"
                  min="1"
                  max="10"
                  step="0.5"
                  value={values[cat.id] || 10}
                  onChange={(e) => handleSliderChange(cat.id, parseFloat(e.target.value))}
                  disabled={syncMode === 'ai'}
                  className={cn(
                    "w-full h-1.5 bg-white/5 rounded-full appearance-none accent-indigo-500",
                    syncMode === 'manual' ? "cursor-pointer" : "cursor-not-allowed opacity-30"
                  )}
                  style={{
                    accentColor: cat.color
                  }}
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
            <button 
              onClick={saveSnapshot}
              disabled={isSaving || alreadySavedToday}
              className={cn(
                "w-full py-4 rounded-xl border font-mono text-xs font-black uppercase tracking-widest transition-all",
                alreadySavedToday 
                  ? "border-white/5 text-text-m opacity-50 cursor-not-allowed" 
                  : "border-white/20 text-text-p hover:bg-white/5 hover:border-white/40 active:scale-95"
              )}
            >
              {isSaving ? "SYNCING..." : alreadySavedToday ? "LOGGED_FOR_TODAY" : "SAVE_TODAY_SNAPSHOT"}
            </button>
            <button 
              onClick={getAiPlan}
              className="w-full py-4 rounded-xl border border-indigo-500/30 text-indigo-400 font-mono text-xs font-black uppercase tracking-widest hover:bg-indigo-500/10 transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              {isAiLoading ? "ANALYZING..." : (
                <>GET AI IMPROVEMENT PLAN <Maximize2 size={12} /></>
              )}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {aiInsight && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <div className="glass max-w-lg w-full p-8 rounded-3xl border border-indigo-500/30 relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4">
                 <button onClick={() => setAiInsight(null)} className="text-text-m hover:text-text-p transition-colors">
                   <X size={20} />
                 </button>
               </div>
               <div className="flex items-center gap-3 mb-6">
                 <Brain className="text-indigo-400" />
                 <span className="text-xs font-mono font-black text-indigo-400 uppercase tracking-widest">AETHER_OS // IMPROVEMENT_PROTOCOL</span>
               </div>
               <div className="space-y-4">
                 <div className="p-6 bg-white/5 rounded-xl border border-white/10 italic text-lg leading-relaxed font-serif text-text-p">
                   "{aiInsight}"
                 </div>
                 <button 
                   onClick={() => setAiInsight(null)}
                   className="w-full py-4 bg-indigo-500 text-white rounded-xl font-mono text-xs font-black uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-[0_0_20px_rgba(99,102,241,0.4)]"
                 >
                   ACKNOWLEDGE_PROTOCOL
                 </button>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

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
  { id: 'creature_of_habit', title: 'CREATURE_OF_HABIT', description: 'Maintain a 7-day streak for any habit.', xpReward: 50, icon: <Flame size={20} />, category: 'streak', rarity: 'uncommon', requiredValue: 7 },
  { id: 'iron_discipline', title: 'IRON_DISCIPLINE', description: 'Maintain a 30-day streak for any habit.', xpReward: 250, icon: <Shield size={20} />, category: 'streak', rarity: 'rare', requiredValue: 30 },
  { id: 'perfect_week', title: 'PERFECT_WEEK', description: '100% completion for all habits for 7 days.', xpReward: 500, icon: <Star size={20} />, category: 'skill', rarity: 'rare', requiredValue: 1 },
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

interface SubTask {
  id: string;
  title: string;
  completed: boolean;
  duration?: number;
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
  isBoss?: boolean; // IDEA 2
  subTasks?: SubTask[];
  scheduledStart?: string; // ISO
  scheduledEnd?: string; // ISO
  completedAt?: string; // ISO
  adherenceStatus?: 'ontime' | 'late' | 'partial' | 'missed';
}

interface Perk {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  cost: number;
  type: 'xp' | 'coins' | 'utility';
  value: number;
}

const PERKS: Perk[] = [
  { id: 'neural_efficiency', name: 'NEURAL_EFFICIENCY', description: 'Gain +10% XP from all completed synchronization protocols.', icon: <Zap size={18} />, cost: 500, type: 'xp', value: 0.1 },
  { id: 'coin_miner', name: 'DATA_MINER', description: 'Increase Credit yield from tasks by 15%.', icon: <Cpu size={18} />, cost: 750, type: 'coins', value: 0.15 },
  { id: 'focus_shield', name: 'FOCUS_SHIELD', description: 'Reduces the XP penalty for late task completion by 50%.', icon: <Shield size={18} />, cost: 1000, type: 'utility', value: 0.5 },
  { id: 'adrenaline_rush', name: 'ADRENALINE_RUSH', description: 'Increases speed-run bonuses by 50%.', icon: <Zap size={18} />, cost: 1200, type: 'xp', value: 0.5 },
  { id: 'deep_archive', name: 'DEEP_ARCHIVE', description: 'Each journal entry rewards 25% more XP.', icon: <Book size={18} />, cost: 800, type: 'xp', value: 0.25 },
];

interface CognitiveSignature {
  emotionalState: string;
  keyTheme: string;
  alignmentScore: number;
  insight: string;
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
  cognitiveSignature?: CognitiveSignature;
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
  POMODORO_SESSION_COMPLETE: 25,
  FOCUS_CYCLE_MASTER_BONUS: 50
};

const calculateTaskXP = (task: Task, currentStreak: number = 0) => {
  if (task.customXP) return task.customXP;
  
  const base = XP_MAP.PRIORITY[task.priority || 'medium'];
  const timeMult = XP_MAP.ESTIMATE(task.estimate || 30);
  const catMult = XP_MAP.CATEGORY[task.category as keyof typeof XP_MAP.CATEGORY] || 1;
  const challengeMult = task.isChallenging ? XP_MAP.CHALLENGING_BONUS : 1;
  const speedMult = task.isSpeedRun ? XP_MAP.SPEED_RUN_BONUS : 1;
  const bossMult = task.isBoss ? 5 : 1;
  const streakBonus = currentStreak * XP_MAP.STREAK_BONUS_PER_DAY;

  return Math.round((base * timeMult * catMult * challengeMult * speedMult * bossMult) + streakBonus);
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
  const [authChoice, setAuthChoice] = useState(false);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [motivationItems, setMotivationItems] = useState<MotivationItem[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitLogs, setHabitLogs] = useState<HabitLog[]>([]);
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [xpNotifications, setXpNotifications] = useState<XPNotification[]>([]);
  const [levelUpLevel, setLevelUpLevel] = useState<number | null>(null);
  const [celebratingAchievement, setCelebratingAchievement] = useState<Achievement | null>(null);
  const [completeToast, setCompleteToast] = useState<string | null>(null);
  const [isMotivationPortalOpen, setIsMotivationPortalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<{ id: string; msg: string; type: 'info' | 'warn' | 'error' | 'success'; time: string }[]>([]);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isNodeRecalibrating, setIsNodeRecalibrating] = useState(false);

  const addToTerminal = (msg: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setTerminalLogs(prev => [{ id, msg, type, time }, ...prev].slice(0, 50));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (user) {
      addToTerminal(`SYSTEM_BOOT_SEQUENCE_COMPLETE: NODE_${user.uid.slice(0, 8)} CONNECTED`, 'success');
    }
  }, [user]);

  useEffect(() => {
    if (user && stats) {
      const today = new Date().toISOString().split('T')[0];
      const briefingLastGenerated = stats.dailyBriefing?.lastGenerated;

      if (!briefingLastGenerated || briefingLastGenerated !== today) {
        const fetchBriefing = async () => {
          try {
            const activeTasks = tasks.filter(t => t.status === 'pending');
            const content = await generateDailyBriefing(stats, activeTasks);
            await updateDoc(doc(db, 'user_stats', user.uid), {
              dailyBriefing: {
                content,
                lastGenerated: today
              }
            });
          } catch (e) {
            console.error("Briefing Generation Failed", e);
          }
        };
        fetchBriefing();
      }
    }
  }, [user, stats, tasks]);

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
          unlockedPerks: [],
          totalWordsWritten: 0,
          streakHistory: [],
          journalStreak: 0,
          lastJournalDate: '',
          reflectionPromptsAnswered: 0,
          adherenceHistory: {},
          scheduleMasteryLevel: 0,
          scheduledTasksCount: 0,
          punctualStreak: 0,
          pomodoroSessions: 0,
          pomodoroToday: 0,
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

  // Fetch Routine Matrix (Habits & Logs)
  useEffect(() => {
    if (!user) {
      setHabits([]);
      setHabitLogs([]);
      return;
    }

    const habitsQ = query(
      collection(db, 'habits'),
      where('userId', '==', user.uid)
    );
    const unsubHabits = onSnapshot(habitsQ, (snapshot) => {
      setHabits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Habit)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'habits'));

    const logsQ = query(
      collection(db, 'habit_logs'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(2000) 
    );
    const unsubLogs = onSnapshot(logsQ, (snapshot) => {
      setHabitLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as HabitLog)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'habit_logs'));

    return () => {
      unsubHabits();
      unsubLogs();
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

          const streakId = Date.now();
          setXpNotifications(prev => [...prev, { 
            id: streakId, 
            amount: dailyBonus, 
            source: `STREAK_BONUS: DAY_${newStreak}` 
          }]);
          setTimeout(() => {
            setXpNotifications(prev => prev.filter(n => n.id !== streakId));
          }, 5000);
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
          pomodoroToday: 0,
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

      // Apply Neural Efficiency perk (+10% XP)
      if (stats.unlockedPerks?.includes('neural_efficiency')) {
        finalAmount = Math.round(finalAmount * 1.1);
      }

      // Apply Deep Archive perk (+25% XP for journals)
      const isJournal = source === 'NEURAL_INGEST_COMPLETE';
      if (isJournal && stats.unlockedPerks?.includes('deep_archive')) {
        finalAmount = Math.round(finalAmount * 1.25);
      }

      const logMsg = `XP_ACQUIRED: +${finalAmount} FROM ${source}`;
      addToTerminal(logMsg, 'success');

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
          const challengeId = Date.now() + 1;
          setXpNotifications(prev => [...prev, { 
            id: challengeId, 
            amount: reward, 
            source: `CHALLENGE_COMPLETE: ${challengeUpdate.id}` 
          }]);
          setTimeout(() => {
            setXpNotifications(prev => prev.filter(n => n.id !== challengeId));
          }, 5000);
        }
      }

      // Trigger Notification
      const id = Date.now();
      setXpNotifications(prev => [...prev, { id, amount: finalAmount, source }]);
      setTimeout(() => {
        setXpNotifications(prev => prev.filter(n => n.id !== id));
      }, 5000);

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
        let coinAmount = meta?.isBoss ? 25 : 5;
        if (stats.unlockedPerks?.includes('coin_miner')) {
          coinAmount = Math.round(coinAmount * 1.15);
        }
        bonusCoins += coinAmount;
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

          // Routine Matrix Achievements
          if (ach.id === 'creature_of_habit' || ach.id === 'iron_discipline') {
            const required = ach.id === 'creature_of_habit' ? 7 : 30;
            const anyStreak = habits.some(h => {
              const logs = habitLogs.filter(l => l.habitId === h.id && l.completed).map(l => l.date).sort((a,b) => b.localeCompare(a));
              if (logs.length < required) return false;
              let streak = 0;
              const todayStr = format(new Date(), 'yyyy-MM-dd');
              const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd');
              if (logs[0] !== todayStr && logs[0] !== yesterdayStr) return false;
              for (let i = 0; i < logs.length; i++) {
                const expected = format(subDays(parseISO(logs[0]), i), 'yyyy-MM-dd');
                if (logs.includes(expected)) streak++;
                else break;
              }
              return streak >= required;
            });
            if (anyStreak) condition = true;
          }
          if (ach.id === 'perfect_week') {
            const activeH = habits.filter(h => !h.isArchived);
            if (activeH.length > 0) {
              const last7Days = Array.from({length: 7}).map((_, i) => format(subDays(new Date(), i), 'yyyy-MM-dd'));
              const allDone = last7Days.every(date => {
                 const logsOnDate = habitLogs.filter(l => l.date === date && l.completed);
                 return activeH.every(h => logsOnDate.some(l => l.habitId === h.id));
              });
              if (allDone) condition = true;
            }
          }
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
            setTimeout(() => setXpNotifications(prev => prev.filter(n => n.id !== achId)), 5000);
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
      if (block.type === 'task') {
        // Find if a task with similar title already exists and is pending, to avoid duplicates? 
        // For now, just create a new task that is scheduled.
        await addDoc(collection(db, 'tasks'), {
          userId: user.uid,
          title: block.title,
          priority: 'medium',
          status: 'pending',
          category: 'learning',
          estimate: differenceInMinutes(parseISO(block.endTime), parseISO(block.startTime)),
          difficulty: 'medium',
          scheduledStart: block.startTime,
          scheduledEnd: block.endTime,
          createdAt: new Date().toISOString()
        });
      } else {
        await addDoc(collection(db, 'time_blocks'), {
          ...block,
          userId: user.uid,
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'time_blocks');
    }
  };

  const deleteTimeBlock = async (id: string, source: 'task' | 'block' = 'block') => {
    try {
      if (source === 'task') {
        await updateDoc(doc(db, 'tasks', id), {
          scheduledStart: null,
          scheduledEnd: null
        });
      } else {
        await deleteDoc(doc(db, 'time_blocks', id));
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${source === 'task' ? 'tasks' : 'time_blocks'}/${id}`);
    }
  };

  const handlePurchasePerk = async (perkId: string) => {
    if (!user || !stats) return;
    const perk = PERKS.find(perk => perk.id === perkId);
    if (!perk) return;

    if ((stats.coins || 0) < perk.cost) return;
    if (stats.unlockedPerks?.includes(perkId)) return;

    try {
      const statsRef = doc(db, 'user_stats', user.uid);
      await updateDoc(statsRef, {
        coins: (stats.coins || 0) - perk.cost,
        unlockedPerks: [...(stats.unlockedPerks || []), perkId]
      });
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#00D9FF', '#22C55E', '#FFFFFF']
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `user_stats/${user.uid}`);
    }
  };

  const updateTimeBlock = async (id: string, updates: Partial<TimeBlock>, source: 'task' | 'block' = 'block') => {
    try {
      if (source === 'task' || (updates.type === 'task' && source === 'block')) {
        // If it was a block and now is a task, this is complex. 
        // For simplicity, if source is task, update task.
        if (source === 'task') {
          await updateDoc(doc(db, 'tasks', id), {
            title: updates.title,
            scheduledStart: updates.startTime,
            scheduledEnd: updates.endTime,
            status: updates.completed ? 'completed' : 'pending'
          });
        } else {
          // It's a block but type became task? User probably wants to sync it.
          // In a real app we'd migrate it. For now just update block.
          await updateDoc(doc(db, 'time_blocks', id), updates);
        }
      } else {
        await updateDoc(doc(db, 'time_blocks', id), updates);
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${source === 'task' ? 'tasks' : 'time_blocks'}/${id}`);
    }
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    try {
      await updateDoc(doc(db, 'tasks', id), updates);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `tasks/${id}`);
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
        
        if (block.type === 'task') {
          const newTaskRef = doc(collection(db, 'tasks'));
          batch.set(newTaskRef, {
            userId: user.uid,
            title: block.title,
            priority: 'medium',
            status: 'pending',
            category: 'learning',
            estimate: block.duration,
            difficulty: 'medium',
            scheduledStart: finalStart.toISOString(),
            scheduledEnd: finalEnd.toISOString(),
            createdAt: new Date().toISOString()
          });
        } else {
          const newBlockRef = doc(collection(db, 'time_blocks'));
          batch.set(newBlockRef, {
            userId: user.uid,
            title: block.title,
            type: block.type,
            startTime: finalStart.toISOString(),
            endTime: finalEnd.toISOString(),
            completed: false
          });
        }
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
          const baseBonus = calculateTaskXP(task, stats.currentStreak) * (XP_MAP.SPEED_BONUS_MULT - 1);
          let speedMult = 1.0;
          if (stats.unlockedPerks?.includes('adrenaline_rush')) {
             speedMult = 1.5;
          }
          speedBonus = Math.round(baseBonus * speedMult);
        }
      }

      // Hardened multi-document update
      const { writeBatch } = await import('firebase/firestore');
      const batch = writeBatch(db);
      
      const taskRef = doc(db, 'tasks', task.id);
      const updateData: any = { 
        status: 'completed',
        completedAt: now.toISOString()
      };
      if (adherenceStatus) {
        updateData.adherenceStatus = adherenceStatus;
      }
      batch.update(taskRef, updateData);

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
      
      // Apply XP Decay for late tasks (-30% by default)
      if (adherenceStatus === 'late') {
        let decayMult = 0.7;
        if (stats.unlockedPerks?.includes('focus_shield')) {
          decayMult = 0.85; // Penalty reduced by 50%
        }
        earnedXP = Math.round(earnedXP * decayMult);
      }

      await addXP(earnedXP, source, { isBoss: task.isBoss });

      if (todayScheduledCompleted === 5) {
        await addXP(50, 'DAILY_TEMPORAL_MASTERY_REACHED');
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `tasks/${task.id}`);
    }
  };

  const addHabit = async (habitData: Omit<Habit, 'id' | 'userId' | 'createdAt' | 'isArchived'>) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'habits'), {
        ...habitData,
        userId: user.uid,
        createdAt: new Date().toISOString(),
        isArchived: false
      });
      setCompleteToast('HABIT_PROTOCOL_INITIALIZED');
      setTimeout(() => setCompleteToast(null), 3000);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'habits');
    }
  };

  const deleteHabit = async (id: string) => {
    try {
      await updateDoc(doc(db, 'habits', id), { isArchived: true });
      setCompleteToast('HABIT_ARCHIVED');
      setTimeout(() => setCompleteToast(null), 3000);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `habits/${id}`);
    }
  };

  const toggleHabit = async (habit: Habit, date: string) => {
    if (!user || !stats) return;
    const existingLog = habitLogs.find(l => l.habitId === habit.id && l.date === date);

    try {
      if (existingLog) {
        await deleteDoc(doc(db, 'habit_logs', existingLog.id));
      } else {
        await addDoc(collection(db, 'habit_logs'), {
          userId: user.uid,
          habitId: habit.id,
          date,
          completed: true,
          timestamp: new Date().toISOString()
        });

        const multipliers: Record<string, number> = {
          health: 1.2,
          learning: 1.1,
          creative: 1.15,
          work: 1.0,
          personal: 0.9,
          routine: 0.7
        };
        const multiplier = multipliers[habit.category] || 1.0;
        const totalXP = Math.round(25 * multiplier);
        addXP(totalXP, `HABIT_DONE: ${habit.name.toUpperCase()}`);

        const axisMap: Record<string, string> = {
          health: 'GYM',
          learning: 'STUDIES',
          personal: 'LOVE',
          routine: 'SLEEP'
        };
        const axis = axisMap[habit.category];
        if (axis) {
          const currentLifeValues = stats.lifeSync?.current || {
            GYM: 10, DIET: 10, LOVE: 4, STUDIES: 10, FINANCE: 10, SLEEP: 10, SOCIAL: 10, MENTAL_HEALTH: 10
          };
          const newVal = Math.min(10, (currentLifeValues[axis] || 0) + 1);
          if (newVal !== currentLifeValues[axis]) {
             await updateDoc(doc(db, 'user_stats', user.uid), {
               [`lifeSync.current.${axis}`]: newVal
             });
          }
        }
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'habit_logs');
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
    if (!authChoice) {
      return <LandingPage onEnter={() => setAuthChoice(true)} />;
    }
    return (
      <AuthorizationPage 
        onBack={() => setAuthChoice(false)} 
        onGoogleLogin={signInWithGoogle} 
      />
    );
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
      <nav className="fixed bottom-0 left-0 right-0 lg:left-0 lg:top-0 lg:bottom-0 lg:w-20 glass border-t lg:border-t-0 lg:border-r border-border-subtle z-50 flex lg:flex-col items-center justify-start lg:justify-center gap-2 lg:gap-8 min-h-[72px] lg:h-auto py-2 lg:py-8 px-4 lg:px-0 overflow-x-auto lg:overflow-x-hidden no-scrollbar premium-transition">
        <NavButton active={activeTab === 'dashboard'} onClick={() => handleTabChange('dashboard')} icon={<HardDrive size={20} className="lg:w-6 lg:h-6" />} label="CORE_COMMAND" />
        <NavButton active={activeTab === 'tasks'} onClick={() => handleTabChange('tasks')} icon={<CheckCircle2 size={20} className="lg:w-6 lg:h-6" />} label="DAILY_SYNC" />
        <NavButton 
          active={activeTab === 'timetable'} 
          onClick={() => handleTabChange('timetable')} 
          icon={<Calendar size={20} className="lg:w-6 lg:h-6" />} 
          label="TEMPORAL_GRID" 
          badge="AI"
        />
        <NavButton 
          active={activeTab === 'routineMatrix'} 
          onClick={() => handleTabChange('routineMatrix')} 
          icon={<Cpu size={20} className="lg:w-6 lg:h-6" />} 
          label="ROUTINE_MATRIX" 
        />
        <NavButton active={activeTab === 'journal'} onClick={() => handleTabChange('journal')} icon={<Book size={20} className="lg:w-6 lg:h-6" />} label="NEURAL_ARCHIVE" />
        <NavButton 
          active={activeTab === 'lifeSync'} 
          onClick={() => handleTabChange('lifeSync')} 
          icon={<Network size={20} className="lg:w-6 lg:h-6" />} 
          label="LIFE_SYNC" 
        />
        <NavButton 
          active={activeTab === 'stats'} 
          onClick={() => handleTabChange('stats')} 
          icon={<TrendingUp size={20} className="lg:w-6 lg:h-6" />} 
          label="NEURAL_EVOLUTION" 
        />
        <NavButton 
          active={activeTab === 'shop'} 
          onClick={() => handleTabChange('shop')} 
          icon={<ShoppingBag size={20} className="lg:w-6 lg:h-6" />} 
          label="MARKETPLACE" 
          locked={!(stats?.level && stats.level >= 20)}
          unlockLevel={20}
        />
        <NavButton 
          active={activeTab === 'settings'} 
          onClick={() => handleTabChange('settings')} 
          icon={<Settings size={20} className="lg:w-6 lg:h-6" />} 
          label="CONFIG_OS" 
        />
        
        <button 
          onClick={() => signOut(auth)}
          className="p-3 text-text-m hover:text-danger transition-colors lg:mt-auto group shrink-0"
        >
          <LogOut size={20} className="lg:w-6 lg:h-6 group-hover:scale-110 transition-transform" />
          <span className="sr-only">TERMINATE_SESSION</span>
        </button>
      </nav>

      <main className="pb-32 lg:pb-8 lg:pl-28 pt-4 lg:pt-8 px-4 max-w-7xl mx-auto">
        {activeTab !== 'dashboard' && (
          <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 lg:mb-12 gap-4 lg:gap-6 glass p-4 lg:p-6 rounded-xl border border-border-subtle premium-transition">
            <div className="flex items-center gap-3 lg:gap-4">
              <div className="w-12 h-12 lg:w-16 lg:h-16 shrink-0 rounded-full bg-gradient-to-br from-accent to-cyan flex items-center justify-center font-bold text-lg lg:text-2xl accent-glow text-white shadow-[0_0_20px_rgba(255,69,0,0.2)]">
                {user.displayName?.[0] || 'A'}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <span className="text-[8px] lg:text-[9px] font-mono text-cyan uppercase tracking-widest border border-cyan/20 px-1.5 py-0.5 rounded bg-cyan/5">AUTH_01</span>
                  <span className="text-[8px] lg:text-[9px] font-mono text-accent uppercase tracking-widest border border-accent/20 px-1.5 py-0.5 rounded bg-accent/5">NODE_{user.uid.slice(0, 4)}</span>
                  <span className="text-[8px] lg:text-[9px] font-mono text-success uppercase tracking-widest border border-success/20 px-1.5 py-0.5 rounded bg-success/5 border-dashed animate-pulse">
                    {getTitleForLevel(stats?.level || 1)}
                  </span>
                </div>
                <h1 className="text-xl lg:text-3xl font-serif font-black uppercase tracking-widest text-text-p flex items-center gap-2 truncate">
                  {user.displayName || 'OPERATOR'} <span className="text-cyan text-glow-cyan ml-1 text-[10px] lg:text-sm font-mono tracking-tighter shrink-0">LVL_{stats?.level || 1}</span>
                </h1>
                {stats && (() => {
                  const { progress, totalForLevel } = getLevelFromXP(stats.experience);
                  return (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-1.5">
                      <div className="w-full sm:w-48 lg:w-64 h-1 bg-background-nested rounded-full overflow-hidden border border-white/5 relative">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${(progress / totalForLevel) * 100}%` }}
                          transition={{ duration: 1, ease: PREMIUM_BEZIER }}
                          className="h-full bg-accent accent-glow shadow-[0_0_10px_rgba(255,69,0,0.4)]"
                        />
                      </div>
                      <span className="text-[8px] lg:text-[10px] text-text-s uppercase tracking-tighter font-mono whitespace-nowrap opacity-60">
                        {Math.floor(progress)}/{totalForLevel} XP
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>
            
            {stats && (
              <div className="flex items-center justify-between md:justify-end gap-3 sm:gap-6 lg:gap-8 border-t md:border-t-0 border-white/5 pt-3 md:pt-0">
                <div className="text-center group relative cursor-help flex flex-col items-center">
                  <p className="text-[8px] lg:text-[10px] text-text-m uppercase font-bold tracking-widest font-mono opacity-40">Streak</p>
                  <div className="text-sm lg:text-xl font-serif font-bold text-warning flex items-center justify-center gap-1 group-hover:drop-shadow-[0_0_8px_rgba(255,165,0,0.5)] transition-all">
                    <Flame size={14} className={cn("lg:w-5 lg:h-5", stats.currentStreak > 0 ? "text-orange-500 animate-pulse" : "text-text-s opacity-30")} />
                    <span>{stats.currentStreak}</span>
                  </div>
                </div>
                <div className="text-center group flex flex-col items-center">
                  <p className="text-[8px] lg:text-[10px] text-text-m uppercase font-bold tracking-widest font-mono opacity-40">Active</p>
                  <p className="text-sm lg:text-xl font-serif font-bold text-accent animate-text-glow">{tasks.filter(t => t.status === 'pending').length}</p>
                </div>
                <div className="text-center group flex flex-col items-center">
                  <p className="text-[8px] lg:text-[10px] text-text-m uppercase font-bold tracking-widest font-mono opacity-40">Sync</p>
                  <p className="text-sm lg:text-xl font-serif font-bold text-cyan text-glow-cyan">94%</p>
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
                  updateTask={updateTask}
                  applyTemplate={applyTemplate}
                  setCompleteToast={setCompleteToast}
                  settings={settings}
                  onUpdateSettings={updateSettings}
                />
              )}
              {activeTab === 'routineMatrix' && (
                <RoutineMatrixView 
                  habits={habits}
                  habitLogs={habitLogs}
                  user={user}
                  onAddHabit={addHabit}
                  onToggleHabit={toggleHabit}
                  onDeleteHabit={deleteHabit}
                />
              )}
              {activeTab === 'journal' && <JournalView journals={journals} user={user} onAddXP={addXP} stats={stats} />}
              {activeTab === 'lifeSync' && <LifeSyncView stats={stats} user={user} onAddXP={addXP} tasks={tasks} journals={journals} addToTerminal={addToTerminal} />}
              {activeTab === 'stats' && <StatsView stats={stats} user={user} tasks={tasks} journals={journals} timeBlocks={timeBlocks} onPurchasePerk={handlePurchasePerk} />}
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
      <CommandPalette 
        isOpen={isCommandPaletteOpen} 
        onClose={() => setIsCommandPaletteOpen(false)} 
        onNavigate={handleTabChange}
        activeTab={activeTab}
      />
      <SystemTerminal logs={terminalLogs} />
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

function AuthorizationPage({ onBack, onGoogleLogin }: { onBack: () => void; onGoogleLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'signin' | 'signup' | 'login'>('login');

  const handleAuth = async (targetMode: 'signin' | 'signup' | 'login') => {
    if (!email || !password) {
      setError("EMAIL_AND_PASSWORD_REQUIRED");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (targetMode === 'signup') {
        await registerWithEmail(email, password);
      } else {
        // Both 'login' and 'signin' use the same backend function for email/pass
        await loginWithEmail(email, password);
      }
    } catch (err: any) {
      console.error("Auth Error:", err);
      let msg = err.message || "AUTH_FAILED";
      if (err.code === 'auth/user-not-found') msg = "USER_NOT_FOUND_SIGN_UP_INSTEAD";
      if (err.code === 'auth/wrong-password') msg = "INVALID_CREDENTIALS";
      if (err.code === 'auth/email-already-in-use') msg = "EMAIL_ALREADY_REGISTERED";
      if (err.code === 'auth/invalid-email') msg = "INVALID_EMAIL_FORMAT";
      setError(msg.replace('Firebase: ', '').split('(')[0].trim());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 bg-scanlines relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,69,0,0.05),transparent_70%)]" />
      <div className="absolute inset-0 cyber-grid opacity-10 pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="max-w-md w-full glass p-10 rounded-[3rem] border border-white/10 shadow-2xl relative z-10 overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none group-hover:rotate-12 transition-transform">
          <Shield size={120} className="text-accent" />
        </div>

        <button 
          onClick={onBack}
          className="mb-8 text-text-s/60 hover:text-accent transition-colors flex items-center gap-2 text-[10px] uppercase font-mono tracking-widest group"
        >
          <div className="w-5 h-5 rounded-full border border-white/20 flex items-center justify-center group-hover:border-accent group-hover:scale-110 transition-all">
            <ChevronRight className="rotate-180" size={12} />
          </div>
          Abort_Session
        </button>

        <div className="text-center mb-10">
          <motion.div 
            animate={{ 
              scale: [1, 1.05, 1],
              opacity: [0.8, 1, 0.8]
            }}
            transition={{ repeat: Infinity, duration: 4 }}
            className="inline-block p-4 bg-accent/5 border border-accent/20 mb-6 rounded-2xl relative shadow-[0_0_20px_rgba(255,69,0,0.1)]"
          >
            <ShieldCheck className="text-accent" size={32} />
          </motion.div>
          <h2 className="text-3xl font-serif font-black text-white italic uppercase tracking-tighter">AUTHORIZATION</h2>
          <p className="text-[10px] font-mono text-text-m opacity-50 mt-2 uppercase tracking-[0.3em] leading-relaxed">
            Neural_Link_Validation_Required
          </p>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-8 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-500 font-mono text-[10px] uppercase tracking-widest leading-relaxed flex items-start gap-3"
          >
            <Zap size={14} className="shrink-0 mt-0.5" />
            <div>
              <span className="font-black">CRITICAL_EXCEPTION:</span> {error}
            </div>
          </motion.div>
        )}

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-mono text-text-m uppercase tracking-widest ml-1 opacity-50">NODE_IDENTIFIER</label>
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-text-s/40 group-focus-within:text-accent transition-colors" size={16} />
              <input 
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="USER@AETHER.NETWORK"
                className="w-full bg-white/2 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-sm font-mono text-white focus:outline-none focus:border-accent/50 focus:bg-white/5 transition-all placeholder:text-text-s/20"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-mono text-text-m uppercase tracking-widest ml-1 opacity-50">ACCESS_PASSKEY</label>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-s/40 group-focus-within:text-accent transition-colors" size={16} />
              <input 
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-white/2 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-sm font-mono text-white focus:outline-none focus:border-accent/50 focus:bg-white/5 transition-all placeholder:text-text-s/20"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-4">
            <button 
              onClick={() => handleAuth('login')}
              disabled={loading}
              className="w-full bg-accent hover:bg-danger text-white font-mono font-black py-5 rounded-2xl shadow-[0_0_20px_rgba(255,69,0,0.2)] hover:shadow-[0_0_30px_rgba(255,69,0,0.4)] transition-all active:scale-[0.98] disabled:opacity-50 text-sm tracking-[0.2em] uppercase"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                  AUTHENTICATING...
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <LogIn size={18} /> INITIALIZE_SYNC
                </div>
              )}
            </button>
            
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => handleAuth('signup')}
                disabled={loading}
                className="py-4 glass border border-white/5 bg-white/2 hover:bg-white/5 text-white font-mono font-black rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50 text-[10px] tracking-[0.2em] uppercase"
              >
                NEW_NODE
              </button>
              <button 
                onClick={() => handleAuth('signin')}
                disabled={loading}
                className="py-4 glass border border-white/5 bg-white/2 hover:bg-white/5 text-white font-mono font-black rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50 text-[10px] tracking-[0.2em] uppercase"
              >
                PASSCODE_RECOVERY
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 my-8">
            <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-white/10" />
            <span className="text-[9px] font-mono text-text-s/30 uppercase tracking-[0.3em]">SECURE_OAUTH</span>
            <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-white/10" />
          </div>

          <button 
            onClick={onGoogleLogin}
            disabled={loading}
            className="w-full bg-white text-black font-mono font-black py-4 rounded-2xl flex items-center justify-center gap-4 hover:bg-gray-200 transition-all active:scale-[0.98] disabled:opacity-50 text-xs tracking-[0.1em] shadow-xl"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            LOGIN_WITH_GOOGLE_CORE
          </button>
        </div>
      </motion.div>
      
      <div className="absolute bottom-10 left-0 right-0 flex justify-between px-12 opacity-20 pointer-events-none">
        <div className="space-y-1">
          <p className="text-[8px] font-mono text-white uppercase tracking-widest">System_Security: AES_256</p>
          <p className="text-[8px] font-mono text-white uppercase tracking-widest">Protocol_Checksum: OK</p>
        </div>
        <div className="text-right space-y-1">
          <p className="text-[8px] font-mono text-white uppercase tracking-widest">Node_IP_Masked</p>
          <p className="text-[8px] font-mono text-white uppercase tracking-widest">Session_Isolation: ACTIVE</p>
        </div>
      </div>
    </div>
  );
}

function LandingPage({ onEnter }: { onEnter: () => void }) {
  const [dbStatus, setDbStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [isInitializing, setIsInitializing] = useState(false);

  useEffect(() => {
    const checkDb = async () => {
      try {
        const testDoc = doc(db, 'system', 'health');
        await getDocFromServer(testDoc);
        setDbStatus('online');
      } catch (err: any) {
        console.warn("DB Health Check Failed:", err.message);
        if (err.message.includes('offline')) {
          setDbStatus('offline');
        } else {
          // If it's permission denied, it's still "online" (server responded)
          setDbStatus('online');
        }
      }
    };
    checkDb();
  }, []);

  const handleEnter = () => {
    setIsInitializing(true);
    setTimeout(onEnter, 2000);
  };

  return (
    <div className="min-h-screen bg-[#040406] flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
      {/* Background Ambience - Black, Blue, and hints of Red */}
      <div className="absolute inset-x-0 top-0 h-full w-full z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(30,58,138,0.15),transparent_50%),radial-gradient(circle_at_80%_70%,rgba(153,27,27,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(15,23,42,0.3)_0%,transparent_70%)]" />
        <div className="absolute inset-0 opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
      </div>

      <div className="absolute inset-0 cyber-grid opacity-5 pointer-events-none" />
      <div className="absolute inset-0 bg-scanlines opacity-[0.02] pointer-events-none" />
      
      <motion.div 
        key="landing-content"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-5xl relative z-10 flex flex-col items-center"
      >
        {/* Logo Section placeholder */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 1 }}
          className="mb-14 relative"
        >
          <div className="w-32 h-32 md:w-40 md:h-40 rounded-[2.5rem] bg-gradient-to-br from-white/10 to-transparent border border-white/10 flex items-center justify-center backdrop-blur-xl group cursor-pointer overflow-hidden shadow-2xl">
            <div className="absolute inset-0 bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            
            {/* Logo Placeholder - Will be replaced by User's Logo */}
            <div className="relative z-10 flex flex-col items-center gap-2">
              <HardDrive size={64} className="text-white/80 group-hover:text-accent transition-all duration-700 group-hover:scale-110" />
              <span className="text-[8px] font-mono tracking-[0.5em] text-white/20 uppercase">AETHER_CORE</span>
            </div>

            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
              className="absolute -inset-4 border border-accent/20 rounded-full border-dashed opacity-20"
            />
          </div>
          
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full backdrop-blur-md">
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-[8px] font-mono text-white/40 tracking-widest uppercase">System_Active</span>
          </div>
        </motion.div>

        <div className="space-y-6 mb-20">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex items-center justify-center gap-8 opacity-40"
          >
            <div className="h-[1px] w-24 bg-gradient-to-r from-transparent to-white" />
            <span className="text-[9px] font-mono text-white uppercase tracking-[1em] font-black">NEURAL_OPERATING_SYSTEM</span>
            <div className="h-[1px] w-24 bg-gradient-to-l from-transparent to-white" />
          </motion.div>
          
          <h1 className="text-8xl md:text-[14rem] font-serif font-black uppercase tracking-tighter leading-[0.75] text-white flex flex-col">
            <motion.span 
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6, duration: 1 }}
              className="relative"
            >
              AETHER
            </motion.span>
            <motion.span 
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8, duration: 1 }}
              className="text-accent italic translate-x-4 md:translate-x-8"
            >
              OS
            </motion.span>
          </h1>
          
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 1 }}
            className="text-lg md:text-2xl text-white/40 font-mono tracking-[0.6em] uppercase max-w-2xl mx-auto pt-8 border-t border-white/5"
          >
            Precision / Protocol / Productivity
          </motion.p>
        </div>

        <div className="flex flex-col items-center gap-12 w-full max-w-md">
          {!isInitializing ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2, duration: 0.8 }}
              className="w-full space-y-12"
            >
              <div className="flex flex-col md:flex-row items-center justify-center gap-10">
                <div className="flex flex-col items-start gap-1">
                  <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest">Network_Stability</span>
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${dbStatus === 'online' ? 'bg-success shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'bg-danger animate-pulse'}`} />
                    <span className="text-xs font-mono text-white/80 uppercase tracking-widest">{dbStatus === 'online' ? 'Verified' : 'Establishing...'}</span>
                  </div>
                </div>
                
                <div className="hidden md:block h-8 w-[1px] bg-white/10" />

                <div className="flex flex-col items-start gap-1">
                  <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest">Encryption_Level</span>
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="text-cyan w-4 h-4" />
                    <span className="text-xs font-mono text-white/80 uppercase tracking-widest">AES_512_X</span>
                  </div>
                </div>
              </div>

              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleEnter}
                disabled={dbStatus === 'checking'}
                className="w-full group relative overflow-hidden bg-white py-8 rounded-[1.5rem] transition-all shadow-[0_40px_80px_rgba(0,0,0,0.4)]"
              >
                <div className="absolute inset-0 bg-accent translate-y-full group-hover:translate-y-0 transition-transform duration-700 ease-[0.16, 1, 0.3, 1]" />
                <div className="relative z-10 flex items-center justify-center gap-4 text-black group-hover:text-white transition-colors duration-700">
                  <span className="text-sm font-mono font-black tracking-[0.5em] uppercase">INITIALIZE_BOOT_SEQUENCE</span>
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-2 transition-transform duration-700" />
                </div>
              </motion.button>

              <div className="flex justify-between w-full opacity-20 px-2">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em]">Build: 4.8.0-STABLE</p>
                <p className="text-[9px] font-mono uppercase tracking-[0.2em]">User: VED_G</p>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-10 w-full"
            >
              <div className="relative w-full h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 2, ease: "easeInOut" }}
                  className="h-full bg-accent shadow-[0_0_25px_rgba(255,69,0,0.6)]"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-8 text-[10px] font-mono text-white/30 uppercase text-left tracking-widest leading-relaxed">
                <div className="space-y-2">
                  <p className="flex justify-between"><span className="text-white/10">[0.002]</span> MOUNTING_FS</p>
                  <p className="flex justify-between"><span className="text-white/10">[0.045]</span> LOADING_NEURAL_MAP</p>
                  <p className="flex justify-between"><span className="text-white/10">[0.120]</span> ESTABLISHING_AUTH</p>
                </div>
                <motion.p 
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ repeat: Infinity, duration: 0.8 }}
                  className="text-right text-accent font-black self-end"
                >
                  DECRYPTING...
                </motion.p>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Decorative Ornaments */}
      <div className="absolute top-20 left-20 hidden lg:block opacity-10 pointer-events-none">
        <div className="p-8 border-l border-t border-white/40 w-40 h-40" />
      </div>
      <div className="absolute bottom-20 right-20 hidden lg:block opacity-10 pointer-events-none">
        <div className="p-8 border-r border-b border-white/40 w-40 h-40 text-right font-mono text-[10px] uppercase flex flex-col justify-end gap-2 tracking-[0.5em]">
          <span>GRID_LOCKED</span>
          <span>40.7128° N, 74.0060° W</span>
        </div>
      </div>
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

function NeuralCore({ stats }: { stats: UserStats | null }) {
  const { progress, totalForLevel } = getLevelFromXP(stats?.experience || 0);
  const percent = (progress / totalForLevel) * 100;

  return (
    <div className="absolute left-[-20px] top-[-20px] w-48 h-48 pointer-events-none opacity-20">
      <motion.div 
        animate={{ 
          rotate: 360,
          scale: [1, 1.1, 1],
        }}
        transition={{ 
          rotate: { repeat: Infinity, duration: 20, ease: "linear" },
          scale: { repeat: Infinity, duration: 4, ease: "easeInOut" }
        }}
        className="w-full h-full relative"
      >
        <div className="absolute inset-0 border-2 border-accent/20 rounded-full border-dashed" />
        <motion.div 
          animate={{ opacity: [0.2, 0.4, 0.2] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute inset-[25%] border border-cyan/40 rounded-full bg-cyan/5 shadow-[0_0_30px_rgba(0,217,255,0.1)]"
        />
        <div className="absolute inset-0">
          {[0, 1, 2, 3].map(i => (
            <motion.div 
              key={i}
              className="absolute w-1 h-1 bg-accent rounded-full"
              style={{ 
                top: '50%', 
                left: '50%', 
                transform: `rotate(${i * 90}deg) translateY(-80px)` 
              }}
            />
          ))}
        </div>
      </motion.div>
      <div className="absolute inset-0 flex items-center justify-center translate-y-4">
         <span className="text-[10px] font-mono text-cyan/40 font-black">{Math.floor(percent)}%</span>
      </div>
    </div>
  );
}

function CommandPalette({ isOpen, onClose, onNavigate, activeTab }: { isOpen: boolean; onClose: () => void; onNavigate: (tab: any) => void; activeTab: string }) {
  const [search, setSearch] = useState('');
  const commands = [
    { id: 'dash', label: 'GO_TO_CORE', icon: <HardDrive size={18} />, tab: 'dashboard' },
    { id: 'tasks', label: 'GO_TO_STACK', icon: <CheckCircle2 size={18} />, tab: 'tasks' },
    { id: 'time', label: 'GO_TO_GRID', icon: <Calendar size={18} />, tab: 'timetable' },
    { id: 'journal', label: 'GO_TO_ARCHIVE', icon: <Book size={18} />, tab: 'journal' },
    { id: 'stats', label: 'GO_TO_EVOLUTION', icon: <TrendingUp size={18} />, tab: 'stats' },
    { id: 'shop', label: 'GO_TO_MARKET', icon: <ShoppingBag size={18} />, tab: 'shop' },
    { id: 'settings', label: 'GO_TO_CONFIG', icon: <Settings size={18} />, tab: 'settings' },
  ];

  const filtered = commands.filter(c => c.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/90 backdrop-blur-md" />
          <motion.div 
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="w-full max-w-lg glass rounded-2xl border border-white/20 overflow-hidden shadow-2xl relative z-10"
          >
            <div className="p-4 border-b border-white/10 flex items-center gap-4 bg-white/5">
              <Command className="text-accent" size={24} />
              <input 
                autoFocus
                placeholder="EXECUTE_COMMAND..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-transparent border-none text-white font-mono outline-none text-lg"
              />
              <kbd className="text-[10px] font-mono bg-white/10 px-2 py-1 rounded text-text-m">ESC</kbd>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2 no-scrollbar">
              {filtered.map(cmd => (
                <button
                  key={cmd.id}
                  onClick={() => { onNavigate(cmd.tab); onClose(); }}
                  className={cn(
                    "w-full flex items-center justify-between p-4 rounded-xl transition-all group",
                    activeTab === cmd.tab ? "bg-accent/20 border border-accent/40" : "hover:bg-white/5"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn("p-2 rounded-lg bg-white/5", activeTab === cmd.tab ? "text-accent" : "text-text-m")}>
                      {cmd.icon}
                    </div>
                    <span className={cn("font-mono text-sm uppercase tracking-widest", activeTab === cmd.tab ? "text-white font-black" : "text-text-m")}>
                      {cmd.label}
                    </span>
                  </div>
                  <ChevronRight size={16} className="text-text-s opacity-0 group-hover:opacity-100" />
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="p-12 text-center opacity-20">
                  <p className="font-mono text-xs uppercase tracking-widest">COMMAND_NOT_FOUND</p>
                </div>
              )}
            </div>
            <div className="p-3 bg-black/40 border-t border-white/5 flex justify-between items-center px-6">
              <span className="text-[8px] font-mono text-text-m uppercase opacity-40 italic">AETHER_RECALIBRATION_OS v2.1.0</span>
              <div className="flex gap-4">
                <span className="text-[8px] font-mono text-text-m uppercase">↑↓ NAVIGATE</span>
                <span className="text-[8px] font-mono text-text-m uppercase">↵ EXECUTE</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function SystemTerminal({ logs }: { logs: any[] }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={cn(
      "fixed bottom-24 lg:bottom-8 right-8 z-[60] transition-all duration-500",
      isExpanded ? "w-80 h-96" : "w-12 h-12"
    )}>
      <motion.div 
        layout
        className={cn(
          "h-full w-full glass rounded-2xl border border-white/10 overflow-hidden flex flex-col shadow-2xl backdrop-blur-2xl",
          isExpanded ? "bg-black/90" : "bg-black/40 hover:scale-110 cursor-pointer"
        )}
      >
        {!isExpanded ? (
          <button onClick={() => setIsExpanded(true)} className="h-full w-full flex items-center justify-center text-accent">
            <Terminal size={20} />
          </button>
        ) : (
          <>
            <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span className="text-[9px] font-mono font-black text-white uppercase tracking-widest">LOGS_NODE_ARCHIVE</span>
              </div>
              <button onClick={() => setIsExpanded(false)} className="text-text-m hover:text-white"><X size={14} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-[9px] space-y-2 no-scrollbar selection:bg-accent/30">
              {logs.map(log => (
                <div key={log.id} className="flex gap-3 animate-in fade-in slide-in-from-left-2 transition-all">
                  <span className="opacity-30 shrink-0">[{log.time}]</span>
                  <span className={cn(
                    "truncate",
                    log.type === 'success' ? 'text-success' : 
                    log.type === 'warn' ? 'text-warning' : 
                    log.type === 'error' ? 'text-accent font-black' : 'text-text-m'
                  )}>
                    {log.msg}
                  </span>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="opacity-10 py-20 text-center uppercase tracking-widest text-[8px]">
                  IDLE_LISTENING...
                </div>
              )}
            </div>
          </>
        )}
      </motion.div>
    </div>
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
    <div className="glass p-4 sm:p-8 rounded-2xl border-l-[6px] sm:border-l-8 border-accent relative overflow-hidden group premium-transition">
      <NeuralCore stats={stats} />
      <CardDecoration />
      <div className="flex flex-col md:flex-row items-center gap-4 sm:gap-8 relative z-10 sm:pl-24 transition-all sm:group-hover:pl-28">
        <div className="relative">
          <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full border-4 border-accent p-1 bg-background-nested overflow-hidden focus-within:ring-2 ring-accent transition-all">
            <img src={user.photoURL || ''} alt="" className="w-full h-full rounded-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" referrerPolicy="no-referrer" />
          </div>
          <motion.div 
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="absolute -bottom-1 -right-1 sm:-bottom-2 sm:-right-2 bg-accent text-white font-mono text-[8px] sm:text-[10px] font-black w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shadow-lg shadow-accent/40"
          >
            {stats.level}
          </motion.div>
        </div>

        <div className="flex-1 space-y-3 sm:space-y-4 text-center md:text-left min-w-0 w-full">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-3xl font-serif font-black text-white uppercase tracking-tight italic glow-text-white truncate">{user.displayName}</h2>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 sm:gap-4">
              <p className="text-[8px] sm:text-[10px] font-mono text-accent uppercase tracking-[0.2em] sm:tracking-[0.5em] font-black whitespace-nowrap">LVL {stats.level} / 100</p>
              <span className="text-[8px] sm:text-[10px] font-mono text-text-m opacity-50 uppercase tracking-widest whitespace-nowrap">• {getTitleForLevel(stats.level)}</span>
              <span className="flex items-center gap-1 text-[8px] sm:text-[10px] font-mono text-warning font-black uppercase whitespace-nowrap">
                <Flame className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> {stats.currentStreak}D STREAK
              </span>
            </div>
          </div>

          <div className="space-y-2 max-w-md mx-auto md:mx-0 w-full">
             <div className="flex justify-between text-[7px] sm:text-[10px] font-mono uppercase gap-2">
                <span className="text-text-m truncate">XP_BARRIER: {Math.floor(levelProgress)}%</span>
                <span className="text-text-s whitespace-nowrap">{currentXP.toLocaleString()}/{nextLevelXP.toLocaleString()} XP</span>
             </div>
             <div className="h-1.5 sm:h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
                <motion.div 
                   initial={{ width: 0 }}
                   animate={{ width: `${levelProgress}%` }}
                   className="h-full bg-gradient-to-r from-cyan to-accent rounded-full shadow-[0_0_15px_rgba(0,217,255,0.4)]"
                />
             </div>
             <div className="flex justify-between text-[6px] sm:text-[8px] font-mono text-text-s uppercase italic opacity-60 gap-4">
                <span className="truncate">Next node: ~{estimatedDays}D</span>
                <span className="whitespace-nowrap">{xpNeeded.toLocaleString()} XP LEFT</span>
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
    { label: 'XP_DATA', value: stats.experience.toLocaleString(), icon: <Activity className="text-cyan w-3 h-3 sm:w-3.5 sm:h-3.5" />, unit: 'PTS' },
    { label: 'TASKS_SYNCED', value: stats.totalTasksCompleted, icon: <CheckCircle2 className="text-success w-3 h-3 sm:w-3.5 sm:h-3.5" />, unit: 'UNITS' },
    { label: 'STREAK', value: stats.currentStreak, icon: <Flame className="text-warning w-3 h-3 sm:w-3.5 sm:h-3.5" />, unit: 'DAYS' },
    { label: 'LOGS', value: journals.length, icon: <Book className="text-accent w-3 h-3 sm:w-3.5 sm:h-3.5" />, unit: 'ENT' },
    { label: 'NODE_SYNC', value: `${Math.floor(levelProgress)}%`, icon: <PieChart className="text-blue-400 w-3 h-3 sm:w-3.5 sm:h-3.5" />, unit: 'VAL' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-4">
      {metrics.map((m, i) => (
        <motion.div 
          key={m.label}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.05 }}
          className="glass p-2.5 sm:p-4 rounded-xl border border-white/5 bg-white/2 hover:bg-white/5 transition-all group overflow-hidden relative"
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="group-hover:scale-110 transition-transform">{m.icon}</div>
            <span className="text-[7px] sm:text-[9px] font-mono text-text-m uppercase tracking-widest font-black whitespace-nowrap">{m.label}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-base sm:text-2xl font-serif font-black text-white italic">{m.value}</span>
            <span className="text-[6px] sm:text-[8px] font-mono text-text-s uppercase opacity-40">{m.unit}</span>
          </div>
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

function LifeSyncOverview({ lifeSync, setActiveTab }: { lifeSync?: UserStats['lifeSync'], setActiveTab: any }) {
  if (!lifeSync) return (
    <div 
      onClick={() => setActiveTab('lifeSync')}
      className="glass p-8 rounded-[2rem] border border-white/5 bg-gradient-to-br from-indigo-500/10 to-transparent cursor-pointer hover:border-indigo-500/30 transition-all flex flex-col items-center justify-center gap-4 text-center group"
    >
       <Network size={40} className="text-indigo-400 group-hover:scale-110 transition-transform" />
       <div>
         <h4 className="text-sm font-mono font-black uppercase tracking-widest text-text-p">INITIALIZE_LIFE_SYNC</h4>
         <p className="text-[10px] font-mono text-text-m opacity-60">"DATA_GAPS_DETECTED. ALIGN_REALITY_PROTOCOLS."</p>
       </div>
    </div>
  );

  const values = lifeSync.current;
  const balanceScore = Number((Object.values(values).reduce((a, b) => a + b, 0) / 8).toFixed(1));
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => setActiveTab('lifeSync')}
      className="glass p-8 lg:p-12 rounded-[2rem] lg:rounded-[3rem] border border-white/5 bg-gradient-to-br from-indigo-500/10 via-transparent to-accent/5 relative overflow-hidden group shadow-2xl cursor-pointer hover:border-white/20 transition-all"
    >
      <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:opacity-10 transition-opacity" style={{ color: '#6366f1' }}>
        <Network size={120} className="rotate-12" />
      </div>
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-[10px] font-mono text-indigo-400 font-black uppercase tracking-[0.4em]">SYSTEM_LIFE_SYNC_ACTIVE</span>
          </div>
          <div className="space-y-1">
             <p className="text-[10px] font-mono text-text-m uppercase tracking-[0.2em] opacity-60">Current_Alignment</p>
             <h2 className="text-5xl font-serif font-black text-text-p italic">{balanceScore}<span className="text-lg opacity-40">/10</span></h2>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-3">
          {LIFE_CATEGORIES.map(cat => {
            const val = values[cat.id] || 0;
            return (
              <div key={cat.id} className="flex flex-col gap-1 items-start min-w-[60px]">
                 <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full" style={{ width: `${val * 10}%`, backgroundColor: cat.color }} />
                 </div>
                 <span className="text-[8px] font-mono font-bold" style={{ color: cat.color }}>{cat.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
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
      
      <LifeSyncOverview lifeSync={stats?.lifeSync} setActiveTab={setActiveTab} />

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
  const [isBoss, setIsBoss] = useState(false);
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
  const [isBreakingDownId, setIsBreakingDownId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleBreakdown = async (task: Task) => {
    setIsBreakingDownId(task.id);
    try {
      const subTasksRaw = await breakdownBossTask(task.title, task.category);
      const subTasks: SubTask[] = subTasksRaw.map((st: any, i: number) => ({
        id: `st-${Date.now()}-${i}`,
        title: st.title,
        completed: false,
        duration: st.duration
      }));
      
      await updateDoc(doc(db, 'tasks', task.id), { subTasks });
      setCompleteToast(`Neural_Link_Expanded: ${subTasks.length} sub-protocols established.`);
    } catch (e) {
      console.error("AI Breakdown Failed", e);
    } finally {
      setIsBreakingDownId(null);
    }
  };

  const toggleSubTask = async (task: Task, subTaskId: string) => {
    if (!task.subTasks) return;
    const newSubTasks = task.subTasks.map(st => 
      st.id === subTaskId ? { ...st, completed: !st.completed } : st
    );
    await updateDoc(doc(db, 'tasks', task.id), { subTasks: newSubTasks });
  };

  const estimateXPWithAI = async () => {
    if (!newTitle.trim()) return;
    setIsEstimating(true);
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY_NOT_FOUND: Configure environment variables for production.");
      }
      const ai = new GoogleGenAI({ apiKey });
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
        isBoss: isBoss,
        customXP: customXP || null,
        isSpeedRun: false, // Updated on completion if user marks it
        difficulty: 'medium', // legacy
        createdAt: new Date().toISOString()
      });
      setNewTitle('');
      setCustomXP('');
      setIsBoss(false);
      setIsChallenging(false);
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
    <div className="space-y-6 lg:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <form onSubmit={addTask} className="glass p-4 lg:p-8 rounded-xl space-y-4 lg:space-y-6 border-t-2 border-t-cyan/20 bg-card/40 premium-transition hover:border-cyan/40 shadow-2xl">
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
                checked={isBoss}
                onChange={(e) => setIsBoss(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-black/40 text-danger focus:ring-0 cursor-pointer"
              />
              <span className="text-[10px] font-mono font-bold text-text-m group-hover:text-danger transition-colors">BOSS_PROTOCOL</span>
            </label>
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
                <div className="flex items-center gap-3">
                  <h3 className={cn("text-xl font-serif font-black uppercase tracking-tight italic truncate", task.status === 'completed' ? "line-through text-text-m" : "text-text-p")}>
                    {task.title}
                  </h3>
                  {task.priority === 'critical' && <Zap size={14} className="text-danger animate-pulse shrink-0" />}
                  {task.isBoss && task.status === 'pending' && !task.subTasks && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleBreakdown(task); }}
                      disabled={isBreakingDownId === task.id}
                      className={cn(
                        "p-1.5 rounded bg-white/5 border border-white/10 text-cyan hover:bg-cyan/10 transition-all",
                        isBreakingDownId === task.id && "animate-spin"
                      )}
                      title="AI_BREAKDOWN"
                    >
                      <Brain size={14} />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                  {/* ... badges ... */}
                  <span className={cn(
                    "text-[9px] px-2 py-0.5 rounded-sm font-bold uppercase font-mono border whitespace-nowrap",
                    task.priority === 'critical' ? "border-danger/30 bg-danger/10 text-danger shadow-[0_0_10px_rgba(255,61,61,0.1)]" : 
                    task.priority === 'high' ? "border-orange-500/30 bg-orange-500/10 text-orange-400" : 
                    task.priority === 'medium' ? "border-warning/30 bg-warning/10 text-warning" : 
                    "border-cyan/30 bg-cyan/10 text-cyan shadow-[0_0_10px_rgba(0,217,255,0.1)]"
                  )}>
                    PRIOR_{task.priority}
                  </span>
                  <span className="text-[9px] text-text-m uppercase font-bold tracking-widest font-mono truncate">NODE_{task.category}</span>
                  <span className="text-[9px] text-text-s uppercase font-mono">{task.estimate} MIN</span>
                  {task.scheduledStart && (
                    <span className="text-[9px] text-cyan font-mono font-black border border-cyan/30 bg-cyan/5 px-1.5 rounded-sm">
                      SCHEDULED: {format(parseISO(task.scheduledStart), 'HH:mm')}
                    </span>
                  )}
                  {task.isBoss && (
                    <span className="text-[9px] text-danger font-mono font-black border border-danger/30 bg-danger/5 px-1.5 rounded-sm shadow-[0_0_10px_rgba(255,61,61,0.2)] animate-pulse uppercase">BOSS_PROTOCOL_5X</span>
                  )}
                  {task.isChallenging && (
                    <span className="text-[9px] text-accent font-mono font-black border border-accent/30 bg-accent/5 px-1.5 rounded-sm whitespace-nowrap">CHALLENGE_ACT_1.5X</span>
                  )}
                  {task.isSpeedRun && (
                    <span className="text-[9px] text-orange-400 font-mono font-black border border-orange-400/30 bg-orange-400/5 px-1.5 rounded-sm whitespace-nowrap">SPEED_RUN_1.2X</span>
                  )}
                </div>

                {/* Sub-tasks list */}
                {task.subTasks && task.subTasks.length > 0 && (
                  <div className="mt-4 pl-4 border-l-2 border-white/5 space-y-2">
                    {task.subTasks.map(st => (
                      <div key={st.id} className="flex items-center gap-3">
                        <button 
                          onClick={() => toggleSubTask(task, st.id)}
                          className={cn("p-1 transition-all", st.completed ? "text-success" : "text-text-m opacity-40 hover:opacity-100")}
                        >
                          {st.completed ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                        </button>
                        <span className={cn("text-[10px] font-mono", st.completed ? "line-through text-text-m opacity-40" : "text-text-p")}>
                          {st.title} <span className="opacity-40 ml-1">[{st.duration}M]</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
              <div className="flex items-center gap-4 relative z-10">
                 <div className="hidden lg:flex flex-col items-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[8px] font-mono text-text-s uppercase">HASH_{task.id.slice(0, 8)}</span>
                    <span className="text-[8px] font-mono text-text-s uppercase">SYNC_DATE_{new Date(task.createdAt).toLocaleDateString().replace(/\//g, '.')}</span>
                 </div>
                
                {deleteConfirmId === task.id ? (
                  <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                    <motion.button 
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => { deleteTask(task.id); setDeleteConfirmId(null); }}
                      className="bg-danger/20 hover:bg-danger text-danger hover:text-white border border-danger/30 px-3 py-1 rounded-lg text-[9px] font-mono font-black uppercase transition-all shadow-[0_0_15px_rgba(255,0,0,0.2)]"
                    >
                      CONFIRM_ERASE
                    </motion.button>
                    <motion.button 
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setDeleteConfirmId(null)}
                      className="bg-white/5 hover:bg-white/10 text-text-m border border-white/10 px-3 py-1 rounded-lg text-[9px] font-mono font-black uppercase transition-all"
                    >
                      ABORT
                    </motion.button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setDeleteConfirmId(task.id)}
                    className="text-text-m hover:text-danger p-2 transition-all hover:bg-danger/10 rounded-lg group-hover:translate-x-0 translate-x-2 opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
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
    },
    {
      category: "FUTURE_ROADMAP",
      items: [
        {
          title: "NEURAL_PERK_TREE",
          description: "A recursive logic path to unlock specialized cognitive boosts, passive XP yields, and advanced interface overrides.",
          icon: <Network size={18} className="text-cyan" />
        },
        {
          title: "TEMPORAL_RAIDS",
          description: "High-stakes, high-reward synchronization events that challenge your focus-density against 'glitch' interference.",
          icon: <Zap size={18} className="text-warning" />
        },
        {
          title: "SYSTEM_THEMES",
          description: "Real-time environment recalibration. Unlock unique aesthetic 'skins' for Aether_OS using marketplace credits.",
          icon: <Palette size={18} className="text-accent" />
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

function FocusProtocol({ stats, user, onAddXP, setCompleteToast }: { stats: UserStats | null, user: User, onAddXP: any, setCompleteToast: any }) {
  const [timerMode, setTimerMode] = React.useState<'POMODORO' | 'DEEP_WORK'>('POMODORO');
  const [phase, setPhase] = React.useState<'WORK' | 'SHORT_BREAK' | 'LONG_BREAK'>('WORK');
  const [timeLeft, setTimeLeft] = React.useState(25 * 60);
  const [isActive, setIsActive] = React.useState(false);
  const [sessionsCompleted, setSessionsCompleted] = React.useState(0);

  const getPhaseDuration = (p: typeof phase, m: typeof timerMode) => {
    if (p === 'LONG_BREAK') return 15 * 60;
    if (m === 'POMODORO') return p === 'WORK' ? 25 * 60 : 5 * 60;
    return p === 'WORK' ? 50 * 60 : 10 * 60;
  };

  const playPhaseSound = (isWorkEnd: boolean) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      // High pitch for work end (starting break), Lower for break end (starting work)
      oscillator.frequency.setValueAtTime(isWorkEnd ? 880 : 440, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(isWorkEnd ? 1320 : 660, audioCtx.currentTime + 0.1);

      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      console.warn("Audio blocked");
    }
  };

  const handleSessionComplete = async () => {
    if (phase === 'WORK') {
      const isLastInCycle = sessionsCompleted === 3;
      const newTotalSessions = (stats?.pomodoroSessions || 0) + 1;
      const newTodaySessions = (stats?.pomodoroToday || 0) + 1;
      
      await updateDoc(doc(db, 'user_stats', user.uid), {
        pomodoroSessions: newTotalSessions,
        pomodoroToday: newTodaySessions
      });

      onAddXP(25, 'POMODORO_SESSION_COMPLETE');
      if (isLastInCycle) {
        onAddXP(50, 'FOCUS_CYCLE_MASTER_BONUS');
        setCompleteToast('FOCUS_CYCLE_PROTOCOL_COMPLETE');
        setTimeout(() => setCompleteToast(null), 3000);
        setPhase('LONG_BREAK');
        setTimeLeft(15 * 60);
      } else {
        setPhase('SHORT_BREAK');
        setTimeLeft(timerMode === 'POMODORO' ? 5 * 60 : 10 * 60);
      }
      
      setSessionsCompleted(prev => (prev + 1) % 4);
      playPhaseSound(true);
    } else {
      // Break over
      setPhase('WORK');
      setTimeLeft(timerMode === 'POMODORO' ? 25 * 60 : 50 * 60);
      playPhaseSound(false);
    }
    setIsActive(false);
  };

  useEffect(() => {
    let interval: any = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      handleSessionComplete();
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft, phase]);

  const resetTimer = () => {
    setIsActive(false);
    setPhase('WORK');
    setTimeLeft(getPhaseDuration('WORK', timerMode));
    setSessionsCompleted(0);
  };

  const toggleTimer = () => {
    setIsActive(!isActive);
  };

  const changeMode = (m: typeof timerMode) => {
    setIsActive(false);
    setTimerMode(m);
    setPhase('WORK');
    setTimeLeft(getPhaseDuration('WORK', m));
    setSessionsCompleted(0);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="glass p-8 rounded-3xl border border-white/5 space-y-8 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
        <Clock size={120} className="text-white" />
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
             <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
             <span className="text-[10px] font-mono text-accent uppercase tracking-[0.4em] font-black">Focus_Protocol_Active</span>
          </div>
          <h3 className="text-3xl font-serif font-black text-white uppercase italic tracking-wider">AETHER_POMODORO</h3>
          
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 w-fit">
            <button 
              onClick={() => changeMode('POMODORO')}
              className={cn(
                "px-4 py-2 rounded-lg text-[10px] font-mono font-black uppercase tracking-widest transition-all",
                timerMode === 'POMODORO' ? "bg-white/10 text-text-p shadow-xl" : "text-text-m opacity-50 hover:opacity-100"
              )}
            >
              POMODORO
            </button>
            <button 
              onClick={() => changeMode('DEEP_WORK')}
              className={cn(
                "px-4 py-2 rounded-lg text-[10px] font-mono font-black uppercase tracking-widest transition-all",
                timerMode === 'DEEP_WORK' ? "bg-white/20 text-accent shadow-xl" : "text-text-m opacity-50 hover:opacity-100"
              )}
            >
              DEEP_WORK
            </button>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4">
           <div className="text-7xl font-mono font-black text-white text-glow-white tracking-tighter">
             {formatTime(timeLeft)}
           </div>
           <div className="flex items-center gap-2">
              <p className="text-[10px] font-mono text-text-m uppercase tracking-widest opacity-60">
                 {phase === 'WORK' ? 'WORK_SESSION' : phase === 'SHORT_BREAK' ? 'SHORT_BREAK' : 'LONG_BREAK'}
              </p>
              <div className="flex gap-1.5 ml-4">
                {[...Array(4)].map((_, i) => (
                  <div 
                    key={i} 
                    className={cn(
                      "w-2 h-2 rounded-full transition-all duration-500",
                      i < sessionsCompleted ? "bg-accent shadow-[0_0_8px_rgba(255,51,102,0.6)]" : "bg-white/10 border border-white/5"
                    )} 
                  />
                ))}
              </div>
           </div>
        </div>

        <div className="flex gap-3">
           <button 
            onClick={toggleTimer}
            className={cn(
              "px-8 py-3 rounded-xl font-mono text-xs font-black uppercase tracking-widest transition-all shadow-xl",
              isActive ? "bg-white/5 text-text-p border border-white/20" : "bg-accent text-white accent-glow"
            )}
           >
             {isActive ? 'PAUSE' : 'START_MISSION'}
           </button>
           <button 
            onClick={resetTimer}
            className="p-3 bg-white/5 border border-white/10 text-text-m hover:text-text-p rounded-xl transition-all"
           >
             <Eraser size={18} />
           </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
         <div className="glass p-4 rounded-2xl border border-white/5 bg-black/40">
            <p className="text-[8px] font-mono text-text-m uppercase tracking-widest mb-1">PROTOCOLS_LIFETIME</p>
            <p className="text-xl font-mono font-black text-white">{stats?.pomodoroSessions || 0}</p>
         </div>
         <div className="glass p-4 rounded-2xl border border-white/5 bg-black/40">
            <p className="text-[8px] font-mono text-text-m uppercase tracking-widest mb-1">PROTOCOLS_TODAY</p>
            <p className="text-xl font-mono font-black text-accent text-glow-soft">{stats?.pomodoroToday || 0}</p>
         </div>
      </div>
    </div>
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
  updateTask,
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
  deleteTimeBlock: (id: string, source?: 'task' | 'block') => Promise<void>;
  updateTimeBlock: (id: string, updates: Partial<TimeBlock>, source?: 'task' | 'block') => Promise<void>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
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
  
  const [draggingBlock, setDraggingBlock] = useState<{
    id: string;
    source: 'task' | 'block';
    initialTop: number;
    initialStartY: number;
    initialStartTime: string;
    initialEndTime: string;
  } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  // Sync scheduled tasks into the timetable
  const allBlocks = useMemo(() => {
    const blocks = timeBlocks.map(b => ({ 
      ...b, 
      source: 'block' as const,
      originalTask: null as Task | null
    }));
    
    tasks.forEach(t => {
      if (t.scheduledStart && t.scheduledEnd) {
        blocks.push({
          id: t.id,
          userId: t.userId,
          title: t.title,
          type: 'task',
          startTime: t.scheduledStart,
          endTime: t.scheduledEnd,
          completed: t.status === 'completed',
          source: 'task' as const,
          originalTask: t
        } as any);
      }
    });
    
    return blocks;
  }, [timeBlocks, tasks]);

  useEffect(() => {
    if (!draggingBlock) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.pageY - draggingBlock.initialStartY;
      setDragOffset(deltaY);
    };

    const handleMouseUp = async () => {
      if (!draggingBlock) return;

      const finalOffsetMinutes = Math.round(dragOffset / 1.6);
      if (finalOffsetMinutes === 0) {
        setDraggingBlock(null);
        setDragOffset(0);
        return;
      }

      const start = parseISO(draggingBlock.initialStartTime);
      const end = parseISO(draggingBlock.initialEndTime);
      
      const newStart = addMinutes(start, finalOffsetMinutes);
      const newEnd = addMinutes(end, finalOffsetMinutes);

      if (draggingBlock.source === 'block') {
        await updateTimeBlock(draggingBlock.id, {
          startTime: newStart.toISOString(),
          endTime: newEnd.toISOString()
        });
      } else {
        await updateTask(draggingBlock.id, {
          scheduledStart: newStart.toISOString(),
          scheduledEnd: newEnd.toISOString()
        });
      }

      setDraggingBlock(null);
      setDragOffset(0);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingBlock, dragOffset, updateTimeBlock, updateTask]);

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
        
        // Only clear BLOCKS, don't delete TASKS
        const todayBlocks = timeBlocks.filter(b => b.startTime.startsWith(todayStr));
        for (const b of todayBlocks) {
          batch.delete(doc(db, 'time_blocks', b.id));
        }

        // Also clear existing scheduled times for tasks today to avoid overlaps or duplicates if they are rescheduled
        const todayTasks = tasks.filter(t => t.scheduledStart?.startsWith(todayStr));
        for (const t of todayTasks) {
          batch.update(doc(db, 'tasks', t.id), { scheduledStart: null, scheduledEnd: null });
        }

        for (const block of blocks) {
          // Sync check: Does this block title match an existing pending task?
          const matchingTask = pendingTasks.find(t => 
            t.title.toLowerCase().includes(block.title.toLowerCase()) || 
            block.title.toLowerCase().includes(t.title.toLowerCase())
          );

          if (block.type === 'task' && matchingTask) {
            batch.update(doc(db, 'tasks', matchingTask.id), {
              scheduledStart: block.startTime,
              scheduledEnd: block.endTime
            });
          } else if (block.type === 'task') {
            // It's a new task suggested by AI, create a Task doc instead of a TimeBlock
            const newTaskRef = doc(collection(db, 'tasks'));
            batch.set(newTaskRef, {
              userId: user.uid,
              title: block.title,
              priority: 'medium',
              status: 'pending',
              category: 'learning',
              estimate: differenceInMinutes(parseISO(block.endTime), parseISO(block.startTime)),
              difficulty: 'medium',
              scheduledStart: block.startTime,
              scheduledEnd: block.endTime,
              createdAt: new Date().toISOString()
            });
          } else {
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
      <div className="space-y-6 lg:space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
           <div className="flex flex-col md:flex-row md:items-center gap-4 lg:gap-6 overflow-x-auto no-scrollbar pb-2 md:pb-0">
              <div className="flex glass p-1 rounded-lg border border-white/5 shrink-0">
                {(['month', 'week', 'day'] as const).map(mode => (
                  <button key={mode} onClick={() => setViewMode(mode)} className={cn("px-4 py-1.5 rounded-md text-[10px] font-mono font-black uppercase transition-all", viewMode === mode ? "bg-accent text-white" : "text-text-m hover:text-text-p")}>{mode}</button>
                ))}
              </div>
              <div className="flex items-center gap-4 shrink-0">
                 <button onClick={() => setCurrentDate(addDays(currentDate, viewMode === 'week' ? -7 : -1))} className="p-2 hover:bg-white/5 rounded-full text-text-m border border-white/5"><ChevronRight className="rotate-180" size={16} /></button>
                 <span className="text-[10px] lg:text-sm font-mono font-black uppercase tracking-widest whitespace-nowrap">{viewMode === 'week' ? `Week of ${format(days[0], 'MMM do')}` : format(currentDate, 'EEEE, MMM do')}</span>
                 <button onClick={() => setCurrentDate(addDays(currentDate, viewMode === 'week' ? 7 : 1))} className="p-2 hover:bg-white/5 rounded-full text-text-m border border-white/5"><ChevronRight size={16} /></button>
              </div>
           </div>
           
           <div className="flex gap-2 lg:gap-4 overflow-x-auto no-scrollbar pb-2 xl:pb-0">
              <button 
                onClick={() => setIsAIModalOpen(true)}
                className="flex items-center gap-2 lg:gap-3 px-3 lg:px-5 py-2 glass border border-accent/40 text-accent font-mono text-[9px] lg:text-[10px] font-black uppercase tracking-widest hover:bg-accent/10 hover:border-accent transition-all rounded-lg accent-glow-soft group shrink-0"
              >
                <Sparkles size={12} className="group-hover:animate-pulse" /> AI Scheduler
              </button>
              <button 
                onClick={() => setIsTemplateModalOpen(true)}
                className="flex items-center gap-2 px-3 lg:px-4 py-2 glass border border-cyan/30 text-cyan font-mono text-[9px] lg:text-[10px] font-black uppercase tracking-widest hover:bg-cyan/10 transition-all rounded-lg shrink-0"
              >
                <LayoutGrid size={12} /> Templates
              </button>
              <button 
                onClick={() => { setBlockForm({ startTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"), endTime: format(addHours(new Date(), 1), "yyyy-MM-dd'T'HH:mm"), type: 'task' }); setIsBlockModalOpen(true); }}
                className="flex items-center gap-2 px-3 lg:px-4 py-2 bg-accent text-white font-mono text-[9px] lg:text-[10px] font-black uppercase tracking-widest hover:bg-red-600 transition-all rounded-lg accent-glow shadow-xl shrink-0"
              >
                <Plus size={12} /> Add Block
              </button>
           </div>
        </div>

        <FocusProtocol stats={stats} user={user} onAddXP={onAddXP} setCompleteToast={setCompleteToast} />

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
                  const dayBlocks = allBlocks.filter(b => b.startTime.startsWith(dayStr));
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
                         const initialTop = ((start.getHours() - 5) * 60 + start.getMinutes()) * 1.6;
                         const height = differenceInMinutes(end, start) * 1.6;
                         
                         const isDragging = draggingBlock?.id === block.id;
                         const top = isDragging ? initialTop + dragOffset : initialTop;
                         
                         const typeColors = {
                            task: 'border-warning bg-warning/10 text-warning',
                            event: 'border-cyan bg-cyan/10 text-cyan',
                            break: 'border-success bg-success/10 text-success',
                            routine: 'border-accent bg-accent/10 text-accent'
                         };

                         return (
                           <motion.div 
                             key={block.id}
                             whileHover={!draggingBlock ? { scale: 1.02, zIndex: 10 } : {}}
                             onMouseDown={(e) => {
                               e.stopPropagation();
                               setDraggingBlock({
                                 id: block.id,
                                 source: (block as any).source || 'block',
                                 initialTop,
                                 initialStartY: e.pageY,
                                 initialStartTime: block.startTime,
                                 initialEndTime: block.endTime
                               });
                             }}
                             onClick={() => { if (!draggingBlock) { setBlockForm(block); setIsBlockModalOpen(true); } }}
                             className={cn(
                                "absolute left-2 right-2 rounded-xl border-t-4 p-3 glass flex flex-col justify-between overflow-hidden cursor-grab active:cursor-grabbing select-none transition-shadow",
                                typeColors[block.type] || typeColors.task,
                                isDragging && "z-50 shadow-[0_0_40px_rgba(255,255,255,0.2)] opacity-90 scale-[1.02] border-white/40"
                             )}
                             style={{ top: `${top}px`, height: `${height}px` }}
                           >
                              <div className="space-y-1">
                                 <div className="flex justify-between items-start">
                                    <p className="text-[8px] font-mono uppercase font-black tracking-widest opacity-60">{(block as any).source === 'task' ? 'SYNCED_TASK' : block.type}</p>
                                    {(block as any).completed && <CheckCircle2 size={10} className="text-success" />}
                                 </div>
                                 <p className="text-xs font-bold leading-tight uppercase font-serif italic truncate">{block.title}</p>
                              </div>
                              <div className="flex justify-between items-center mt-2">
                                 <span className="text-[8px] font-mono opacity-50">
                                   {format(isDragging ? addMinutes(start, Math.round(dragOffset/1.6)) : start, 'HH:mm')}
                                 </span>
                                 <div className="flex gap-2">
                                   {(block as any).source === 'task' && !block.completed && (
                                     <button 
                                       onClick={(e) => { 
                                         e.stopPropagation(); 
                                         if ((block as any).originalTask) {
                                           onComplete((block as any).originalTask);
                                         }
                                       }} 
                                       className="hover:text-success p-1 opacity-40 hover:opacity-100"
                                     >
                                       <CheckCircle2 size={10} />
                                     </button>
                                   )}
                                   <button 
                                     onClick={(e) => { 
                                       e.stopPropagation(); 
                                       if ((block as any).source === 'block') {
                                         deleteTimeBlock(block.id);
                                       } else {
                                         deleteTimeBlock(block.id, 'task');
                                       }
                                     }} 
                                     className="hover:text-danger p-1 opacity-40 hover:opacity-100"
                                   >
                                     <Trash2 size={10} />
                                   </button>
                                 </div>
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
      {(viewMode === 'week' || viewMode === 'day') && (
        <div className="grid grid-cols-1 gap-6">
          {/* Protocol Buffer (Unscheduled Tasks) */}
          <div className="glass p-6 rounded-3xl border border-white/5 bg-white/2 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan/2 rounded-full -translate-y-32 translate-x-32 blur-3xl" />
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan/10 flex items-center justify-center border border-cyan/20">
                  <Database size={16} className="text-cyan" />
                </div>
                <div>
                  <h3 className="text-xs font-mono font-black text-white uppercase tracking-[0.3em]">Protocol_Buffer</h3>
                  <p className="text-[8px] font-mono text-text-m uppercase opacity-50">Pending Synchronization</p>
                </div>
              </div>
              <span className="text-[10px] font-mono text-text-m bg-white/5 px-2 py-1 rounded border border-white/5 italic">
                {tasks.filter(t => t.status === 'pending' && !t.scheduledStart).length} PENDING_LOADS
              </span>
            </div>
            
            <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar relative z-10 scroll-smooth">
              {tasks.filter(t => t.status === 'pending' && !t.scheduledStart).length === 0 ? (
                <div className="py-6 px-4 text-center w-full">
                  <p className="text-[10px] font-mono text-text-s uppercase tracking-widest opacity-40">ALL_PROTOCOLS_SYNCHRONIZED</p>
                </div>
              ) : (
                tasks.filter(t => t.status === 'pending' && !t.scheduledStart).map(task => (
                  <motion.div 
                    key={task.id} 
                    whileHover={{ scale: 1.02, backgroundColor: 'rgba(0, 217, 255, 0.05)' }}
                    onClick={() => { 
                      const now = new Date();
                      now.setMinutes(Math.round(now.getMinutes() / 15) * 15);
                      const end = addMinutes(now, task.estimate || 30);
                      setBlockForm({
                        id: task.id,
                        title: task.title,
                        startTime: format(now, "yyyy-MM-dd'T'HH:mm"),
                        endTime: format(end, "yyyy-MM-dd'T'HH:mm"),
                        type: 'task',
                        source: 'task'
                      } as any);
                      setIsBlockModalOpen(true);
                    }}
                    className="min-w-[200px] p-4 glass border border-white/10 rounded-2xl cursor-pointer hover:border-cyan/40 transition-all flex flex-col justify-between group/task bg-black/20"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[8px] font-mono text-cyan uppercase font-black tracking-tighter opacity-70 group-hover/task:opacity-100 italic">SYSTEM_PENDING</span>
                      <ChevronRight size={12} className="text-text-m opacity-0 group-hover/task:opacity-100 group-hover/task:translate-x-1 transition-all" />
                    </div>
                    <p className="text-sm font-serif font-black text-white italic uppercase tracking-tight truncate mb-2">{task.title}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono text-text-m opacity-50 uppercase">NODE_{task.category}</span>
                      <span className="text-[9px] font-mono text-cyan font-black uppercase">{task.estimate}M</span>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>

          {viewMode === 'week' && renderTimetableView(eachDayOfInterval({ start: startOfWeek(currentDate, { weekStartsOn: 1 }), end: endOfWeek(currentDate, { weekStartsOn: 1 }) }))}
          {viewMode === 'day' && renderTimetableView([currentDate])}
        </div>
      )}

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
                    <button onClick={() => { 
                      if (blockForm.id) { 
                        updateTimeBlock(blockForm.id, blockForm, (blockForm as any).source); 
                      } else { 
                        addTimeBlock(blockForm as any); 
                      } 
                      setIsBlockModalOpen(false); 
                    }} className="flex-1 py-4 bg-accent text-white font-mono font-black uppercase rounded-xl accent-glow">{blockForm.id ? 'Update Sync' : 'Initialize'}</button>
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

function RoutineMatrixView({ 
  habits, 
  habitLogs, 
  user, 
  onAddHabit, 
  onToggleHabit, 
  onDeleteHabit 
}: { 
  habits: Habit[]; 
  habitLogs: HabitLog[]; 
  user: User; 
  onAddHabit: (h: any) => Promise<void>; 
  onToggleHabit: (h: Habit, date: string) => Promise<void>;
  onDeleteHabit: (id: string) => Promise<void>;
}) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedHabit, setSelectedHabit] = useState<Habit | null>(null);
  const [newHabit, setNewHabit] = useState({
    name: '',
    category: 'routine',
    frequency: 'daily',
    targetStreak: 30,
    color: '#00D9FF'
  });

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  
  const activeHabits = habits.filter(h => !h.isArchived);

  // Helper: Calculate streak for a habit
  const calculateStreak = (habitId: string) => {
    const logs = habitLogs
      .filter(l => l.habitId === habitId && l.completed)
      .map(l => l.date)
      .sort((a, b) => b.localeCompare(a));
    
    if (logs.length === 0) return 0;
    
    let streak = 0;
    let checkDate = new Date();
    const todayStr = format(checkDate, 'yyyy-MM-dd');
    const yesterdayStr = format(subDays(checkDate, 1), 'yyyy-MM-dd');
    
    if (logs[0] !== todayStr && logs[0] !== yesterdayStr) return 0;

    let currentIdx = 0;
    while (currentIdx < logs.length) {
      const expected = format(subDays(new Date(logs[0]), streak), 'yyyy-MM-dd');
      if (logs.find(l => l === expected)) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  };

  // Helper: Best streak
  const calculateBestStreak = (habitId: string) => {
    const logs = habitLogs
      .filter(l => l.habitId === habitId && l.completed)
      .map(l => l.date)
      .sort((a, b) => a.localeCompare(b));
    
    if (logs.length === 0) return 0;
    
    let best = 0;
    let current = 1;
    for (let i = 1; i < logs.length; i++) {
      const prevDate = new Date(logs[i-1]);
      const currDate = new Date(logs[i]);
      const diff = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (diff === 1) {
        current++;
      } else {
        best = Math.max(best, current);
        current = 1;
      }
    }
    return Math.max(best, current);
  };

  // Heatmap Data (last 52 weeks)
  const heatmapData = useMemo(() => {
    const data = [];
    const end = new Date();
    const start = subDays(end, 364); // 52 weeks
    
    // Adjust start to Monday
    const mondayStart = startOfWeek(start, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: mondayStart, end });

    // Group logs by date
    const logsByDate: Record<string, number> = {};
    habitLogs.forEach(log => {
      if (log.completed) {
        logsByDate[log.date] = (logsByDate[log.date] || 0) + 1;
      }
    });

    return days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      return {
        date: dateStr,
        count: logsByDate[dateStr] || 0,
        dayName: format(day, 'EEE'),
        weekNum: format(day, 'w')
      };
    });
  }, [habitLogs]);

  const categories = [
    { id: 'health', icon: <Activity size={14} />, mult: '1.2x', label: 'Health' },
    { id: 'learning', icon: <Book size={14} />, mult: '1.1x', label: 'Learning' },
    { id: 'creative', icon: <Palette size={14} />, mult: '1.15x', label: 'Creative' },
    { id: 'work', icon: <Briefcase size={14} />, mult: '1.0x', label: 'Work' },
    { id: 'personal', icon: <Users size={14} />, mult: '0.9x', label: 'Personal' },
    { id: 'routine', icon: <Clock size={14} />, mult: '0.7x', label: 'Routine' },
  ];

  const getIntensity = (count: number) => {
    if (count === 0) return 'bg-white/5';
    if (count <= 2) return 'bg-cyan/20';
    if (count <= 4) return 'bg-cyan/50';
    return 'bg-cyan';
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
               <Cpu size={20} className="text-accent" />
             </div>
             <div>
               <h2 className="text-2xl font-serif font-black italic text-white uppercase tracking-tighter">Routine_Matrix</h2>
               <p className="text-[10px] font-mono text-text-m uppercase tracking-[0.2em] opacity-60">Neural_Habit_Synchronization_Unit</p>
             </div>
          </div>
        </div>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-6 py-3 bg-accent text-white font-mono font-black uppercase text-xs rounded-xl accent-glow"
        >
          <Plus size={16} />
          Initialize_New_Habit
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Panel - Habit List */}
        <div className="lg:col-span-4 space-y-6">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs font-mono font-black text-text-m uppercase tracking-widest">Active_Protocols</h3>
            <span className="text-[10px] font-mono text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
              {activeHabits.length} LOADED
            </span>
          </div>

          <div className="space-y-4">
            {activeHabits.length === 0 ? (
              <div className="glass p-12 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center gap-4 opacity-40">
                <div className="w-16 h-16 rounded-full border border-dashed border-white/20 flex items-center justify-center">
                  <Database size={24} />
                </div>
                <div>
                  <p className="text-xs font-mono font-black uppercase mb-1">NO_HABITS_DETECTED</p>
                  <p className="text-[10px] font-mono opacity-60 italic">"CREATE_FIRST_HABIT_TO_BEGIN_SYNC"</p>
                </div>
              </div>
            ) : (
              activeHabits.map(habit => {
                const isDoneToday = habitLogs.some(l => l.habitId === habit.id && l.date === todayStr);
                const streak = calculateStreak(habit.id);
                const catInfo = categories.find(c => c.id === habit.category);
                
                return (
                  <motion.div 
                    key={habit.id}
                    layoutId={habit.id}
                    className="glass rounded-2xl border border-white/5 bg-white/2 overflow-hidden group hover:border-cyan/30 transition-all cursor-pointer"
                  >
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1" onClick={() => setSelectedHabit(habit)}>
                        <div 
                          className="w-10 h-10 rounded-lg flex items-center justify-center border transition-all"
                          style={{ 
                            backgroundColor: `${habit.color}10`,
                            borderColor: `${habit.color}30`,
                            color: habit.color 
                          }}
                        >
                          {catInfo?.icon}
                        </div>
                        <div className="space-y-0.5 overflow-hidden">
                          <h4 className="text-sm font-serif font-black text-white italic uppercase truncate">{habit.name}</h4>
                          <div className="flex items-center gap-2">
                             <div className="flex items-center gap-1">
                               <Flame size={10} className={streak > 0 ? "text-orange-500" : "text-text-s"} />
                               <span className="text-[10px] font-mono font-black text-text-p">{streak > 0 ? streak : '0'}_DAYS</span>
                             </div>
                             <span className="text-[8px] font-mono text-text-m opacity-40 uppercase tracking-tighter">{habit.frequency}</span>
                          </div>
                        </div>
                      </div>
                      
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleHabit(habit, todayStr);
                        }}
                        className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center border transition-all",
                          isDoneToday 
                            ? "bg-cyan border-cyan text-black shadow-[0_0_15px_rgba(0,217,255,0.4)]" 
                            : "bg-white/5 border-white/10 text-white/20 hover:border-cyan/40 hover:text-cyan/40"
                        )}
                      >
                        <CheckCircle2 size={24} />
                      </button>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel - Heatmap */}
        <div className="lg:col-span-8 space-y-6">
          <div className="glass p-8 rounded-3xl border border-white/5 bg-white/2 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-64 h-64 bg-cyan/5 rounded-full -translate-y-32 translate-x-32 blur-3xl" />
             
             <div className="flex justify-between items-center mb-8 relative z-10">
               <div>
                 <h3 className="text-xs font-mono font-black text-white uppercase tracking-widest">Global_Consistency_Map</h3>
                 <p className="text-[10px] font-mono text-text-m uppercase opacity-50">52_Week_Neural_Engagement_Grid</p>
               </div>
               <div className="flex gap-2">
                 <div className="flex items-center gap-1.5">
                   <div className="w-2 h-2 rounded-sm bg-white/5 border border-white/10" />
                   <span className="text-[8px] font-mono text-text-m opacity-50 uppercase">0</span>
                 </div>
                 <div className="flex items-center gap-1.5">
                   <div className="w-2 h-2 rounded-sm bg-cyan/20 border border-cyan/20" />
                   <span className="text-[8px] font-mono text-text-m opacity-50 uppercase">1-2</span>
                 </div>
                 <div className="flex items-center gap-1.5">
                   <div className="w-2 h-2 rounded-sm bg-cyan/50 border border-cyan/50" />
                   <span className="text-[8px] font-mono text-text-m opacity-50 uppercase">3-4</span>
                 </div>
                 <div className="flex items-center gap-1.5">
                   <div className="w-2 h-2 rounded-sm bg-cyan border border-cyan" />
                   <span className="text-[8px] font-mono text-text-m opacity-50 uppercase">5+</span>
                 </div>
               </div>
             </div>

             <div className="relative z-10">
                <div className="flex gap-1 overflow-x-auto pb-4 no-scrollbar">
                  {/* Grid Labels: Days */}
                  <div className="flex flex-col justify-around text-[8px] font-mono text-text-m opacity-30 pr-2 uppercase pb-2">
                    <span>Mon</span>
                    <span className="opacity-0">Tue</span>
                    <span>Wed</span>
                    <span className="opacity-0">Thu</span>
                    <span>Fri</span>
                    <span className="opacity-0">Sat</span>
                    <span>Sun</span>
                  </div>

                  {/* Grid Columns (Weeks) */}
                  <div className="flex gap-1">
                    {Array.from({ length: 52 }).map((_, weekIdx) => (
                      <div key={weekIdx} className="flex flex-col gap-1">
                        {Array.from({ length: 7 }).map((_, dayIdx) => {
                          const dataIdx = weekIdx * 7 + dayIdx;
                          const dayData = heatmapData[dataIdx];
                          if (!dayData) return <div key={dayIdx} className="w-3 h-3 rounded-sm bg-transparent" />;
                          
                          return (
                            <div 
                              key={dayIdx}
                              title={`${dayData.date} - ${dayData.count} habits completed`}
                              className={cn(
                                "w-3 h-3 rounded-sm border border-black/5 flex items-center justify-center text-[6px] font-mono transition-transform hover:scale-125 cursor-help",
                                getIntensity(dayData.count)
                              )}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="mt-4 flex justify-between text-[8px] font-mono text-text-m opacity-30 uppercase">
                  <span>LAST_SYNC: 52_WEEKS_AGO</span>
                  <span>SYNC_TARGET: PRESENT_DAY</span>
                </div>
             </div>
          </div>

          {/* Habit Details View */}
          <AnimatePresence mode="wait">
            {selectedHabit && (
              <motion.div 
                key={selectedHabit.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="glass p-8 rounded-3xl border border-white/10 bg-white/5 relative overflow-hidden"
              >
                <button 
                  onClick={() => setSelectedHabit(null)}
                  className="absolute top-4 right-4 text-text-m hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>

                <div className="flex items-start gap-6 mb-8">
                   <div 
                     className="w-16 h-16 rounded-2xl flex items-center justify-center border-2"
                     style={{ 
                       backgroundColor: `${selectedHabit.color}20`,
                       borderColor: `${selectedHabit.color}40`,
                       color: selectedHabit.color 
                     }}
                   >
                     {categories.find(c => c.id === selectedHabit.category)?.icon}
                   </div>
                   <div className="space-y-2">
                     <h3 className="text-2xl font-serif font-black italic text-white uppercase">{selectedHabit.name}</h3>
                     <div className="flex flex-wrap gap-3">
                       <span className="text-[10px] font-mono text-white bg-white/10 px-2 py-0.5 rounded border border-white/10 uppercase">
                          {selectedHabit.category}
                       </span>
                       <span className="text-[10px] font-mono text-cyan bg-cyan/10 px-2 py-0.5 rounded border border-cyan/20 uppercase">
                          {selectedHabit.frequency}
                       </span>
                       <span className="text-[10px] font-mono text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded border border-orange-400/20 uppercase">
                          Target: {selectedHabit.targetStreak} Days
                       </span>
                     </div>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="glass p-4 rounded-xl border border-white/5 bg-white/2 text-center space-y-1">
                    <p className="text-[8px] font-mono text-text-m uppercase opacity-50">Current_Streak</p>
                    <p className="text-xl font-mono font-black text-white">{calculateStreak(selectedHabit.id)}_DAYS</p>
                  </div>
                  <div className="glass p-4 rounded-xl border border-white/5 bg-white/2 text-center space-y-1">
                    <p className="text-[8px] font-mono text-text-m uppercase opacity-50">Best_Sync_Streak</p>
                    <p className="text-xl font-mono font-black text-accent">{calculateBestStreak(selectedHabit.id)}_DAYS</p>
                  </div>
                  <div className="glass p-4 rounded-xl border border-white/5 bg-white/2 text-center space-y-1">
                    <p className="text-[8px] font-mono text-text-m uppercase opacity-50">Est_Completion_Rate</p>
                    <p className="text-xl font-mono font-black text-cyan">
                      {Math.round((habitLogs.filter(l => l.habitId === selectedHabit.id && l.completed).length / Math.max(1, differenceInMinutes(new Date(), parseISO(selectedHabit.createdAt)) / (24*60))) * 100)}%
                    </p>
                  </div>
                </div>

                <div className="mt-8 flex justify-end gap-4">
                  <button 
                    onClick={() => onDeleteHabit(selectedHabit.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-danger/10 text-danger font-mono font-black uppercase text-[10px] rounded-lg border border-danger/20 hover:bg-danger/20 transition-all"
                  >
                    <Trash2 size={14} />
                    Archive_Protocol
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Add Habit Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-background/90 backdrop-blur-xl">
             <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="w-full max-w-lg glass p-8 rounded-[2rem] border border-white/10 shadow-2xl relative"
             >
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-3 bg-cyan/10 rounded-xl border border-cyan/20">
                    <Plus size={20} className="text-cyan" />
                  </div>
                  <div>
                    <h2 className="text-xl font-serif font-black italic text-white uppercase">Initialize_New_Protocol</h2>
                    <p className="text-[10px] font-mono text-text-m uppercase opacity-50">Configuring_Sync_Parameters</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono font-black text-text-m uppercase ml-1">Habit_Identity</label>
                    <input 
                      type="text"
                      placeholder="ENTER_PROTOCOL_NAME..."
                      value={newHabit.name}
                      onChange={e => setNewHabit({...newHabit, name: e.target.value})}
                      className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-xl focus:border-cyan/50 focus:ring-0 text-white font-mono transition-all outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono font-black text-text-m uppercase ml-1">Category_Link</label>
                      <select 
                        value={newHabit.category}
                        onChange={e => setNewHabit({...newHabit, category: e.target.value as any})}
                        className="w-full px-6 py-4 bg-black/40 border border-white/10 rounded-xl focus:border-cyan/50 text-white font-mono text-sm outline-none appearance-none"
                      >
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.label.toUpperCase()}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono font-black text-text-m uppercase ml-1">Sync_Frequency</label>
                      <select 
                        value={newHabit.frequency}
                        onChange={e => setNewHabit({...newHabit, frequency: e.target.value})}
                        className="w-full px-6 py-4 bg-black/40 border border-white/10 rounded-xl focus:border-cyan/50 text-white font-mono text-sm outline-none appearance-none"
                      >
                        <option value="daily">DAILY</option>
                        <option value="Mon,Wed,Fri">MON_WED_FRI</option>
                        <option value="Tue,Thu">TUE_THU</option>
                        <option value="weekend">WEEKENDS</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono font-black text-text-m uppercase ml-1">Target_Streak</label>
                      <input 
                        type="number"
                        value={newHabit.targetStreak}
                        onChange={e => setNewHabit({...newHabit, targetStreak: parseInt(e.target.value)})}
                        className="w-full px-6 py-4 bg-white/5 border border-white/10 rounded-xl focus:border-cyan/50 text-white font-mono outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono font-black text-text-m uppercase ml-1">Color_Hex</label>
                      <div className="flex gap-2">
                         {['#00D9FF', '#FF4500', '#7C3AED', '#10B981', '#F59E0B'].map(c => (
                           <button 
                             key={c}
                             onClick={() => setNewHabit({...newHabit, color: c})}
                             className={cn(
                               "w-8 h-10 rounded-lg transition-all",
                               newHabit.color === c ? "scale-110 border-2 border-white" : "opacity-40"
                             )}
                             style={{ backgroundColor: c }}
                           />
                         ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button 
                      onClick={() => setIsAddModalOpen(false)}
                      className="flex-1 py-4 glass border border-white/10 text-white font-mono font-black uppercase rounded-xl hover:bg-white/5"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => {
                        onAddHabit(newHabit);
                        setIsAddModalOpen(false);
                      }}
                      className="flex-1 py-4 bg-accent text-white font-mono font-black uppercase rounded-xl accent-glow"
                    >
                      ENGAGE_PROTOCOL
                    </button>
                  </div>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
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
        promptId: usePrompt ? currentPrompt : undefined,
        cognitiveSignature: await (async () => {
          try {
            return await analyzeJournalEntry(content);
          } catch (e) {
            console.error("AI Journal Analysis Failed", e);
            return null;
          }
        })()
      };

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

function StatsView({ stats, user, tasks, journals, timeBlocks, onPurchasePerk }: { stats: UserStats | null; user: User; tasks: Task[]; journals: JournalEntry[]; timeBlocks: TimeBlock[]; onPurchasePerk: (perkId: string) => void }) {
  const [activeSubTab, setActiveSubTab] = useState<'evolution' | 'achievements' | 'perks'>('evolution');
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
             {activeSubTab === 'evolution' ? 'NEURAL_EVOLUTION' : activeSubTab === 'achievements' ? 'SYST_ARCHIVE' : 'NEURAL_PERKS'}
           </h1>
           <p className="text-[10px] font-mono text-text-m uppercase tracking-[0.5em] opacity-40">
             {activeSubTab === 'evolution' ? 'MONTH_OVER_MONTH_SYNC_ANALYSIS' : activeSubTab === 'achievements' ? `Neural_Growth: ${completionRate}% Complete` : 'PURCHASE_CRITICAL_SYSTEM_UPGRADES'}
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
           <button 
             onClick={() => setActiveSubTab('perks')}
             className={cn("px-4 py-2 rounded-lg font-mono text-[10px] font-black uppercase tracking-widest transition-all", activeSubTab === 'perks' ? "bg-accent text-white" : "text-text-m hover:text-white")}
           >
             Perks
           </button>
        </div>
      </div>

      {activeSubTab === 'evolution' && (
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
      )}

      {activeSubTab === 'achievements' && (
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

      {activeSubTab === 'perks' && (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {PERKS.map((perk, i) => {
                const isUnlocked = stats.unlockedPerks?.includes(perk.id);
                const canAfford = (stats.coins || 0) >= perk.cost;
                
                return (
                  <motion.div 
                    key={perk.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className={cn(
                      "glass p-8 rounded-[2.5rem] border flex flex-col justify-between group transition-all relative overflow-hidden h-80",
                      isUnlocked ? "border-success/30 bg-success/5 shadow-[0_0_30px_rgba(34,197,94,0.1)]" : "border-white/5 hover:border-accent/40"
                    )}
                  >
                    <div className="absolute top-0 right-0 p-8 opacity-5 grayscale group-hover:grayscale-0 group-hover:scale-125 transition-all">
                       {perk.icon}
                    </div>
                    
                    <div className="space-y-4 relative z-10">
                       <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-3 rounded-2xl",
                            isUnlocked ? "bg-success/20 text-success shadow-[0_0_15px_rgba(34,197,94,0.2)]" : "bg-white/5 text-accent"
                          )}>
                             {perk.icon}
                          </div>
                          <div>
                            <h3 className="text-xl font-serif font-black text-white italic transition-colors group-hover:text-accent uppercase">{perk.name}</h3>
                            <p className="text-[10px] font-mono text-text-m uppercase opacity-60 font-black">COST_{perk.cost}_CR</p>
                          </div>
                       </div>
                       <p className="text-sm font-mono leading-relaxed text-text-m group-hover:text-text-p transition-colors">{perk.description}</p>
                    </div>

                    <button 
                      disabled={isUnlocked || !canAfford}
                      onClick={() => onPurchasePerk(perk.id)}
                      className={cn(
                        "w-full py-4 rounded-2xl font-mono text-[10px] font-black uppercase tracking-widest transition-all relative z-10",
                        isUnlocked ? "bg-success/10 text-success border border-success/20 cursor-default" :
                        canAfford ? "bg-white text-black hover:bg-accent hover:text-white" :
                        "bg-white/5 text-text-m border border-white/10 opacity-50 cursor-not-allowed"
                      )}
                    >
                      {isUnlocked ? "PROTOCOL_ACTIVE" : canAfford ? "AUTHORIZE_SYNAPSE_PURGE" : "INSUFFICIENT_CREDITS"}
                    </button>
                  </motion.div>
                );
              })}
           </div>

           <div className="glass p-12 rounded-[3.5rem] border border-white/5 text-center space-y-6 relative overflow-hidden bg-accent/5">
              <Network size={48} className="mx-auto text-accent animate-pulse" />
              <div className="space-y-2">
                 <h3 className="text-3xl font-serif font-black text-white italic uppercase tracking-widest">Neural_Pathways</h3>
                 <p className="text-xs font-mono text-text-m uppercase max-w-lg mx-auto opacity-60">Perks provide permanent cognitive enhancements. These upgrades are integrated directly into the Aether_OS Kernel and cannot be revoked once active.</p>
              </div>
           </div>
        </div>
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
      <Analytics />
      <SpeedInsights />
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
