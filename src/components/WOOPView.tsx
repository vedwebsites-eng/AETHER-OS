import React, { useState } from 'react';
import { WOOPPlan } from '../types';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface WOOPViewProps {
  woopPlans: WOOPPlan[];
  user: any;
}

export const WOOPView: React.FC<WOOPViewProps> = ({ woopPlans, user }) => {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ wish: '', outcome: '', obstacle: '', plan: '', obstacleType: 'internal' as any });
  const [submitting, setSubmitting] = useState(false);

  const saveWOOP = async () => {
    if (!form.wish || !form.outcome || !form.obstacle || !form.plan) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'users', user.uid, 'woop'), {
        ...form,
        userId: user.uid,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setForm({ wish: '', outcome: '', obstacle: '', plan: '', obstacleType: 'internal' });
      setShowForm(false);
    } finally {
      setSubmitting(false);
    }
  };

  const activeWOOP = woopPlans.find(w => w.status === 'active');

  return (
    <section className="glass rounded-2xl p-6 space-y-6 border border-white/5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-mono font-black uppercase tracking-widest text-white">WOOP_FRAMEWORK</h3>
        <button onClick={() => setShowForm(!showForm)} className="text-xs font-mono text-cyan uppercase">
          {activeWOOP ? 'EDIT_WOOP' : '+_NEW_WOOP'}
        </button>
      </div>

      {activeWOOP ? (
        <div className="space-y-4 text-sm font-mono">
          <div><p className="text-text-s text-[10px] uppercase">Wish</p><p className="text-white">{activeWOOP.wish}</p></div>
          <div><p className="text-text-s text-[10px] uppercase">Outcome</p><p className="text-white">{activeWOOP.outcome}</p></div>
          <div><p className="text-text-s text-[10px] uppercase">Obstacle</p><p className="text-white">{activeWOOP.obstacle}</p></div>
          <div><p className="text-text-s text-[10px] uppercase">Plan</p><p className="text-white">{activeWOOP.plan}</p></div>
        </div>
      ) : showForm ? (
        <div className="space-y-3">
          <input placeholder="Wish..." value={form.wish} onChange={e => setForm({...form, wish: e.target.value})} className="w-full bg-white/5 p-3 rounded-lg text-sm" />
          <input placeholder="Outcome..." value={form.outcome} onChange={e => setForm({...form, outcome: e.target.value})} className="w-full bg-white/5 p-3 rounded-lg text-sm" />
          <input placeholder="Obstacle..." value={form.obstacle} onChange={e => setForm({...form, obstacle: e.target.value})} className="w-full bg-white/5 p-3 rounded-lg text-sm" />
          <input placeholder="Plan (If... Then...)..." value={form.plan} onChange={e => setForm({...form, plan: e.target.value})} className="w-full bg-white/5 p-3 rounded-lg text-sm" />
          <button onClick={saveWOOP} disabled={submitting} className="w-full bg-cyan/20 p-3 rounded-lg text-cyan font-black uppercase text-xs">
            {submitting ? 'SAVING...' : 'SAVE_WOOP'}
          </button>
        </div>
      ) : (
        <p className="text-text-s text-xs font-mono italic">No active WOOP. Define your focus.</p>
      )}
    </section>
  );
};
