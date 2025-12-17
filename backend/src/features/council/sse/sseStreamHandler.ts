/**
 * SSE 스트림 핸들러
 * SSE 응답 설정, 이벤트 스트리밍, 클라이언트 라이프사이클 관리
 */

import { Response } from 'express';
import type { SSEEvent, CouncilMode } from '@shared';
import { COUNCIL } from '@shared';
import { processingRegistry } from './index';
import * as councilService from '../services';

export interface StreamCouncilMessageOptions {
  userId: string;
  sessionId: string;
  content: string;
  mode: CouncilMode;
}

/** SSE 응답 헤더 설정 */
export const setupSSEHeaders = (res: Response): void => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx 버퍼링 비활성화
  res.flushHeaders();
};

/** SSE를 통한 Council 메시지 처리 스트리밍 - 전체 SSE 라이프사이클 캡슐화 */
export const streamCouncilMessage = async (
  res: Response,
  options: StreamCouncilMessageOptions
): Promise<void> => {
  const { userId, sessionId, content, mode } = options;

  setupSSEHeaders(res);

  const abortController = new AbortController();

  // 제목 생성 즉시 브로드캐스트 콜백
  const onTitleGenerated = (title: string) => {
    const titleEvent = { type: 'title_complete' as const, data: { title } };
    processingRegistry.recordEvent(userId, sessionId, titleEvent);
    processingRegistry.broadcast(userId, sessionId, titleEvent);
  };

  const generator = councilService.processCouncilMessage(
    userId,
    sessionId,
    content,
    mode,
    abortController.signal,
    onTitleGenerated
  );

  processingRegistry.register(
    userId,
    sessionId,
    content,
    generator,
    abortController
  );
  processingRegistry.addClient(userId, sessionId, res);

  // 클라이언트 연결 끊김 감지 - grace period가 정리 처리 (재연결 허용)
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log(`[Council] Client disconnected for session ${sessionId}`);
      processingRegistry.removeClient(userId, sessionId, res);
      // Grace period (30초) 내에 재연결 없으면 abort
    }
  });

  try {
    await consumeEventGenerator(generator, abortController, userId, sessionId);
  } catch (error) {
    handleStreamError(error, abortController, userId, sessionId);
  } finally {
    // 이 클라이언트 연결 종료
    if (!res.writableEnded) {
      res.end();
    }
  }
};

/**
 * Generator에서 이벤트 소비 및 클라이언트로 브로드캐스트
 * 장시간 작업 중 SSE 연결 유지를 위한 heartbeat 메커니즘 포함
 */
const consumeEventGenerator = async (
  generator: AsyncGenerator<SSEEvent>,
  abortController: AbortController,
  userId: string,
  sessionId: string
): Promise<void> => {
  // Heartbeat 인터벌 시작 (연결 유지)
  // 프록시/터널 타임아웃 방지 (예: Cloudflare ~100초 idle 타임아웃)
  const heartbeatInterval = setInterval(() => {
    if (!abortController.signal.aborted) {
      const heartbeatEvent: SSEEvent = { type: 'heartbeat', timestamp: Date.now() };
      // heartbeat는 이벤트 히스토리에 기록하지 않음 (재생 불필요)
      processingRegistry.broadcast(userId, sessionId, heartbeatEvent);
    }
  }, COUNCIL.SSE.HEARTBEAT_INTERVAL_MS);
  heartbeatInterval.unref();  // 프로세스 종료 차단 방지

  try {
    for await (const event of generator) {
      if (abortController.signal.aborted) {
        break;
      }

      // 재연결 시 재생을 위해 이벤트 기록
      processingRegistry.recordEvent(userId, sessionId, event);

      // 연결된 모든 클라이언트로 브로드캐스트
      processingRegistry.broadcast(userId, sessionId, event);

      // 최종 이벤트에서 완료 표시
      if (event.type === 'complete' || event.type === 'error') {
        processingRegistry.complete(userId, sessionId, abortController);
        break;
      }
    }
  } finally {
    clearInterval(heartbeatInterval);
  }
};

/** 스트리밍 에러 처리 */
const handleStreamError = (
  error: unknown,
  abortController: AbortController,
  userId: string,
  sessionId: string
): void => {
  // AbortError 무시 - 클라이언트 연결 끊김 시 예상되는 에러
  if (error instanceof Error && error.name === 'AbortError') {
    console.log(`[Council] Processing aborted for session ${sessionId}`);
    processingRegistry.complete(userId, sessionId, abortController);
    return;
  }

  console.error('Council message error:', error);
  if (!abortController.signal.aborted) {
    const errorEvent = { type: 'error' as const, error: 'Processing failed' };
    processingRegistry.broadcast(userId, sessionId, errorEvent);
  }
  processingRegistry.complete(userId, sessionId, abortController);
};
