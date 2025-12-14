/**
 * Processing Registry (Facade)
 * Maintains backward-compatible API while delegating to specialized components.
 */

import { Response } from 'express';
import type { SSEEvent } from '../../../shared';
import { SSEJobTracker, ActiveProcessing } from './sseJobTracker';
import { SSEClientManager } from './sseClientManager';
import { SSEEventAccumulator } from './sseEventAccumulator';
import { SSEBroadcaster } from './sseBroadcaster';
import { SSELifecycleManager } from './sseLifecycleManager';
import {
  councilSseConnections,
  councilAbortsTotal,
  getDeploymentEnv,
} from '../../../shared';

// Re-export ActiveProcessing type
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

  /**
   * Check if processing is active for a session
   */
  isProcessing(userId: string, sessionId: string): boolean {
    return this.jobTracker.isProcessing(userId, sessionId);
  }

  /**
   * Check if at maximum capacity for concurrent sessions
   */
  isAtCapacity(): boolean {
    return this.jobTracker.isAtCapacity();
  }

  /**
   * Get current count of active processing sessions
   */
  getActiveCount(): number {
    return this.jobTracker.getActiveCount();
  }

  /**
   * Get active processing for a session
   */
  get(userId: string, sessionId: string): ActiveProcessing | undefined {
    return this.jobTracker.get(userId, sessionId);
  }

  /**
   * Register new processing job
   */
  register(
    userId: string,
    sessionId: string,
    userMessage: string,
    generator: AsyncGenerator<SSEEvent>,
    abortController: AbortController
  ): ActiveProcessing {
    // Cancel any grace period timer
    this.lifecycleManager.cancelGracePeriod(userId, sessionId);

    // Fully abort and cleanup existing processing BEFORE registering new one
    // This prevents race condition where old processing's complete() removes new processing
    if (this.jobTracker.isProcessing(userId, sessionId)) {
      this.lifecycleManager.abort(userId, sessionId);
    }

    return this.jobTracker.register(userId, sessionId, userMessage, generator, abortController);
  }

  /**
   * Add client to existing processing
   */
  addClient(userId: string, sessionId: string, client: Response): boolean {
    const processing = this.jobTracker.get(userId, sessionId);
    if (!processing) return false;

    // Cancel any grace period timer since client is reconnecting
    this.lifecycleManager.cancelGracePeriod(userId, sessionId);

    this.clientManager.addClient(processing, client);

    // Record SSE connection
    councilSseConnections.labels(getDeploymentEnv()).inc();

    return true;
  }

  /**
   * Remove client from processing
   */
  removeClient(userId: string, sessionId: string, client: Response): void {
    const processing = this.jobTracker.get(userId, sessionId);
    if (!processing) return;

    const wasRemoved = this.clientManager.removeClient(processing, client);

    // Only decrement gauge if client was actually removed
    if (wasRemoved) {
      councilSseConnections.labels(getDeploymentEnv()).dec();
    }

    // If all clients disconnected, start grace period
    if (!this.clientManager.hasClients(processing)) {
      this.lifecycleManager.startGracePeriod(userId, sessionId);
    }
  }

  /**
   * Record event and update accumulated state
   */
  recordEvent(userId: string, sessionId: string, event: SSEEvent): void {
    const processing = this.jobTracker.get(userId, sessionId);
    if (!processing) return;

    this.eventAccumulator.recordEvent(processing, event);
  }

  /**
   * Broadcast event to all connected clients
   */
  broadcast(userId: string, sessionId: string, event: SSEEvent): void {
    const processing = this.jobTracker.get(userId, sessionId);
    if (!processing) return;

    this.broadcaster.broadcast(processing, event);
  }

  /**
   * Mark processing as complete (success or error)
   * @param abortController - If provided, only complete if it matches current processing
   */
  complete(userId: string, sessionId: string, abortController?: AbortController): void {
    this.lifecycleManager.complete(userId, sessionId, abortController);
  }

  /**
   * Abort processing and cleanup registry
   */
  abort(userId: string, sessionId: string): void {
    // Record abort with current stage
    const processing = this.jobTracker.get(userId, sessionId);
    if (processing) {
      const stage = processing.currentStage?.replace('stage', '') || 'unknown';
      councilAbortsTotal.labels(stage, getDeploymentEnv()).inc();
    }

    this.lifecycleManager.abort(userId, sessionId);
  }

  /**
   * Shutdown registry (cleanup)
   */
  shutdown(): void {
    this.lifecycleManager.shutdown();
  }
}

// Singleton instance
export const processingRegistry = new ProcessingRegistry();
