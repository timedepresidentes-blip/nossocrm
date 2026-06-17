import { useCallback, useEffect } from 'react';

export type SoundType =
  | 'mensagem_recebida'
  | 'mensagem_enviada'
  | 'lead_movido'
  | 'lead_ganho'
  | 'lead_perdido';

// ─── Singleton AudioContext ───────────────────────────────────────────────────

let _ctx: AudioContext | null = null;

// Fila de sons pendentes: cada item expira em 8s para não soar defasado
const _queue: Array<{ type: SoundType; expiresAt: number }> = [];
const QUEUE_TTL_MS = 8_000;

// Promise de resume em andamento — evita múltiplos ctx.resume() simultâneos
let _resuming: Promise<void> | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!_ctx || _ctx.state === 'closed') {
      _ctx = new AudioContext();
      // Sempre que o contexto mudar de estado, tenta re-ativar
      _ctx.addEventListener('statechange', () => {
        if (_ctx?.state === 'running' && _queue.length > 0) {
          flushQueue(_ctx);
        }
      });
    }
    return _ctx;
  } catch {
    return null;
  }
}

// Drena a fila tocando todos os sons não expirados
function flushQueue(ctx: AudioContext) {
  const now = Date.now();
  const pending = _queue.splice(0).filter(item => item.expiresAt > now);
  for (const { type } of pending) {
    try { createSound(ctx, type); } catch { /* silencia */ }
  }
}

// Tenta ativar o AudioContext — funciona dentro de gestos do usuário
async function tryResume(): Promise<void> {
  const ctx = getCtx();
  if (!ctx || ctx.state === 'running') return;
  if (_resuming) return _resuming;

  _resuming = ctx.resume()
    .then(() => {
      _resuming = null;
      // Toca um buffer silencioso para confirmar ativação (warm-up real)
      try {
        const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
      } catch { /* silencia */ }
      flushQueue(ctx);
    })
    .catch(() => { _resuming = null; });

  return _resuming;
}

// Desbloqueio público — chamar em qualquer gesto do usuário
export function unlockAudio(): void {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'running') {
    if (_queue.length > 0) flushQueue(ctx);
    return;
  }
  tryResume().catch(() => {});
}

// ─── Geração de sons ─────────────────────────────────────────────────────────

function beep(
  ctx: AudioContext,
  freq: number,
  startDelay: number,
  duration: number,
  vol: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.value = vol;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const t = ctx.currentTime + startDelay;
  osc.start(t);
  gain.gain.setValueAtTime(vol, t + duration - 0.03);
  gain.gain.linearRampToValueAtTime(0, t + duration);
  osc.stop(t + duration + 0.01);
}

function createSound(ctx: AudioContext, type: SoundType) {
  switch (type) {
    case 'mensagem_recebida':
      // Dois tons ascendentes — ding-dong
      beep(ctx, 523, 0,    0.15, 0.4);
      beep(ctx, 784, 0.15, 0.20, 0.4);
      break;
    case 'mensagem_enviada':
      // Tique discreto duplo
      beep(ctx, 440, 0,    0.05, 0.2);
      beep(ctx, 660, 0.06, 0.10, 0.2);
      break;
    case 'lead_movido':
      // Clique médio único
      beep(ctx, 600, 0, 0.08, 0.25);
      break;
    case 'lead_ganho':
      // Fanfarra ascendente — conquista
      beep(ctx, 523, 0,    0.10, 0.3);
      beep(ctx, 659, 0.10, 0.10, 0.3);
      beep(ctx, 784, 0.20, 0.20, 0.45);
      break;
    case 'lead_perdido':
      // Dois tons descendentes — perda suave
      beep(ctx, 440, 0,    0.15, 0.25);
      beep(ctx, 330, 0.16, 0.20, 0.25);
      break;
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useNotificationSound() {
  useEffect(() => {
    // Cria o AudioContext na montagem para garantir que existe antes de qualquer gesto
    getCtx();

    // Eventos de desbloqueio: o mais amplo possível para capturar o primeiro gesto
    const unlock = () => unlockAudio();
    const opts = { passive: true, capture: true } as const;
    document.addEventListener('click',      unlock, opts);
    document.addEventListener('mousedown',  unlock, opts);
    document.addEventListener('pointerdown',unlock, opts);
    document.addEventListener('keydown',    unlock, opts);
    document.addEventListener('touchstart', unlock, opts);

    // Quando a aba volta ao foco, tenta reativar (Chrome pode suspender em background)
    const onVisible = () => {
      if (document.visibilityState === 'visible') unlockAudio();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('click',      unlock, opts);
      document.removeEventListener('mousedown',  unlock, opts);
      document.removeEventListener('pointerdown',unlock, opts);
      document.removeEventListener('keydown',    unlock, opts);
      document.removeEventListener('touchstart', unlock, opts);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const play = useCallback((type: SoundType) => {
    const ctx = getCtx();
    if (!ctx) return;

    if (ctx.state === 'running') {
      try { createSound(ctx, type); } catch { /* silencia */ }
      return;
    }

    // Contexto suspenso: coloca na fila e tenta desbloquear
    _queue.push({ type, expiresAt: Date.now() + QUEUE_TTL_MS });
    tryResume().catch(() => {
      // Se tryResume falhar (sem gesto disponível), a fila será drenada
      // no próximo gesto do usuário via o listener de click/mousedown
    });
  }, []);

  return { play };
}
