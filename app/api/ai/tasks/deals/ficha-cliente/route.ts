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

const FichaClienteSchema = z.object({
  // Dados pessoais
  nomeCompleto:    z.string().nullable().describe('Nome completo do cliente.'),
  cpfCnpj:        z.string().nullable().describe('CPF ou CNPJ do cliente. Formato: 000.000.000-00 ou 00.000.000/0000-00.'),
  rg:             z.string().nullable().describe('RG do cliente se mencionado.'),
  telefone:       z.string().nullable().describe('Telefone principal do cliente.'),
  email:          z.string().nullable().describe('E-mail do cliente.'),
  estadoCivil:    z.string().nullable().describe('Estado civil se mencionado.'),
  // Endereço do cliente
  enderecoRua:    z.string().nullable().describe('Rua e número do endereço do cliente.'),
  enderecoBairro: z.string().nullable().describe('Bairro do endereço do cliente.'),
  enderecoCidade: z.string().nullable().describe('Cidade do cliente.'),
  enderecoEstado: z.string().nullable().describe('Estado (UF) do cliente.'),
  enderecoCep:    z.string().nullable().describe('CEP do cliente.'),
  // Local de instalação (pode diferir do endereço)
  instalacaoEndereco:   z.string().nullable().describe('Endereço completo do local de instalação, se diferente do endereço do cliente.'),
  instalacaoCidade:     z.string().nullable().describe('Cidade do local de instalação.'),
  instalacaoTipoImovel: z.string().nullable().describe('Tipo de imóvel: Residencial, Comercial, Rural, Industrial.'),
  instalacaoTelhado:    z.string().nullable().describe('Tipo de telhado: Cerâmica, Metálica, Fibrocimento, Laje, Solo.'),
  instalacaoFases:      z.string().nullable().describe('Fases elétricas: Monofásico, Bifásico, Trifásico.'),
  instalacaoDisjuntor:  z.string().nullable().describe('Amperagem do disjuntor principal se mencionado.'),
  // Dados do sistema solar acordado
  potenciaKwp:    z.number().nullable().describe('Potência total do sistema em kWp.'),
  numPaineis:     z.number().nullable().describe('Quantidade de painéis solares.'),
  modeloPainel:   z.string().nullable().describe('Marca e modelo do painel solar.'),
  potenciaPainelW: z.number().nullable().describe('Potência unitária do painel em Watts.'),
  modeloInversor: z.string().nullable().describe('Marca e modelo do inversor.'),
  tipoInversor:   z.string().nullable().describe('Tipo: Microinversor ou Inversor String.'),
  qtdInversores:  z.number().nullable().describe('Quantidade de inversores.'),
  tipoEstrutura:  z.string().nullable().describe('Tipo de estrutura de fixação.'),
  // Dados financeiros e condições comerciais
  valorTotal:          z.number().nullable().describe('Valor total da venda acordado em R$.'),
  formaPagamento:      z.string().nullable().describe('Forma de pagamento combinada (ex: Financiado, À vista, Parcelado).'),
  condicoesPagamento:  z.string().nullable().describe('Detalhes das condições: prazo, parcelas, entrada etc.'),
  prazoEntrega:        z.string().nullable().describe('Prazo de entrega ou instalação combinado.'),
  // Dados de consumo/distribuidora
  consumoMensalKwh:    z.number().nullable().describe('Consumo médio mensal em kWh.'),
  valorContaAtual:     z.number().nullable().describe('Valor atual da conta de energia em R$.'),
  distribuidora:       z.string().nullable().describe('Nome da distribuidora de energia.'),
  // Observações gerais
  observacoes:         z.string().nullable().describe('Qualquer outra informação relevante mencionada na conversa.'),
});

export type FichaClienteData = z.infer<typeof FichaClienteSchema>;

const SYSTEM_PROMPT = `Você é especialista em extrair dados cadastrais e comerciais de conversas de vendas de energia solar.

Analise a conversa completa e extraia TODAS as informações mencionadas para montar a ficha do cliente.

Extraia:
- Dados pessoais: nome completo, CPF/CNPJ, RG, telefone, e-mail, estado civil
- Endereço completo do cliente (rua, bairro, cidade, estado, CEP)
- Local de instalação (se diferente do endereço do cliente)
- Tipo de imóvel e características elétricas (fases, disjuntor, telhado)
- Sistema solar acordado: potência kWp, painéis, inversor, estrutura
- Condições comerciais: valor total, forma de pagamento, prazo de entrega
- Consumo atual, distribuidora, valor da conta
- Quaisquer observações relevantes mencionadas

REGRAS:
- Extraia SOMENTE o que está explícito na conversa
- Não invente nem suponha dados
- Se um dado não foi mencionado, retorne null
- Seja preciso com valores monetários e quantidades`;

function extractTextContent(content: Record<string, unknown>): string {
  if (typeof content?.text === 'string') return content.text;
  if (typeof content?.body === 'string') return content.body;
  if (typeof content?.caption === 'string') return `[Imagem] ${content.caption}`;
  const type = content?.type as string | undefined;
  if (type === 'image') return '[Foto enviada]';
  if (type === 'audio') return '[Áudio enviado]';
  if (type === 'document') return '[Documento enviado]';
  return '[Mensagem sem texto]';
}

export async function POST(req: Request) {
  try {
    const { model, supabase } = await requireAITaskContext(req);
    const body = await req.json().catch(() => null);
    const { conversationId, dealId } = body || {};

    if (!conversationId && !dealId) {
      return json({ error: { code: 'MISSING_PARAM', message: 'Forneça conversationId ou dealId.' } }, 400);
    }

    // Busca mensagens da conversa
    let conversationText = '';
    let targetConversationId = conversationId;

    // Se veio dealId mas não conversationId, busca a conversa vinculada ao deal
    if (!targetConversationId && dealId) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('id')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      targetConversationId = conv?.id ?? null;
    }

    if (targetConversationId) {
      const { data: messages } = await supabase
        .from('messaging_messages')
        .select('direction, content, created_at')
        .eq('conversation_id', targetConversationId)
        .order('created_at', { ascending: true })
        .limit(100);

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

    // Busca dados já extraídos do deal (ai_extracted, ficha_cliente existente)
    let dealContext = '';
    if (dealId) {
      const { data: deal } = await supabase
        .from('deals')
        .select('title, value, ai_extracted, ficha_cliente')
        .eq('id', dealId)
        .maybeSingle();

      if (deal) {
        dealContext = `\n\nDADOS JÁ EXTRAÍDOS DO DEAL:\n- Título: ${deal.title}\n- Valor: R$ ${deal.value ?? 'não informado'}`;
        if (deal.ai_extracted) {
          dealContext += `\n- Dados técnicos: ${JSON.stringify(deal.ai_extracted)}`;
        }
        if (deal.ficha_cliente) {
          dealContext += `\n- Ficha anterior: ${JSON.stringify(deal.ficha_cliente)}`;
        }
      }
    }

    if (!conversationText && !dealContext) {
      return json({ error: { code: 'NO_DATA', message: 'Nenhuma conversa ou dado encontrado para extrair.' } }, 400);
    }

    const prompt = [
      conversationText ? `CONVERSA:\n${conversationText}` : '',
      dealContext,
    ].filter(Boolean).join('\n\n');

    const result = await generateText({
      model,
      maxRetries: 2,
      output: Output.object({ schema: FichaClienteSchema }),
      system: SYSTEM_PROMPT,
      prompt,
    });

    // Salva no deal se dealId fornecido
    if (dealId && result.output) {
      await supabase
        .from('deals')
        .update({ ficha_cliente: result.output, updated_at: new Date().toISOString() })
        .eq('id', dealId);
    }

    return json({ ficha: result.output });
  } catch (err: unknown) {
    if (err instanceof AITaskHttpError) return err.toResponse();
    const e = err as Record<string, unknown>;
    console.error('[api/ai/tasks/deals/ficha-cliente] Error:', e);
    return json({ error: { code: 'INTERNAL_ERROR', message: (e.message as string) || 'Erro ao extrair ficha.' } }, 500);
  }
}
