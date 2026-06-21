'use client';

import React, { useState, useEffect } from 'react';
import { X, Bell, Calendar, CheckSquare, Phone, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import type { CalendarReminder, ReminderType } from '@/lib/query/hooks/useRemindersQuery';

const TYPE_OPTIONS: { value: ReminderType; label: string; icon: React.ReactNode }[] = [
  { value: 'reminder', label: 'Lembrete', icon: <Bell size={14} /> },
  { value: 'meeting',  label: 'Reunião',  icon: <Calendar size={14} /> },
  { value: 'task',     label: 'Tarefa',   icon: <CheckSquare size={14} /> },
  { value: 'call',     label: 'Ligação',  icon: <Phone size={14} /> },
];

const ALARM_OPTIONS = [
  { value: 0,   label: 'Na hora' },
  { value: 5,   label: '5 minutos antes' },
  { value: 15,  label: '15 minutos antes' },
  { value: 30,  label: '30 minutos antes' },
  { value: 60,  label: '1 hora antes' },
  { value: 120, label: '2 horas antes' },
];

interface ReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    title: string;
    notes?: string;
    type: ReminderType;
    scheduledAt: string;
    alarmMinutesBefore: number;
  }) => void;
  onDelete?: () => void;
  initialDate?: Date;
  reminder?: CalendarReminder;
  isSaving?: boolean;
}

export function ReminderModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialDate,
  reminder,
  isSaving,
}: ReminderModalProps) {
  const defaultDate = initialDate || new Date();

  const [title, setTitle]   = useState('');
  const [notes, setNotes]   = useState('');
  const [type,  setType]    = useState<ReminderType>('reminder');
  const [date,  setDate]    = useState(format(defaultDate, 'yyyy-MM-dd'));
  const [time,  setTime]    = useState('09:00');
  const [alarm, setAlarm]   = useState(15);

  // Preenche formulário ao editar lembrete existente
  useEffect(() => {
    if (reminder) {
      const dt = new Date(reminder.scheduledAt);
      setTitle(reminder.title);
      setNotes(reminder.notes || '');
      setType(reminder.type);
      setDate(format(dt, 'yyyy-MM-dd'));
      setTime(format(dt, 'HH:mm'));
      setAlarm(reminder.alarmMinutesBefore);
    } else {
      setTitle('');
      setNotes('');
      setType('reminder');
      setDate(format(initialDate || new Date(), 'yyyy-MM-dd'));
      setTime('09:00');
      setAlarm(15);
    }
  }, [reminder, initialDate, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!title.trim()) return;
    const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
    onSave({ title: title.trim(), notes: notes.trim() || undefined, type, scheduledAt, alarmMinutesBefore: alarm });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {reminder ? 'Editar lembrete' : 'Novo lembrete'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {/* Tipo */}
          <div className="flex gap-2">
            {TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setType(opt.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  type === opt.value
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>

          {/* Título */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Título <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ex: Ligar para o cliente"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Data + Hora */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Data</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Hora</label>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Alarme */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              <Bell size={11} className="inline mr-1" />
              Alarme
            </label>
            <select
              value={alarm}
              onChange={e => setAlarm(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {ALARM_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Anotações */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Anotações</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Detalhes ou observações..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div>
            {onDelete && (
              <button
                onClick={onDelete}
                className="flex items-center gap-1.5 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-sm font-medium transition-colors"
              >
                <Trash2 size={14} />
                Excluir
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!title.trim() || isSaving}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
