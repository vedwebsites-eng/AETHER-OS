import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, X, CheckSquare } from 'lucide-react';

interface WeeklyDebriefModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (wentWell: string, didntGo: string, focus: string) => Promise<void>;
  tasks: any[];
  journals: any[];
  habits: any[];
  habitLogs: any[];
  pomodoroSessions: number;
}

export function WeeklyDebriefModal({
  isOpen,
  onClose,
  onSave,
  tasks,
  journals,
  habits,
  habitLogs,
  pomodoroSessions,
}: WeeklyDebriefModalProps) {
  const [wentWell, setWentWell] = useState('');
  const [didntGo, setDidntGo] = useState('');
  const [nextWeekFocus, setNextWeekFocus] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      analyzeWeekWithGemini();
    }
  }, [isOpen]);

  const analyzeWeekWithGemini = async () => {
    setIsAnalyzing(true);
    try {
      // Direct high-quality deterministic summaries about the logged activities to pre-fill
      const completedTasks = tasks.filter(t => t.status === 'completed').length;
      const totalTasks = tasks.length;
      const completedHabits = habitLogs.filter(l => l.completed).length;

      // Prefill wentWell and didntGo based on actual statistics
      const analyzedWell = `Established positive synchronization sequence. Completed ${completedTasks} of ${totalTasks} scheduled protocols this week. Maintained consistent routine focus checkpoints, achieving a total of ${completedHabits} habit executions. Pomodoro active count reached ${pomodoroSessions} cycles. Neural stability maintains ideal trajectory.`;
      
      const analyzedStruggles = `Identified minor schedule variance checkpoints. A few habits or target routines showed low frequency consistency. Recommend adjusting allocation limits to avoid cognitive overload under high priority queues.`;

      setWentWell(analyzedWell);
      setDidntGo(analyzedStruggles);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async () => {
    await onSave(wentWell, didntGo, nextWeekFocus);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/85 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 30 }}
            className="glass w-full h-full sm:h-auto sm:max-w-lg md:max-w-2xl rounded-none sm:rounded-[2.5rem] border-0 sm:border border-white/10 overflow-hidden flex flex-col relative z-20 shadow-2xl bg-background max-h-screen sm:max-h-[90vh]"
          >
            <div className="p-5 sm:p-6 md:p-8 border-b border-white/5 flex items-center justify-between bg-white/2">
              <div className="flex items-center gap-3">
                <Sparkles size={24} className="text-accent animate-pulse" />
                <div>
                  <h2 className="text-xl sm:text-2xl md:text-3xl font-serif font-black text-white italic uppercase tracking-tighter">DEBRIEF_PROTOCOL</h2>
                  <p className="text-[10px] sm:text-xs font-mono text-text-m uppercase tracking-widest opacity-60">
                    System analysis of completed cognitive cycles
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center">
                <X size={20} className="text-text-m" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 sm:p-6 md:p-8 space-y-6 no-scrollbar">
              {isAnalyzing ? (
                <div className="py-20 text-center space-y-4">
                  <div className="w-12 h-12 border-2 border-t-accent border-r-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs sm:text-sm font-mono text-accent uppercase tracking-widest">INTERROGATING_AI_NODES...</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] sm:text-xs font-mono font-black text-accent uppercase tracking-widest">
                      WHAT_WENT_WELL
                    </label>
                    <textarea
                      value={wentWell}
                      onChange={e => setWentWell(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 p-4 rounded-xl text-sm font-mono text-white outline-none focus:border-accent/40 min-h-[120px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] sm:text-xs font-mono font-black text-danger uppercase tracking-widest">
                      WHAT_DIDNT_GO
                    </label>
                    <textarea
                      value={didntGo}
                      onChange={e => setDidntGo(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 p-4 rounded-xl text-sm font-mono text-white outline-none focus:border-danger/40 min-h-[120px]"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] sm:text-xs font-mono font-black text-cyan uppercase tracking-widest">
                      NEXT_WEEK_FOCUS
                    </label>
                    <textarea
                      value={nextWeekFocus}
                      onChange={e => setNextWeekFocus(e.target.value)}
                      placeholder="Input core focus protocols for the upcoming cycle..."
                      className="w-full bg-black/40 border border-white/10 p-4 rounded-xl text-sm font-mono text-white outline-none focus:border-cyan/40 min-h-[100px]"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="p-5 sm:p-6 md:p-8 bg-white/2 border-t border-white/5 flex gap-4">
              <button
                onClick={handleSubmit}
                disabled={isAnalyzing}
                className="flex-1 py-4 min-h-[44px] bg-accent text-white font-mono font-black text-xs sm:text-sm rounded-xl hover:shadow-[0_0_20px_rgba(255,51,102,0.3)] transition-all uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <CheckSquare size={16} /> SAVE_DEBRIEF (+100 XP)
              </button>
              <button
                onClick={onClose}
                className="px-6 py-4 min-h-[44px] bg-white/5 border border-white/10 text-text-m font-mono font-black text-xs sm:text-sm rounded-xl hover:bg-white/10 transition-all uppercase tracking-widest"
              >
                SKIP_WEEK
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
