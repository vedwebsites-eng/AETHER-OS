import { User } from 'firebase/auth';

export interface UserStats {
  level: number;
  currentStreak: number;
  totalXp: number;
  // Add other fields as needed
}

export interface Habit {
  id: string;
  userId: string;
  name: string;
  category: 'health' | 'learning' | 'creative' | 'work' | 'personal' | 'routine';
  frequency: string;
  createdAt: string;
  targetStreak: number;
  currentStreak: number;
  lastCompletedDate?: string;
  color: string;
  isArchived: boolean;
}
