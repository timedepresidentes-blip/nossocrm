'use client';

import React, { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { playAlarmSound } from '@/lib/hooks/useReminderAlarm';
import type { CalendarReminder } from '@/lib/query/hooks/useRemindersQuery';

interface ReminderAlarmOverlayProps {
  alarms: CalendarReminder[];
  onDismiss: (id: string) => void;
}

export function ReminderAlarmOverlay({ alarms, onDismiss }: ReminderAlarmOverlayProps) {
  // Índice do alarme atual (quando tem vários, avança um a um)
  const [index, setIndex] = useState(0);
  // Estado de flash: alterna entre dois tons de laranja
  const [flash, setFlash] = useState(false);

  const alarm = alarms[index] ?? alarms[0];

  // Reseta índice se os alarmes mudarem
  useEffect(() => {
    setIndex(0);
  }, [alarms.length]);

  // Flash da tela
  useEffect(() => {
    if (!alarm) return;
    const id = setInterval(() => setFlash(f => !f), 600);
    return () => clearInterval(id);
  }, [alarm]);

  // Repete o som a cada 8 segundos enquanto o overlay está aberto
  useEffect(() => {
    if (!alarm) return;
    const id = setInterval(() => playAlarmSound(), 8_000);
    return () => clearInterval(id);
  }, [alarm]);

  if (!alarm) return null;

  const handleDismiss = () => {
    onDismiss(alarm.id);
    // Avança para o próximo se houver
    const remaining = alarms.filter(a => a.id !== alarm.id);
    if (remaining.length > 0) {
      setIndex(0);
      playAlarmSound();
    }
  };

  const bgColor = flash ? 'rgba(234, 88, 12, 0.92)' : 'rgba(249, 115, 22, 0.88)';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: bgColor, transition: 'background-color 0.5s ease' }}
      role="alertdialog"
      aria-modal="true"
      aria-label="Alarme de lembrete"
    >
      {/* Card central */}
      <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">

        {/* Barra laranja superior */}
        <div
          className="h-2 w-full"
          style={{ backgroundColor: flash ? '#ea580c' : '#f97316', transition: 'background-color 0.5s ease' }}
        />

        <div className="p-8 text-center">
          {/* Sino animado */}
          <div className="flex justify-center mb-5">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: flash ? '#fed7aa' : '#ffedd5',
                transform: flash ? 'scale(1.1) rotate(-8deg)' : 'scale(1) rotate(8deg)',
                transition: 'all 0.5s ease',
              }}
            >
              <Bell
                className="text-orange-500"
                style={{
                  width: 40,
                  height: 40,
                  transform: flash ? 'rotate(-15deg)' : 'rotate(15deg)',
                  transition: 'transform 0.5s ease',
                }}
              />
            </div>
          </div>

          {/* Rótulo */}
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-500 mb-2">
            Lembrete
          </p>

          {/* Título */}
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 leading-tight">
            {alarm.title}
          </h2>

          {/* Horário */}
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            {format(new Date(alarm.scheduledAt), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
          </p>

          {/* Anotações */}
          {alarm.notes && (
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-3 mb-5 text-left">
              <p className="text-sm text-slate-700 dark:text-slate-300">{alarm.notes}</p>
            </div>
          )}

          {/* Contador de pendentes */}
          {alarms.length > 1 && (
            <p className="text-xs text-orange-600 dark:text-orange-400 mb-4 font-medium">
              {alarms.length - 1} outro(s) lembrete(s) aguardando
            </p>
          )}

          {/* Botão de dispensar */}
          <button
            onClick={handleDismiss}
            className="w-full py-3.5 rounded-2xl text-white font-bold text-base transition-all active:scale-95"
            style={{
              backgroundColor: flash ? '#ea580c' : '#f97316',
              transition: 'background-color 0.5s ease',
            }}
          >
            {alarms.length > 1 ? `Dispensar (${alarms.length - 1} restante${alarms.length - 2 !== 1 ? 's' : ''})` : 'Dispensar'}
          </button>
        </div>
      </div>

      {/* X discreto no canto para usuários avançados */}
      <button
        onClick={handleDismiss}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
        aria-label="Fechar"
      >
        <X size={20} />
      </button>
    </div>
  );
}
