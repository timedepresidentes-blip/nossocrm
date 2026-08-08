import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ofClient = createClient(
  process.env.NEXT_PUBLIC_ORCAFACIL_URL!,
  process.env.NEXT_PUBLIC_ORCAFACIL_ANON_KEY!
)

export async function GET() {
  try {
    const { data, error } = await ofClient.rpc('list_orcamentos_for_crm')
    if (error) throw error
    return NextResponse.json({ orcamentos: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erro ao listar' }, { status: 500 })
  }
}
