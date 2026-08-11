import React, { useState, useEffect } from 'react';
import { chronos } from '../services/chronos';

export const ChronosClock = () => {
  const [timeLeft, setTimeLeft] = useState(chronos.getRemainingMs());

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(chronos.getRemainingMs());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  return (
    <div className="text-cyan font-mono text-[10px] uppercase tracking-widest">
      <span className="opacity-60">NEXT_DAILY_RESET</span>
      <span className="ml-2 font-black">{formatTime(timeLeft)}</span>
    </div>
  );
};
