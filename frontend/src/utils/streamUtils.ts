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
 * Streaming SSE client using fetch + ReadableStream
 * Supports POST method with JSON body for CSRF protection
 *
 * This architecture supports future expansion for character-by-character streaming
 * by yielding chunk events (stage1_chunk, stage2_chunk, stage3_chunk) when implemented
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

      // Parse SSE events from buffer
      // SSE format: "data: {...}\n\n"
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || ""; // Keep incomplete data in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        // Extract data from "data: {...}" format
        const dataMatch = line.match(/^data:\s*(.+)$/m);
        if (dataMatch) {
          try {
            const event: SSEEvent = JSON.parse(dataMatch[1]);
            yield event;

            // If we received an error or complete event, stop processing
            if (event.type === "error" || event.type === "complete") {
              return;
            }
          } catch (parseError) {
            console.error("Failed to parse SSE event:", parseError, dataMatch[1]);
          }
        }
      }
    }

    // Process any remaining data in buffer
    if (buffer.trim()) {
      const dataMatch = buffer.match(/^data:\s*(.+)$/m);
      if (dataMatch) {
        try {
          const event: SSEEvent = JSON.parse(dataMatch[1]);
          yield event;
        } catch {
          // Ignore parse errors for final incomplete data
        }
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      throw new StreamError("Request aborted", undefined, true);
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Build the council message URL
 */
export function getCouncilMessageUrl(sessionId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  return `${baseUrl}/api/council/sessions/${sessionId}/message`;
}
