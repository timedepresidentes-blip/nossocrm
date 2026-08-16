'use client';

import React, { useState } from 'react';
import {
  BadgeCheck, CalendarClock, ChevronDown, ChevronUp,
  Package, PenLine, RotateCcw, Ruler, SearchCheck,
  Zap, CheckSquare, Loader2,
} from 'lucide-react';
import { PROJETO_STEPS, type ProjetoStepKey } from '@/types';
import { useUpdateDeal } from '@/lib/query/hooks/useDealsQuery';

const STEP_ICONS: Record<ProjetoStepKey, React.ElementType> = {
  contrato:        PenLine,
  engenharia:      Ruler,
  projetoAprovado: CheckSquare,
  equipamento:     Package,
  agendamento:     CalendarClock,
  instalado:       Zap,
  vistoria:        SearchCheck,
  homologado:      BadgeCheck,
};

const PT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

function fmt(iso: string) {
  try { return PT_DATE.format(new Date(iso + 'T12:00:00')); } catch { return iso; }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

interface Props {
  dealId: string;
  timeline?: Partial<Record<ProjetoStepKey, string>>;
}

export function ProjetoTimelinePanel({ dealId, timeline = {} }: Props) {
  const [open, setOpen] = useState(true);
  const [editingDate, setEditingDate] = useState<ProjetoStepKey | null>(null);
  const [dateInput, setDateInput] = useState('');
  const { mutate: updateDeal, isPending } = useUpdateDeal();

  const completedCount = PROJETO_STEPS.filter(s => timeline[s.key]).length;

  function save(newTimeline: Partial<Record<ProjetoStepKey, string>>) {
    updateDeal({ id: dealId, updates: { projetoTimeline: newTimeline } });
  }

  function mark(key: ProjetoStepKey) {
    save({ ...timeline, [key]: todayISO() });
  }

  function clear(key: ProjetoStepKey) {
    const next = { ...timeline };
    delete next[key];
    save(next);
  }

  function startEdit(key: ProjetoStepKey) {
    setEditingDate(key);
    setDateInput(timeline[key] ?? todayISO());
  }

  function commitEdit(key: ProjetoStepKey) {
    if (dateInput) save({ ...timeline, [key]: dateInput });
    setEditingDate(null);
  }

  return (
    <div className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-white/3 transition-colors"
      >
        <CalendarClock className="h-4 w-4 text-cyan-400 shrink-0" />
        <span className="flex-1 text-sm font-semibold text-slate-100">Linha do Tempo</span>

        {/* Progress pill */}
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
          completedCount === PROJETO_STEPS.length
            ? 'bg-emerald-500/20 text-emerald-300'
            : 'bg-white/8 text-slate-400'
        }`}>
          {completedCount}/{PROJETO_STEPS.length}
        </span>

        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />}
        {open ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
      </button>

      {/* Progress bar */}
      {open && completedCount > 0 && (
        <div className="h-0.5 bg-white/5 mx-4">
          <div
            className="h-full bg-emerald-500/60 transition-all duration-500 rounded-full"
            style={{ width: `${(completedCount / PROJETO_STEPS.length) * 100}%` }}
          />
        </div>
      )}

      {/* Steps */}
      {open && (
        <div className="px-4 py-3 space-y-0">
          {PROJETO_STEPS.map((step, idx) => {
            const done = !!timeline[step.key];
            const date = timeline[step.key];
            const isEditing = editingDate === step.key;
            const Icon = STEP_ICONS[step.key];
            const isLast = idx === PROJETO_STEPS.length - 1;

            return (
              <div key={step.key} className="flex gap-3 group">
                {/* Left: connector line + circle */}
                <div className="flex flex-col items-center">
                  <div className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    done
                      ? 'border-emerald-500/60 bg-emerald-500/15'
                      : 'border-white/10 bg-white/3'
                  }`}>
                    <Icon className={`h-3.5 w-3.5 ${done ? 'text-emerald-400' : 'text-slate-500'}`} />
                    {done && (
                      <div className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 flex items-center justify-center">
                        <svg viewBox="0 0 8 8" className="h-1.5 w-1.5 text-white" fill="currentColor">
                          <path d="M1.5 4L3 5.5L6.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                      </div>
                    )}
                  </div>
                  {!isLast && (
                    <div className={`w-px flex-1 mt-1 mb-1 min-h-[16px] ${done ? 'bg-emerald-500/30' : 'bg-white/6'}`} />
                  )}
                </div>

                {/* Right: label + actions */}
                <div className={`flex flex-1 items-start justify-between gap-2 py-0.5 ${isLast ? '' : 'pb-3'}`}>
                  <div>
                    <div className={`text-xs font-medium ${done ? 'text-slate-200' : 'text-slate-400'}`}>
                      {step.label}
                    </div>

                    {done && !isEditing && (
                      <button
                        type="button"
                        onClick={() => startEdit(step.key)}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors mt-0.5"
                      >
                        {fmt(date!)}
                      </button>
                    )}

                    {isEditing && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <input
                          type="date"
                          value={dateInput}
                          onChange={e => setDateInput(e.target.value)}
                          className="rounded bg-white/6 border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-200 outline-none focus:ring-1 focus:ring-cyan-500/40"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => commitEdit(step.key)}
                          className="text-[10px] font-semibold text-cyan-400 hover:text-cyan-300"
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingDate(null)}
                          className="text-[10px] text-slate-500 hover:text-slate-400"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0 pt-0.5">
                    {!done && !isEditing && (
                      <button
                        type="button"
                        onClick={() => mark(step.key)}
                        className="opacity-0 group-hover:opacity-100 rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-400 hover:bg-white/8 hover:text-slate-200 transition-all"
                      >
                        Marcar
                      </button>
                    )}
                    {done && !isEditing && (
                      <button
                        type="button"
                        onClick={() => clear(step.key)}
                        title="Desfazer"
                        className="opacity-0 group-hover:opacity-100 rounded-md p-0.5 text-slate-600 hover:text-slate-400 transition-all"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
