import { createStaticAdminClient } from '@/lib/supabase/staticAdminClient';

// ClickSign envia eventos via POST nesta URL
// Configure em: app.clicksign.com → Configurações → API → Adicionar Webhook
// URL: https://seu-dominio.com/api/clicksign/webhook

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    // ClickSign v3 envia { event: { name, data: { envelope: { id, key, status } } } }
    const event = body?.event;
    if (!event) return new Response('ok', { status: 200 });

    const envelopeId  = event?.data?.envelope?.id;
    const envelopeKey = event?.data?.envelope?.key;
    const status      = event?.data?.envelope?.status; // 'running' | 'closed' | 'cancelled'
    const eventName   = event?.name; // 'envelope.finished' | 'envelope.cancelled' etc.

    if (!envelopeId) return new Response('ok', { status: 200 });

    const clicksignStatus = mapStatus(eventName, status);

    const supabase = createStaticAdminClient();

    // Busca o deal que tem esse envelopeId salvo
    const { data: deals } = await supabase
      .from('deals')
      .select('id, custom_fields')
      .filter('custom_fields->clicksign->>envelopeId', 'eq', envelopeId);

    if (!deals || deals.length === 0) return new Response('ok', { status: 200 });

    for (const deal of deals) {
      const existing = (deal.custom_fields as Record<string, unknown>) ?? {};
      const existingClicksign = (existing.clicksign as Record<string, unknown>) ?? {};

      await supabase
        .from('deals')
        .update({
          custom_fields: {
            ...existing,
            clicksign: {
              ...existingClicksign,
              status: clicksignStatus,
              envelopeKey: envelopeKey ?? existingClicksign.envelopeKey,
              ...(clicksignStatus === 'signed' ? { signedAt: new Date().toISOString() } : {}),
            },
          },
        })
        .eq('id', deal.id);
    }

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('[clicksign/webhook]', err);
    return new Response('error', { status: 500 });
  }
}

function mapStatus(eventName: string, rawStatus: string): string {
  if (eventName === 'envelope.finished' || rawStatus === 'closed') return 'signed';
  if (eventName === 'envelope.cancelled' || rawStatus === 'cancelled') return 'cancelled';
  if (rawStatus === 'running') return 'running';
  return rawStatus ?? 'unknown';
}
