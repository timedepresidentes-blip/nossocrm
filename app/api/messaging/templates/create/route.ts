import { createClient } from '@/lib/supabase/server';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { MetaCloudWhatsAppProvider } from '@/lib/messaging/providers/whatsapp/meta-cloud.provider';

export const maxDuration = 30;

function json<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * POST /api/messaging/templates/create
 * Cria um template diretamente na API do Meta WhatsApp Cloud
 */
export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) return json({ error: 'Forbidden' }, 403);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id || profile.role !== 'admin') {
    return json({ error: 'Forbidden' }, 403);
  }

  const body = await req.json() as {
    channelId: string;
    name: string;
    category: string;
    language: string;
    components: unknown[];
  };

  const { data: channel } = await supabase
    .from('messaging_channels')
    .select('*')
    .eq('id', body.channelId)
    .eq('organization_id', profile.organization_id)
    .eq('provider', 'meta-cloud')
    .is('deleted_at', null)
    .single();

  if (!channel) return json({ error: 'Canal não encontrado' }, 404);

  const credentials = channel.credentials as Record<string, string>;
  if (!credentials.wabaId || !credentials.accessToken) {
    return json({ error: 'wabaId ou accessToken ausente nas credenciais do canal' }, 400);
  }

  const res = await fetch(
    `https://graph.facebook.com/v25.0/${credentials.wabaId}/message_templates`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.accessToken}`,
      },
      body: JSON.stringify({
        name: body.name,
        category: body.category.toUpperCase(),
        language: body.language,
        components: body.components,
      }),
    }
  );

  const metaResult = await res.json() as Record<string, unknown>;

  if (!res.ok) {
    return json({ error: 'Erro ao criar template no Meta', detail: metaResult }, res.status);
  }

  return json({ success: true, template: metaResult });
}
