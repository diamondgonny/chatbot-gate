/**
 * SSE Stream Parser
 * Parses Server-Sent Events from a Response body with buffering and [DONE] termination handling.
 *
 * Responsibilities:
 * - Read chunks from Response body
 * - Buffer incomplete lines across chunks
 * - Parse SSE protocol (data: prefix, [DONE] termination)
 * - Yield raw JSON strings (caller handles business logic)
 */

/**
 * Parse SSE stream from a Response and yield raw JSON strings.
 * Handles buffering, line splitting, and SSE protocol parsing.
 *
 * @param response - Fetch Response with body stream
 * @yields Raw JSON strings from SSE data lines (without 'data: ' prefix)
 * @throws Error if response body is null
 *
 * @example
 * for await (const jsonStr of parseSSEStream(response)) {
 *   const data = JSON.parse(jsonStr);
 *   // Handle parsed data...
 * }
 */
export async function* parseSSEStream(response: Response): AsyncGenerator<string> {
  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split by newlines, keeping incomplete line in buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines and [DONE] marker
        if (!trimmed || trimmed === 'data: [DONE]') continue;

        // Yield data content (strip 'data: ' prefix)
        if (trimmed.startsWith('data: ')) {
          yield trimmed.slice(6);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
