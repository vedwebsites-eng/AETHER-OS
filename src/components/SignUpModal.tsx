import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Eye, EyeOff, Sparkles, User, Lock, Mail, ArrowRight } from 'lucide-react';
import { registerWithEmail } from '../lib/firebase';
import { suggestPassword } from '../services/geminiService';

interface SignUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function SignUpModal({ isOpen, onClose, onSuccess }: SignUpModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGeneratePassword = async () => {
    setIsLoading(true);
    setError('');
    try {
      const suggested = await suggestPassword();
      setPassword(suggested);
    } catch (err) {
      setError('Failed to generate password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async () => {
    setIsLoading(true);
    setError('');
    try {
      await registerWithEmail(email, password);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create account.');
    } finally {
      setIsLoading(false);
    }
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
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 30 }}
            className="glass w-full max-w-sm rounded-[2.5rem] border border-white/10 overflow-hidden flex flex-col relative z-20 shadow-2xl bg-background"
          >
            <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/2">
              <h2 className="text-xl font-serif font-black text-white italic uppercase tracking-tighter">NEW_ACCOUNT_SETUP</h2>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-mono font-black text-text-m uppercase">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-text-m" size={16} />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 p-4 pl-10 rounded-xl text-sm font-mono text-white outline-none focus:border-accent/40"
                    placeholder="OPERATOR@NEURAL.NET"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <label className="text-[10px] font-mono font-black text-text-m uppercase">Password</label>
                    <button onClick={handleGeneratePassword} className="text-[10px] font-mono font-black text-accent uppercase flex items-center gap-1 hover:underline">
                        <Sparkles size={10} /> SUGGEST
                    </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-text-m" size={16} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 p-4 pl-10 pr-10 rounded-xl text-sm font-mono text-white outline-none focus:border-accent/40"
                    placeholder="••••••••"
                  />
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-m hover:text-white"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && <p className="text-red-500 text-xs font-mono">{error}</p>}
            </div>

            <div className="p-8 bg-white/2 border-t border-white/5">
              <button
                onClick={handleSignUp}
                disabled={isLoading || !email || !password}
                className="w-full py-4 bg-accent text-white font-mono font-black text-sm rounded-xl hover:shadow-[0_0_20px_rgba(255,51,102,0.3)] transition-all uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? 'INITIALIZING...' : 'CREATE_ACCOUNT'} <ArrowRight size={14} />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
