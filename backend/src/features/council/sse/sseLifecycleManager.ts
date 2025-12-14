/**
 * SSE Lifecycle Manager
 * Manages grace periods, cleanup, and shutdown.
 */

import { SSEJobTracker } from './sseJobTracker';
import { SSEClientManager } from './sseClientManager';
import { COUNCIL, councilSseConnections, getDeploymentEnv } from '../../../shared';

export class SSELifecycleManager {
  private gracePeriodTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(
    private jobTracker: SSEJobTracker,
    private clientManager: SSEClientManager
  ) {
    // Cleanup stale processing at configured interval
    this.cleanupInterval = setInterval(
      () => this.cleanupStale(),
      COUNCIL.SSE.CLEANUP_INTERVAL_MS
    );
    // Don't let this timer prevent process from exiting
    this.cleanupInterval.unref();
  }

  /**
   * Start grace period before aborting (allows reconnection)
   */
  startGracePeriod(userId: string, sessionId: string): void {
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

    this.gracePeriodTimers.set(key, timer);
  }

  /**
   * Cancel grace period (client reconnected)
   */
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
   * Mark processing as complete (success or error)
   * @param forAbortController - If provided, only complete if it matches current processing
   */
  complete(userId: string, sessionId: string, forAbortController?: AbortController): void {
    const key = this.jobTracker.getKey(userId, sessionId);
    const processing = this.jobTracker.get(userId, sessionId);

    // Already cleaned up
    if (!processing) {
      console.log(`[SSELifecycleManager] Processing already cleaned up for ${key}`);
      return;
    }

    // Skip if this is a stale call (abortController doesn't match current processing)
    if (forAbortController && processing.abortController !== forAbortController) {
      console.log(`[SSELifecycleManager] Skipping stale complete call for ${key}`);
      return;
    }

    // Cancel any grace period timer
    const timer = this.gracePeriodTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.gracePeriodTimers.delete(key);
    }

    // Close all connected clients before removing
    const closedCount = this.clientManager.closeAllClients(processing);
    this.decrementConnectionGauge(closedCount);

    this.jobTracker.remove(userId, sessionId);
    console.log(`[SSELifecycleManager] Completed processing for ${key}`);
  }

  /**
   * Abort processing and cleanup
   */
  abort(userId: string, sessionId: string): void {
    const processing = this.jobTracker.get(userId, sessionId);

    if (processing) {
      processing.abortController.abort();
      console.log(`[SSELifecycleManager] Aborted processing for ${this.jobTracker.getKey(userId, sessionId)}`);
      // Pass the abortController to ensure we only clean up this specific processing
      this.complete(userId, sessionId, processing.abortController);
    }
  }

  /**
   * Cleanup stale processing (no activity within threshold)
   */
  private cleanupStale(): void {
    const now = Date.now();

    for (const [key, processing] of this.jobTracker.getAll()) {
      if (now - processing.lastEventAt.getTime() > COUNCIL.SSE.STALE_THRESHOLD_MS) {
        console.log(`[SSELifecycleManager] Cleaning up stale processing: ${key}`);
        const closedCount = this.clientManager.closeAllClients(processing);
        this.decrementConnectionGauge(closedCount);
        processing.abortController.abort();
        this.jobTracker.remove(processing.userId, processing.sessionId);

        // Clean up any grace period timer
        const timer = this.gracePeriodTimers.get(key);
        if (timer) {
          clearTimeout(timer);
          this.gracePeriodTimers.delete(key);
        }
      }
    }
  }

  /**
   * Shutdown lifecycle manager (cleanup)
   */
  shutdown(): void {
    clearInterval(this.cleanupInterval);

    // Clear all grace period timers
    for (const timer of this.gracePeriodTimers.values()) {
      clearTimeout(timer);
    }
    this.gracePeriodTimers.clear();

    // Close all clients and abort all active processing
    for (const [key, processing] of this.jobTracker.getAll()) {
      console.log(`[SSELifecycleManager] Shutting down processing: ${key}`);
      const closedCount = this.clientManager.closeAllClients(processing);
      this.decrementConnectionGauge(closedCount);
      processing.abortController.abort();
    }
    this.jobTracker.clear();
  }

  /**
   * Decrement connection gauge for closed clients
   */
  private decrementConnectionGauge(count: number): void {
    const env = getDeploymentEnv();
    for (let i = 0; i < count; i++) {
      councilSseConnections.labels(env).dec();
    }
  }
}
