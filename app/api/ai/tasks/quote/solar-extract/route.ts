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
  kwhMonth: z.number().nullable().describe('Consumo médio mensal ATUAL em kWh. null se não encontrado.'),
  consumoFuturoKwh: z.number().nullable().describe('Consumo mensal ADICIONAL esperado no futuro. Use: carro elétrico ≈ 350 kWh/mês, piscina ≈ 150 kWh/mês, ar-condicionado central ≈ 150 kWh/mês. null se nenhuma carga futura mencionada.'),
  clientStreet: z.string().nullable().describe('Rua/logradouro do endereço do CONSUMIDOR/TITULAR da conta (ex: "Rua das Flores, 123"). Leia o bloco "Dados do Consumidor", "Local de Fornecimento" ou "Endereço de Instalação". IGNORE o endereço da distribuidora no cabeçalho. null se não encontrado.'),
  clientNeighborhood: z.string().nullable().describe('Bairro do endereço do CONSUMIDOR/TITULAR. null se não encontrado.'),
  clientCep: z.string().nullable().describe('CEP do endereço do CONSUMIDOR/TITULAR (formato 00000-000). null se não encontrado.'),
  city: z.string().nullable().describe('Cidade do CONSUMIDOR/TITULAR — extraída do mesmo bloco de endereço que clientStreet. IGNORE a cidade da distribuidora. null se não encontrada.'),
  state: z.string().nullable().describe('Estado (UF, 2 letras) do CONSUMIDOR/TITULAR — mesmo bloco que city. null se não encontrado.'),
  distributor: z.string().nullable().describe('Nome da empresa distribuidora de energia que emitiu a conta (ex: CPFL, Cemig, Enel, Energisa, ELEKTRO, Neoenergia, Equatorial, Copel, LIGHT). null se não mencionada.'),
  currentBillValue: z.number().nullable().describe('Valor atual da conta de energia em R$. null se não mencionado.'),
  systemPowerKwp: z.number().nullable().describe('Potência mencionada EXPLICITAMENTE pelo cliente ou no documento em kWp. null se não foi dito de forma explícita.'),
  kwpRecomendado: z.number().nullable().describe('Potência DO SISTEMA RECOMENDADA calculada pela IA. Fórmula: ((kwhAtual + consumoFuturo) × 12) / (365 × 4.8), arredondado para cima ao próximo 0.5 kWp. null somente se não há NENHUMA informação de consumo.'),
  raciocinioDimensionamento: z.string().nullable().describe('Raciocínio claro do dimensionamento: "Consumo atual: X kWh/mês + Y kWh/mês (carro elétrico) = Z kWh/mês total → sistema de N kWp recomendado."'),
  observations: z.string().nullable().describe('Observações técnicas relevantes (telhado, sombreamento, fases, informações da conta lida). null se nada relevante.'),
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

const SYSTEM_PROMPT = `Você é especialista em energia solar fotovoltaica e dimensionamento de sistemas. Sua tarefa vai além de extrair dados: você deve RACIOCINAR e CALCULAR o sistema ideal para o cliente.

## EXTRAÇÃO DE DADOS — CONTA DE ENERGIA
Se receber conta de energia (PDF ou imagem), leia o documento INTEIRO com atenção máxima a cada campo.

### Consumo e valor
- Consumo (kWh): busque "Consumo (kWh)", "Média kWh", "Histórico de Consumo" — use a média dos últimos 12 meses se disponível
- Valor: "Valor a Pagar", "Total a Pagar", "Total" — valor final em R$

### Distribuidora
- Nome da empresa emissora da conta: CPFL, Cemig, Enel, Energisa, CPFL Paulista, ELEKTRO, Neoenergia, Equatorial, Copel, RGE, CPFL Piratininga, LIGHT, Coelba, Celpe, Cosern, EDP, AES, Celg, CEMAR, CEAL, CERON, Amazonas Energia etc.

### ENDEREÇO DO CLIENTE — ATENÇÃO CRÍTICA
A conta tem DOIS endereços distintos: o endereço da DISTRIBUIDORA (cabeçalho, rodapé, sede) e o endereço do CONSUMIDOR/TITULAR (onde a energia é consumida).
Você deve extrair APENAS o endereço do CONSUMIDOR, que normalmente aparece:
- Na seção "Dados do Consumidor", "Dados do Cliente", "Titular" ou similar
- Próximo ao nome do titular, CPF/CNPJ e número da Unidade Consumidora (UC / Instalação)
- No campo "Local de Fornecimento", "Endereço de Instalação", "Endereço de Entrega" ou "Endereço"
- Exemplos de rótulos: "Rua X, nº Y, Bairro Z, Cidade – UF"

IGNORE completamente o endereço da distribuidora (sede, agência, escritório) que aparece no cabeçalho ou rodapé.
Extraia cidade e estado (UF de 2 letras) do endereço do consumidor.

## CONSUMO FUTURO — CRÍTICO
Analise toda a conversa em busca de menções a novas cargas elétricas. Se o cliente mencionar:
- **Carro elétrico / EV**: adicione 350 kWh/mês (recarga doméstica típica) ao consumoFuturoKwh
- **Piscina com bomba**: adicione 150 kWh/mês
- **Ar-condicionado central ou vários splits novos**: adicione 150 kWh/mês
- **Chuveiro elétrico adicional**: adicione 80 kWh/mês
- Qualquer outra carga relevante: estime com bom senso

## DIMENSIONAMENTO — SEMPRE CALCULE
Nunca deixe kwpRecomendado como null se há alguma informação de consumo.

Fórmula:
1. Consumo total = kwhMêsAtual + consumoFuturoKwh
2. kWp bruto = (consumoTotal × 12) / (365 × 4.8)
   - 4.8 = irradiação média diária Brasil (kWh/kWp/dia)
3. Arredonde para CIMA ao múltiplo de 0.5 mais próximo

Exemplo: cliente com 400 kWh/mês + carro elétrico (350 kWh/mês) = 750 kWh/mês total
→ (750 × 12) / (365 × 4.8) = 9000 / 1752 = 5.14 → arredonda para 5.5 kWp

Em raciocinioDimensionamento, mostre os cálculos de forma clara.

Se o cliente já mencionou uma potência explicitamente, registre em systemPowerKwp (mas ainda calcule kwpRecomendado independentemente).

Prioridade da conta de energia sobre o texto da conversa para dados de consumo.`;


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

    // Formata texto da conversa e detecta mídia armazenada (conta de luz)
    let conversationText = '';
    let conversationMediaBase64: string | null = null;
    let conversationMediaMime = 'image/jpeg';

    if (conversationId) {
      const { data: messages } = await supabase
        .from('messaging_messages')
        .select('id, direction, content, content_type, created_at')
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

        // Encontra a conta de luz mais recente enviada pelo cliente (imagem ou PDF)
        if (!billImageBase64) {
          const mediaMsg = [...messages]
            .reverse()
            .find(m =>
              m.direction === 'inbound' &&
              (m.content_type === 'image' || m.content_type === 'document')
            );

          if (mediaMsg) {
            const c = mediaMsg.content as Record<string, unknown>;
            const storedUrl = c?.mediaUrl as string | undefined;
            const storedMime = (c?.mimeType as string) ||
              (mediaMsg.content_type === 'document' ? 'application/pdf' : 'image/jpeg');

            if (storedUrl) {
              if (storedUrl.startsWith('data:')) {
                // Evolution: data URI já em base64
                const commaIdx = storedUrl.indexOf(',');
                if (commaIdx !== -1) {
                  const header = storedUrl.substring(5, commaIdx);
                  const mimePart = header.split(';')[0];
                  conversationMediaBase64 = storedUrl.substring(commaIdx + 1);
                  conversationMediaMime = mimePart || storedMime;
                }
              } else if (storedUrl.startsWith('meta:')) {
                // Meta/WhatsApp Business API: ID de mídia — baixar via Graph API
                const mediaId = storedUrl.slice(5);
                try {
                  const { data: conv } = await supabase
                    .from('messaging_conversations')
                    .select('channel_id')
                    .eq('id', conversationId)
                    .maybeSingle();
                  if (conv?.channel_id) {
                    const { data: ch } = await supabase
                      .from('messaging_channels')
                      .select('credentials')
                      .eq('id', conv.channel_id)
                      .maybeSingle();
                    const token = ((ch?.credentials as Record<string, unknown> | null)?.accessToken
                      ?? (ch?.credentials as Record<string, unknown> | null)?.access_token) as string | undefined;
                    if (token) {
                      const infoRes = await fetch(`https://graph.facebook.com/v25.0/${mediaId}`, {
                        headers: { Authorization: `Bearer ${token}` },
                        signal: AbortSignal.timeout(10000),
                      });
                      if (infoRes.ok) {
                        const info = await infoRes.json() as { url?: string };
                        if (info.url) {
                          const mediaRes = await fetch(info.url, {
                            headers: { Authorization: `Bearer ${token}` },
                            signal: AbortSignal.timeout(20000),
                          });
                          if (mediaRes.ok) {
                            const buf = await mediaRes.arrayBuffer();
                            conversationMediaBase64 = Buffer.from(new Uint8Array(buf)).toString('base64');
                            conversationMediaMime = storedMime;
                          }
                        }
                      }
                    }
                  }
                } catch { /* falha no download Meta — continua sem mídia */ }
              } else {
                // Z-API / outro: tenta baixar via fetch
                try {
                  const res = await fetch(storedUrl, { signal: AbortSignal.timeout(10000) });
                  if (res.ok) {
                    const buf = await res.arrayBuffer();
                    conversationMediaBase64 = Buffer.from(new Uint8Array(buf)).toString('base64');
                    conversationMediaMime = storedMime;
                  }
                } catch { /* URL expirada ou sem acesso — continua sem imagem */ }
              }
            }
          }
        }
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

    // Determina qual base64 usar (upload manual tem prioridade sobre conversa)
    const effectiveBillBase64 = billImageBase64 || conversationMediaBase64;
    const effectiveBillMime = billImageBase64 ? (billImageMimeType || 'image/jpeg') : conversationMediaMime;

    let result;

    if (effectiveBillBase64) {
      const mime = effectiveBillMime.toLowerCase();
      const isPdf = mime.includes('pdf');
      const billContentPart = isPdf
        ? { type: 'file' as const, data: effectiveBillBase64, mediaType: 'application/pdf' as const }
        : { type: 'image' as const, image: `data:${mime};base64,${effectiveBillBase64}` };

      const conversaText = conversationText
        ? `Além da conta de energia, o contexto da conversa com o cliente:\n\n${conversationText}${productsContext}`
        : `Analise esta conta de energia e extraia os dados para dimensionamento solar.${productsContext}`;

      result = await generateText({
        model,
        maxRetries: 2,
        output: Output.object({ schema: SolarExtractSchema }),
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            billContentPart,
            { type: 'text' as const, text: conversaText },
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
