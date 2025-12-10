/**
 * OpenRouter Service
 * Handles communication with OpenRouter API for multi-LLM council feature.
 */

import { config } from '../config';
import { COUNCIL } from '../constants';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export interface ModelResponse {
  model: string;
  content: string;
  responseTimeMs: number;
  promptTokens?: number;
  completionTokens?: number;
}

/**
 * Check if OpenRouter API key is configured
 */
export const isOpenRouterConfigured = (): boolean => {
  return !!config.openRouterApiKey;
};

/**
 * Send a chat completion request to OpenRouter
 */
export const chatCompletion = async (
  model: string,
  messages: OpenRouterMessage[],
  maxTokens: number = COUNCIL.MAX_TOKENS
): Promise<{ content: string; responseTimeMs: number; promptTokens?: number; completionTokens?: number }> => {
  const startTime = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), COUNCIL.API_TIMEOUT_MS);

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://chatbotgate.click',
        'X-Title': 'Chatbot Gate Council',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const data: OpenRouterResponse = await response.json();
    const responseTimeMs = Date.now() - startTime;

    return {
      content: data.choices[0]?.message?.content || '',
      responseTimeMs,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`OpenRouter API timeout for model ${model}`);
    }
    throw error;
  }
};

/**
 * Query multiple council models in parallel
 * Returns successful responses, gracefully handling individual failures
 */
export const queryCouncilModels = async (
  messages: OpenRouterMessage[]
): Promise<ModelResponse[]> => {
  const results = await Promise.allSettled(
    COUNCIL.MODELS.map(async (model) => {
      const result = await chatCompletion(model, messages);
      return {
        model,
        content: result.content,
        responseTimeMs: result.responseTimeMs,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
      };
    })
  );

  const successfulResponses: ModelResponse[] = [];
  const failedModels: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successfulResponses.push(result.value);
    } else {
      failedModels.push(COUNCIL.MODELS[index]);
      console.error(`Council model ${COUNCIL.MODELS[index]} failed:`, result.reason);
    }
  });

  if (failedModels.length > 0) {
    console.warn(`${failedModels.length} council models failed: ${failedModels.join(', ')}`);
  }

  return successfulResponses;
};

/**
 * Query the chairman model for final synthesis
 */
export const queryChairman = async (
  messages: OpenRouterMessage[]
): Promise<ModelResponse> => {
  const result = await chatCompletion(
    COUNCIL.CHAIRMAN_MODEL,
    messages,
    COUNCIL.CHAIRMAN_MAX_TOKENS
  );
  return {
    model: COUNCIL.CHAIRMAN_MODEL,
    content: result.content,
    responseTimeMs: result.responseTimeMs,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
  };
};
