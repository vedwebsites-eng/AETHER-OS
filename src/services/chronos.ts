import { doc, getDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { startOfDay, addDays, differenceInMilliseconds } from 'date-fns';

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
    
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      this.settings = snap.data() as ClockSettings;
      this.notifyListeners();
    }

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

  private getCycleBase(): Date {
    if (!this.settings) return startOfDay(new Date());
    return this.settings.lastResetAt.toDate();
  }

  public getCycleStart(): Date {
    return this.getCycleBase();
  }

  public getCycleEnd(): Date {
    return addDays(this.getCycleStart(), 1);
  }

  public getCurrentCycle(): { start: Date; end: Date } {
    return { start: this.getCycleStart(), end: this.getCycleEnd() };
  }

  public getRemainingMs(): number {
    return Math.max(0, differenceInMilliseconds(this.getCycleEnd(), new Date()));
  }

  public isExpired(timestamp: Timestamp | Date): boolean {
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : timestamp;
    return date < this.getCycleStart();
  }

  public getLocalDateKey(date: Date = new Date()): string {
    return date.toISOString().split('T')[0];
  }
}

export const chronos = new ChronosCore();
