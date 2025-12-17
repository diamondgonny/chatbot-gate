/**
 * OpenRouter Service
 * 스트리밍 지원을 포함한 범용 OpenRouter API 클라이언트
 */

import { config } from '../config';
import { COUNCIL } from '../constants';
import { parseSSEStream } from './sseParser';
import { fetchWithAbort } from './fetchWithAbort';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Retry 설정
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1000;

/**
 * Backoff를 위한 sleep 유틸리티
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 에러가 재시도 가능한지 확인 (일시적인 네트워크/서버 문제)
 */
const isRetryableError = (error: Error, status?: number): boolean => {
  const networkErrors = ['socket', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN'];
  if (networkErrors.some((e) => error.message.includes(e))) return true;
  if (error.name === 'AbortError') return true;
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
 * OpenRouter API 키가 설정되어 있는지 확인
 */
export const isOpenRouterConfigured = (): boolean => {
  return !!config.openRouterApiKey;
};

/**
 * retry 로직을 포함한 OpenRouter로 chat completion 요청 전송
 */
export const chatCompletion = async (
  model: string,
  messages: OpenRouterMessage[],
  maxTokens: number = COUNCIL.MAX_TOKENS,
  externalSignal?: AbortSignal,
  timeoutMs: number = COUNCIL.STAGE1_TIMEOUT_MS
): Promise<{ content: string; responseTimeMs: number; promptTokens?: number; completionTokens?: number }> => {
  const startTime = Date.now();
  let lastError: Error | null = null;

  // 시작 전에 이미 중단되었는지 확인
  if (externalSignal?.aborted) {
    throw new Error(`Request aborted for model ${model}`);
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // 외부 abort 시그널 리스닝
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

        // 5xx 에러 시 재시도
        if (response.status >= 500 && attempt < MAX_RETRIES) {
          // 재시도 전 리스너 정리하여 누적 방지
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

      // 반환 전 정리
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

      // 외부에서 중단된 경우, 재시도하지 않고 즉시 throw
      if (externalSignal?.aborted) {
        throw new Error(`Request aborted for model ${model}`);
      }

      lastError = error;

      // 재시도 여부 확인
      if (attempt < MAX_RETRIES && isRetryableError(error)) {
        console.warn(`[Retry ${attempt + 1}/${MAX_RETRIES}] ${model}: ${error.message}, retrying...`);
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await sleep(backoff);
        continue;
      }

      // 최종 실패 - 컨텍스트와 함께 throw
      if (error.name === 'AbortError') {
        throw new Error(`OpenRouter API timeout for model ${model} after ${attempt + 1} attempts`);
      }
      throw error;
    }
  }

  // 여기에 도달하면 안 되지만, TypeScript를 위해 필요
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
 * OpenRouter로 스트리밍 chat completion 요청 전송
 * Delta 청크를 도착하는 대로 yield하고, 마지막에 사용량 통계와 함께 completion 이벤트 yield
 */
export async function* chatCompletionStream(
  model: string,
  messages: OpenRouterMessage[],
  maxTokens: number = COUNCIL.MAX_TOKENS,
  externalSignal?: AbortSignal,
  timeoutMs: number = COUNCIL.STAGE1_TIMEOUT_MS
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
    { timeoutMs, externalSignal }
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

        // Delta content 추출
        const content = data.choices?.[0]?.delta?.content;
        if (content) {
          yield { delta: content };
        }

        // Usage 추출 (보통 마지막 청크에 포함)
        if (data.usage) {
          promptTokens = data.usage.prompt_tokens;
          completionTokens = data.usage.completion_tokens;
        }
      } catch {
        // 잘못된 청크의 파싱 에러 무시
      }
    }

    yield { done: true, promptTokens, completionTokens };
  } finally {
    cleanup();
  }
}

/**
 * Reasoning 활성화와 함께 스트리밍 chat completion 요청 전송 (Stage 3용)
 * Content와 reasoning을 모두 포함한 delta 청크를 도착하는 대로 yield
 */
export async function* chatCompletionStreamWithReasoning(
  model: string,
  messages: OpenRouterMessage[],
  maxTokens: number = COUNCIL.MAX_TOKENS,
  externalSignal?: AbortSignal,
  timeoutMs: number = COUNCIL.STAGE3_TIMEOUT_MS
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
    { timeoutMs, externalSignal }
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

        // Delta content 및 reasoning 추출
        const delta = data.choices?.[0]?.delta;
        const content = delta?.content;
        const reasoning = delta?.reasoning;

        if (content || reasoning) {
          yield { delta: content || '', reasoning };
        }

        // Usage 추출 (보통 마지막 청크에 포함)
        if (data.usage) {
          promptTokens = data.usage.prompt_tokens;
          completionTokens = data.usage.completion_tokens;
          reasoningTokens = data.usage.completion_tokens_details?.reasoning_tokens;
        }
      } catch {
        // 잘못된 청크의 파싱 에러 무시
      }
    }

    yield { done: true, promptTokens, completionTokens, reasoningTokens };
  } finally {
    cleanup();
  }
}
