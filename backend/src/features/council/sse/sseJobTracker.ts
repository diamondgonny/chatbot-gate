/**
 * SSE Job Tracker
 * Manages active processing jobs in-memory.
 */

import { Response } from 'express';
import type { SSEEvent, AggregateRanking, IStage1Response, IStage2Review } from '../../../shared';

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
  stage3Reasoning: string;
  labelToModel: Record<string, string>;
  aggregateRankings: AggregateRanking[];
  // Streaming content for models currently in progress
  stage1StreamingContent: Record<string, string>;
  stage2StreamingContent: Record<string, string>;
  // User message for this processing
  userMessage: string;
}

export class SSEJobTracker {
  private activeProcessing = new Map<string, ActiveProcessing>();

  /**
   * Get composite key for userId + sessionId
   */
  getKey(userId: string, sessionId: string): string {
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
   * Get active processing by key
   */
  getByKey(key: string): ActiveProcessing | undefined {
    return this.activeProcessing.get(key);
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
      stage3Reasoning: '',
      labelToModel: {},
      aggregateRankings: [],
      stage1StreamingContent: {},
      stage2StreamingContent: {},
    };

    this.activeProcessing.set(key, processing);
    console.log(`[SSEJobTracker] Registered processing for ${key}`);
    return processing;
  }

  /**
   * Remove processing entry
   */
  remove(userId: string, sessionId: string): void {
    const key = this.getKey(userId, sessionId);
    this.activeProcessing.delete(key);
  }

  /**
   * Get all active processing entries
   */
  getAll(): IterableIterator<[string, ActiveProcessing]> {
    return this.activeProcessing.entries();
  }

  /**
   * Clear all processing entries
   */
  clear(): void {
    this.activeProcessing.clear();
  }
}
