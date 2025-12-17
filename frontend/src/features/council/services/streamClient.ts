/**
 * Council feature용 low-level SSE streaming client
 * Server-Sent Event를 위한 fetch + ReadableStream 처리
 */

"use client";

import type { SSEEvent, CouncilMode } from "../domain";

async function cleanupReader(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // ignore
  }
  try {
    reader.releaseLock();
  } catch {
    // ignore
  }
}

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)csrfToken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export class StreamError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly isAborted = false
  ) {
    super(message);
    this.name = "StreamError";
  }
}

/**
 * Text buffer에서 SSE event 파싱
 * @returns [파싱된 event, 남은 buffer] 튜플
 */
function parseSSEBuffer(buffer: string): [SSEEvent[], string] {
  const events: SSEEvent[] = [];
  const lines = buffer.split("\n\n");
  const remaining = lines.pop() || "";

  for (const line of lines) {
    if (!line.trim()) continue;

    const dataMatch = line.match(/^data:\s*(.+)$/m);
    if (dataMatch) {
      try {
        const event: SSEEvent = JSON.parse(dataMatch[1]);
        events.push(event);
      } catch (parseError) {
        console.error("Failed to parse SSE event:", parseError, dataMatch[1]);
      }
    }
  }

  return [events, remaining];
}

/**
 * fetch + ReadableStream을 사용하는 streaming SSE client
 * CSRF 보호를 위해 JSON body와 함께 POST method 지원
 */
export async function* streamSSE(
  url: string,
  body: { content: string; mode?: CouncilMode },
  signal?: AbortSignal
): AsyncGenerator<SSEEvent> {
  const csrfToken = getCsrfToken();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
    body: JSON.stringify(body),
    credentials: "include",
    signal,
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorBody = await response.json();
      if (errorBody?.error) {
        errorMessage = errorBody.error;
      }
    } catch {
      // 무시 - response body가 JSON이 아닐 수 있음
    }

    throw new StreamError(errorMessage, response.status);
  }

  if (!response.body) {
    throw new StreamError("No response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const [events, remaining] = parseSSEBuffer(buffer);
      buffer = remaining;

      for (const event of events) {
        yield event;

        // Error 또는 complete event 수신 시 처리 중단
        if (event.type === "error" || event.type === "complete") {
          return;
        }
      }
    }

    // Buffer에 남은 데이터 처리
    if (buffer.trim()) {
      const [events] = parseSSEBuffer(buffer + "\n\n");
      for (const event of events) {
        yield event;
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      throw new StreamError("Request aborted", undefined, true);
    }
    throw error;
  } finally {
    await cleanupReader(reader);
  }
}

/**
 * GET을 사용하는 재연결용 SSE client (진행 중인 처리에 재연결)
 */
export async function* reconnectSSE(
  url: string,
  signal?: AbortSignal
): AsyncGenerator<SSEEvent> {
  const csrfToken = getCsrfToken();

  const response = await fetch(url, {
    method: "GET",
    headers: {
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
    credentials: "include",
    signal,
  });

  if (!response.ok) {
    // Error response body 가능하면 파싱
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorBody = await response.json();
      if (errorBody.error) {
        errorMessage = errorBody.error;
      }
    } catch {
      // 기본 error 메시지 사용
    }
    throw new StreamError(errorMessage, response.status);
  }

  if (!response.body) {
    throw new StreamError("No response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const [events, remaining] = parseSSEBuffer(buffer);
      buffer = remaining;

      for (const event of events) {
        yield event;

        if (event.type === "error" || event.type === "complete") {
          return;
        }
      }
    }

    // Buffer에 남은 데이터 처리
    if (buffer.trim()) {
      const [events] = parseSSEBuffer(buffer + "\n\n");
      for (const event of events) {
        yield event;
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      throw new StreamError("Request aborted", undefined, true);
    }
    throw error;
  } finally {
    await cleanupReader(reader);
  }
}
