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

  const { data, error } = await ofClient.rpc('get_orcamento_by_id', {
    p_id: id,
    p_telefone: phone,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Função retorna JSON scalar (pode vir como objeto direto ou null)
  const orcamento = Array.isArray(data) ? (data[0] ?? null) : (data ?? null)
  if (!orcamento) return NextResponse.json({ error: 'Orçamento não encontrado' }, { status: 404 })

  return NextResponse.json({ orcamento })
}
