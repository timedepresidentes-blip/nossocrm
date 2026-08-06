import { generateText, generateObject } from 'ai';
import { requireAITaskContext, AITaskHttpError } from '@/lib/ai/tasks/server';
import { FichaClienteSchema } from '@/lib/ai/schemas/fichaCliente';

export const maxDuration = 120;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

const EXTRACT_SYSTEM = `Você é um extrator de dados de contratos de energia solar.
Leia o documento inteiro e transcreva TODOS os dados relevantes, preservando valores e nomes exatamente como aparecem:
- Dados do cliente: nome completo, CPF/CNPJ, RG, telefone, e-mail, estado civil
- Endereço do cliente: rua, número, bairro, cidade, estado, CEP
- Local de instalação (se diferente do endereço)
- Tipo de imóvel, telhado, fases elétricas, disjuntor
- Sistema fotovoltaico: potência em kWp, quantidade e modelo dos painéis, potência unitária, modelo e quantidade do inversor, tipo de estrutura
- Valor total do contrato em R$, forma de pagamento, parcelas/financiamento, prazo
- Distribuidora, consumo mensal, valor da conta (se constar)
Seja fiel ao documento. Não invente informações.`;

const STRUCTURE_SYSTEM = `Você é especialista em estruturar dados de contratos de energia solar.
Analise o texto transcrito e preencha os campos do esquema.
REGRAS:
- Extraia SOMENTE o que está no texto
- Não invente nem suponha dados ausentes — retorne null
- valorTotal deve ser número (ex: 28500.00)
- potenciaKwp deve ser número (ex: 3.85)`;

export async function POST(req: Request) {
  try {
    const { model, supabase } = await requireAITaskContext(req);

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return json({ error: { code: 'INVALID_BODY', message: 'Envie o PDF via multipart/form-data.' } }, 400);
    }

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

    // Passo 1 — extrai texto do PDF via modelo multimodal (sem saída estruturada)
    let extractedText: string;
    try {
      const textResult = await generateText({
        model,
        maxRetries: 1,
        system: EXTRACT_SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'file', data: pdfBase64, mediaType: 'application/pdf' },
              { type: 'text', text: 'Transcreva todos os dados relevantes deste contrato.' },
            ],
          },
        ],
      });
      extractedText = textResult.text?.trim() ?? '';
    } catch (err: unknown) {
      const msg = (err as Record<string, unknown>)?.message as string | undefined;
      return json({
        error: { code: 'PDF_READ_ERROR', message: `Falha ao processar o PDF: ${msg ?? 'erro desconhecido'}` },
      }, 422);
    }

    if (!extractedText) {
      return json({ error: { code: 'EMPTY_EXTRACTION', message: 'O modelo não conseguiu ler o conteúdo do PDF. Verifique se o arquivo está legível.' } }, 422);
    }

    // Passo 2 — estrutura o texto extraído com generateObject (sem arquivo)
    let ficha: Record<string, unknown>;
    try {
      const { object } = await generateObject({
        model,
        schema: FichaClienteSchema,
        maxRetries: 2,
        system: STRUCTURE_SYSTEM,
        prompt: extractedText,
      });
      ficha = object as Record<string, unknown>;
    } catch (err: unknown) {
      const msg = (err as Record<string, unknown>)?.message as string | undefined;
      return json({
        error: { code: 'STRUCTURE_ERROR', message: `Falha ao estruturar os dados: ${msg ?? 'erro desconhecido'}` },
      }, 422);
    }

    // Atualiza deal se fornecido
    if (dealId && ficha) {
      const { data: deal } = await supabase
        .from('deals')
        .select('title, value')
        .eq('id', dealId)
        .maybeSingle();

      const agora = new Date().toISOString();
      const updates: Record<string, unknown> = {
        ficha_cliente: ficha,
        contrato_assinado: true,
        contrato_assinado_at: agora,
        is_won: true,
        is_lost: false,
        closed_at: agora,
        updated_at: agora,
      };

      const valorTotal = ficha.valorTotal as number | null;
      if (valorTotal && (!deal?.value || deal.value === 0)) {
        updates.value = valorTotal;
      }

      const nomeCompleto = ficha.nomeCompleto as string | null;
      if (nomeCompleto && deal?.title?.startsWith('Deal -')) {
        updates.title = `Deal - ${nomeCompleto}`;
      }

      await supabase.from('deals').update(updates).eq('id', dealId);
    }

    return json({ ficha });
  } catch (err: unknown) {
    if (err instanceof AITaskHttpError) return err.toResponse();
    const e = err as Record<string, unknown>;
    console.error('[ficha-from-pdf]', e);
    return json({
      error: {
        code: 'INTERNAL_ERROR',
        message: (e?.message as string) || 'Erro interno ao processar o contrato.',
      },
    }, 500);
  }
}
