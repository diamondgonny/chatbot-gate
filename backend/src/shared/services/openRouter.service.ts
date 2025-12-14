/**
 * OpenRouter Service
 * Generic OpenRouter API client with streaming support.
 */

import { config } from '../config';
import { COUNCIL } from '../constants';
import { parseSSEStream } from './sseParser';
import { fetchWithAbort } from './fetchWithAbort';

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
  maxTokens: number = COUNCIL.MAX_TOKENS,
  externalSignal?: AbortSignal
): Promise<{ content: string; responseTimeMs: number; promptTokens?: number; completionTokens?: number }> => {
  const startTime = Date.now();
  let lastError: Error | null = null;

  // Check if already aborted before starting
  if (externalSignal?.aborted) {
    throw new Error(`Request aborted for model ${model}`);
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), COUNCIL.API_TIMEOUT_MS);

    // Listen to external abort signal
    const abortHandler = () => controller.abort();
    externalSignal?.addEventListener('abort', abortHandler);

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
          // Cleanup listener before retry to prevent accumulation
          externalSignal?.removeEventListener('abort', abortHandler);

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

      // Cleanup before returning
      externalSignal?.removeEventListener('abort', abortHandler);

      return {
        content: data.choices[0]?.message?.content || '',
        responseTimeMs,
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', abortHandler);

      if (!(error instanceof Error)) {
        throw error;
      }

      // If externally aborted, don't retry - throw immediately
      if (externalSignal?.aborted) {
        throw new Error(`Request aborted for model ${model}`);
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

// ============================================================================
// Streaming API
// ============================================================================

export interface StreamChunk {
  delta: string;
  reasoning?: string;
}

export interface StreamComplete {
  done: true;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
}

export type StreamEvent = StreamChunk | StreamComplete;

/**
 * Send a streaming chat completion request to OpenRouter
 * Yields delta chunks as they arrive, then a completion event with usage stats
 */
export async function* chatCompletionStream(
  model: string,
  messages: OpenRouterMessage[],
  maxTokens: number = COUNCIL.MAX_TOKENS,
  externalSignal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  if (externalSignal?.aborted) {
    throw new Error(`Request aborted for model ${model}`);
  }

  const { response, cleanup } = await fetchWithAbort(
    `${OPENROUTER_BASE_URL}/chat/completions`,
    {
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
        stream: true,
      }),
    },
    { timeoutMs: COUNCIL.API_TIMEOUT_MS, externalSignal }
  );

  try {
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    let promptTokens: number | undefined;
    let completionTokens: number | undefined;

    for await (const jsonStr of parseSSEStream(response)) {
      try {
        const data = JSON.parse(jsonStr);

        // Extract delta content
        const content = data.choices?.[0]?.delta?.content;
        if (content) {
          yield { delta: content };
        }

        // Extract usage (usually in the last chunk)
        if (data.usage) {
          promptTokens = data.usage.prompt_tokens;
          completionTokens = data.usage.completion_tokens;
        }
      } catch {
        // Ignore parse errors for malformed chunks
      }
    }

    yield { done: true, promptTokens, completionTokens };
  } finally {
    cleanup();
  }
}

/**
 * Send a streaming chat completion request with reasoning enabled (for Stage 3)
 * Yields delta chunks with both content and reasoning as they arrive
 */
export async function* chatCompletionStreamWithReasoning(
  model: string,
  messages: OpenRouterMessage[],
  maxTokens: number = COUNCIL.MAX_TOKENS,
  externalSignal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  if (externalSignal?.aborted) {
    throw new Error(`Request aborted for model ${model}`);
  }

  const { response, cleanup } = await fetchWithAbort(
    `${OPENROUTER_BASE_URL}/chat/completions`,
    {
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
        stream: true,
        reasoning: { enabled: true },
      }),
    },
    { timeoutMs: COUNCIL.API_TIMEOUT_MS, externalSignal }
  );

  try {
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    let promptTokens: number | undefined;
    let completionTokens: number | undefined;
    let reasoningTokens: number | undefined;

    for await (const jsonStr of parseSSEStream(response)) {
      try {
        const data = JSON.parse(jsonStr);

        // Extract delta content and reasoning
        const delta = data.choices?.[0]?.delta;
        const content = delta?.content;
        const reasoning = delta?.reasoning;

        if (content || reasoning) {
          yield { delta: content || '', reasoning };
        }

        // Extract usage (usually in the last chunk)
        if (data.usage) {
          promptTokens = data.usage.prompt_tokens;
          completionTokens = data.usage.completion_tokens;
          reasoningTokens = data.usage.completion_tokens_details?.reasoning_tokens;
        }
      } catch {
        // Ignore parse errors for malformed chunks
      }
    }

    yield { done: true, promptTokens, completionTokens, reasoningTokens };
  } finally {
    cleanup();
  }
}
