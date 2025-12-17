/**
 * SSE Stream Parser
 * Response body에서 Server-Sent Events를 파싱하며 버퍼링 및 [DONE] 종료 처리 지원
 *
 * 책임:
 * - Response body에서 청크 읽기
 * - 청크 간 불완전한 라인을 버퍼링
 * - SSE 프로토콜 파싱 (data: 접두사, [DONE] 종료)
 * - raw JSON 문자열 yield (호출자가 비즈니스 로직 처리)
 */

/**
 * Response에서 SSE 스트림을 파싱하여 raw JSON 문자열 yield
 * 버퍼링, 라인 분할 및 SSE 프로토콜 파싱 처리
 *
 * @param response - body 스트림이 있는 Fetch Response
 * @yields SSE data 라인의 raw JSON 문자열 ('data: ' 접두사 제외)
 * @throws response body가 null인 경우 에러
 *
 * @example
 * for await (const jsonStr of parseSSEStream(response)) {
 *   const data = JSON.parse(jsonStr);
 *   // 파싱된 데이터 처리...
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

      // 개행으로 분할하고 불완전한 라인은 buffer에 보관
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();

        // 빈 라인과 [DONE] 마커 건너뛰기
        if (!trimmed || trimmed === 'data: [DONE]') continue;

        // data 내용 yield ('data: ' 접두사 제거)
        if (trimmed.startsWith('data: ')) {
          yield trimmed.slice(6);
        }
      }
    }
  } finally {
    // 대기 중인 읽기를 취소하고 lock 해제
    // 조기 종료 시 기본 연결이 올바르게 닫히도록 보장
    await reader.cancel();
    reader.releaseLock();
  }
}
