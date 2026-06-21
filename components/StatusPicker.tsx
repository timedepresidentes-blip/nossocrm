'use client';

import React, { useState, useRef, useEffect } from 'react';
import { type AgentStatus, STATUS_CONFIG, useMyStatus } from '@/lib/hooks/useAgentStatus';

export function StatusDot({ status, size = 'md' }: { status: AgentStatus; size?: 'sm' | 'md' }) {
  const { dot } = STATUS_CONFIG[status] ?? STATUS_CONFIG.online;
  const sz = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';
  return <span className={`${sz} rounded-full ${dot} shrink-0 ring-1 ring-white dark:ring-slate-800`} />;
}

export function StatusPicker() {
  const { status, setStatus, isPending } = useMyStatus();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const options: AgentStatus[] = ['online', 'away', 'busy'];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <StatusDot status={status} />
        <span className="flex-1 text-left">{STATUS_CONFIG[status]?.label ?? 'Online'}</span>
        <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50 animate-in slide-in-from-bottom-1 fade-in duration-100">
          <div className="p-1">
            {options.map((opt) => (
              <button
                key={opt}
                onClick={async () => {
                  await setStatus(opt);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  opt === status
                    ? 'bg-slate-100 dark:bg-slate-700 font-medium text-slate-900 dark:text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                }`}
              >
                <StatusDot status={opt} size="sm" />
                <span>{STATUS_CONFIG[opt].label}</span>
                {opt === status && (
                  <svg className="w-3.5 h-3.5 ml-auto text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
