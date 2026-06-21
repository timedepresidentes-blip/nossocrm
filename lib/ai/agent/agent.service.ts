/**
 * @fileoverview AI Agent Service
 *
 * Serviço principal do agente autônomo de vendas.
 * Processa mensagens recebidas e gera respostas automaticamente.
 *
 * @module lib/ai/agent/agent.service
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { type AIProvider } from '../config';
import { AI_DEFAULT_MODELS, AI_DEFAULT_PROVIDER } from '../defaults';
import { generateWithFailover, buildProviderList } from './provider-failover';
import { checkRateLimit, recordRateCall } from './rate-limiter';
import { checkTokenBudget } from './token-budget';
import { buildLeadContext, formatContextForPrompt } from './context-builder';
import { getChannelRouter } from '@/lib/messaging/channel-router.service';
import { evaluateStageAdvancement } from './stage-evaluator';
import { extractAndUpdateBANT } from '../extraction/extraction.service';
import {
  buildConversationalPromptFromPatterns,
} from './generative-schema';
import type { LearnedPattern } from './few-shot-learner';
import type {
  StageAIConfig,
  LeadContext,
  AgentDecision,
  AgentProcessResult,
} from './types';

/**
 * Prompt base padrão do agente — usado quando a organização não configurou
 * um prompt próprio em organization_settings.ai_base_system_prompt.
 * Edite via Settings > IA > Prompt Base para customizar por organização.
 */
const DEFAULT_BASE_SYSTEM_PROMPT = `Você é um assistente de vendas profissional.
Seu objetivo é ajudar leads a avançar no funil de vendas de forma natural e consultiva.

REGRAS IMPORTANTES:
1. Seja cordial e profissional, mas não robótico
2. Use o nome do lead quando apropriado
3. Faça perguntas para entender as necessidades
4. Nunca invente informações sobre produtos/serviços
5. Se não souber responder algo, diga que vai verificar
6. Mantenha respostas concisas (máximo 3-4 frases)
7. Use emojis com moderação (máximo 1 por mensagem)
8. NUNCA revele que você é uma IA`;

// =============================================================================
// Organization AI Config
// =============================================================================

export type AIConfigMode = 'zero_config' | 'template' | 'auto_learn' | 'advanced';

export interface OrgAIConfig {
  enabled: boolean;
  provider: AIProvider;
  model: string;
  apiKey: string;
  hitlThreshold: number;
  /** Min confidence to surface a stage-advance suggestion. DB: ai_hitl_min_confidence. Default 0.70. */
  hitlMinConfidence: number;
  /** Hours before a pending HITL advance expires. DB: ai_hitl_expiration_hours. Default 24. */
  hitlExpirationHours: number;
  configMode: AIConfigMode;
  learnedPatterns: LearnedPattern | null;
  templateId: string | null;
  takeoverEnabled: boolean;
  takeoverMinutes: number;
  allKeys: Record<AIProvider, string | null>;
  /** Org-level base system prompt (rules, tone, identity). DB: ai_base_system_prompt. Null → use built-in default. */
  baseSystemPrompt: string | null;
  /** Org timezone. DB: timezone. Default 'America/Sao_Paulo'. */
  timezone: string;
}

/**
 * Busca as configurações de AI da organização no banco de dados.
 */
export async function getOrgAIConfig(
  supabase: SupabaseClient,
  organizationId: string
): Promise<OrgAIConfig | null> {
  const { data: orgSettings, error } = await supabase
    .from('organization_settings')
    .select(
      'ai_enabled, ai_provider, ai_model, ai_google_key, ai_openai_key, ai_anthropic_key, ai_hitl_threshold, ai_hitl_min_confidence, ai_hitl_expiration_hours, ai_config_mode, ai_learned_patterns, ai_template_id, ai_takeover_enabled, ai_takeover_minutes, ai_base_system_prompt, timezone'
    )
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) {
    console.error('[AIAgent] Error fetching org AI config:', error);
    return null;
  }

  if (!orgSettings) {
    console.warn('[AIAgent] No AI settings found for organization:', organizationId);
    return null;
  }

  const provider = (orgSettings.ai_provider || AI_DEFAULT_PROVIDER) as AIProvider;

  // Env vars como fallback quando chave não está no banco
  const ENV_KEY_MAP: Record<AIProvider, string> = {
    google: 'GOOGLE_GENERATIVE_AI_API_KEY',
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
  };

  const getApiKey = () => {
    const dbKey = (() => {
      switch (provider) {
        case 'google': return orgSettings.ai_google_key || '';
        case 'openai': return orgSettings.ai_openai_key || '';
        case 'anthropic': return orgSettings.ai_anthropic_key || '';
        default: return '';
      }
    })();
    const envKey = process.env[ENV_KEY_MAP[provider]] || '';
    if (!dbKey && envKey) {
      console.log(`[AIAgent] Using env var key for provider ${provider} (not set in DB)`);
    }
    return dbKey || envKey;
  };

  const apiKey = getApiKey();

  if (!apiKey) {
    // Verificar se algum provider de fallback tem chave disponível
    const fallbackKey =
      orgSettings.ai_anthropic_key || process.env['ANTHROPIC_API_KEY'] ||
      orgSettings.ai_openai_key || process.env['OPENAI_API_KEY'] ||
      (provider !== 'google' ? (orgSettings.ai_google_key || process.env['GOOGLE_GENERATIVE_AI_API_KEY']) : null);

    if (!fallbackKey) {
      console.warn('[AIAgent] No API key configured for any provider. Primary:', provider);
      return null;
    }
    console.warn(`[AIAgent] No key for primary provider "${provider}" — fallback available, will continue`);
  }

  // Parse learned patterns - pode ser {} vazio, null, ou objeto válido
  let learnedPatterns: LearnedPattern | null = null;
  if (
    orgSettings.ai_learned_patterns &&
    typeof orgSettings.ai_learned_patterns === 'object' &&
    Object.keys(orgSettings.ai_learned_patterns as object).length > 0 &&
    'learnedCriteria' in (orgSettings.ai_learned_patterns as object)
  ) {
    learnedPatterns = orgSettings.ai_learned_patterns as LearnedPattern;
  }

  return {
    enabled: orgSettings.ai_enabled !== false, // default true
    provider,
    model: orgSettings.ai_model || AI_DEFAULT_MODELS[provider],
    apiKey,
    hitlThreshold: orgSettings.ai_hitl_threshold ?? 0.85,
    hitlMinConfidence: orgSettings.ai_hitl_min_confidence ?? 0.70,
    hitlExpirationHours: orgSettings.ai_hitl_expiration_hours ?? 24,
    configMode: (orgSettings.ai_config_mode as AIConfigMode) || 'zero_config',
    learnedPatterns,
    templateId: orgSettings.ai_template_id || null,
    takeoverEnabled: orgSettings.ai_takeover_enabled === true,
    takeoverMinutes: orgSettings.ai_takeover_minutes ?? 15,
    allKeys: {
      google: orgSettings.ai_google_key || process.env['GOOGLE_GENERATIVE_AI_API_KEY'] || null,
      openai: orgSettings.ai_openai_key || process.env['OPENAI_API_KEY'] || null,
      anthropic: orgSettings.ai_anthropic_key || process.env['ANTHROPIC_API_KEY'] || null,
    },
    baseSystemPrompt: orgSettings.ai_base_system_prompt || null,
    timezone: orgSettings.timezone || 'America/Sao_Paulo',
  };
}

// =============================================================================
// Types
// =============================================================================

export interface ProcessMessageParams {
  supabase: SupabaseClient;
  conversationId: string;
  organizationId: string;
  incomingMessage: string;
  messageId?: string;
  /** Quando definido, bypassa a verificação de ai_paused e substitui o prompt de disparo */
  triggerContext?: string;
}

// =============================================================================
// Agent Service
// =============================================================================

/**
 * Processa uma mensagem recebida e decide a ação do AI Agent.
 *
 * Fluxo:
 * 1. Busca deal associado à conversa
 * 2. Busca deal e stage
 * 3. Busca configuração de AI do estágio
 * 4. Busca configuração de AI da organização (chaves do banco)
 * 5. Monta contexto do lead
 * 6. Verifica limite de mensagens
 * 7. Verifica handoff keywords
 * 8. Verifica horário comercial
 * 9. Gera resposta com AI (usando chaves do banco)
 * 10. Envia resposta via ChannelRouter
 * 11. Log da interação
 */
export async function processIncomingMessage(
  params: ProcessMessageParams
): Promise<AgentProcessResult> {
  const { supabase, conversationId, organizationId, incomingMessage, messageId, triggerContext } = params;

  console.log('[AIAgent] Processing message:', { conversationId, messageId, trigger: !!triggerContext, org: organizationId });

  // 0a. Rate limit check (per-conversation)
  const rateCheck = checkRateLimit(conversationId);
  if (!rateCheck.allowed) {
    console.warn('[AIAgent] Rate limited for conversation:', conversationId);
    return {
      success: true,
      decision: {
        action: 'skipped',
        reason: `Rate limit: aguarde ${Math.ceil((rateCheck.retryAfterMs || 0) / 1000)}s`,
      },
    };
  }

  // 1. Buscar deal associado à conversa para pegar o stage + assignment
  const { data: conversation } = await supabase
    .from('messaging_conversations')
    .select('metadata, assigned_user_id, assigned_at, contact_id, closing_mode, window_expires_at, channel_id, external_contact_id')
    .eq('id', conversationId)
    .single();

  // 0b. Check if AI is paused for this conversation (metadata) or contact
  // triggerContext bypassa esta verificação — o atendente já desbloqueou a Julia manualmente
  const conversationMetadata = (conversation?.metadata || {}) as Record<string, unknown>;
  if (!triggerContext && conversationMetadata.ai_paused === true) {
    console.log('[AIAgent] AI paused for this conversation:', conversationId);
    return {
      success: true,
      decision: {
        action: 'skipped',
        reason: 'AI pausado para esta conversa',
      },
    };
  }

  // 0c. Check if AI is paused at the contact level (cross-channel)
  if (conversation?.contact_id) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('ai_paused')
      .eq('id', conversation.contact_id)
      .maybeSingle();
    if (contact?.ai_paused) {
      console.log('[AIAgent] AI paused for contact:', conversation.contact_id);
      return {
        success: true,
        decision: {
          action: 'skipped',
          reason: 'AI pausado para este contato',
        },
      };
    }
  }

  const dealId = conversationMetadata.deal_id as string | undefined;
  console.log('[AIAgent] Conversation meta:', { dealId, ai_paused: conversationMetadata.ai_paused, contact_id: conversation?.contact_id });

  if (!dealId) {
    console.log('[AIAgent] No deal associated, skipping AI processing');
    return {
      success: true,
      decision: {
        action: 'skipped',
        reason: 'Conversa não tem deal associado',
      },
    };
  }

  // 2. Buscar deal e stage
  const { data: deal } = await supabase
    .from('deals')
    .select('id, stage_id')
    .eq('id', dealId)
    .single();

  console.log('[AIAgent] Deal fetched:', { id: deal?.id, stage_id: deal?.stage_id });
  if (!deal?.stage_id) {
    console.log('[AIAgent] Skipping: deal without stage, dealId:', dealId);
    return {
      success: true,
      decision: {
        action: 'skipped',
        reason: 'Deal sem estágio definido',
      },
    };
  }

  // 3. Buscar config do AI para este estágio
  const { data: stageConfig } = await supabase
    .from('stage_ai_config')
    .select('*')
    .eq('stage_id', deal.stage_id)
    .eq('enabled', true)
    .single();

  console.log('[AIAgent] Stage config:', { found: !!stageConfig, stage_id: deal.stage_id });
  if (!stageConfig) {
    console.log('[AIAgent] AI not enabled for this stage');
    return {
      success: true,
      decision: {
        action: 'skipped',
        reason: 'AI não habilitado para este estágio',
      },
    };
  }

  const config = stageConfig as StageAIConfig;

  // 4. Buscar configuração de AI e token budget em paralelo
  const [aiConfig, budgetCheck] = await Promise.all([
    getOrgAIConfig(supabase, organizationId),
    checkTokenBudget(supabase, organizationId),
  ]);

  if (!aiConfig) {
    console.log('[AIAgent] No AI config found for organization');
    return {
      success: true,
      decision: {
        action: 'skipped',
        reason: 'Configuração de AI não encontrada para a organização',
      },
    };
  }

  if (!aiConfig.enabled) {
    console.log('[AIAgent] AI is disabled for organization');
    return {
      success: true,
      decision: {
        action: 'skipped',
        reason: 'AI desabilitado para esta organização',
      },
    };
  }

  // 4a-2. Token budget check (já resolvido acima via Promise.all)
  if (!budgetCheck.allowed) {
    console.warn('[AIAgent] Token budget exceeded:', budgetCheck);
    return {
      success: true,
      decision: {
        action: 'skipped',
        reason: `Limite mensal de tokens excedido (${budgetCheck.used.toLocaleString()}/${budgetCheck.limit.toLocaleString()})`,
      },
    };
  }

  // 4b. Verificar inatividade do operador (AI Takeover).
  // triggerContext: atendente explicitamente devolveu para Julia — bypassa o check de takeover.
  if (aiConfig.takeoverEnabled && !triggerContext) {
    const operatorActive = await isOperatorActive(
      supabase,
      conversationId,
      conversation?.assigned_at,
      aiConfig.takeoverMinutes
    );

    if (operatorActive) {
      console.log('[AIAgent] Operator is active, skipping AI response');
      return {
        success: true,
        decision: {
          action: 'skipped',
          reason: `Operador ativo (última mensagem há menos de ${aiConfig.takeoverMinutes} min)`,
        },
      };
    }

    console.log(`[AIAgent] Operator inactive for >${aiConfig.takeoverMinutes}min, AI taking over`);
  } else if (triggerContext) {
    console.log('[AIAgent] Takeover check bypassed — manual handoff trigger');
  }

  // 5. Montar contexto do lead
  const context = await buildLeadContext({
    supabase,
    conversationId,
    organizationId,
  });

  if (!context) {
    console.log('[AIAgent] Skipping: context build failed for', conversationId);
    return {
      success: false,
      decision: {
        action: 'skipped',
        reason: 'Falha ao montar contexto',
      },
      error: {
        code: 'CONTEXT_BUILD_FAILED',
        message: 'Não foi possível montar o contexto do lead',
      },
    };
  }

  console.log('[AIAgent] Context built, ai_messages_count:', context.stats.ai_messages_count, 'max:', config.settings.max_messages_per_conversation);

  // 5b. Verificar janela de 24h — se expirada, Julia não pode enviar mensagem comum
  const windowExpiresAt = (conversation as Record<string, unknown>)?.window_expires_at as string | null | undefined;
  if (windowExpiresAt && new Date(windowExpiresAt) < new Date()) {
    if (triggerContext) {
      // Disparado pelo botão "Devolver para Júlia": janela expirou, envia template de retomada
      console.log('[AIAgent] Janela de 24h expirada — enviando template retomada_conversa_24h');
      await sendTemplateAsAI({
        supabase,
        conversationId,
        channelId: (conversation as Record<string, unknown>)?.channel_id as string,
        externalContactId: (conversation as Record<string, unknown>)?.external_contact_id as string,
        templateName: 'retomada_conversa_24h',
        parameters: [{ type: 'text', text: context.contact?.name || 'cliente' }],
        senderLabel: 'Julia',
      });
    } else {
      console.log('[AIAgent] Janela de 24h expirada — aguardando resposta do cliente para reabrir');
    }
    return {
      success: true,
      decision: {
        action: 'skipped',
        reason: 'Janela de 24h expirada' + (triggerContext ? ' — template de retomada enviado' : ''),
      },
    };
  }

  // 6. Verificar limite de mensagens
  if (context.stats.ai_messages_count >= config.settings.max_messages_per_conversation) {
    console.log('[AIAgent] Skipping: message limit reached');
    return {
      success: true,
      decision: await handleHandoff(supabase, conversationId, organizationId, context, 'Limite de mensagens atingido'),
    };
  }

  // 7. Verificar handoff keywords
  const handoffKeyword = checkHandoffKeywords(incomingMessage, config.settings.handoff_keywords);
  if (handoffKeyword) {
    return {
      success: true,
      decision: await handleHandoff(
        supabase,
        conversationId,
        organizationId,
        context,
        `Keyword de handoff detectada: "${handoffKeyword}"`
      ),
    };
  }

  // 8. Verificar horário comercial — ignorado em triggers manuais (atendente decidiu acionar)
  if (config.settings.business_hours_only && !isBusinessHours(config.settings.business_hours)) {
    if (triggerContext) {
      console.log('[AIAgent] Business hours check bypassed — manual handoff trigger');
    } else {
      console.log('[AIAgent] Skipping: outside business hours');
      return {
        success: true,
        decision: {
          action: 'skipped',
          reason: 'Fora do horário comercial',
        },
      };
    }
  }

  // 9. Gerar resposta usando configuração de AI do banco
  const decision = await generateResponse({
    context,
    stageConfig: config,
    incomingMessage,
    aiConfig,
    closingMode: conversation?.closing_mode ?? false,
    triggerContext,
  });

  // Record rate call only on actual AI response (not on skipped/handoff)
  if (decision.action === 'responded') {
    recordRateCall(conversationId);
  }

  // 9b. Falha de geração: todos os providers AI falharam — notifica cliente via template
  if (decision.action === 'generation_failed') {
    console.warn('[AIAgent] Geração falhou — enviando template inicio_atendimento_humano');
    const channelId = (conversation as Record<string, unknown>)?.channel_id as string;
    const externalContactId = (conversation as Record<string, unknown>)?.external_contact_id as string;
    if (channelId && externalContactId) {
      await sendTemplateAsAI({
        supabase,
        conversationId,
        channelId,
        externalContactId,
        templateName: 'inicio_atendimento_humano',
        parameters: [
          { type: 'text', text: context.contact?.name || 'cliente' },
          { type: 'text', text: 'nossa equipe' },
        ],
        senderLabel: 'Julia',
      });
    }
    return {
      success: false,
      decision: {
        action: 'handoff',
        reason: decision.reason,
      },
      error: { code: 'ALL_PROVIDERS_FAILED', message: decision.reason || 'Todos os providers falharam' },
    };
  }

  // 10. Se deve responder, enviar mensagem
  if (decision.action === 'responded' && decision.response) {
    const sendResult = await sendAIResponse({
      supabase,
      conversationId,
      response: decision.response,
    });

    if (!sendResult.success) {
      return {
        success: false,
        decision,
        error: sendResult.error,
      };
    }

    // 11. Log da interação
    await logAIInteraction({
      supabase,
      organizationId,
      conversationId,
      messageId,
      stageId: deal.stage_id,
      context,
      decision,
    });

    // 12. Extrair campos BANT automaticamente (fire-and-forget)
    extractAndUpdateBANT({
      supabase,
      dealId,
      conversationId,
      organizationId,
      triggerMessageId: messageId,
    }).catch((err) => {
      console.error('[AIAgent] BANT extraction failed:', err);
    });

    // 13. Avaliar avanço de estágio (após resposta bem-sucedida)
    let stageAdvanced = false;
    let newStageId: string | undefined;

    if (config.advancement_criteria && config.advancement_criteria.length > 0) {
      // Montar histórico da conversa para avaliação
      const conversationHistory = await getConversationHistory(supabase, conversationId);

      const evalResult = await evaluateStageAdvancement({
        supabase,
        context,
        stageConfig: config,
        conversationHistory,
        aiConfig: {
          provider: aiConfig.provider,
          apiKey: aiConfig.apiKey,
          model: aiConfig.model,
        },
        organizationId,
        hitlThreshold: aiConfig.hitlThreshold,
        hitlMinConfidence: aiConfig.hitlMinConfidence,
        hitlExpirationHours: aiConfig.hitlExpirationHours,
        conversationId,
      });

      if (evalResult.advanced && evalResult.newStageId) {
        stageAdvanced = true;
        newStageId = evalResult.newStageId;
        console.log('[AIAgent] Deal advanced to stage:', newStageId);
      } else if (evalResult.requiresConfirmation && evalResult.pendingAdvanceId) {
        console.log('[AIAgent] Stage advancement requires HITL confirmation:', evalResult.pendingAdvanceId);
      }
    }

    return {
      success: true,
      decision: {
        ...decision,
        stage_advanced: stageAdvanced,
        new_stage_id: newStageId,
      },
      message_sent: {
        id: sendResult.messageId!,
      },
    };
  }

  return {
    success: true,
    decision,
  };
}

// =============================================================================
// Response Generation
// =============================================================================

interface GenerateResponseParams {
  context: LeadContext;
  stageConfig: StageAIConfig;
  incomingMessage: string;
  aiConfig: OrgAIConfig;
  closingMode?: boolean;
  triggerContext?: string;
}

async function generateResponse(params: GenerateResponseParams): Promise<AgentDecision> {
  const { context, stageConfig, incomingMessage, aiConfig, closingMode, triggerContext } = params;

  const systemPrompt = buildSystemPrompt(
    context,
    stageConfig,
    aiConfig.learnedPatterns,
    aiConfig.configMode,
    aiConfig.baseSystemPrompt,
    closingMode
  );
  const contextText = formatContextForPrompt(context);

  // triggerContext: acionado por handoff manual — Julia deve se apresentar e retomar
  const userPrompt = triggerContext
    ? `${contextText}\n\n---\n\n${triggerContext}\n\nResponda de forma natural, seguindo as instruções do sistema.`
    : `
${contextText}

---

A última mensagem do lead foi:
"${incomingMessage}"

Responda de forma natural, seguindo as instruções do sistema.
`;

  try {
    // Usar model do stage se definido, senão usar config da organização
    const modelId = stageConfig.ai_model || aiConfig.model;

    // Build provider list with failover (primary first, then others with keys)
    const providers = buildProviderList({
      provider: aiConfig.provider,
      apiKey: aiConfig.apiKey,
      model: modelId,
      allKeys: aiConfig.allKeys,
    });

    const result = await generateWithFailover({
      providers,
      system: systemPrompt,
      prompt: userPrompt,
      maxRetries: 2,
    });

    return {
      action: 'responded',
      response: result.text.trim(),
      reason: 'Resposta gerada com sucesso',
      tokens_used: result.usage?.totalTokens,
      model_used: result.modelUsed || modelId,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.error('[AIAgent] All providers failed. Summary:', msg);
    return {
      action: 'generation_failed',
      reason: `Erro na geração: ${msg}`,
    };
  }
}

const CLOSING_MODE_INSTRUCTIONS = `

## ⚡ MODO FECHAMENTO ATIVO
Seu objetivo PRINCIPAL agora é fechar a venda. Seja direto, assertivo e focado em levar o cliente à decisão.
- Resuma os benefícios já discutidos e proponha o próximo passo concreto (ex: "Posso enviar o contrato agora?")
- Use urgência genuína quando aplicável (disponibilidade limitada, prazo de proposta)
- Faça perguntas de fechamento diretas ("Podemos fechar isso hoje?", "O que falta para você decidir?")
- Remova objeções restantes com segurança e empatia
- Não prolongue a conversa com perguntas genéricas — mire no "sim" do cliente
`;

function buildSystemPrompt(
  context: LeadContext,
  config: StageAIConfig,
  learnedPatterns: LearnedPattern | null,
  configMode: AIConfigMode,
  orgBasePrompt: string | null,
  closingMode?: boolean
): string {
  // Usa prompt base da org (editável em Settings > IA) ou o padrão embutido
  const basePrompt = orgBasePrompt || DEFAULT_BASE_SYSTEM_PROMPT;

  // Se modo Auto-Learn e tem padrões aprendidos, usar sistema de padrões
  if (configMode === 'auto_learn' && learnedPatterns) {
    console.log('[AIAgent] Using learned patterns for response generation');

    const learnedPrompt = buildConversationalPromptFromPatterns(learnedPatterns);

    return `${learnedPrompt}

## Contexto da Organização
Você está representando: ${context.organization.name}

${config.stage_goal ? `
## Objetivo deste Estágio
${config.stage_goal}
` : ''}

${config.advancement_criteria.length > 0 ? `
## Para Avançar o Lead
${config.advancement_criteria.map((c) => `- ${c}`).join('\n')}
` : ''}

## Instruções Adicionais
${config.system_prompt}
${closingMode ? CLOSING_MODE_INSTRUCTIONS : ''}`;
  }

  // Modo padrão (zero_config, template, advanced)
  const stageSection = `
## Contexto
Você está representando: ${context.organization.name}

${config.stage_goal ? `OBJETIVO DESTE ESTÁGIO:\n${config.stage_goal}\n` : ''}
${config.advancement_criteria.length > 0 ? `PARA AVANÇAR O LEAD, VOCÊ PRECISA:\n${config.advancement_criteria.map((c) => `- ${c}`).join('\n')}\n` : ''}`;

  return `${basePrompt}

${stageSection}

INSTRUÇÕES ESPECÍFICAS:
${config.system_prompt}
${closingMode ? CLOSING_MODE_INSTRUCTIONS : ''}`;
}

// =============================================================================
// Message Sending
// =============================================================================

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: { code: string; message: string };
}

async function sendAIResponse(params: {
  supabase: SupabaseClient;
  conversationId: string;
  response: string;
}): Promise<SendResult> {
  const { supabase, conversationId, response } = params;

  // Buscar dados da conversa e canal
  const { data: conversation } = await supabase
    .from('messaging_conversations')
    .select('channel_id, external_contact_id')
    .eq('id', conversationId)
    .single();

  if (!conversation?.channel_id) {
    return {
      success: false,
      error: { code: 'NO_CHANNEL', message: 'Conversa sem canal associado' },
    };
  }

  if (!conversation.external_contact_id) {
    return {
      success: false,
      error: { code: 'NO_CONTACT', message: 'Conversa sem contato externo' },
    };
  }

  // Inserir mensagem no banco com status pending
  const { data: message, error: insertError } = await supabase
    .from('messaging_messages')
    .insert({
      conversation_id: conversationId,
      direction: 'outbound',
      content_type: 'text',
      content: { type: 'text', text: response },
      status: 'pending',
      sender_type: 'ai',
      sender_name: 'Julia',
      metadata: { sent_by_ai: true },
    })
    .select('id')
    .single();

  if (insertError) {
    return {
      success: false,
      error: { code: 'INSERT_FAILED', message: insertError.message },
    };
  }

  // Enviar via ChannelRouter
  try {
    const router = getChannelRouter();
    const sendResult = await router.sendMessage(conversation.channel_id, {
      conversationId,
      to: conversation.external_contact_id,
      content: { type: 'text', text: response },
    });

    if (sendResult.success) {
      // Atualizar mensagem com external_id e status sent
      await supabase
        .from('messaging_messages')
        .update({
          external_id: sendResult.externalMessageId,
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', message.id);

      return {
        success: true,
        messageId: message.id,
      };
    } else {
      // Marcar mensagem como falha
      await supabase
        .from('messaging_messages')
        .update({
          status: 'failed',
          error_code: sendResult.error?.code || 'SEND_FAILED',
          error_message: sendResult.error?.message || 'Unknown error',
          failed_at: new Date().toISOString(),
        })
        .eq('id', message.id);

      return {
        success: false,
        messageId: message.id,
        error: {
          code: sendResult.error?.code || 'SEND_FAILED',
          message: sendResult.error?.message || 'Falha ao enviar mensagem',
        },
      };
    }
  } catch (error) {
    console.error('[AIAgent] Error sending via provider:', error);

    // Marcar mensagem como falha
    await supabase
      .from('messaging_messages')
      .update({
        status: 'failed',
        error_code: 'PROVIDER_ERROR',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        failed_at: new Date().toISOString(),
      })
      .eq('id', message.id);

    return {
      success: false,
      messageId: message.id,
      error: {
        code: 'PROVIDER_ERROR',
        message: error instanceof Error ? error.message : 'Erro ao enviar',
      },
    };
  }
}

// =============================================================================
// Template Fallback
// =============================================================================

async function sendTemplateAsAI(params: {
  supabase: SupabaseClient;
  conversationId: string;
  channelId: string;
  externalContactId: string;
  templateName: string;
  parameters: Array<{ type: string; text: string }>;
  senderLabel: string;
}): Promise<void> {
  const { supabase, conversationId, channelId, externalContactId, templateName, parameters, senderLabel } = params;

  const { data: message } = await supabase
    .from('messaging_messages')
    .insert({
      conversation_id: conversationId,
      direction: 'outbound',
      content_type: 'template',
      content: { type: 'template', templateName, parameters },
      status: 'pending',
      sender_type: 'ai',
      sender_name: senderLabel,
      metadata: { sent_by_ai: true, template_fallback: true },
    })
    .select('id')
    .single();

  if (!message?.id) return;

  try {
    const router = getChannelRouter();
    const result = await router.sendTemplate(channelId, {
      conversationId,
      to: externalContactId,
      templateName,
      templateLanguage: 'pt_BR',
      components: [{ type: 'body', parameters }],
    });

    await supabase
      .from('messaging_messages')
      .update(
        result.success
          ? { external_id: result.externalMessageId, status: 'sent', sent_at: new Date().toISOString() }
          : { status: 'failed', error_code: result.error?.code || 'TEMPLATE_FAILED', error_message: result.error?.message, failed_at: new Date().toISOString() }
      )
      .eq('id', message.id);
  } catch (err) {
    console.error('[AIAgent] sendTemplateAsAI error:', err);
    await supabase
      .from('messaging_messages')
      .update({ status: 'failed', error_code: 'EXCEPTION', error_message: String(err), failed_at: new Date().toISOString() })
      .eq('id', message.id);
  }
}

// =============================================================================
// Handoff
// =============================================================================

async function handleHandoff(
  supabase: SupabaseClient,
  conversationId: string,
  organizationId: string,
  context: LeadContext,
  reason: string
): Promise<AgentDecision> {
  const now = new Date().toISOString();

  // Fetch existing metadata to merge (never overwrite)
  const { data: existing } = await supabase
    .from('messaging_conversations')
    .select('metadata')
    .eq('id', conversationId)
    .single();

  const existingMetadata = (existing?.metadata as Record<string, unknown>) ?? {};

  // Atualizar conversa para marcar handoff pendente
  await supabase
    .from('messaging_conversations')
    .update({
      metadata: {
        ...existingMetadata,
        ai_handoff_pending: true,
        ai_handoff_reason: reason,
        ai_handoff_at: now,
      },
    })
    .eq('id', conversationId);

  // Log handoff as deal activity
  if (context.deal?.id) {
    await supabase.from('deal_activities').insert({
      deal_id: context.deal.id,
      organization_id: organizationId,
      type: 'ai_handoff',
      description: `AI encaminhou conversa para operador humano: ${reason}`,
      metadata: {
        ai_handoff: true,
        reason,
        conversationId,
      },
    }).then(({ error }) => {
      if (error) console.error('[AIAgent] Failed to log handoff activity:', error);
    });
  }

  // Broadcast handoff notification via Supabase Realtime
  const channel = supabase.channel(`org:${organizationId}:notifications`);
  try {
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 5000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    await channel.send({
      type: 'broadcast',
      event: 'ai_handoff',
      payload: {
        conversationId,
        dealId: context.deal?.id,
        contactName: context.contact?.name || 'Desconhecido',
        reason,
        timestamp: now,
      },
    });
  } catch (err) {
    console.error('[AIAgent] Failed to broadcast handoff notification:', err);
  } finally {
    supabase.removeChannel(channel);
  }

  return {
    action: 'handoff',
    reason,
  };
}

// =============================================================================
// Logging
// =============================================================================

async function logAIInteraction(params: {
  supabase: SupabaseClient;
  organizationId: string;
  conversationId: string;
  messageId?: string;
  stageId: string;
  context: LeadContext;
  decision: AgentDecision;
}): Promise<void> {
  const { supabase, organizationId, conversationId, messageId, stageId, context, decision } = params;

  // Logging is fire-and-forget — a failure here must NOT propagate to the caller
  // and disrupt message processing or webhook acknowledgment.
  try {
    const { error } = await supabase.from('ai_conversation_log').insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      message_id: messageId,
      stage_id: stageId,
      context_snapshot: context,
      ai_response: decision.response || '',
      tokens_used: decision.tokens_used,
      model_used: decision.model_used,
      action_taken: decision.action,
      action_reason: decision.reason,
    });
    if (error) {
      console.error('[AI] logAIInteraction insert failed (non-fatal):', error.message);
    }
  } catch (err) {
    console.error('[AI] logAIInteraction unexpected error (non-fatal):', err);
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Verifica se o operador atribuído enviou mensagem recentemente.
 * Compara o tempo desde a última mensagem outbound do operador (ou assignment)
 * contra o limiar de takeover.
 */
async function isOperatorActive(
  supabase: SupabaseClient,
  conversationId: string,
  assignedAt: string | null | undefined,
  takeoverMinutes: number
): Promise<boolean> {
  const { data: lastUserMessage } = await supabase
    .from('messaging_messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('direction', 'outbound')
    .eq('sender_type', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const referenceTime = lastUserMessage?.created_at || assignedAt;

  if (!referenceTime) {
    return false; // Nunca respondeu e não tem assignment → inativo
  }

  const minutesSince = (Date.now() - new Date(referenceTime).getTime()) / 60000;
  return minutesSince < takeoverMinutes;
}

function checkHandoffKeywords(message: string, keywords: string[]): string | null {
  const lowerMessage = message.toLowerCase();
  for (const keyword of keywords) {
    if (lowerMessage.includes(keyword.toLowerCase())) {
      return keyword;
    }
  }
  return null;
}

function isBusinessHours(hours?: { start: string; end: string; timezone: string; daysOfWeek?: number[] }): boolean {
  if (!hours) return true;

  try {
    const now = new Date();

    // Check day of week (0=Sunday, 6=Saturday)
    const dayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: hours.timezone,
      weekday: 'short',
    });
    const dayStr = dayFormatter.format(now);
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const currentDay = dayMap[dayStr] ?? now.getDay();

    // Default: Mon-Fri (1-5) if daysOfWeek not specified
    const allowedDays = hours.daysOfWeek ?? [1, 2, 3, 4, 5];
    if (!allowedDays.includes(currentDay)) {
      return false;
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: hours.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const [hourStr, minuteStr] = formatter.format(now).split(':');
    const currentMinutes = parseInt(hourStr) * 60 + parseInt(minuteStr);

    const [startHour, startMin] = hours.start.split(':').map(Number);
    const [endHour, endMin] = hours.end.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } catch {
    return true; // Em caso de erro, permite
  }
}

/**
 * Busca o histórico da conversa para avaliação de avanço.
 * Retorna as últimas mensagens no formato esperado pelo evaluator.
 */
async function getConversationHistory(
  supabase: SupabaseClient,
  conversationId: string,
  limit: number = 10
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  // Fetch most recent messages (DESC) then reverse for chronological order
  const { data: messages } = await supabase
    .from('messaging_messages')
    .select('direction, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!messages || messages.length === 0) {
    return [];
  }

  // Reverse to chronological order (oldest first)
  messages.reverse();

  return messages.map((msg) => ({
    role: msg.direction === 'inbound' ? 'user' as const : 'assistant' as const,
    content:
      typeof msg.content === 'object' && msg.content !== null
        ? (msg.content as { text?: string }).text || JSON.stringify(msg.content)
        : String(msg.content),
  }));
}

// =============================================================================
// SLA Auto-Resume: Julia assume temporariamente quando atendente demora > 15 min
// =============================================================================

export interface ResumeByAIResult {
  success: boolean;
  conversationId: string;
  messageSent?: string;
  error?: string;
}

/**
 * Reativa a Julia para uma conversa que estava com atendimento humano pausado,
 * mas o atendente não respondeu em 15 minutos.
 * Julia envia uma mensagem de intermediário e aguarda o atendente retomar.
 */
export async function resumeByAI(
  supabase: SupabaseClient,
  conversationId: string,
  organizationId: string
): Promise<ResumeByAIResult> {
  try {
    // 1. Busca config de IA da organização
    const aiConfig = await getOrgAIConfig(supabase, organizationId);
    if (!aiConfig || !aiConfig.enabled) {
      return { success: false, conversationId, error: 'IA desabilitada para a organização' };
    }

    // 2. Busca histórico recente da conversa (últimas 20 mensagens para contexto)
    const history = await getConversationHistory(supabase, conversationId, 20);
    if (history.length === 0) {
      return { success: false, conversationId, error: 'Sem histórico de mensagens' };
    }

    // 3. Busca nome do contato para personalizar
    const { data: conv } = await supabase
      .from('messaging_conversations')
      .select('external_contact_name, contact_id, metadata, assigned_user_id')
      .eq('id', conversationId)
      .single();

    const contactName = conv?.external_contact_name || 'cliente';

    // 4. Busca nome do atendente que estava responsável (para mencionar)
    let attendantName = 'atendente';
    if (conv?.assigned_user_id) {
      const { data: attendant } = await supabase
        .from('profiles')
        .select('nickname, first_name, last_name')
        .eq('id', conv.assigned_user_id)
        .maybeSingle();
      attendantName = attendant?.nickname
        || (attendant?.first_name ? `${attendant.first_name}${attendant.last_name ? ' ' + attendant.last_name : ''}` : null)
        || 'atendente';
    }

    // 5. Formata o histórico como texto para o prompt
    const historyText = history
      .map(m => `${m.role === 'user' ? contactName : 'Atendente'}: ${m.content}`)
      .join('\n');

    // 6. Monta prompt especializado para retomada por SLA
    const systemPrompt = `Você é Júlia, assistente virtual da empresa.
Um atendente humano estava cuidando dessa conversa, mas ficou ausente por mais de 15 minutos.
Sua missão AGORA é:
1. Se apresentar de forma simpática e natural como assistente virtual
2. Informar que o ${attendantName} vai retornar em breve e você vai ajudar no que puder enquanto isso
3. Oferecer ajuda com o que o ${contactName} precisar no momento
4. Ser breve: no máximo 3 frases
5. NÃO revelar detalhes internos do sistema
6. Use linguagem natural e acolhedora, não robótica`;

    const userPrompt = `Histórico da conversa:
${historyText}

---
Envie agora a mensagem de intermediário para ${contactName}.`;

    // 7. Gera a mensagem
    const providers = buildProviderList({
      provider: aiConfig.provider,
      apiKey: aiConfig.apiKey,
      model: aiConfig.model,
      allKeys: aiConfig.allKeys,
    });

    const result = await generateWithFailover({
      providers,
      system: systemPrompt,
      prompt: userPrompt,
      maxRetries: 2,
    });

    const message = result.text.trim();
    if (!message) {
      return { success: false, conversationId, error: 'IA não gerou resposta' };
    }

    // 8. Reativa Julia no banco (despausa)
    const currentMeta = (conv?.metadata as Record<string, unknown>) || {};
    await supabase
      .from('messaging_conversations')
      .update({
        metadata: {
          ...currentMeta,
          ai_paused: false,
          sla_resumed_by_ai: true,
          sla_resumed_at: new Date().toISOString(),
          sla_attendant: attendantName,
        },
      })
      .eq('id', conversationId);

    // 9. Envia a mensagem via canal
    const sendResult = await sendAIResponse({ supabase, conversationId, response: message });
    if (!sendResult.success) {
      return { success: false, conversationId, error: sendResult.error?.message };
    }

    console.log(`[SLA-Resume] Julia assumiu conversa ${conversationId} após 15 min sem resposta`);
    return { success: true, conversationId, messageSent: message };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error(`[SLA-Resume] Erro na conversa ${conversationId}:`, msg);
    return { success: false, conversationId, error: msg };
  }
}
