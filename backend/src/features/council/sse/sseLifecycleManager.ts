/**
 * SSE 라이프사이클 관리자
 * grace period, cleanup, shutdown 관리
 */

import { SSEJobTracker } from './sseJobTracker';
import { SSEClientManager } from './sseClientManager';
import { COUNCIL, councilSseConnections, getDeploymentEnv } from '@shared';

export class SSELifecycleManager {
  private gracePeriodTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private cleanupInterval: ReturnType<typeof setInterval>;
  private isShuttingDown = false;

  constructor(
    private jobTracker: SSEJobTracker,
    private clientManager: SSEClientManager
  ) {
    // 설정된 간격으로 stale 처리 정리
    this.cleanupInterval = setInterval(
      () => this.cleanupStale(),
      COUNCIL.SSE.CLEANUP_INTERVAL_MS
    );
    // 이 타이머가 프로세스 종료를 차단하지 않도록 함
    this.cleanupInterval.unref();
  }

  /** abort 전 grace period 시작 (재연결 허용) */
  startGracePeriod(userId: string, sessionId: string): void {
    if (this.isShuttingDown) return;

    const key = this.jobTracker.getKey(userId, sessionId);
    const gracePeriodMs = COUNCIL.SSE.GRACE_PERIOD_MS;

    console.log(`[SSELifecycleManager] Starting ${gracePeriodMs / 1000}s grace period for ${key}`);

    const timer = setTimeout(() => {
      const processing = this.jobTracker.get(userId, sessionId);
      if (processing && !this.clientManager.hasClients(processing)) {
        console.log(`[SSELifecycleManager] Grace period expired for ${key}, aborting`);
        processing.abortController.abort();
        this.jobTracker.remove(userId, sessionId);
      }
      this.gracePeriodTimers.delete(key);
    }, gracePeriodMs);
    // grace period 타이머가 shutdown 중 프로세스 종료를 차단하지 않도록 함
    timer.unref();

    this.gracePeriodTimers.set(key, timer);
  }

  /** grace period 취소 (클라이언트 재연결) */
  cancelGracePeriod(userId: string, sessionId: string): void {
    const key = this.jobTracker.getKey(userId, sessionId);
    const existingTimer = this.gracePeriodTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.gracePeriodTimers.delete(key);
      console.log(`[SSELifecycleManager] Cancelled grace period for ${key} - client reconnected`);
    }
  }

  /**
   * 처리 완료 표시 (성공 또는 에러)
   * @param forAbortController - 제공된 경우, 현재 처리의 abortController와 일치할 때만 완료 처리
   */
  complete(userId: string, sessionId: string, forAbortController?: AbortController): void {
    const key = this.jobTracker.getKey(userId, sessionId);
    const processing = this.jobTracker.get(userId, sessionId);

    // 이미 정리됨
    if (!processing) {
      console.log(`[SSELifecycleManager] Processing already cleaned up for ${key}`);
      return;
    }

    // stale 호출인 경우 스킵 (abortController가 현재 처리와 일치하지 않음)
    if (forAbortController && processing.abortController !== forAbortController) {
      console.log(`[SSELifecycleManager] Skipping stale complete call for ${key}`);
      return;
    }

    // grace period 타이머 취소
    const timer = this.gracePeriodTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.gracePeriodTimers.delete(key);
    }

    // 제거 전에 모든 연결된 클라이언트 닫기
    const closedCount = this.clientManager.closeAllClients(processing);
    this.decrementConnectionGauge(closedCount);

    this.jobTracker.remove(userId, sessionId);
    console.log(`[SSELifecycleManager] Completed processing for ${key}`);
  }

  /** 처리 abort 및 cleanup */
  abort(userId: string, sessionId: string): void {
    const processing = this.jobTracker.get(userId, sessionId);

    if (processing) {
      processing.abortController.abort();
      console.log(`[SSELifecycleManager] Aborted processing for ${this.jobTracker.getKey(userId, sessionId)}`);
      // 이 특정 처리만 정리하도록 abortController 전달
      this.complete(userId, sessionId, processing.abortController);
    }
  }

  /** stale 처리 정리 (임계값 내에 활동 없음) */
  private cleanupStale(): void {
    const now = Date.now();

    for (const [key, processing] of this.jobTracker.getAll()) {
      if (now - processing.lastEventAt.getTime() > COUNCIL.SSE.STALE_THRESHOLD_MS) {
        console.log(`[SSELifecycleManager] Cleaning up stale processing: ${key}`);
        const closedCount = this.clientManager.closeAllClients(processing);
        this.decrementConnectionGauge(closedCount);
        processing.abortController.abort();
        this.jobTracker.remove(processing.userId, processing.sessionId);

        // grace period 타이머 정리
        const timer = this.gracePeriodTimers.get(key);
        if (timer) {
          clearTimeout(timer);
          this.gracePeriodTimers.delete(key);
        }
      }
    }
  }

  /** 라이프사이클 관리자 shutdown (cleanup) */
  shutdown(): void {
    this.isShuttingDown = true;
    clearInterval(this.cleanupInterval);

    // 모든 grace period 타이머 정리
    for (const timer of this.gracePeriodTimers.values()) {
      clearTimeout(timer);
    }
    this.gracePeriodTimers.clear();

    // 모든 클라이언트 닫기 및 활성 처리 abort
    for (const [key, processing] of this.jobTracker.getAll()) {
      console.log(`[SSELifecycleManager] Shutting down processing: ${key}`);
      const closedCount = this.clientManager.closeAllClients(processing);
      this.decrementConnectionGauge(closedCount);
      processing.abortController.abort();
    }
    this.jobTracker.clear();
  }

  /** 닫힌 클라이언트에 대한 connection gauge 감소 */
  private decrementConnectionGauge(count: number): void {
    const env = getDeploymentEnv();
    for (let i = 0; i < count; i++) {
      councilSseConnections.labels(env).dec();
    }
  }
}
