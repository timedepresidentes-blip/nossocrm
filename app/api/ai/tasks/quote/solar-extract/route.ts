import { generateText, Output } from 'ai';
import { z } from 'zod';
import { requireAITaskContext, AITaskHttpError } from '@/lib/ai/tasks/server';

export const maxDuration = 60;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

const SolarExtractSchema = z.object({
  kwhMonth: z.number().nullable().describe('Consumo médio mensal em kWh. null se não encontrado.'),
  city: z.string().nullable().describe('Cidade do cliente. null se não mencionada.'),
  state: z.string().nullable().describe('Estado (UF) do cliente. null se não mencionado.'),
  distributor: z.string().nullable().describe('Nome da distribuidora de energia. null se não mencionada.'),
  currentBillValue: z.number().nullable().describe('Valor atual da conta de energia em R$. null se não mencionado.'),
  systemPowerKwp: z.number().nullable().describe('Potência estimada em kWp (se mencionada). null caso contrário.'),
  observations: z.string().nullable().describe('Observações técnicas relevantes (telhado, sombreamento, fases etc). null se nada relevante.'),
  confidence: z.number().min(0).max(1).describe('Confiança geral de 0 a 1.'),
});

export type SolarExtractResult = z.infer<typeof SolarExtractSchema>;

const SYSTEM_PROMPT = `Você é especialista em energia solar fotovoltaica. Analise o conteúdo fornecido (conversa e/ou imagem de conta de energia) e extraia informações para dimensionamento de sistema solar.

Extraia:
- Consumo mensal em kWh (verifique campos "Consumo (kWh)", "Histórico de Consumo" ou texto da conversa)
- Cidade e estado do cliente
- Distribuidora de energia (CPFL, Cemig, Enel, Energisa etc.)
- Valor total da conta em R$ (campo "Valor a Pagar" ou "Total")
- Potência estimada do sistema em kWp se mencionada
- Observações técnicas relevantes

Se uma imagem de conta de energia for fornecida, priorize os dados da imagem sobre o texto da conversa.
Extraia APENAS o que está explícito. Não invente dados.`;

function extractTextContent(content: Record<string, unknown>): string {
  if (typeof content?.text === 'string') return content.text;
  if (typeof content?.body === 'string') return content.body;
  if (typeof content?.caption === 'string') return `[Imagem] ${content.caption}`;
  const type = content?.type as string | undefined;
  if (type === 'image') return '[Foto enviada pelo cliente]';
  if (type === 'audio') return '[Áudio enviado]';
  if (type === 'document') return '[Documento enviado]';
  return '[Mensagem sem texto]';
}

export async function POST(req: Request) {
  try {
    const { model, supabase, organizationId } = await requireAITaskContext(req);

    const body = await req.json().catch(() => null);
    const { conversationId, billImageBase64, billImageMimeType } = body || {};

    // Precisa de pelo menos conversationId ou imagem da conta
    if (!conversationId && !billImageBase64) {
      return json({ error: { code: 'MISSING_PARAM', message: 'Forneça conversationId ou a imagem da conta de energia.' } }, 400);
    }

    // Formatar texto da conversa (opcional)
    let conversationText = '';
    if (conversationId) {
      const { data: messages } = await supabase
        .from('messaging_messages')
        .select('id, direction, content, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(60);

      if (messages && messages.length > 0) {
        conversationText = messages
          .map((m) => {
            const role = m.direction === 'inbound' ? 'CLIENTE' : 'VENDEDOR';
            const text = extractTextContent(m.content as Record<string, unknown>);
            return `[${role}]: ${text}`;
          })
          .join('\n');
      }
    }

    // Buscar produtos ativos para contexto de sugestão
    const { data: products } = await supabase
      .from('products')
      .select('id, name, price, kit_cost, cost_price, cost_items, characteristics, kit_description, active')
      .eq('organization_id', organizationId)
      .eq('active', true)
      .order('price', { ascending: true });

    const productsContext = products && products.length > 0
      ? `\n\nCATÁLOGO DE KITS DISPONÍVEIS:\n${products.map((p) => {
          const chars = Array.isArray(p.characteristics)
            ? p.characteristics.map((c: { key: string; value: string }) => `${c.key}: ${c.value}`).join(', ')
            : '';
          return `- ${p.name} (R$ ${Number(p.price).toLocaleString('pt-BR')})${chars ? ` | ${chars}` : ''}`;
        }).join('\n')}`
      : '';

    // Monta o prompt base
    const textPrompt = [
      conversationText
        ? `CONVERSA COM O CLIENTE:\n${conversationText}`
        : '',
      productsContext,
      '\nExtraia os dados técnicos para dimensionamento solar.',
    ].filter(Boolean).join('\n\n');

    let result;

    if (billImageBase64) {
      // Extração com visão (imagem da conta de energia)
      const mimeType = (billImageMimeType || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
      result = await generateText({
        model,
        maxRetries: 2,
        output: Output.object({ schema: SolarExtractSchema }),
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                image: `data:${mimeType};base64,${billImageBase64}`,
              },
              ...(conversationText ? [{
                type: 'text' as const,
                text: `Além da imagem da conta de energia acima, veja também o contexto da conversa:\n\n${conversationText}${productsContext}`,
              }] : [{
                type: 'text' as const,
                text: `Analise a conta de energia acima e extraia os dados solares.${productsContext}`,
              }]),
            ],
          },
        ],
      });
    } else {
      // Extração apenas por texto da conversa
      result = await generateText({
        model,
        maxRetries: 2,
        output: Output.object({ schema: SolarExtractSchema }),
        system: SYSTEM_PROMPT,
        prompt: textPrompt,
      });
    }

    return json({
      extracted: result.output,
      products: products || [],
    });
  } catch (err: unknown) {
    if (err instanceof AITaskHttpError) return err.toResponse();
    if (err instanceof z.ZodError) {
      return json({ error: { code: 'INVALID_INPUT', message: 'Payload inválido.' } }, 400);
    }

    // Extrair mensagem real do erro para diagnóstico
    const e = err as Record<string, unknown>;
    const status = (e.statusCode ?? e.status) as number | undefined;
    const rawMessage = typeof e.message === 'string' ? e.message : '';
    const responseBody = typeof e.responseBody === 'string' ? e.responseBody : '';

    console.error('[api/ai/tasks/quote/solar-extract] Error:', {
      name: (err as Error)?.name,
      status,
      message: rawMessage,
      responseBody,
    });

    let message = rawMessage || 'Erro ao extrair dados.';
    if (status === 429 || rawMessage.includes('quota') || rawMessage.includes('RESOURCE_EXHAUSTED')) {
      message = 'Cota de API esgotada. Verifique o faturamento no Google Cloud Console.';
    } else if (status === 401 || status === 403 || rawMessage.includes('API_KEY_INVALID') || rawMessage.includes('PERMISSION_DENIED')) {
      message = 'Chave de API inválida ou sem permissão. Reconfigure em Configurações.';
    }

    return json({ error: { code: 'INTERNAL_ERROR', message } }, 500);
  }
}
