'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useDueReminders, useMarkReminderAlerted, type CalendarReminder } from '@/lib/query/hooks/useRemindersQuery';

// ---------------------------------------------------------------------------
// Singleton de AudioContext — precisa ser criado após gesto do usuário
// ---------------------------------------------------------------------------
let sharedCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = (window as unknown as Record<string, unknown>).AudioContext as typeof AudioContext | undefined
    || (window as unknown as Record<string, unknown>).webkitAudioContext as typeof AudioContext | undefined;
  if (!AudioCtx) return null;
  if (!sharedCtx || sharedCtx.state === 'closed') {
    try { sharedCtx = new AudioCtx(); } catch { return null; }
  }
  if (sharedCtx.state === 'suspended') {
    sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

// Desbloqueia o AudioContext na primeira interação do usuário
// (política de autoplay do browser exige gesto humano)
function unlockAudio() {
  getAudioCtx();
}

if (typeof window !== 'undefined') {
  (['click', 'keydown', 'touchstart'] as const).forEach(ev => {
    document.addEventListener(ev, unlockAudio, { once: false, passive: true });
  });
}

// ---------------------------------------------------------------------------
// Som de alarme: 3 bipes suaves em sequência ascendente (não enjoativo)
// ---------------------------------------------------------------------------
export function playAlarmSound() {
  try {
    const ctx = getAudioCtx();
    if (!ctx || ctx.state !== 'running') {
      // Tenta desbloquear e agendar nova tentativa
      ctx?.resume().then(() => playAlarmSound()).catch(() => {});
      return;
    }

    // Notas: A4 → C5 → E5 (acorde de Lá maior)
    const notes = [440, 523, 659];
    notes.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.32;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      // Envelope suave: fade in curto + fade out
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.35, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.start(t);
      osc.stop(t + 0.32);
    });
  } catch (err) {
    console.warn('[ReminderAlarm] som falhou:', err);
  }
}

// ---------------------------------------------------------------------------
// Hook principal
// ---------------------------------------------------------------------------
export function useReminderAlarm() {
  const { data: reminders = [] } = useDueReminders();
  const { mutate: markAlerted } = useMarkReminderAlerted();
  const [activeAlarms, setActiveAlarms] = useState<CalendarReminder[]>([]);
  // IDs já disparados nesta sessão — evita re-disparo antes do DB confirmar
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const toFire: CalendarReminder[] = [];

      for (const r of reminders) {
        if (firedRef.current.has(r.id)) continue;
        const scheduledMs = new Date(r.scheduledAt).getTime();
        const alarmMs = scheduledMs - r.alarmMinutesBefore * 60_000;
        // Sem janela superior: o DB garante disparo único via alerted_at
        if (alarmMs <= now) {
          firedRef.current.add(r.id);
          toFire.push(r);
        }
      }

      if (toFire.length > 0) {
        setActiveAlarms(prev => {
          // evita duplicatas se o effect rodar duas vezes
          const existingIds = new Set(prev.map(a => a.id));
          const fresh = toFire.filter(r => !existingIds.has(r.id));
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
        playAlarmSound();
      }
    };

    check(); // Verifica imediatamente ao montar / ao reminders mudar
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [reminders]); // Só `reminders` — markAlerted é estável via destructure

  const dismissAlarm = useCallback((reminderId: string) => {
    markAlerted(reminderId);
    firedRef.current.add(reminderId); // garante que não re-dispara
    setActiveAlarms(prev => prev.filter(a => a.id !== reminderId));
  }, [markAlerted]);

  return { activeAlarms, dismissAlarm };
}
