/**
 * Endpoint de diagnóstico — testa a chave de IA configurada no banco.
 * GET /api/messaging/ai/test
 * Requer sessão autenticada. Retorna o erro exato da API ou confirma funcionamento.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getOrgAIConfig } from '@/lib/ai/agent/agent.service';
import { buildProviderList, generateWithFailover } from '@/lib/ai/agent/provider-failover';

export const maxDuration = 30;

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!
  );
}

export async function GET(request: NextRequest) {
  // Validar sessão do usuário
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: 'Organização não encontrada' }, { status: 404 });
  }

  const orgId = profile.organization_id;
  const admin = adminClient();
  const aiConfig = await getOrgAIConfig(admin, orgId);

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
