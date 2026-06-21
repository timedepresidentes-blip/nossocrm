import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
  if (!profile?.organization_id) return NextResponse.json({ error: 'Org not found' }, { status: 403 });

  const body = await req.json();
  const { name, message, channelId, deals } = body;

  if (!name || !message || !channelId || !Array.isArray(deals) || deals.length === 0) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
  }

  // Cria a campanha
  const { data: campaign, error: campErr } = await supabase
    .from('campaigns')
    .insert({
      organization_id: profile.organization_id,
      name,
      message,
      channel_id: channelId,
      status: 'draft',
      total_count: deals.length,
      created_by: user.id,
    })
    .select()
    .single();

  if (campErr) return NextResponse.json({ error: campErr.message }, { status: 500 });

  // Insere destinatários
  const recipients = deals.map((d: {
    dealId: string; dealTitle: string; stageName: string;
    contactId: string; contactName: string;
    externalContactId: string; conversationId: string | null;
  }) => ({
    campaign_id: campaign.id,
    organization_id: profile.organization_id,
    deal_id: d.dealId,
    contact_id: d.contactId,
    conversation_id: d.conversationId,
    external_contact_id: d.externalContactId,
    contact_name: d.contactName,
    deal_title: d.dealTitle,
    stage_name: d.stageName,
    status: 'pending',
  }));

  const { error: recipErr } = await supabase.from('campaign_recipients').insert(recipients);
  if (recipErr) return NextResponse.json({ error: recipErr.message }, { status: 500 });

  return NextResponse.json({ id: campaign.id, name: campaign.name });
}
