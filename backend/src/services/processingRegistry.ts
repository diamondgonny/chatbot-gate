/**
 * Processing Registry
 * In-memory registry for tracking active council processing jobs.
 * Enables SSE reconnection when clients navigate away and return.
 */

import { Response } from 'express';
import { SSEEvent } from './councilService';
import { IStage1Response, IStage2Review } from '../models/CouncilSession';

export interface ActiveProcessing {
  sessionId: string;
  userId: string;
  generator: AsyncGenerator<SSEEvent>;
  abortController: AbortController;
  startedAt: Date;
  lastEventAt: Date;
  // Connected SSE clients
  clients: Set<Response>;
  // Current processing state
  currentStage: 'stage1' | 'stage2' | 'stage3' | null;
  // Accumulated results for replay on reconnection
  stage1Results: IStage1Response[];
  stage2Results: IStage2Review[];
  stage3Content: string;
  labelToModel: Record<string, string>;
  aggregateRankings: { model: string; averageRank: number; rankingsCount: number }[];
  // Streaming content for models currently in progress
  stage1StreamingContent: Record<string, string>;
  stage2StreamingContent: Record<string, string>;
  // User message for this processing
  userMessage: string;
}

class ProcessingRegistry {
  private activeProcessing = new Map<string, ActiveProcessing>();
  private cleanupInterval: ReturnType<typeof setInterval>;
  private gracePeriodTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    // Cleanup stale processing every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanupStale(), 5 * 60 * 1000);
  }

  /**
   * Get composite key for userId + sessionId
   */
  private getKey(userId: string, sessionId: string): string {
    return `${userId}:${sessionId}`;
  }

  /**
   * Check if processing is active for a session
   */
  isProcessing(userId: string, sessionId: string): boolean {
    return this.activeProcessing.has(this.getKey(userId, sessionId));
  }

  /**
   * Get active processing for a session
   */
  get(userId: string, sessionId: string): ActiveProcessing | undefined {
    return this.activeProcessing.get(this.getKey(userId, sessionId));
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
    const key = this.getKey(userId, sessionId);

    // Cancel any grace period timer
    const existingTimer = this.gracePeriodTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.gracePeriodTimers.delete(key);
    }

    // Abort any existing processing for this session
    const existing = this.activeProcessing.get(key);
    if (existing) {
      existing.abortController.abort();
      console.log(`[ProcessingRegistry] Aborted existing processing for ${key}`);
    }

    const processing: ActiveProcessing = {
      sessionId,
      userId,
      userMessage,
      generator,
      abortController,
      startedAt: new Date(),
      lastEventAt: new Date(),
      clients: new Set(),
      currentStage: null,
      stage1Results: [],
      stage2Results: [],
      stage3Content: '',
      labelToModel: {},
      aggregateRankings: [],
      stage1StreamingContent: {},
      stage2StreamingContent: {},
    };

    this.activeProcessing.set(key, processing);
    console.log(`[ProcessingRegistry] Registered processing for ${key}`);
    return processing;
  }

  /**
   * Add client to existing processing
   */
  addClient(userId: string, sessionId: string, client: Response): boolean {
    const key = this.getKey(userId, sessionId);
    const processing = this.activeProcessing.get(key);
    if (!processing) return false;

    // Cancel any grace period timer since client is reconnecting
    const existingTimer = this.gracePeriodTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.gracePeriodTimers.delete(key);
      console.log(`[ProcessingRegistry] Cancelled grace period for ${key} - client reconnected`);
    }

    processing.clients.add(client);
    console.log(`[ProcessingRegistry] Added client to ${key}, total clients: ${processing.clients.size}`);
    return true;
  }

  /**
   * Remove client from processing
   */
  removeClient(userId: string, sessionId: string, client: Response): void {
    const key = this.getKey(userId, sessionId);
    const processing = this.activeProcessing.get(key);
    if (!processing) return;

    processing.clients.delete(client);
    console.log(`[ProcessingRegistry] Removed client from ${key}, remaining clients: ${processing.clients.size}`);

    // If all clients disconnected, start grace period
    if (processing.clients.size === 0) {
      this.startGracePeriod(userId, sessionId);
    }
  }

  /**
   * Start grace period before aborting (allows reconnection)
   */
  private startGracePeriod(userId: string, sessionId: string): void {
    const key = this.getKey(userId, sessionId);
    const GRACE_PERIOD_MS = 30000; // 30 seconds

    console.log(`[ProcessingRegistry] Starting ${GRACE_PERIOD_MS / 1000}s grace period for ${key}`);

    const timer = setTimeout(() => {
      const processing = this.activeProcessing.get(key);
      if (processing && processing.clients.size === 0) {
        console.log(`[ProcessingRegistry] Grace period expired for ${key}, aborting`);
        processing.abortController.abort();
        this.activeProcessing.delete(key);
      }
      this.gracePeriodTimers.delete(key);
    }, GRACE_PERIOD_MS);

    this.gracePeriodTimers.set(key, timer);
  }

  /**
   * Record event and update accumulated state
   */
  recordEvent(userId: string, sessionId: string, event: SSEEvent): void {
    const processing = this.get(userId, sessionId);
    if (!processing) return;

    processing.lastEventAt = new Date();

    // Update state based on event type
    switch (event.type) {
      case 'stage1_start':
        processing.currentStage = 'stage1';
        break;
      case 'stage1_chunk':
        // Accumulate streaming content for this model
        if ('model' in event && 'delta' in event && event.model && event.delta) {
          processing.stage1StreamingContent[event.model] =
            (processing.stage1StreamingContent[event.model] || '') + event.delta;
        }
        break;
      case 'stage1_response':
        if (event.data) {
          // Clear streaming content for completed model
          delete processing.stage1StreamingContent[event.data.model];
          processing.stage1Results.push(event.data);
        }
        break;
      case 'stage1_complete':
        // Clear all stage1 streaming content
        processing.stage1StreamingContent = {};
        break;
      case 'stage2_start':
        processing.currentStage = 'stage2';
        break;
      case 'stage2_chunk':
        // Accumulate streaming content for this model
        if ('model' in event && 'delta' in event && event.model && event.delta) {
          processing.stage2StreamingContent[event.model] =
            (processing.stage2StreamingContent[event.model] || '') + event.delta;
        }
        break;
      case 'stage2_response':
        if (event.data) {
          // Clear streaming content for completed model
          delete processing.stage2StreamingContent[event.data.model];
          processing.stage2Results.push(event.data);
        }
        break;
      case 'stage2_complete':
        // Clear all stage2 streaming content
        processing.stage2StreamingContent = {};
        if (event.data && 'labelToModel' in event.data) {
          processing.labelToModel = event.data.labelToModel;
          processing.aggregateRankings = event.data.aggregateRankings;
        }
        break;
      case 'stage3_start':
        processing.currentStage = 'stage3';
        break;
      case 'stage3_chunk':
        if ('delta' in event && event.delta) {
          processing.stage3Content += event.delta;
        }
        break;
    }
  }

  /**
   * Mark processing as complete (success or error)
   */
  complete(userId: string, sessionId: string): void {
    const key = this.getKey(userId, sessionId);

    // Cancel any grace period timer
    const timer = this.gracePeriodTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.gracePeriodTimers.delete(key);
    }

    this.activeProcessing.delete(key);
    console.log(`[ProcessingRegistry] Completed processing for ${key}`);
  }

  /**
   * Broadcast event to all connected clients
   */
  broadcast(userId: string, sessionId: string, event: SSEEvent): void {
    const processing = this.get(userId, sessionId);
    if (!processing) return;

    const eventData = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of processing.clients) {
      if (!client.writableEnded) {
        client.write(eventData);
      }
    }
  }

  /**
   * Cleanup stale processing (older than 10 minutes with no activity)
   */
  private cleanupStale(): void {
    const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
    const now = Date.now();

    for (const [key, processing] of this.activeProcessing) {
      if (now - processing.lastEventAt.getTime() > STALE_THRESHOLD_MS) {
        console.log(`[ProcessingRegistry] Cleaning up stale processing: ${key}`);
        processing.abortController.abort();
        this.activeProcessing.delete(key);

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
   * Shutdown registry (cleanup)
   */
  shutdown(): void {
    clearInterval(this.cleanupInterval);

    // Clear all grace period timers
    for (const timer of this.gracePeriodTimers.values()) {
      clearTimeout(timer);
    }
    this.gracePeriodTimers.clear();

    // Abort all active processing
    for (const [key, processing] of this.activeProcessing) {
      console.log(`[ProcessingRegistry] Shutting down processing: ${key}`);
      processing.abortController.abort();
    }
    this.activeProcessing.clear();
  }
}

// Singleton instance
export const processingRegistry = new ProcessingRegistry();
