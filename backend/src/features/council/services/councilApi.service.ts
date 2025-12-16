/**
 * Council API Service
 * Council-specific OpenRouter API functions for multi-model orchestration.
 */

import {
  COUNCIL,
  CouncilMode,
  getModelsForMode,
  getChairmanForMode,
  OpenRouterMessage,
  chatCompletion,
  chatCompletionStream,
  chatCompletionStreamWithReasoning,
  StreamEvent,
} from '@shared';

export interface ModelResponse {
  model: string;
  content: string;
  responseTimeMs: number;
  promptTokens?: number;
  completionTokens?: number;
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

/**
 * Query multiple council models in parallel
 * Returns successful responses, gracefully handling individual failures
 */
export const queryCouncilModels = async (
  messages: OpenRouterMessage[],
  mode: CouncilMode = 'lite',
  signal?: AbortSignal
): Promise<ModelResponse[]> => {
  // If already aborted, return empty array immediately
  if (signal?.aborted) {
    return [];
  }

  const models = getModelsForMode(mode);
  const results = await Promise.allSettled(
    models.map(async (model) => {
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
      failedModels.push(models[index]);
      console.error(`Council model ${models[index]} failed:`, result.reason);
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
  mode: CouncilMode = 'lite',
  signal?: AbortSignal
): Promise<ModelResponse> => {
  const chairmanModel = getChairmanForMode(mode);
  const result = await chatCompletion(
    chairmanModel,
    messages,
    COUNCIL.CHAIRMAN_MAX_TOKENS,
    signal,
    COUNCIL.STAGE3_TIMEOUT_MS  // Chairman gets 5 min timeout
  );
  return {
    model: chairmanModel,
    content: result.content,
    responseTimeMs: result.responseTimeMs,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
  };
};

// Batching configuration
const BATCH_INTERVAL_MS = 50;

/**
 * Query multiple council models in parallel with streaming
 * Yields chunks from all models as they arrive (batched for efficiency)
 */
export async function* queryCouncilModelsStreaming(
  messages: OpenRouterMessage[],
  mode: CouncilMode = 'lite',
  signal?: AbortSignal,
  timeoutMs?: number
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

  const models = getModelsForMode(mode);
  // Initialize streams for all models
  const streams: StreamState[] = models.map((model) => ({
    model,
    generator: chatCompletionStream(model, messages, COUNCIL.MAX_TOKENS, signal, timeoutMs),
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

// Re-export chatCompletionStreamWithReasoning for Stage 3 (chairman with reasoning)
export { chatCompletionStreamWithReasoning } from '@shared';
