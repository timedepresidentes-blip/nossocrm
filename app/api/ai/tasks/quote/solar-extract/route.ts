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

// Schema de retorno da extração solar
const SolarExtractSchema = z.object({
  kwhMonth: z.number().nullable().describe('Consumo médio mensal em kWh. null se não encontrado.'),
  city: z.string().nullable().describe('Cidade do cliente. null se não mencionada.'),
  state: z.string().nullable().describe('Estado (UF) do cliente. null se não mencionado.'),
  distributor: z.string().nullable().describe('Nome da distribuidora de energia. null se não mencionada.'),
  currentBillValue: z.number().nullable().describe('Valor atual da conta de energia em R$. null se não mencionado.'),
  systemPowerKwp: z.number().nullable().describe('Potência estimada do sistema solar em kWp (se o cliente ou vendedor já mencionou). null se não mencionado.'),
  observations: z.string().nullable().describe('Outras informações relevantes sobre o projeto solar (telhado, sombreamento, número de fases etc.). null se nada relevante.'),
  confidence: z.number().min(0).max(1).describe('Confiança geral da extração de 0 a 1.'),
});

export type SolarExtractResult = z.infer<typeof SolarExtractSchema>;

function extractTextContent(content: Record<string, unknown>): string {
  if (typeof content?.text === 'string') return content.text;
  if (typeof content?.body === 'string') return content.body;
  if (typeof content?.caption === 'string') return `[Imagem] ${content.caption}`;
  const type = content?.type as string | undefined;
  if (type === 'image') return '[Foto da conta de energia ou imagem enviada]';
  if (type === 'audio') return '[Áudio enviado]';
  if (type === 'document') return '[Documento enviado]';
  return '[Mensagem sem texto]';
}

export async function POST(req: Request) {
  try {
    const { model, supabase, organizationId } = await requireAITaskContext(req);

    const body = await req.json().catch(() => null);
    const { conversationId } = body || {};

    if (!conversationId) {
      return json({ error: { code: 'MISSING_PARAM', message: 'conversationId obrigatório.' } }, 400);
    }

    // Buscar mensagens da conversa
    const { data: messages, error: msgError } = await supabase
      .from('messaging_messages')
      .select('id, direction, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(60);

    if (msgError) {
      return json({ error: { code: 'DB_ERROR', message: 'Erro ao buscar mensagens.' } }, 500);
    }

    if (!messages || messages.length < 1) {
      return json({ error: { code: 'NO_MESSAGES', message: 'Nenhuma mensagem encontrada nesta conversa.' } }, 404);
    }

    // Formatar conversa para o prompt
    const conversationText = messages
      .map((m) => {
        const role = m.direction === 'inbound' ? 'CLIENTE' : 'VENDEDOR';
        const text = extractTextContent(m.content as Record<string, unknown>);
        return `[${role}]: ${text}`;
      })
      .join('\n');

    // Buscar produtos ativos do catálogo para incluir no contexto
    const { data: products } = await supabase
      .from('products')
      .select('id, name, price, kit_cost, cost_price, cost_items, characteristics, kit_description, active')
      .eq('organization_id', organizationId)
      .eq('active', true)
      .order('price', { ascending: true });

    const productsContext = products && products.length > 0
      ? `\n\nPRODUTOS DISPONÍVEIS NO CATÁLOGO:\n${products.map((p) => {
          const chars = Array.isArray(p.characteristics)
            ? p.characteristics.map((c: { key: string; value: string }) => `${c.key}: ${c.value}`).join(', ')
            : '';
          return `- ${p.name} (R$ ${Number(p.price).toLocaleString('pt-BR')})${chars ? ` | ${chars}` : ''}`;
        }).join('\n')}`
      : '';

    // Chamada de IA para extração solar
    const result = await generateText({
      model,
      maxRetries: 2,
      output: Output.object({ schema: SolarExtractSchema }),
      system: `Você é um especialista em energia solar fotovoltaica. Analise conversas de vendas de sistemas solares e extraia informações técnicas relevantes para gerar um orçamento.

Foque em:
- Consumo mensal em kWh (pode vir como "minha conta é de X kWh" ou deduzido do valor da conta)
- Localização do cliente (cidade e estado)
- Distribuidora de energia (ex: CPFL, Cemig, Enel, Energisa etc.)
- Valor atual da conta de energia em R$
- Potência do sistema em kWp se mencionada
- Observações técnicas relevantes (telhado, sombreamento, número de fases)

Se o cliente enviou foto da conta de energia, provavelmente está no campo marcado como [Foto da conta de energia].
Extraia APENAS o que está explícito ou fortemente implícito na conversa.`,
      prompt: `Analise esta conversa e extraia os dados solares relevantes:

${conversationText}${productsContext}

Extraia as informações técnicas para dimensionamento do sistema solar.`,
    });

    return json({
      extracted: result.output,
      products: products || [],
    });
  } catch (err: unknown) {
    if (err instanceof AITaskHttpError) return err.toResponse();
    if (err instanceof z.ZodError) {
      return json({ error: { code: 'INVALID_INPUT', message: 'Payload inválido.' } }, 400);
    }
    console.error('[api/ai/tasks/quote/solar-extract] Error:', err);
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Erro ao extrair dados da conversa.' } }, 500);
  }
}
