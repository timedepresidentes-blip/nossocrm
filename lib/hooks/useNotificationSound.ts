import { useCallback, useEffect } from 'react';

export type SoundType =
  | 'mensagem_recebida'
  | 'mensagem_enviada'
  | 'lead_movido'
  | 'lead_ganho'
  | 'lead_perdido';

// Singleton AudioContext compartilhado entre todos os hooks
let _ctx: AudioContext | null = null;
// Fila de sons pendentes enquanto AudioContext está suspenso
const _queue: Array<{ type: SoundType; expiresAt: number }> = [];
// Promise de desbloqueio em andamento para evitar múltiplas chamadas concorrentes
let _resumePromise: Promise<void> | null = null;

const QUEUE_TTL_MS = 5000; // Sons expiram após 5s na fila

function getOrCreateCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!_ctx || _ctx.state === 'closed') {
      _ctx = new AudioContext();
    }
    return _ctx;
  } catch {
    return null;
  }
}

function flushQueue(ctx: AudioContext) {
  const now = Date.now();
  const pending = _queue.splice(0).filter(item => item.expiresAt > now);
  for (const { type } of pending) {
    try { createSound(ctx, type); } catch { /* silencia erros de oscilador */ }
  }
}

// Desbloqueia o AudioContext — deve ser chamado dentro de um gesto do usuário
export function unlockAudio() {
  const ctx = getOrCreateCtx();
  if (!ctx) return;

  if (ctx.state === 'running') {
    // Já desbloqueado — processa a fila imediatamente
    if (_queue.length > 0) flushQueue(ctx);
    return;
  }

  if (ctx.state === 'suspended') {
    if (_resumePromise) {
      // Resume já em andamento — encadeia o flush
      _resumePromise.then(() => { if (_queue.length > 0) flushQueue(ctx); }).catch(() => {});
      return;
    }
    _resumePromise = ctx.resume()
      .then(() => {
        _resumePromise = null;
        flushQueue(ctx);
      })
      .catch(() => {
        _resumePromise = null;
      });
  }
}

function beep(ctx: AudioContext, freq: number, delay: number, duration: number, vol: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.value = vol;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + delay);
  // Fade-out suave nos últimos 30ms para evitar click auditivo
  gain.gain.setValueAtTime(vol, ctx.currentTime + delay + duration - 0.03);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + duration);
  osc.stop(ctx.currentTime + delay + duration + 0.01);
}

function createSound(ctx: AudioContext, type: SoundType) {
  switch (type) {
    case 'mensagem_recebida':
      // Dois tons ascendentes — ding-dong suave
      beep(ctx, 523, 0,    0.15, 0.4);
      beep(ctx, 784, 0.15, 0.20, 0.4);
      break;
    case 'mensagem_enviada':
      // Tom curto discreto
      beep(ctx, 440, 0,    0.05, 0.2);
      beep(ctx, 660, 0.05, 0.10, 0.2);
      break;
    case 'lead_movido':
      // Um clique médio
      beep(ctx, 600, 0, 0.08, 0.25);
      break;
    case 'lead_ganho':
      // Fanfarra ascendente — conquista
      beep(ctx, 523, 0,    0.12, 0.3);
      beep(ctx, 659, 0.12, 0.12, 0.3);
      beep(ctx, 784, 0.24, 0.20, 0.4);
      break;
    case 'lead_perdido':
      // Dois tons descendentes — perda suave
      beep(ctx, 440, 0,    0.15, 0.25);
      beep(ctx, 330, 0.15, 0.20, 0.25);
      break;
  }
}

export function useNotificationSound() {
  useEffect(() => {
    // Desbloqueia o AudioContext no primeiro gesto do usuário
    const unlock = () => unlockAudio();
    document.addEventListener('click',      unlock, { passive: true });
    document.addEventListener('keydown',    unlock, { passive: true });
    document.addEventListener('touchstart', unlock, { passive: true });
    return () => {
      document.removeEventListener('click',      unlock);
      document.removeEventListener('keydown',    unlock);
      document.removeEventListener('touchstart', unlock);
    };
  }, []);

  const play = useCallback((type: SoundType) => {
    const ctx = getOrCreateCtx();
    if (!ctx) return;

    if (ctx.state === 'running') {
      // Contexto ativo — toca imediatamente
      try { createSound(ctx, type); } catch { /* silencia */ }
      return;
    }

    // Contexto suspenso — coloca na fila (expira em 5s para não soar defasado)
    _queue.push({ type, expiresAt: Date.now() + QUEUE_TTL_MS });

    // Tenta resumir (só funciona se houver gesto de usuário pendente ou em andamento)
    if (!_resumePromise) {
      _resumePromise = ctx.resume()
        .then(() => {
          _resumePromise = null;
          flushQueue(ctx);
        })
        .catch(() => {
          _resumePromise = null;
          // Sem gesto do usuário disponível — sons serão tocados no próximo unlock
        });
    } else {
      _resumePromise.then(() => flushQueue(ctx)).catch(() => {});
    }
  }, []);

  return { play };
}
