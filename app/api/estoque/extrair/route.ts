import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { requireAITaskContext, AITaskHttpError } from '@/lib/ai/tasks/server';

export const maxDuration = 60;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

const ExtraidosSchema = z.object({
  itens: z.array(z.object({
    nome: z.string().describe('Nome exato do item conforme lista fornecida'),
    quantidade: z.number().describe('Quantidade numérica utilizada'),
  })),
});

export async function POST(req: Request) {
  try {
    const { model } = await requireAITaskContext(req);

    const formData = await req.formData().catch(() => null);
    if (!formData) return json({ error: 'Envie multipart/form-data' }, 400);

    const arquivo = formData.get('arquivo') as File | null;
    const itensRaw = formData.get('itens') as string | null;

    if (!arquivo || arquivo.size === 0) return json({ error: 'Arquivo não encontrado' }, 400);
    if (!itensRaw) return json({ error: 'Lista de itens não fornecida' }, 400);

    const itens: { id: string; name: string; unit: string }[] = JSON.parse(itensRaw);
    const listaItens = itens.map(i => `- ${i.name} (${i.unit})`).join('\n');

    // Detecta tipo do arquivo
    const mime = arquivo.type || (arquivo.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    const isImage = mime.startsWith('image/');
    const isPdf = mime === 'application/pdf';

    if (!isImage && !isPdf) {
      return json({ error: 'Envie uma imagem (JPG, PNG) ou PDF' }, 400);
    }

    const buffer = await arquivo.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    const instrucao = `Você é um assistente que lê formulários de instalação de energia solar.

Analise este documento/imagem e extraia SOMENTE os materiais que aparecem com quantidade preenchida.

Os itens disponíveis no catálogo são:
${listaItens}

Regras:
- Use EXATAMENTE os nomes da lista acima ao retornar (copie o nome).
- Interprete abreviações: "CA 10" = "Cabo CA 10mm", "terra 6" = "Cabo Terra 6mm", "DJ 32" = "Disjuntor 32A", etc.
- Quantidades de cabos geralmente estão em metros.
- Ignore campos em branco ou zerados.
- Retorne apenas itens com quantidade > 0.`;

    // Passo 1: extrai texto do documento via visão
    const { text: textoExtraido } = await generateText({
      model,
      maxRetries: 1,
      messages: [{
        role: 'user',
        content: [
          isImage
            ? { type: 'image', image: base64, mimeType: mime as 'image/jpeg' | 'image/png' | 'image/webp' }
            : { type: 'file', data: base64, mediaType: 'application/pdf' as const },
          { type: 'text', text: 'Transcreva todos os campos e valores preenchidos neste formulário.' },
        ],
      }],
    });

    if (!textoExtraido?.trim()) {
      return json({ error: 'Não foi possível ler o documento. Verifique se a imagem está nítida.' }, 422);
    }

    // Passo 2: estrutura os dados extraídos
    const { object } = await generateObject({
      model,
      schema: ExtraidosSchema,
      system: instrucao,
      prompt: textoExtraido,
    });

    // Mapeia nomes para IDs do estoque
    const resultado = object.itens.map(extraido => {
      const match = itens.find(i =>
        i.name.toLowerCase().includes(extraido.nome.toLowerCase()) ||
        extraido.nome.toLowerCase().includes(i.name.toLowerCase())
      );
      return match ? { itemId: match.id, qty: extraido.quantidade } : null;
    }).filter(Boolean);

    return json({ extraidos: resultado, textoLido: textoExtraido });
  } catch (e) {
    if (e instanceof AITaskHttpError) return json({ error: e.message }, e.status);
    console.error('Erro extração estoque:', e);
    return json({ error: 'Erro interno ao processar o documento' }, 500);
  }
}
