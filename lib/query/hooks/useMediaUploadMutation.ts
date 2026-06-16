/**
 * @fileoverview Media Upload Mutation — fluxo de 3 passos para evitar limite de body do Vercel.
 *
 * 1. Solicita URL assinada ao servidor (body pequeno — metadados do arquivo)
 * 2. Faz upload do arquivo DIRETO para o Supabase usando o client JS
 *    (bypassa o Vercel, lida com CORS e autenticação corretamente)
 * 3. Solicita ao servidor o Media ID da Meta API (body pequeno — só o path)
 */
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

interface MediaUploadResult {
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  mimeType: string;
  fileName: string;
  fileSize: number;
}

export function useMediaUploadMutation() {
  return useMutation({
    mutationFn: async ({
      file,
      conversationId,
    }: {
      file: File;
      conversationId: string;
    }): Promise<MediaUploadResult> => {

      // Passo 1: obter URL assinada do Supabase (request pequeno — só metadados)
      const res1 = await fetch('/api/messaging/media/signed-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          mimeType:  file.type,
          fileSize:  file.size,
          conversationId,
        }),
      });

      let signedData: { signedUrl: string; token: string; storagePath: string; publicUrl: string; mediaType: string };
      try {
        if (!res1.ok) {
          const err = await res1.json().catch(() => ({})) as { error?: string };
          throw new Error(err.error || `Erro ao preparar upload (${res1.status})`);
        }
        signedData = await res1.json();
      } catch (e) {
        throw e instanceof Error ? e : new Error('Erro ao preparar upload');
      }

      const { signedUrl, token, storagePath, publicUrl, mediaType } = signedData;

      // Passo 2: upload DIRETO para o Supabase usando o cliente JS (bypassa o Vercel)
      // uploadToSignedUrl lida corretamente com CORS, retries e headers do Supabase.
      const { error: uploadError } = await supabase.storage
        .from('messaging-media')
        .uploadToSignedUrl(storagePath, token, file, { contentType: file.type });

      if (uploadError) {
        throw new Error(`Falha ao enviar arquivo para o storage: ${uploadError.message}`);
      }

      // Passo 3: finalizar — servidor faz re-upload para Meta API e retorna mediaUrl
      const res3 = await fetch('/api/messaging/media/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath,
          publicUrl,
          mimeType: file.type,
          conversationId,
          fileName:  file.name,
          fileSize:  file.size,
          mediaType,
        }),
      });

      try {
        if (!res3.ok) {
          const err = await res3.json().catch(() => ({})) as { error?: string };
          throw new Error(err.error || `Erro ao finalizar upload (${res3.status})`);
        }
        return res3.json();
      } catch (e) {
        throw e instanceof Error ? e : new Error('Erro ao finalizar upload');
      }
    },
  });
}
