import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createStaticAdminClient } from '@/lib/supabase/server'

const ofClient = createClient(
  process.env.NEXT_PUBLIC_ORCAFACIL_URL!,
  process.env.NEXT_PUBLIC_ORCAFACIL_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const dealId    = req.nextUrl.searchParams.get('dealId')
  const contactId = req.nextUrl.searchParams.get('contactId')

  if (!dealId && !contactId) {
    return NextResponse.json({ error: 'dealId ou contactId obrigatório' }, { status: 400 })
  }

  const sb = createStaticAdminClient()

  // Resolve telefone do contato
  let phone: string | null = null

  if (contactId) {
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
    return NextResponse.json({ orcamentos: [] })
  }

  const { data, error } = await ofClient.rpc('get_orcamentos_by_phone', {
    p_telefone: phone,
    p_nome: null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ orcamentos: (data as any[]) ?? [] })
}
