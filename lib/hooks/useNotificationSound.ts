import { useCallback, useEffect } from 'react';

type SoundType =
  | 'mensagem_recebida'
  | 'mensagem_enviada'
  | 'lead_movido'
  | 'lead_ganho'
  | 'lead_perdido';

let _ctx: AudioContext | null = null;

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

// Tenta resumir o AudioContext — só funciona dentro de gesto do usuário.
export function unlockAudio() {
  const ctx = getOrCreateCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
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
  // Fade out nos últimos 30ms para evitar clique
  gain.gain.setValueAtTime(vol, ctx.currentTime + delay + duration - 0.03);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + delay + duration);
  osc.stop(ctx.currentTime + delay + duration + 0.01);
}

function createSound(ctx: AudioContext, type: SoundType) {
  switch (type) {
    case 'mensagem_recebida':
      beep(ctx, 523, 0,    0.15, 0.4);
      beep(ctx, 784, 0.15, 0.20, 0.4);
      break;
    case 'mensagem_enviada':
      beep(ctx, 440, 0,    0.05, 0.2);
      beep(ctx, 660, 0.05, 0.10, 0.2);
      break;
    case 'lead_movido':
      beep(ctx, 600, 0,    0.08, 0.25);
      break;
    case 'lead_ganho':
      beep(ctx, 523, 0,    0.12, 0.3);
      beep(ctx, 659, 0.12, 0.12, 0.3);
      beep(ctx, 784, 0.24, 0.20, 0.4);
      break;
    case 'lead_perdido':
      beep(ctx, 440, 0,    0.15, 0.25);
      beep(ctx, 330, 0.15, 0.20, 0.25);
      break;
  }
}

export function useNotificationSound() {
  useEffect(() => {
    // Desbloqueia AudioContext no primeiro gesto do usuário
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

    const doPlay = () => {
      try { createSound(ctx, type); } catch { /* ignora */ }
    };

    if (ctx.state === 'running') {
      doPlay();
    } else {
      // Contexto suspenso: tenta resumir e tocar
      ctx.resume().then(doPlay).catch(() => {});
    }
  }, []);

  return { play };
}
