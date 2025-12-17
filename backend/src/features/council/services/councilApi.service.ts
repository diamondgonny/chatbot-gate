/**
 * Council API 서비스
 * 멀티 모델 오케스트레이션을 위한 Council 전용 OpenRouter API 함수
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
 * 여러 council 모델을 병렬로 쿼리
 * 개별 실패를 정상적으로 처리하며 성공한 응답 반환
 */
export const queryCouncilModels = async (
  messages: OpenRouterMessage[],
  mode: CouncilMode = 'lite',
  signal?: AbortSignal
): Promise<ModelResponse[]> => {
  // 이미 중단된 경우 즉시 빈 배열 반환
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
 * 최종 통합을 위해 chairman 모델 쿼리
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
    COUNCIL.STAGE3_TIMEOUT_MS  // Chairman은 5분 timeout
  );
  return {
    model: chairmanModel,
    content: result.content,
    responseTimeMs: result.responseTimeMs,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
  };
};

// 배칭 설정
const BATCH_INTERVAL_MS = 50;

/**
 * 스트리밍으로 여러 council 모델을 병렬로 쿼리
 * 도착하는 모든 모델의 청크를 효율성을 위해 배칭하여 yield
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
  // 모든 모델에 대한 스트림 초기화
  const streams: StreamState[] = models.map((model) => ({
    model,
    generator: chatCompletionStream(model, messages, COUNCIL.MAX_TOKENS, signal, timeoutMs),
    startTime: Date.now(),
    done: false,
    pendingChunks: [],
  }));

  // 스트림의 다음 청크에 대한 promise 생성 헬퍼
  const createPromiseForStream = (stream: StreamState): Promise<StreamPromiseResult> => {
    return stream.generator.next().then(
      (result) => ({ stream, result }),
      (error) => {
        console.error(`Stream error for ${stream.model}:`, error);
        return { stream, result: { done: true, value: undefined } as IteratorResult<StreamEvent, void> };
      }
    );
  };

  // 스트림별 대기 중인 promise 추적 (key = 모델 이름)
  const pendingPromises = new Map<string, Promise<StreamPromiseResult>>();

  // 모든 스트림에 대한 대기 중인 promise 초기화
  for (const stream of streams) {
    pendingPromises.set(stream.model, createPromiseForStream(stream));
  }

  let activeStreams = streams.length;
  let lastFlush = Date.now();

  // 배칭된 청크를 플러시하는 헬퍼
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

  // 모든 스트림을 동시에 처리
  while (activeStreams > 0) {
    if (signal?.aborted) return;

    // 모든 대기 중인 promise 가져오기
    const promiseArray = Array.from(pendingPromises.values());
    if (promiseArray.length === 0) break;

    // 어떤 스트림이든 yield할 때까지 대기
    const { stream, result } = await Promise.race(promiseArray);

    // 추적에서 해결된 promise 제거
    pendingPromises.delete(stream.model);

    if (result.done) {
      stream.done = true;
      activeStreams--;

      // 이 모델의 남은 청크 플러시
      if (stream.pendingChunks.length > 0) {
        yield { model: stream.model, delta: stream.pendingChunks.join('') };
        stream.pendingChunks = [];
      }

      // 완료 이벤트 yield
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
        // 청크 배칭
        stream.pendingChunks.push(event.delta);

        // 배치 간격 초과 시 플러시
        if (Date.now() - lastFlush >= BATCH_INTERVAL_MS) {
          yield* flushBatch();
        }
      } else if ('done' in event) {
        // 완료 이벤트를 위한 사용량 저장
        stream.promptTokens = event.promptTokens;
        stream.completionTokens = event.completionTokens;
      }

      // 방금 해결된 스트림에 대해서만 새 promise 생성
      pendingPromises.set(stream.model, createPromiseForStream(stream));
    }

    // 주기적으로 남은 배치 yield
    if (Date.now() - lastFlush >= BATCH_INTERVAL_MS) {
      yield* flushBatch();
    }
  }

  // 최종 플러시
  yield* flushBatch();
}

// Stage 3 (reasoning 포함 chairman)을 위한 chatCompletionStreamWithReasoning 재export
export { chatCompletionStreamWithReasoning } from '@shared';
