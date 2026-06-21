/**
 * @fileoverview Provider failover for AI model generation.
 *
 * Tries the primary provider first, then falls back to secondary/tertiary
 * providers if configured. Only retries on provider-level errors (auth,
 * rate limit, server errors), NOT on content/validation errors.
 */

import { generateText, type LanguageModel } from 'ai';
import { getModel, type AIProvider } from '../config';

export interface ProviderConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
}

interface GenerateWithFailoverParams {
  providers: ProviderConfig[];
  system: string;
  prompt: string;
  maxRetries?: number;
  temperature?: number;
}

interface GenerateWithFailoverResult {
  text: string;
  usage?: { totalTokens?: number };
  modelUsed: string;
  providerUsed: AIProvider;
}

/**
 * Try generating text with failover across multiple providers.
 *
 * @throws If ALL providers fail
 */
export async function generateWithFailover(
  params: GenerateWithFailoverParams
): Promise<GenerateWithFailoverResult> {
  const { providers, system, prompt, maxRetries = 2, temperature } = params;

  if (providers.length === 0) {
    throw new Error('No AI providers configured');
  }

  const errors: Array<{ provider: AIProvider; error: string }> = [];

  for (const config of providers) {
    try {
      const model: LanguageModel = getModel(
        config.provider,
        config.apiKey,
        config.model
      );

      const result = await generateText({
        model,
        system,
        prompt,
        maxRetries,
        ...(temperature !== undefined ? { temperature } : {}),
      });

      if (errors.length > 0) {
        console.warn(
          `[AIAgent] Failover: ${config.provider} succeeded after ${errors.length} failed provider(s):`,
          errors.map((e) => `${e.provider}: ${e.error}`)
        );
      }

      return {
        text: result.text,
        usage: result.usage
          ? { totalTokens: result.usage.totalTokens }
          : undefined,
        modelUsed: config.model,
        providerUsed: config.provider,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      // Log detalhado para ajudar no diagnóstico: inclui cause e status HTTP
      const cause = (error as { cause?: unknown })?.cause;
      const status = (error as { status?: number })?.status;
      console.error(
        `[AIAgent] Provider ${config.provider} (model: ${config.model || 'default'}) failed:`,
        errorMessage,
        cause ? `| cause: ${JSON.stringify(cause)}` : '',
        status ? `| status: ${status}` : ''
      );
      errors.push({ provider: config.provider, error: errorMessage });
    }
  }

  // All providers failed
  const summary = errors
    .map((e) => `${e.provider}: ${e.error}`)
    .join('; ');
  throw new Error(`All AI providers failed: ${summary}`);
}

// Mapa de env vars por provider (fallback quando chave do banco está errada)
const ENV_KEY_MAP: Record<AIProvider, string> = {
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

/**
 * Build an ordered list of provider configs from org settings.
 * Primary provider first, then env var fallback for same provider, then others with API keys.
 */
export function buildProviderList(orgConfig: {
  provider: AIProvider;
  apiKey: string;
  model: string;
  allKeys: Record<AIProvider, string | null>;
}): ProviderConfig[] {
  const { provider: primary, apiKey, model, allKeys } = orgConfig;
  const providers: ProviderConfig[] = [];

  // Primary always first (chave do banco)
  if (apiKey) {
    providers.push({ provider: primary, apiKey, model });
  }

  // Fallback: env var do provider primário (caso chave do banco esteja errada)
  const envKey = typeof process !== 'undefined' ? process.env[ENV_KEY_MAP[primary]] : undefined;
  if (envKey && envKey !== apiKey) {
    providers.push({ provider: primary, apiKey: envKey, model });
  }

  // Add others that have keys (in a fixed fallback order)
  const fallbackOrder: AIProvider[] = ['google', 'openai', 'anthropic'];

  for (const p of fallbackOrder) {
    if (p === primary) continue;
    const key = allKeys[p];
    if (key) {
      providers.push({ provider: p, apiKey: key, model: '' }); // empty model = use default
    }
  }

  return providers;
}
