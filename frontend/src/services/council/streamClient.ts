/**
 * Low-level SSE streaming client for Council feature
 * Handles fetch + ReadableStream for Server-Sent Events
 */

"use client";

import type { SSEEvent } from "@/types";

/**
 * Get CSRF token from cookie
 */
function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)csrfToken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Error class for streaming failures
 */
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
 * Parse SSE events from a text buffer
 * @returns Tuple of [parsedEvents, remainingBuffer]
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
 * Streaming SSE client using fetch + ReadableStream
 * Supports POST method with JSON body for CSRF protection
 */
export async function* streamSSE(
  url: string,
  body: { content: string },
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
    throw new StreamError(
      `HTTP ${response.status}: ${response.statusText}`,
      response.status
    );
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

        // If we received an error or complete event, stop processing
        if (event.type === "error" || event.type === "complete") {
          return;
        }
      }
    }

    // Process any remaining data in buffer
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
    reader.cancel();
  }
}

/**
 * Reconnect SSE client using GET (for reconnecting to existing processing)
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
    // Parse error response body if available
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorBody = await response.json();
      if (errorBody.error) {
        errorMessage = errorBody.error;
      }
    } catch {
      // Use default error message
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

    // Process any remaining data in buffer
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
    reader.cancel();
  }
}
