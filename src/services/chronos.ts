import { doc, getDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase'; // Corrected path

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

  public isResetNeeded(): boolean {
    if (!this.settings) return false;
    
    const now = new Date();
    const lastReset = this.settings.lastResetAt.toDate();
    
    // Logic to check if a new day has started based on resetTime
    // This is a placeholder for actual reset logic
    return now.getDate() !== lastReset.getDate();
  }
}

export const chronos = new ChronosCore();
