import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient';
import {
  createEnvelope,
  addDocument,
  addSigner,
  addRequirement,
  activateEnvelope,
  type SignaturePosition,
} from '@/lib/clicksign/client';

export const maxDuration = 30;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Contrato: assinaturas lado a lado na página 2
const DEFAULT_COMPANY_POSITION: SignaturePosition = { page: 2, x: 0.05, y: 0.78, width: 0.38, height: 0.08 };
const DEFAULT_CLIENT_POSITION: SignaturePosition  = { page: 2, x: 0.57, y: 0.78, width: 0.38, height: 0.08 };

// Procuração: assinatura centralizada na página 1 (abaixo da linha de assinatura)
const PROC_CLIENT_POSITION: SignaturePosition = { page: 1, x: 0.15, y: 0.72, width: 0.70, height: 0.08 };

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const {
      dealId, pdfBase64, filename,
      signerName, signerEmail, signerPhone,
      companySignerName, companySignerEmail,
      procuracaoBase64, procuracaoFilename,
    } = body ?? {};

    if (!pdfBase64) {
      return json({ error: 'pdfBase64 é obrigatório.' }, 400);
    }

    const supabase = createStaticAdminClient();
    const isAvulso = !dealId || dealId === 'doc-avulso';

    let deal: { id: string; title: string; custom_fields: Record<string, unknown> } | null = null;
    if (!isAvulso) {
      const { data, error: dealErr } = await supabase
        .from('deals')
        .select('id, title, custom_fields')
        .eq('id', dealId)
        .single();
      if (dealErr || !data) return json({ error: 'Deal não encontrado.' }, 404);
      deal = data as typeof deal;
    }

    const contractName = `Contrato - ${signerName ?? deal?.title ?? 'Cliente'}`;

    // 1. Criar envelope
    const envelope = await createEnvelope(contractName);

    // 2. Adicionar documento (PDF em base64)
    const pdfFilename = filename ?? 'contrato.pdf';
    const document = await addDocument(envelope.id, pdfFilename, pdfBase64);

    // 3. Adicionar signatário(s)
    const clientSigner = await addSigner(envelope.id, signerName, signerEmail, signerPhone);

    // Posição do cliente no contrato
    await addRequirement(envelope.id, document.id, clientSigner.id, DEFAULT_CLIENT_POSITION);

    // Signatário da empresa (opcional)
    if (companySignerEmail && companySignerName) {
      const companySigner = await addSigner(envelope.id, companySignerName, companySignerEmail);
      await addRequirement(envelope.id, document.id, companySigner.id, DEFAULT_COMPANY_POSITION);
    }

    // 3b. Procuração no mesmo envelope (opcional)
    if (procuracaoBase64) {
      const procFilename = procuracaoFilename ?? 'procuracao.pdf';
      const procDocument = await addDocument(envelope.id, procFilename, procuracaoBase64);
      // Apenas o cliente assina a procuração
      await addRequirement(envelope.id, procDocument.id, clientSigner.id, PROC_CLIENT_POSITION);
    }

    // 4. Ativar (dispara os emails automaticamente)
    await activateEnvelope(envelope.id);

    // 5. Salvar estado no deal (se vinculado a um deal)
    if (deal) {
      const existingCustomFields = deal.custom_fields ?? {};
      await supabase
        .from('deals')
        .update({
          custom_fields: {
            ...existingCustomFields,
            clicksign: {
              envelopeId: envelope.id,
              envelopeKey: envelope.key,
              status: 'running',
              sentAt: new Date().toISOString(),
              signerName,
              signerEmail,
            },
          },
        })
        .eq('id', deal.id);
    }

    return json({ ok: true, envelopeId: envelope.id, envelopeKey: envelope.key });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido.';
    console.error('[clicksign/send]', message);
    return json({ error: message }, 500);
  }
}
