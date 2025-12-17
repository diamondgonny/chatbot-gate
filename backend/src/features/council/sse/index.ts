/**
 * Processing Registry (Facade)
 * 특화된 컴포넌트에 위임하면서 하위 호환 API 유지
 */

import { Response } from 'express';
import type { SSEEvent } from '@shared';
import { SSEJobTracker, ActiveProcessing } from './sseJobTracker';
import { SSEClientManager } from './sseClientManager';
import { SSEEventAccumulator } from './sseEventAccumulator';
import { SSEBroadcaster } from './sseBroadcaster';
import { SSELifecycleManager } from './sseLifecycleManager';
import {
  councilSseConnections,
  councilAbortsTotal,
  getDeploymentEnv,
} from '@shared';

// ActiveProcessing 타입 재export
export type { ActiveProcessing } from './sseJobTracker';

class ProcessingRegistry {
  private jobTracker = new SSEJobTracker();
  private clientManager = new SSEClientManager();
  private eventAccumulator = new SSEEventAccumulator();
  private broadcaster = new SSEBroadcaster();
  private lifecycleManager: SSELifecycleManager;

  constructor() {
    this.lifecycleManager = new SSELifecycleManager(
      this.jobTracker,
      this.clientManager
    );
  }

  /** 세션에 대한 처리가 활성화되어 있는지 확인 */
  isProcessing(userId: string, sessionId: string): boolean {
    return this.jobTracker.isProcessing(userId, sessionId);
  }

  /** 동시 세션 최대 용량에 도달했는지 확인 */
  isAtCapacity(): boolean {
    return this.jobTracker.isAtCapacity();
  }

  /** 활성 처리 세션의 현재 개수 가져오기 */
  getActiveCount(): number {
    return this.jobTracker.getActiveCount();
  }

  /** 세션에 대한 활성 처리 가져오기 */
  get(userId: string, sessionId: string): ActiveProcessing | undefined {
    return this.jobTracker.get(userId, sessionId);
  }

  /** 새로운 처리 작업 등록 */
  register(
    userId: string,
    sessionId: string,
    userMessage: string,
    generator: AsyncGenerator<SSEEvent>,
    abortController: AbortController
  ): ActiveProcessing {
    // grace period 타이머 취소
    this.lifecycleManager.cancelGracePeriod(userId, sessionId);

    // 새 처리를 등록하기 전에 기존 처리를 완전히 abort 및 cleanup
    // 이전 처리의 complete()가 새 처리를 제거하는 race condition 방지
    if (this.jobTracker.isProcessing(userId, sessionId)) {
      this.lifecycleManager.abort(userId, sessionId);
    }

    return this.jobTracker.register(userId, sessionId, userMessage, generator, abortController);
  }

  /** 기존 처리에 클라이언트 추가 */
  addClient(userId: string, sessionId: string, client: Response): boolean {
    const processing = this.jobTracker.get(userId, sessionId);
    if (!processing) return false;

    // 클라이언트가 재연결 중이므로 grace period 타이머 취소
    this.lifecycleManager.cancelGracePeriod(userId, sessionId);

    this.clientManager.addClient(processing, client);

    // SSE 연결 기록
    councilSseConnections.labels(getDeploymentEnv()).inc();

    return true;
  }

  /** 처리에서 클라이언트 제거 */
  removeClient(userId: string, sessionId: string, client: Response): void {
    const processing = this.jobTracker.get(userId, sessionId);
    if (!processing) return;

    const wasRemoved = this.clientManager.removeClient(processing, client);

    // 클라이언트가 실제로 제거된 경우에만 gauge 감소
    if (wasRemoved) {
      councilSseConnections.labels(getDeploymentEnv()).dec();
    }

    // 모든 클라이언트가 연결 해제된 경우, grace period 시작
    if (!this.clientManager.hasClients(processing)) {
      this.lifecycleManager.startGracePeriod(userId, sessionId);
    }
  }

  /** 이벤트 기록 및 누적 상태 업데이트 */
  recordEvent(userId: string, sessionId: string, event: SSEEvent): void {
    const processing = this.jobTracker.get(userId, sessionId);
    if (!processing) return;

    this.eventAccumulator.recordEvent(processing, event);
  }

  /** 연결된 모든 클라이언트로 이벤트 브로드캐스트 */
  broadcast(userId: string, sessionId: string, event: SSEEvent): void {
    const processing = this.jobTracker.get(userId, sessionId);
    if (!processing) return;

    this.broadcaster.broadcast(processing, event);
  }

  /**
   * 처리 완료 표시 (성공 또는 에러)
   * @param abortController - 제공된 경우, 현재 처리와 일치할 때만 완료 처리
   */
  complete(userId: string, sessionId: string, abortController?: AbortController): void {
    this.lifecycleManager.complete(userId, sessionId, abortController);
  }

  /** 처리 abort 및 레지스트리 cleanup */
  abort(userId: string, sessionId: string): void {
    // 현재 스테이지와 함께 abort 기록
    const processing = this.jobTracker.get(userId, sessionId);
    if (processing) {
      const stage = processing.currentStage?.replace('stage', '') || 'unknown';
      councilAbortsTotal.labels(stage, getDeploymentEnv()).inc();
    }

    this.lifecycleManager.abort(userId, sessionId);
  }

  /** 레지스트리 shutdown (cleanup) */
  shutdown(): void {
    this.lifecycleManager.shutdown();
  }
}

// 싱글톤 인스턴스
export const processingRegistry = new ProcessingRegistry();
