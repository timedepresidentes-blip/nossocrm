import { generateText, Output } from 'ai';
import { requireAITaskContext, AITaskHttpError } from '@/lib/ai/tasks/server';
import { FichaClienteSchema } from '@/lib/ai/schemas/fichaCliente';

export const maxDuration = 90;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

const SYSTEM_PROMPT = `Você é especialista em extrair dados cadastrais e comerciais de contratos de energia solar.

Analise o documento completo e extraia TODAS as informações presentes para montar a ficha do cliente.

Extraia com atenção:
- Dados pessoais: nome completo, CPF/CNPJ, RG, telefone, e-mail, estado civil
- Endereço completo do cliente (rua, bairro, cidade, estado, CEP)
- Local de instalação (se diferente do endereço do cliente)
- Tipo de imóvel e características elétricas (fases, disjuntor, tipo de telhado)
- Sistema solar: potência total em kWp, quantidade e modelo dos painéis, potência unitária do painel, modelo e quantidade do inversor/microinversor, tipo de estrutura
- Condições comerciais: valor total do contrato em R$ (número puro), forma de pagamento, parcelas/financiamento, prazo de entrega/instalação
- Consumo atual, distribuidora, valor da conta de energia (se constar)
- Observações relevantes

REGRAS CRÍTICAS:
- Extraia SOMENTE o que está explícito no documento
- Nunca invente nem suponha dados ausentes — retorne null para o que não constar
- valorTotal deve ser um número (ex: 28500.00), não uma string
- potenciaKwp deve ser um número (ex: 3.85), não uma string`;

export async function POST(req: Request) {
  try {
    const { model, supabase } = await requireAITaskContext(req);

    const formData = await req.formData().catch(() => null);
    if (!formData) return json({ error: { code: 'INVALID_BODY', message: 'Envie o PDF via multipart/form-data.' } }, 400);

    const pdfFile = formData.get('pdf') as File | null;
    const dealId  = formData.get('dealId') as string | null;

    if (!pdfFile || pdfFile.size === 0) {
      return json({ error: { code: 'MISSING_FILE', message: 'Nenhum arquivo PDF encontrado.' } }, 400);
    }

    if (pdfFile.size > 20 * 1024 * 1024) {
      return json({ error: { code: 'FILE_TOO_LARGE', message: 'PDF deve ter menos de 20 MB.' } }, 400);
    }

    const pdfBuffer = await pdfFile.arrayBuffer();
    const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');

    const result = await generateText({
      model,
      maxRetries: 2,
      output: Output.object({ schema: FichaClienteSchema }),
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'file', data: pdfBase64, mimeType: 'application/pdf' },
            { type: 'text', text: 'Extraia todos os dados deste contrato de energia solar conforme as instruções.' },
          ],
        },
      ],
    });

    const ficha = result.output;

    // Atualiza deal se fornecido: ficha, valor e título (quando não preenchidos)
    if (dealId && ficha) {
      const { data: deal } = await supabase
        .from('deals')
        .select('title, value')
        .eq('id', dealId)
        .maybeSingle();

      const updates: Record<string, unknown> = {
        ficha_cliente: ficha,
        contrato_assinado: true,
        updated_at: new Date().toISOString(),
      };

      // Atualiza valor do deal se estiver vazio/zero e o contrato trouxer valorTotal
      if (ficha.valorTotal && (!deal?.value || deal.value === 0)) {
        updates.value = ficha.valorTotal;
      }

      // Atualiza título com o nome do cliente se o título for genérico
      if (ficha.nomeCompleto && deal?.title && deal.title.startsWith('Deal -')) {
        updates.title = `Deal - ${ficha.nomeCompleto}`;
      }

      await supabase.from('deals').update(updates).eq('id', dealId);
    }

    return json({ ficha });
  } catch (err: unknown) {
    if (err instanceof AITaskHttpError) return err.toResponse();
    const e = err as Record<string, unknown>;
    console.error('[api/ai/tasks/deals/ficha-from-pdf] Error:', e);
    return json({ error: { code: 'INTERNAL_ERROR', message: (e.message as string) || 'Erro ao extrair dados do contrato.' } }, 500);
  }
}
