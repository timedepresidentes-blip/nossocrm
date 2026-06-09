// Converte áudio audio/mp4 (M4A) para audio/mpeg (MP3) usando FFmpeg WASM.
// Usa o módulo Emscripten @ffmpeg/core diretamente (sem WebWorker) para compatibilidade com Node.js.
// O WASM é servido como arquivo estático em public/ffmpeg/ (copiado por scripts/copy-ffmpeg-wasm.mjs).
// Necessário porque WhatsApp Cloud API retorna erro 131053 ao enviar audio/mp4.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EmscriptenModule = Record<string, any>;

export async function convertM4aToMp3(sourceBuffer: Buffer): Promise<Buffer | null> {
  try {
    // WASM é servido como estático — carregado via HTTP do próprio domínio
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000');

    const wasmRes = await fetch(`${baseUrl}/ffmpeg/ffmpeg-core.wasm`);
    if (!wasmRes.ok) {
      throw new Error(`WASM fetch falhou: ${wasmRes.status} ${wasmRes.statusText}`);
    }
    const wasmBinary = new Uint8Array(await wasmRes.arrayBuffer());

    // Carrega e inicializa o módulo Emscripten do @ffmpeg/core
    // O pacote exporta createFFmpegCore como default; aceita um objeto Module como argumento.
    const { default: createFFmpegCore } = await import('@ffmpeg/core');
    const mod: EmscriptenModule = { wasmBinary };

    // createFFmpegCore(mod) muta mod com FS, exec etc. e retorna mod.ready (Promise)
    await createFFmpegCore(mod);

    const FS: (cmd: string, ...args: unknown[]) => unknown = mod.FS;
    const exec: (...args: string[]) => number = mod.exec;

    FS('writeFile', 'input.m4a', new Uint8Array(sourceBuffer));

    // Converte M4A→MP3: mono, 22050 Hz, 64kbps — adequado para áudio de voz
    exec('-i', 'input.m4a', '-acodec', 'libmp3lame', '-ac', '1', '-ar', '22050', '-b:a', '64k', 'output.mp3');

    const outputData = FS('readFile', 'output.mp3') as Uint8Array;

    try { FS('unlink', 'input.m4a'); } catch { /* ignore */ }
    try { FS('unlink', 'output.mp3'); } catch { /* ignore */ }

    console.log('[audio-converter] M4A→MP3 OK, saída:', outputData.byteLength, 'bytes');
    return Buffer.from(outputData);
  } catch (err) {
    console.error('[audio-converter] Conversão M4A→MP3 falhou:', err instanceof Error ? err.message : err);
    return null;
  }
}
