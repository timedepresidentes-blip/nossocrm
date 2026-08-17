import { generateObject } from 'ai';
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
    nome: z.string().describe('Nome exato do item como aparece na lista fornecida'),
    quantidade: z.number().describe('Quantidade numérica utilizada'),
  })).describe('Lista de materiais identificados no relatório'),
});

export async function POST(req: Request) {
  try {
    const { model } = await requireAITaskContext(req);

    const body = await req.json().catch(() => null);
    if (!body?.texto || !body?.itens?.length) {
      return json({ error: 'texto e itens são obrigatórios' }, 400);
    }

    const { texto, itens } = body as { texto: string; itens: { id: string; name: string; unit: string }[] };

    const listaItens = itens.map((i: { name: string; unit: string }) => `- ${i.name} (${i.unit})`).join('\n');

    const prompt = `Você é um assistente especializado em extração de dados de relatórios de instalação de energia solar.

O instalador preencheu o seguinte relatório de materiais utilizados:
---
${texto}
---

Os itens disponíveis no estoque são:
${listaItens}

Extraia as quantidades de cada material mencionado no relatório.
- Use EXATAMENTE os nomes da lista de itens acima (copie o nome sem modificar).
- Se um item não for mencionado no relatório, não o inclua.
- Interprete abreviações comuns: "CA 10" = "Cabo CA 10mm", "terra 6" = "Cabo Terra 6mm", "DJ 40" = "Disjuntor 40A", etc.
- Quantidades de cabos podem estar em metros (m) — preserve o número informado.
- Ignore itens com quantidade zero.`;

    const { object } = await generateObject({
      model,
      schema: ExtraidosSchema,
      prompt,
    });

    // Mapeia nomes extraídos para os IDs do estoque por correspondência aproximada
    const resultado = object.itens.map((extraido: { nome: string; quantidade: number }) => {
      const match = itens.find((i: { name: string }) =>
        i.name.toLowerCase().includes(extraido.nome.toLowerCase()) ||
        extraido.nome.toLowerCase().includes(i.name.toLowerCase())
      );
      return match ? { itemId: match.id, qty: extraido.quantidade } : null;
    }).filter(Boolean);

    return json({ extraidos: resultado });
  } catch (e) {
    if (e instanceof AITaskHttpError) {
      return json({ error: e.message }, e.status);
    }
    console.error('Erro extração estoque:', e);
    return json({ error: 'Erro interno ao processar extração' }, 500);
  }
}
