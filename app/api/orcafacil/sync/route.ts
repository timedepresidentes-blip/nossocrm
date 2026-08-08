import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ofClient = createClient(
  process.env.NEXT_PUBLIC_ORCAFACIL_URL!,
  process.env.NEXT_PUBLIC_ORCAFACIL_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { dealId, clienteNome, clienteCidade, clienteEnd, telefone,
            potenciaKwp, painelW, numPaineis, modeloPainel,
            modeloInversor, qtdInversores, tipoEstrutura,
            valorFinal, formaPagamento } = body

    if (!dealId || !clienteNome) {
      return NextResponse.json({ error: 'dealId e clienteNome são obrigatórios' }, { status: 400 })
    }

    const { data, error } = await ofClient.rpc('upsert_orcamento_from_crm', {
      p_crm_deal_id:   dealId,
      p_cliente_nome:  clienteNome,
      p_cliente_cidade: clienteCidade ?? null,
      p_cliente_end:   clienteEnd ?? null,
      p_telefone:      telefone ?? null,
      p_potencia_kwp:  potenciaKwp ?? null,
      p_painel_w:      painelW ?? null,
      p_num_paineis:   numPaineis ?? null,
      p_modelo_painel: modeloPainel ?? null,
      p_modelo_inv:    modeloInversor ?? null,
      p_qtd_inv:       qtdInversores ?? null,
      p_tipo_estrutura: tipoEstrutura ?? null,
      p_valor_final:   valorFinal ?? null,
      p_forma_pag:     formaPagamento ?? null,
    })

    if (error) throw error

    return NextResponse.json({ orcafacilId: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erro ao sincronizar' }, { status: 500 })
  }
}
