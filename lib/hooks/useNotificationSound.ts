import { useCallback, useEffect } from 'react';

export type SoundType =
  | 'mensagem_recebida'
  | 'mensagem_enviada'
  | 'lead_movido'
  | 'lead_ganho'
  | 'lead_perdido'
  | 'nova_conversa'
  | 'ai_handoff'
  | 'nota_interna'
  | 'lembrete_criado';

// ─── AudioContext singleton ───────────────────────────────────────────────────
// Regra crítica: AudioContext criado DENTRO de um gesto do usuário inicia em
// 'running'. Criado fora (ex: useEffect na montagem) inicia em 'suspended' e
// resume() pode ser rejeitado silenciosamente pelo browser.

let _ctx: AudioContext | null = null;

function getRunningCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (_ctx && _ctx.state === 'running') return _ctx;
  return null;
}

// Chamado dentro do gesto (capture phase) — garante contexto running
export function unlockAudio(): void {
  if (typeof window === 'undefined') return;
  try {
    if (!_ctx || _ctx.state === 'closed') {
      _ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    if (_ctx.state === 'suspended') {
      _ctx.resume().catch(() => {});
    }
  } catch { /* browser sem suporte */ }
}

// ─── Geração de sons ─────────────────────────────────────────────────────────

function beep(ctx: AudioContext, freq: number, startDelay: number, duration: number, vol: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.value = vol;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const t = ctx.currentTime + startDelay;
  osc.start(t);
  gain.gain.setValueAtTime(vol, t + duration - 0.04);
  gain.gain.linearRampToValueAtTime(0, t + duration);
  osc.stop(t + duration + 0.05);
}

function createSound(ctx: AudioContext, type: SoundType) {
  try {
    switch (type) {
      case 'mensagem_recebida':
        beep(ctx, 523, 0,    0.15, 0.55);
        beep(ctx, 784, 0.18, 0.22, 0.60);
        break;
      case 'mensagem_enviada':
        beep(ctx, 440, 0,    0.07, 0.28);
        beep(ctx, 660, 0.09, 0.12, 0.28);
        break;
      case 'lead_movido':
        beep(ctx, 600, 0, 0.08, 0.22);
        break;
      case 'lead_ganho':
        beep(ctx, 523, 0,    0.10, 0.3);
        beep(ctx, 659, 0.12, 0.10, 0.3);
        beep(ctx, 784, 0.25, 0.20, 0.45);
        break;
      case 'lead_perdido':
        beep(ctx, 440, 0,    0.15, 0.22);
        beep(ctx, 330, 0.18, 0.20, 0.22);
        break;
      case 'nova_conversa':
        beep(ctx, 440, 0,    0.10, 0.28);
        beep(ctx, 523, 0.14, 0.12, 0.32);
        beep(ctx, 659, 0.28, 0.18, 0.38);
        break;
      case 'ai_handoff':
        beep(ctx, 523, 0,    0.12, 0.28);
        beep(ctx, 784, 0.02, 0.12, 0.18);
        beep(ctx, 659, 0.16, 0.18, 0.32);
        break;
      case 'nota_interna':
        // Dois bipes suaves ascendentes — confirmação discreta de anotação
        beep(ctx, 660, 0,    0.09, 0.20);
        beep(ctx, 880, 0.11, 0.12, 0.22);
        break;
      case 'lembrete_criado':
        // Três notas curtas — como um alarme de agenda
        beep(ctx, 784, 0,    0.08, 0.22);
        beep(ctx, 784, 0.10, 0.08, 0.22);
        beep(ctx, 988, 0.20, 0.14, 0.30);
        break;
    }
  } catch { /* silencia erros de áudio */ }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useNotificationSound() {
  useEffect(() => {
    // Registra listeners no modo capture para firmar o PRIMEIRO gesto
    const opts = { passive: true, capture: true } as const;
    document.addEventListener('click',       unlockAudio, opts);
    document.addEventListener('pointerdown', unlockAudio, opts);
    document.addEventListener('keydown',     unlockAudio, opts);
    document.addEventListener('touchstart',  unlockAudio, opts);

    // Reativa ao voltar ao foco da aba (Chrome suspende contextos em background)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && _ctx?.state === 'suspended') {
        _ctx.resume().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('click',       unlockAudio, opts);
      document.removeEventListener('pointerdown', unlockAudio, opts);
      document.removeEventListener('keydown',     unlockAudio, opts);
      document.removeEventListener('touchstart',  unlockAudio, opts);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const play = useCallback((type: SoundType) => {
    if (typeof window === 'undefined') return;
    if (!_ctx || _ctx.state === 'closed') return;

    if (_ctx.state === 'running') {
      createSound(_ctx, type);
      return;
    }

    // Contexto suspenso (tab voltou do background ou ainda não interagiu):
    // tenta resumir e tocar em seguida
    if (_ctx.state === 'suspended') {
      _ctx.resume().then(() => {
        if (_ctx && _ctx.state === 'running') createSound(_ctx, type);
      }).catch(() => {});
    }
  }, []);

  return { play };
}
