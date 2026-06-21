/**
 * Endpoint de diagnóstico — testa a chave de IA configurada no banco.
 * GET /api/messaging/ai/test
 * Retorna o erro exato da API ou confirma que está funcionando.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getOrgAIConfig } from '@/lib/ai/agent/agent.service';
import { buildProviderList, generateWithFailover } from '@/lib/ai/agent/provider-failover';

export const maxDuration = 30;

// Endpoint de diagnóstico temporário — sem auth, org fixo para testes
const ORG_ID = '3f118023-c8e3-4e62-8ec4-a3e40bfde164';

export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!
  );

  const aiConfig = await getOrgAIConfig(supabase, ORG_ID);

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
