import { doc, getDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface ClockSettings {
  lastResetAt: Timestamp;
  resetTime: string; // "HH:mm"
  timezone: string;
}

class ChronosCore {
  private settings: ClockSettings | null = null;
  private listeners: (() => void)[] = [];

  constructor() {
    this.init();
  }

  private async init() {
    const docRef = doc(db, 'system_settings', 'global_clock');
    
    // Initial fetch
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      this.settings = snap.data() as ClockSettings;
    }

    // Subscribe for real-time updates
    onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        this.settings = snap.data() as ClockSettings;
        this.notifyListeners();
      }
    });
  }

  public subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(l => l());
  }

  public getNextResetTime(): Date {
    if (!this.settings) return new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    const lastReset = this.settings.lastResetAt.toDate();
    const nextReset = new Date(lastReset);
    nextReset.setDate(nextReset.getDate() + 1);
    
    return nextReset;
  }

  public getTimeUntilReset(): number {
    const nextReset = this.getNextResetTime();
    return Math.max(0, nextReset.getTime() - Date.now());
  }

  public isResetNeeded(): boolean {
    return this.getTimeUntilReset() <= 0;
  }
}

export const chronos = new ChronosCore();
