import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient as createAdminClient } from '@supabase/supabase-js';

// Envia mensagem via canal WhatsApp
async function sendViaChannel(
  provider: string,
  credentials: Record<string, string>,
  phone: string,
  text: string
): Promise<void> {
  if (provider === 'z-api') {
    const { instanceId, token, clientToken } = credentials;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (clientToken) headers['Client-Token'] = clientToken;
    const res = await fetch(
      `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`,
      { method: 'POST', headers, body: JSON.stringify({ phone, message: text }) }
    );
    if (!res.ok) throw new Error(`Z-API ${res.status}`);
    return;
  }
  if (provider === 'meta-cloud') {
    const { accessToken, phoneNumberId } = credentials;
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { body: text },
        }),
      }
    );
    if (!res.ok) throw new Error(`Meta Cloud ${res.status}`);
    return;
  }
  if (provider === 'evolution') {
    const { serverUrl, apiKey, instanceName } = credentials;
    const res = await fetch(
      `${serverUrl.replace(/\/+$/, '')}/message/sendText/${instanceName}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({ number: phone, textMessage: { text } }),
      }
    );
    if (!res.ok) throw new Error(`Evolution ${res.status}`);
    return;
  }
  throw new Error(`Provider desconhecido: ${provider}`);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await params;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Admin client para operações de escrita cross-RLS
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Busca campanha + canal
  const { data: campaign } = await admin
    .from('campaigns')
    .select('*, channel:messaging_channels(id, provider, credentials)')
    .eq('id', campaignId)
    .single();

  if (!campaign) return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });

  const channel = campaign.channel as { id: string; provider: string; credentials: Record<string, string> } | null;
  if (!channel) return NextResponse.json({ error: 'Canal não encontrado' }, { status: 400 });

  // Marca campanha como running
  await admin.from('campaigns').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', campaignId);

  // Busca destinatários pendentes
  const { data: recipients } = await admin
    .from('campaign_recipients')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending');

  let sentCount = 0, failedCount = 0;

  for (const r of recipients ?? []) {
    const phone = r.external_contact_id;
    if (!phone) {
      await admin.from('campaign_recipients').update({ status: 'skipped' }).eq('id', r.id);
      continue;
    }

    try {
      await sendViaChannel(channel.provider, channel.credentials, phone, campaign.message);

      // Insere mensagem na conversa se houver
      if (r.conversation_id) {
        await admin.from('messaging_messages').insert({
          conversation_id: r.conversation_id,
          direction: 'outbound',
          content_type: 'text',
          content: { type: 'text', text: campaign.message },
          status: 'sent',
          sent_at: new Date().toISOString(),
          sender_type: 'user',
          sender_name: 'Campanha',
          metadata: { campaign_id: campaignId },
        });
        await admin.from('messaging_conversations').update({
          last_message_at: new Date().toISOString(),
          last_message_preview: campaign.message.slice(0, 100),
          last_message_direction: 'outbound',
        }).eq('id', r.conversation_id);
      }

      await admin.from('campaign_recipients').update({
        status: 'sent',
        sent_at: new Date().toISOString(),
      }).eq('id', r.id);

      sentCount++;
    } catch (err) {
      await admin.from('campaign_recipients').update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : String(err),
      }).eq('id', r.id);
      failedCount++;
    }

    // Intervalo de 1s entre envios para evitar spam
    await new Promise((res) => setTimeout(res, 1000));
  }

  // Finaliza campanha
  await admin.from('campaigns').update({
    status: 'completed',
    sent_count: sentCount,
    failed_count: failedCount,
    completed_at: new Date().toISOString(),
  }).eq('id', campaignId);

  return NextResponse.json({ ok: true, sentCount, failedCount });
}
