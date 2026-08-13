import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createStaticAdminClient } from '@/lib/supabase/server'

const ofClient = createClient(
  process.env.NEXT_PUBLIC_ORCAFACIL_URL!,
  process.env.NEXT_PUBLIC_ORCAFACIL_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const id        = req.nextUrl.searchParams.get('id')
  const contactId = req.nextUrl.searchParams.get('contactId')
  const dealId    = req.nextUrl.searchParams.get('dealId')

  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  // Resolve o telefone do contato para validação segura no RPC
  const sb = createStaticAdminClient()
  let phone: string | null = req.nextUrl.searchParams.get('phone')

  if (!phone && contactId) {
    const { data: contact } = await sb
      .from('contacts')
      .select('phone')
      .eq('id', contactId)
      .maybeSingle()
    phone = (contact as any)?.phone ?? null
  }

  if (!phone && dealId) {
    const { data: deal } = await sb
      .from('deals')
      .select('contact_id')
      .eq('id', dealId)
      .maybeSingle()
    const cid = (deal as any)?.contact_id
    if (cid) {
      const { data: contact } = await sb
        .from('contacts')
        .select('phone')
        .eq('id', cid)
        .maybeSingle()
      phone = (contact as any)?.phone ?? null
    }
  }

  if (!phone) {
    return NextResponse.json({ error: 'Telefone do contato não encontrado' }, { status: 400 })
  }

  // Tenta primeiro a função nova (retorna JSON com distribuidora_nome via JOIN)
  // Se não existir ainda (404), cai na função antiga (setof orcamentos)
  let orcamento: Record<string, unknown> | null = null

  const { data: dataJson, error: errJson } = await ofClient.rpc('get_orcamento_by_id_json', {
    p_id: id,
    p_telefone: phone,
  })

  if (!errJson) {
    orcamento = (dataJson as Record<string, unknown>) ?? null
  } else if (errJson.code === 'PGRST202' || errJson.message?.includes('does not exist')) {
    // Função nova ainda não existe — usa a antiga como fallback
    const { data: dataOld, error: errOld } = await ofClient.rpc('get_orcamento_by_id', {
      p_id: id,
      p_telefone: phone,
    })
    if (errOld) return NextResponse.json({ error: errOld.message }, { status: 500 })
    orcamento = Array.isArray(dataOld) ? (dataOld[0] ?? null) : (dataOld ?? null)
  } else {
    return NextResponse.json({ error: errJson.message }, { status: 500 })
  }

  if (!orcamento) return NextResponse.json({ error: 'Orçamento não encontrado' }, { status: 404 })

  return NextResponse.json({ orcamento: orcamento as Record<string, unknown> })
}
