import { useCallback, useRef } from 'react';

type SoundType =
  | 'mensagem_recebida'
  | 'mensagem_enviada'
  | 'lead_movido'
  | 'lead_ganho'
  | 'lead_perdido';

// Sons gerados via Web Audio API — nenhum arquivo externo necessário.
// Cada som é distinto para identificação auditiva imediata.
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
    // Dois tons ascendentes — estilo MSN Messenger clássico
    case 'mensagem_recebida':
      note(523, 0,    0.18, 0.35);
      note(784, 0.15, 0.28, 0.40);
      break;

    // Tom curto ascendente — "whoosh" discreto de envio
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

    // "Pop" seco — card movido no kanban
    case 'lead_movido':
      note(600, 0,    0.08, 0.30, 'sine');
      note(900, 0.06, 0.07, 0.15, 'sine');
      break;

    // Três notas ascendentes em acorde maior — vitória!
    case 'lead_ganho':
      note(523, 0,    0.20, 0.35);
      note(659, 0.12, 0.20, 0.35);
      note(784, 0.24, 0.35, 0.40);
      break;

    // Dois tons descendentes — sinal de encerramento
    case 'lead_perdido':
      note(440, 0,    0.20, 0.30);
      note(330, 0.18, 0.28, 0.28);
      break;
  }
}

export function useNotificationSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  const play = useCallback((type: SoundType) => {
    try {
      // Cria o AudioContext na primeira interação do usuário (exigência dos browsers)
      if (!ctxRef.current || ctxRef.current.state === 'closed') {
        ctxRef.current = new AudioContext();
      }
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => createSound(ctx, type));
      } else {
        createSound(ctx, type);
      }
    } catch {
      // Silencia erros — som é progressivo, não crítico
    }
  }, []);

  return { play };
}
