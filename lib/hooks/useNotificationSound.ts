import { useCallback, useEffect } from 'react';

type SoundType =
  | 'mensagem_recebida'
  | 'mensagem_enviada'
  | 'lead_movido'
  | 'lead_ganho'
  | 'lead_perdido';

// Singleton — sobrevive a remontagens do componente.
let _ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new AudioContext();
    // Quando o Chrome auto-suspende o contexto (idle), registramos
    // um listener de clique para reativá-lo na próxima interação.
    _ctx.addEventListener('statechange', () => {
      if (_ctx?.state === 'suspended') {
        const resume = () => {
          _ctx?.resume().catch(() => {});
        };
        document.addEventListener('click',      resume, { once: true, passive: true });
        document.addEventListener('keydown',    resume, { once: true, passive: true });
        document.addEventListener('touchstart', resume, { once: true, passive: true });
      }
    });
  }
  return _ctx;
}

function tryResume() {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  } catch {
    // ignora — SSR ou browser sem suporte
  }
}

function createSound(ctx: AudioContext, type: SoundType) {
  const master = ctx.createGain();
  master.connect(ctx.destination);

  const note = (freq: number, start: number, duration: number, vol = 0.4, wave: OscillatorType = 'sine') => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(master);
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
    gain.gain.setValueAtTime(0, ctx.currentTime + start);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + duration + 0.05);
  };

  switch (type) {
    case 'mensagem_recebida':
      note(523, 0,    0.18, 0.35);
      note(784, 0.15, 0.28, 0.40);
      break;

    case 'mensagem_enviada': {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(master);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(700, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.22);
      break;
    }

    case 'lead_movido':
      note(600, 0,    0.08, 0.30, 'sine');
      note(900, 0.06, 0.07, 0.15, 'sine');
      break;

    case 'lead_ganho':
      note(523, 0,    0.20, 0.35);
      note(659, 0.12, 0.20, 0.35);
      note(784, 0.24, 0.35, 0.40);
      break;

    case 'lead_perdido':
      note(440, 0,    0.20, 0.30);
      note(330, 0.18, 0.28, 0.28);
      break;
  }
}

export function useNotificationSound() {
  useEffect(() => {
    const unlock = () => tryResume();

    document.addEventListener('click',      unlock, { passive: true });
    document.addEventListener('keydown',    unlock, { passive: true });
    document.addEventListener('touchstart', unlock, { passive: true });

    // Tenta desbloquear imediatamente — funciona se já houve gesto anterior na sessão
    unlock();

    return () => {
      document.removeEventListener('click',      unlock);
      document.removeEventListener('keydown',    unlock);
      document.removeEventListener('touchstart', unlock);
    };
  }, []);

  const play = useCallback((type: SoundType) => {
    try {
      const ctx = getCtx();
      if (ctx.state === 'suspended') {
        // Tenta resumir e tocar em seguida; se falhar (sem gesto recente),
        // o statechange listener vai re-agendar para o próximo clique.
        ctx.resume()
          .then(() => createSound(ctx, type))
          .catch(() => {});
      } else {
        createSound(ctx, type);
      }
    } catch {
      // Som é progressivo — falha silenciosa
    }
  }, []);

  return { play };
}
