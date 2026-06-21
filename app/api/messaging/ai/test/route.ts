/**
 * Endpoint de diagnóstico — testa a chave de IA configurada no banco.
 * GET /api/messaging/ai/test
 * Retorna o erro exato da API ou confirma que está funcionando.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getOrgAIConfig } from '@/lib/ai/agent/agent.service';
import { buildProviderList, generateWithFailover } from '@/lib/ai/agent/provider-failover';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!
  );

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: 'Sem organização' }, { status: 403 });
  }

  const aiConfig = await getOrgAIConfig(supabase, profile.organization_id);

  if (!aiConfig) {
    return NextResponse.json({
      ok: false,
      step: 'config',
      error: 'Configuração de IA não encontrada ou sem chave válida',
    });
  }

  const providers = buildProviderList({
    provider: aiConfig.provider,
    apiKey: aiConfig.apiKey,
    model: aiConfig.model,
    allKeys: aiConfig.allKeys,
  });

  if (providers.length === 0) {
    return NextResponse.json({
      ok: false,
      step: 'providers',
      error: 'Nenhum provider com chave disponível',
      config: {
        provider: aiConfig.provider,
        model: aiConfig.model,
        hasKey: !!aiConfig.apiKey,
        allKeys: {
          google: !!aiConfig.allKeys.google,
          openai: !!aiConfig.allKeys.openai,
          anthropic: !!aiConfig.allKeys.anthropic,
        },
      },
    });
  }

  try {
    const result = await generateWithFailover({
      providers,
      system: 'Você é um assistente de teste.',
      prompt: 'Responda apenas: "OK"',
      maxRetries: 1,
    });

    return NextResponse.json({
      ok: true,
      response: result.text,
      provider: result.providerUsed,
      model: result.modelUsed,
      config: {
        provider: aiConfig.provider,
        model: aiConfig.model,
        providerList: providers.map(p => ({ provider: p.provider, model: p.model })),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ok: false,
      step: 'generate',
      error: msg,
      config: {
        provider: aiConfig.provider,
        model: aiConfig.model,
        providerList: providers.map(p => ({ provider: p.provider, model: p.model })),
      },
    });
  }
}
