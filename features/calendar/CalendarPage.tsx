'use client';

import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Bell,
  Calendar as CalendarIcon,
  CheckSquare,
  Phone,
  Check,
  Loader2,
} from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ReminderModal } from './components/ReminderModal';
import {
  useReminders,
  useCreateReminder,
  useUpdateReminder,
  useDeleteReminder,
  type CalendarReminder,
  type ReminderType,
} from '@/lib/query/hooks/useRemindersQuery';

const TYPE_COLORS: Record<ReminderType, string> = {
  reminder: 'bg-blue-500',
  meeting:  'bg-purple-500',
  task:     'bg-amber-500',
  call:     'bg-green-500',
};

const TYPE_ICONS: Record<ReminderType, React.ReactNode> = {
  reminder: <Bell size={11} />,
  meeting:  <CalendarIcon size={11} />,
  task:     <CheckSquare size={11} />,
  call:     <Phone size={11} />,
};

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<CalendarReminder | undefined>();

  const { data: reminders = [], isLoading } = useReminders(currentMonth);
  const createReminder = useCreateReminder();
  const updateReminder = useUpdateReminder();
  const deleteReminder = useDeleteReminder();

  // Agrupa lembretes por dia (chave: yyyy-MM-dd)
  const remindersByDay = useMemo(() => {
    const map = new Map<string, CalendarReminder[]>();
    for (const r of reminders) {
      const key = format(new Date(r.scheduledAt), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [reminders]);

  // Dias do calendário (incluindo dias de semanas incompletas para preencher o grid)
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end   = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  // Lembretes do dia selecionado
  const selectedDayKey = format(selectedDay, 'yyyy-MM-dd');
  const selectedDayReminders = remindersByDay.get(selectedDayKey) ?? [];

  const handleSave = async (data: {
    title: string;
    notes?: string;
    type: ReminderType;
    scheduledAt: string;
    alarmMinutesBefore: number;
  }) => {
    if (editingReminder) {
      await updateReminder.mutateAsync({ id: editingReminder.id, ...data });
    } else {
      await createReminder.mutateAsync(data);
    }
    setModalOpen(false);
    setEditingReminder(undefined);
  };

  const handleDelete = async () => {
    if (!editingReminder) return;
    await deleteReminder.mutateAsync(editingReminder.id);
    setModalOpen(false);
    setEditingReminder(undefined);
  };

  const handleToggleDone = (reminder: CalendarReminder) => {
    updateReminder.mutate({ id: reminder.id, isDone: !reminder.isDone });
  };

  const openNew = (day?: Date) => {
    setEditingReminder(undefined);
    if (day) setSelectedDay(day);
    setModalOpen(true);
  };

  const openEdit = (reminder: CalendarReminder) => {
    setEditingReminder(reminder);
    setModalOpen(true);
  };

  const isSaving = createReminder.isPending || updateReminder.isPending;

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <CalendarIcon size={20} className="text-primary-600" />
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Calendário</h1>
        </div>
        <button
          onClick={() => openNew(selectedDay)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Novo lembrete
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Calendário mensal */}
        <div className="flex flex-col w-full max-w-lg border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto">

          {/* Navegação do mês */}
          <div className="flex items-center justify-between px-5 py-4">
            <button
              onClick={() => setCurrentMonth(m => subMonths(m, 1))}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-semibold text-slate-900 dark:text-white capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <button
              onClick={() => setCurrentMonth(m => addMonths(m, 1))}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Dias da semana */}
          <div className="grid grid-cols-7 px-4 pb-1">
            {WEEKDAYS.map(d => (
              <div key={d} className="text-center text-[11px] font-medium text-slate-400 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Grid de dias */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="grid grid-cols-7 px-4 pb-4 gap-1">
              {calendarDays.map(day => {
                const key  = format(day, 'yyyy-MM-dd');
                const dots = remindersByDay.get(key) ?? [];
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isSelected     = isSameDay(day, selectedDay);
                const isTodayDay     = isToday(day);

                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDay(day)}
                    onDoubleClick={() => openNew(day)}
                    title={dots.length ? `${dots.length} lembrete(s)` : undefined}
                    className={`relative flex flex-col items-center justify-start pt-1 pb-1.5 rounded-xl min-h-[52px] transition-colors ${
                      isSelected
                        ? 'bg-primary-600 text-white'
                        : isTodayDay
                        ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                        : isCurrentMonth
                        ? 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        : 'text-slate-300 dark:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <span className={`text-xs font-semibold ${isSelected ? 'text-white' : ''}`}>
                      {format(day, 'd')}
                    </span>

                    {/* Pontos de lembretes (até 3) */}
                    {dots.length > 0 && (
                      <div className="flex gap-0.5 mt-1 flex-wrap justify-center max-w-[36px]">
                        {dots.slice(0, 3).map(r => (
                          <span
                            key={r.id}
                            className={`w-1.5 h-1.5 rounded-full ${
                              isSelected ? 'bg-white/80' : TYPE_COLORS[r.type]
                            }`}
                          />
                        ))}
                        {dots.length > 3 && (
                          <span className={`text-[9px] leading-none ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                            +{dots.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Legenda de tipos */}
          <div className="px-5 pb-4 flex flex-wrap gap-3 border-t border-slate-100 dark:border-slate-800 pt-3">
            {(['reminder', 'meeting', 'task', 'call'] as ReminderType[]).map(t => (
              <div key={t} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${TYPE_COLORS[t]}`} />
                <span className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                  {t === 'reminder' ? 'Lembrete' : t === 'meeting' ? 'Reunião' : t === 'task' ? 'Tarefa' : 'Ligação'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Painel do dia selecionado */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Cabeçalho do dia */}
          <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">
                {format(selectedDay, 'EEEE', { locale: ptBR })}
              </p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {format(selectedDay, "d 'de' MMMM", { locale: ptBR })}
              </p>
            </div>
            <button
              onClick={() => openNew(selectedDay)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium transition-colors"
            >
              <Plus size={14} />
              Adicionar
            </button>
          </div>

          {/* Lista de lembretes do dia */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
            {selectedDayReminders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <CalendarIcon size={40} className="text-slate-300 dark:text-slate-700 mb-3" />
                <p className="text-slate-500 dark:text-slate-400 text-sm">Nenhum lembrete neste dia</p>
                <button
                  onClick={() => openNew(selectedDay)}
                  className="mt-3 text-primary-600 dark:text-primary-400 text-sm font-medium hover:underline"
                >
                  Criar lembrete
                </button>
              </div>
            ) : (
              selectedDayReminders.map(reminder => (
                <div
                  key={reminder.id}
                  className={`group flex items-start gap-3 p-4 rounded-xl border transition-colors cursor-pointer ${
                    reminder.isDone
                      ? 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 opacity-60'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-primary-300 dark:hover:border-primary-700'
                  }`}
                  onClick={() => openEdit(reminder)}
                >
                  {/* Checkbox de concluído */}
                  <button
                    onClick={e => { e.stopPropagation(); handleToggleDone(reminder); }}
                    className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 transition-colors ${
                      reminder.isDone
                        ? 'border-green-500 bg-green-500'
                        : 'border-slate-300 dark:border-slate-600 hover:border-green-400'
                    }`}
                  >
                    {reminder.isDone && <Check size={10} className="text-white" />}
                  </button>

                  {/* Conteúdo */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-white text-[10px] font-medium ${TYPE_COLORS[reminder.type]}`}>
                        {TYPE_ICONS[reminder.type]}
                        {reminder.type === 'reminder' ? 'Lembrete' : reminder.type === 'meeting' ? 'Reunião' : reminder.type === 'task' ? 'Tarefa' : 'Ligação'}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {format(new Date(reminder.scheduledAt), 'HH:mm')}
                      </span>
                      {reminder.alarmMinutesBefore > 0 && (
                        <span className="flex items-center gap-1 text-[10px] text-slate-400">
                          <Bell size={9} />
                          {reminder.alarmMinutesBefore}min
                        </span>
                      )}
                    </div>
                    <p className={`text-sm font-medium ${reminder.isDone ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                      {reminder.title}
                    </p>
                    {reminder.notes && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                        {reminder.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal de criar/editar */}
      <ReminderModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingReminder(undefined); }}
        onSave={handleSave}
        onDelete={editingReminder ? handleDelete : undefined}
        initialDate={selectedDay}
        reminder={editingReminder}
        isSaving={isSaving}
      />
    </div>
  );
}
