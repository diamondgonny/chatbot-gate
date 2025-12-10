/**
 * OpenRouter Service
 * Handles communication with OpenRouter API for multi-LLM council feature.
 */

import { config } from '../config';
import { COUNCIL } from '../constants';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Retry configuration
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1000;

/**
 * Sleep utility for backoff
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Check if an error is retryable (transient network/server issues)
 */
const isRetryableError = (error: Error, status?: number): boolean => {
  // Network errors (socket hangup, ECONNRESET, etc.)
  const networkErrors = ['socket', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN'];
  if (networkErrors.some((e) => error.message.includes(e))) return true;
  // Timeout
  if (error.name === 'AbortError') return true;
  // 5xx server errors
  if (status && status >= 500) return true;
  return false;
};

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
 * Send a chat completion request to OpenRouter with retry logic
 */
export const chatCompletion = async (
  model: string,
  messages: OpenRouterMessage[],
  maxTokens: number = COUNCIL.MAX_TOKENS
): Promise<{ content: string; responseTimeMs: number; promptTokens?: number; completionTokens?: number }> => {
  const startTime = Date.now();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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
        const error = new Error(`OpenRouter API error: ${response.status} - ${errorText}`);

        // Retry on 5xx errors
        if (response.status >= 500 && attempt < MAX_RETRIES) {
          console.warn(`[Retry ${attempt + 1}/${MAX_RETRIES}] ${model}: ${response.status} error, retrying...`);
          const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          await sleep(backoff);
          lastError = error;
          continue;
        }
        throw error;
      }

      const data: OpenRouterResponse = await response.json();
      const responseTimeMs = Date.now() - startTime;

      if (attempt > 0) {
        console.log(`[Retry success] ${model}: succeeded after ${attempt} retries`);
      }

      return {
        content: data.choices[0]?.message?.content || '',
        responseTimeMs,
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (!(error instanceof Error)) {
        throw error;
      }

      lastError = error;

      // Check if we should retry
      if (attempt < MAX_RETRIES && isRetryableError(error)) {
        console.warn(`[Retry ${attempt + 1}/${MAX_RETRIES}] ${model}: ${error.message}, retrying...`);
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await sleep(backoff);
        continue;
      }

      // Final failure - throw with context
      if (error.name === 'AbortError') {
        throw new Error(`OpenRouter API timeout for model ${model} after ${attempt + 1} attempts`);
      }
      throw error;
    }
  }

  // Should not reach here, but TypeScript needs this
  throw lastError || new Error(`OpenRouter API failed for model ${model}`);
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
