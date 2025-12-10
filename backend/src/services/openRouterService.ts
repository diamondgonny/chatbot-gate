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

/**
 * Query multiple council models in parallel
 * Returns successful responses, gracefully handling individual failures
 */
export const queryCouncilModels = async (
  messages: OpenRouterMessage[],
  signal?: AbortSignal
): Promise<ModelResponse[]> => {
  // If already aborted, return empty array immediately
  if (signal?.aborted) {
    return [];
  }

  const results = await Promise.allSettled(
    COUNCIL.MODELS.map(async (model) => {
      const result = await chatCompletion(model, messages, COUNCIL.MAX_TOKENS, signal);
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
  messages: OpenRouterMessage[],
  signal?: AbortSignal
): Promise<ModelResponse> => {
  const result = await chatCompletion(
    COUNCIL.CHAIRMAN_MODEL,
    messages,
    COUNCIL.CHAIRMAN_MAX_TOKENS,
    signal
  );
  return {
    model: COUNCIL.CHAIRMAN_MODEL,
    content: result.content,
    responseTimeMs: result.responseTimeMs,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
  };
};

// ============================================================================
// Streaming API
// ============================================================================

export interface StreamChunk {
  delta: string;
}

export interface StreamComplete {
  done: true;
  promptTokens?: number;
  completionTokens?: number;
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
  // Check if already aborted before starting
  if (externalSignal?.aborted) {
    throw new Error(`Request aborted for model ${model}`);
  }

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
        stream: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6));

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
      }
    }

    // Yield completion event
    yield { done: true, promptTokens, completionTokens };
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abortHandler);
  }
}

export interface ModelStreamChunk {
  model: string;
  delta: string;
}

export interface ModelStreamComplete {
  model: string;
  done: true;
  responseTimeMs: number;
  promptTokens?: number;
  completionTokens?: number;
}

export type ModelStreamEvent = ModelStreamChunk | ModelStreamComplete;

// Batching configuration
const BATCH_INTERVAL_MS = 50;

/**
 * Query multiple council models in parallel with streaming
 * Yields chunks from all models as they arrive (batched for efficiency)
 */
export async function* queryCouncilModelsStreaming(
  messages: OpenRouterMessage[],
  signal?: AbortSignal
): AsyncGenerator<ModelStreamEvent> {
  if (signal?.aborted) return;

  interface StreamState {
    model: string;
    generator: AsyncGenerator<StreamEvent>;
    startTime: number;
    done: boolean;
    pendingChunks: string[];
    promptTokens?: number;
    completionTokens?: number;
  }

  type StreamPromiseResult = { stream: StreamState; result: IteratorResult<StreamEvent, void> };

  // Initialize streams for all models
  const streams: StreamState[] = COUNCIL.MODELS.map((model) => ({
    model,
    generator: chatCompletionStream(model, messages, COUNCIL.MAX_TOKENS, signal),
    startTime: Date.now(),
    done: false,
    pendingChunks: [],
  }));

  // Helper to create a promise for a stream's next chunk
  const createPromiseForStream = (stream: StreamState): Promise<StreamPromiseResult> => {
    return stream.generator.next().then(
      (result) => ({ stream, result }),
      (error) => {
        console.error(`Stream error for ${stream.model}:`, error);
        return { stream, result: { done: true, value: undefined } as IteratorResult<StreamEvent, void> };
      }
    );
  };

  // Track pending promises per stream (key = model name)
  const pendingPromises = new Map<string, Promise<StreamPromiseResult>>();

  // Initialize pending promises for all streams
  for (const stream of streams) {
    pendingPromises.set(stream.model, createPromiseForStream(stream));
  }

  let activeStreams = streams.length;
  let lastFlush = Date.now();

  // Helper to flush batched chunks
  const flushBatch = function* (): Generator<ModelStreamEvent> {
    for (const stream of streams) {
      if (stream.pendingChunks.length > 0) {
        const combined = stream.pendingChunks.join('');
        stream.pendingChunks = [];
        yield { model: stream.model, delta: combined };
      }
    }
    lastFlush = Date.now();
  };

  // Process all streams concurrently
  while (activeStreams > 0) {
    if (signal?.aborted) return;

    // Get all pending promises
    const promiseArray = Array.from(pendingPromises.values());
    if (promiseArray.length === 0) break;

    // Wait for any stream to yield
    const { stream, result } = await Promise.race(promiseArray);

    // Remove the resolved promise from tracking
    pendingPromises.delete(stream.model);

    if (result.done) {
      stream.done = true;
      activeStreams--;

      // Flush any remaining chunks for this model
      if (stream.pendingChunks.length > 0) {
        yield { model: stream.model, delta: stream.pendingChunks.join('') };
        stream.pendingChunks = [];
      }

      // Yield completion event
      yield {
        model: stream.model,
        done: true,
        responseTimeMs: Date.now() - stream.startTime,
        promptTokens: stream.promptTokens,
        completionTokens: stream.completionTokens,
      };
    } else if (result.value) {
      const event = result.value;

      if ('delta' in event) {
        // Batch chunks
        stream.pendingChunks.push(event.delta);

        // Flush if batch interval exceeded
        if (Date.now() - lastFlush >= BATCH_INTERVAL_MS) {
          yield* flushBatch();
        }
      } else if ('done' in event) {
        // Store usage for completion event
        stream.promptTokens = event.promptTokens;
        stream.completionTokens = event.completionTokens;
      }

      // Create a new promise ONLY for the stream that just resolved
      pendingPromises.set(stream.model, createPromiseForStream(stream));
    }

    // Yield remaining batches periodically
    if (Date.now() - lastFlush >= BATCH_INTERVAL_MS) {
      yield* flushBatch();
    }
  }

  // Final flush
  yield* flushBatch();
}
