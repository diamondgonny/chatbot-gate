/**
 * Abort 지원 fetch
 *
 * 타임아웃 및 외부 abort 시그널 처리:
 * - 타임아웃이 있는 AbortController 생성
 * - 외부 abort 시그널 연결 (부모 컨텍스트의 중단 요청 전파)
 * - cleanup 함수로 리소스 정리 (타이머, 이벤트 리스너)
 */

export interface FetchWithAbortOptions {
  /** 타임아웃 (밀리초) */
  timeoutMs: number;
  /** 외부 abort 시그널 */
  externalSignal?: AbortSignal;
}

export interface FetchWithAbortResult {
  /** fetch 응답 */
  response: Response;
  /** 타임아웃 및 이벤트 리스너 정리 함수 */
  cleanup: () => void;
}

/**
 * 타임아웃 및 외부 abort 시그널을 지원하는 fetch 실행
 *
 * @param url - 요청 URL
 * @param init - Fetch RequestInit 옵션 (헤더, body 등)
 * @param options - 타임아웃 및 외부 시그널 옵션
 * @returns 응답 및 cleanup 함수
 * @throws 요청이 중단되거나 타임아웃된 경우 에러
 *
 * @example
 * const { response, cleanup } = await fetchWithAbort(url, init, { timeoutMs: 30000 });
 * try {
 *   // 응답 처리...
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

  // 외부 abort를 내부 controller로 전달
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
