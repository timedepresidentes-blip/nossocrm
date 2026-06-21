'use client';

import React, { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { ReminderModal } from '@/features/calendar/components/ReminderModal';
import { useCreateReminder } from '@/lib/query/hooks/useRemindersQuery';
import type { ReminderType } from '@/lib/query/hooks/useRemindersQuery';

// Botão fixo no header para adicionar lembretes de qualquer tela
export function CalendarQuickButton() {
  const [open, setOpen] = useState(false);
  const createReminder = useCreateReminder();

  const handleSave = async (data: {
    title: string;
    notes?: string;
    type: ReminderType;
    scheduledAt: string;
    alarmMinutesBefore: number;
  }) => {
    await createReminder.mutateAsync(data);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Agendar lembrete"
        className="p-2 rounded-full text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-all active:scale-95 focus-visible-ring"
      >
        <CalendarDays size={20} aria-hidden="true" />
      </button>

      <ReminderModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onSave={handleSave}
        isSaving={createReminder.isPending}
      />
    </>
  );
}
