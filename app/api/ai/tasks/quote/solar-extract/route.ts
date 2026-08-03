import { generateText, generateObject, Output } from 'ai';
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

const SupplierQuoteSchema = z.object({
  kitTotalPrice: z.number().nullable().describe('Valor total do kit/orçamento em R$. null se não encontrado.'),
  systemPowerKwp: z.number().nullable().describe('Potência total do sistema em kWp. null se não encontrado.'),
  panelBrand: z.string().nullable().describe('Marca do painel solar. null se não mencionada.'),
  panelModel: z.string().nullable().describe('Modelo do painel solar. null se não mencionado.'),
  panelWatts: z.number().nullable().describe('Potência unitária do painel em Watts. null se não mencionada.'),
  panelQty: z.number().nullable().describe('Quantidade de painéis. null se não mencionada.'),
  inverterType: z.enum(['micro', 'string']).nullable().describe(
    'Tipo de inversor: "micro" se for microinversor (palavras-chave: microinversor, micro inversor, micro-inversor, marcas como Hoymiles, APsystems, Enphase, Deye Micro, IQ, HMS, HM, TSOL) — nesses casos há geralmente 1 microinversor por painel. "string" se for inversor string convencional (Growatt, WEG, Fronius, SMA, SAJ, Sofar, Solis, Deye, GoodWe sem indicação "micro"). null se não for possível determinar.'),
  inverterBrand: z.string().nullable().describe('Marca do inversor. null se não mencionada.'),
  inverterModel: z.string().nullable().describe('Modelo do inversor. null se não mencionado.'),
  inverterQty: z.number().nullable().describe('Quantidade de inversores ou microinversores. Para microinversores costuma ser igual à quantidade de painéis (1 por painel). Para inversor string geralmente é 1. null se não mencionado.'),
  inverterPower: z.string().nullable().describe('Potência unitária do inversor em kW ou kVA (ex: "5", "5kW", "300W" para micro). null se não mencionada.'),
  structureType: z.string().nullable().describe('Tipo de estrutura de fixação (ex: "Cerâmica", "Metálica", "Fibrocimento", "Solo"). null se não mencionada.'),
  freightCost: z.number().nullable().describe('Custo de frete em R$. null se não mencionado ou incluído no total.'),
  warranty: z.string().nullable().describe('Informações de garantia (ex: "25 anos painel, 10 anos inversor"). null se não mencionada.'),
  observations: z.string().nullable().describe('Outras informações relevantes do orçamento (ex: forma de pagamento, prazo de entrega, condições especiais). null se nada relevante.'),
});

export type SolarExtractResult = z.infer<typeof SolarExtractSchema>;
export type SupplierQuoteResult = z.infer<typeof SupplierQuoteSchema>;

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

const SUPPLIER_SYSTEM_PROMPT = `Você é especialista em energia solar e análise de orçamentos de fornecedores de kits solares. Analise o documento/imagem fornecido (orçamento de fornecedor de equipamentos solares) e extraia TODAS as informações relevantes com máxima precisão.

Extraia:
- Valor total do kit/orçamento (procure por "Total", "Valor Total", "Subtotal", "Total Geral" em R$)
- Potência total do sistema em kWp
- Painel solar: marca, modelo, potência unitária em Watts, quantidade
- TIPO DE INVERSOR (CRÍTICO): identifique se é microinversor ou inversor string:
  * MICROINVERSOR: palavras "microinversor", "micro inversor", "micro-inversor", marcas Hoymiles (HM-xxx, HMS-xxx), APsystems, Enphase (IQ), Deye com "Micro" no modelo, TSOL, Apsmart. Nestes casos geralmente há 1 microinversor por painel.
  * INVERSOR STRING: Growatt, WEG, Fronius, SMA, SAJ, Sofar, Solis, GoodWe, Huawei, Deye (sem "Micro"), ABB, Schneider — geralmente 1 unidade por sistema.
- Quantidade de inversores ou microinversores (para micro: igual à qtd de painéis normalmente)
- Modelo e potência unitária do inversor/microinversor
- Tipo de estrutura de fixação (cerâmica, metálica, fibrocimento, solo)
- Frete (se discriminado separadamente)
- Garantias dos equipamentos
- Outras informações relevantes

Seja preciso com os valores monetários — use o valor final total do orçamento.
Extraia APENAS o que está explícito no documento. Não invente dados.`;

async function extractSupplierData(
  model: Parameters<typeof generateObject>[0]['model'],
  supplierQuoteBase64: string,
  supplierQuoteMimeType: string,
): Promise<z.infer<typeof SupplierQuoteSchema>> {
  const mimeType = (supplierQuoteMimeType || 'application/pdf') as string;
  const isImage = mimeType.startsWith('image/');

  const contentPart = isImage
    ? { type: 'image' as const, image: `data:${mimeType};base64,${supplierQuoteBase64}` }
    : { type: 'file' as const, data: supplierQuoteBase64, mediaType: 'application/pdf' as const };

  const { object } = await generateObject({
    model,
    schema: SupplierQuoteSchema,
    system: SUPPLIER_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        contentPart,
        { type: 'text', text: 'Analise o orçamento de fornecedor acima e extraia todos os dados solicitados no sistema.' },
      ],
    }],
  });

  return object;
}

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
    const {
      conversationId,
      billImageBase64,
      billImageMimeType,
      supplierQuoteBase64,
      supplierQuoteMimeType,
    } = body || {};

    // Se enviou apenas o PDF do fornecedor — extração independente
    if (supplierQuoteBase64 && !conversationId && !billImageBase64) {
      try {
        const supplierData = await extractSupplierData(model, supplierQuoteBase64, supplierQuoteMimeType || 'application/pdf');
        return json({ supplierData });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao extrair PDF do fornecedor.';
        return json({ error: { code: 'SUPPLIER_EXTRACT_ERROR', message: msg } }, 500);
      }
    }

    // Modo conversa + conta de energia
    if (!conversationId && !billImageBase64) {
      return json({ error: { code: 'MISSING_PARAM', message: 'Forneça conversationId ou a imagem da conta de energia.' } }, 400);
    }

    // Formata texto da conversa
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

    // Busca produtos ativos
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

    const textPrompt = [
      conversationText ? `CONVERSA COM O CLIENTE:\n${conversationText}` : '',
      productsContext,
      '\nExtraia os dados técnicos para dimensionamento solar.',
    ].filter(Boolean).join('\n\n');

    let result;

    if (billImageBase64) {
      const mimeType = (billImageMimeType || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
      result = await generateText({
        model,
        maxRetries: 2,
        output: Output.object({ schema: SolarExtractSchema }),
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', image: `data:${mimeType};base64,${billImageBase64}` },
            ...(conversationText ? [{
              type: 'text' as const,
              text: `Além da imagem da conta de energia acima, veja também o contexto da conversa:\n\n${conversationText}${productsContext}`,
            }] : [{
              type: 'text' as const,
              text: `Analise a conta de energia acima e extraia os dados solares.${productsContext}`,
            }]),
          ],
        }],
      });
    } else {
      result = await generateText({
        model,
        maxRetries: 2,
        output: Output.object({ schema: SolarExtractSchema }),
        system: SYSTEM_PROMPT,
        prompt: textPrompt,
      });
    }

    // Se também enviou PDF do fornecedor junto com a análise da conversa
    let supplierData: SupplierQuoteResult | null = null;
    let supplierExtractError: string | null = null;
    if (supplierQuoteBase64) {
      try {
        supplierData = await extractSupplierData(model, supplierQuoteBase64, supplierQuoteMimeType || 'application/pdf');
      } catch (err) {
        supplierExtractError = err instanceof Error ? err.message : 'Erro ao extrair PDF.';
        console.error('[solar-extract] supplier extraction failed:', supplierExtractError);
      }
    }

    return json({
      extracted: result.output,
      supplierData,
      supplierExtractError,
      products: products || [],
    });
  } catch (err: unknown) {
    if (err instanceof AITaskHttpError) return err.toResponse();
    if (err instanceof z.ZodError) {
      return json({ error: { code: 'INVALID_INPUT', message: 'Payload inválido.' } }, 400);
    }

    const e = err as Record<string, unknown>;
    const status = (e.statusCode ?? e.status) as number | undefined;
    const rawMessage = typeof e.message === 'string' ? e.message : '';
    const responseBody = typeof e.responseBody === 'string' ? e.responseBody : '';

    console.error('[api/ai/tasks/quote/solar-extract] Error:', {
      name: (err as Error)?.name, status, message: rawMessage, responseBody,
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
