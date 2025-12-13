/**
 * Fetch with Abort Support
 * Provides timeout and external abort signal handling for fetch requests.
 *
 * Responsibilities:
 * - Create AbortController with timeout
 * - Listen to external abort signals
 * - Provide cleanup function for resource management
 */

export interface FetchWithAbortOptions {
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** External abort signal to listen to */
  externalSignal?: AbortSignal;
}

export interface FetchWithAbortResult {
  /** The fetch Response */
  response: Response;
  /** Cleanup function to clear timeout and remove event listeners */
  cleanup: () => void;
}

/**
 * Execute a fetch request with timeout and external abort signal support.
 *
 * @param url - Request URL
 * @param init - Fetch RequestInit options (headers, body, etc.)
 * @param options - Timeout and external signal options
 * @returns Response and cleanup function
 * @throws Error if request is aborted or times out
 *
 * @example
 * const { response, cleanup } = await fetchWithAbort(url, init, { timeoutMs: 30000 });
 * try {
 *   // Process response...
 * } finally {
 *   cleanup();
 * }
 */
export async function fetchWithAbort(
  url: string,
  init: RequestInit,
  options: FetchWithAbortOptions
): Promise<FetchWithAbortResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

  // Forward external abort to our controller
  const abortHandler = () => controller.abort();
  options.externalSignal?.addEventListener('abort', abortHandler);

  const cleanup = () => {
    clearTimeout(timeoutId);
    options.externalSignal?.removeEventListener('abort', abortHandler);
  };

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return { response, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}
