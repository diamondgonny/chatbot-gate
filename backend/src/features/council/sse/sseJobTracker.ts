/**
 * SSE Job Tracker
 * 메모리 내 활성 처리 작업 관리
 */

import { Response } from 'express';
import type { SSEEvent, AggregateRanking, IStage1Response, IStage2Review } from '@shared';
import { COUNCIL } from '@shared';

export interface ActiveProcessing {
  sessionId: string;
  userId: string;
  generator: AsyncGenerator<SSEEvent>;
  abortController: AbortController;
  startedAt: Date;
  lastEventAt: Date;
  // 연결된 SSE 클라이언트
  clients: Set<Response>;
  // 현재 처리 상태
  currentStage: 'stage1' | 'stage2' | 'stage3' | null;
  // 재연결 시 재생을 위한 누적 결과
  stage1Results: IStage1Response[];
  stage2Results: IStage2Review[];
  stage3Content: string;
  stage3Reasoning: string;
  labelToModel: Record<string, string>;
  aggregateRankings: AggregateRanking[];
  // 현재 진행 중인 모델의 스트리밍 컨텐츠
  stage1StreamingContent: Record<string, string>;
  stage2StreamingContent: Record<string, string>;
  // 이 처리에 대한 사용자 메시지
  userMessage: string;
}

export class SSEJobTracker {
  private activeProcessing = new Map<string, ActiveProcessing>();

  /**
   * userId + sessionId의 복합 키 가져오기
   */
  getKey(userId: string, sessionId: string): string {
    return `${userId}:${sessionId}`;
  }

  /**
   * 활성 처리 세션의 현재 개수 가져오기
   */
  getActiveCount(): number {
    return this.activeProcessing.size;
  }

  /**
   * 최대 용량에 도달했는지 확인
   */
  isAtCapacity(): boolean {
    return this.activeProcessing.size >= COUNCIL.SSE.MAX_CONCURRENT_SESSIONS;
  }

  /**
   * 세션에 대한 처리가 활성화되어 있는지 확인
   */
  isProcessing(userId: string, sessionId: string): boolean {
    return this.activeProcessing.has(this.getKey(userId, sessionId));
  }

  /**
   * 세션에 대한 활성 처리 가져오기
   */
  get(userId: string, sessionId: string): ActiveProcessing | undefined {
    return this.activeProcessing.get(this.getKey(userId, sessionId));
  }

  /**
   * 키로 활성 처리 가져오기
   */
  getByKey(key: string): ActiveProcessing | undefined {
    return this.activeProcessing.get(key);
  }

  /**
   * 새 처리 작업 등록
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
   * 처리 엔트리 제거
   */
  remove(userId: string, sessionId: string): void {
    const key = this.getKey(userId, sessionId);
    this.activeProcessing.delete(key);
  }

  /**
   * 모든 활성 처리 엔트리 가져오기
   */
  getAll(): IterableIterator<[string, ActiveProcessing]> {
    return this.activeProcessing.entries();
  }

  /**
   * 모든 처리 엔트리 정리
   */
  clear(): void {
    this.activeProcessing.clear();
  }
}
