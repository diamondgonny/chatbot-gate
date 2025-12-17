/**
 * Council feature용 Stream Event Processor
 * SSE event 처리 로직을 재사용 가능하고 테스트 가능한 class로 추상화
 */

import type {
  SSEEvent,
  Stage1Response,
  Stage2Review,
  Stage3Synthesis,
  AggregateRanking,
  CouncilAssistantMessage,
} from "../types";
import type { CurrentStage, StreamState } from "../types";
import { buildLabelToModel, calculateAggregateRankings } from "../utils";

export interface StreamEventCallbacks {
  onStateChange: (partial: Partial<StreamState>) => void;
  onUserMessageConfirmed: () => void;
  onComplete: (assistantMessage: CouncilAssistantMessage) => void;
  onError: (error: string) => void;
  onTitleComplete: (title: string) => void;
  onReconnected: (stage: CurrentStage, userMessage?: string) => void;
}

export interface StreamEventProcessorOptions {
  /** 재연결인지 여부 (chunk 무시) */
  isReconnection?: boolean;
}

/**
 * SSE event를 처리하고 누적된 state를 유지.
 * Event 처리 로직을 React state 관리로부터 분리.
 */
export class StreamEventProcessor {
  private callbacks: StreamEventCallbacks;
  private isReconnection: boolean;
  private userMessageConfirmed = false;

  // 처리 중 누적된 state
  private tempStage1: Stage1Response[] = [];
  private tempStage2: Stage2Review[] = [];
  private tempStage3: Stage3Synthesis | null = null;
  private tempLabelToModel: Record<string, string> = {};
  private tempAggregateRankings: AggregateRanking[] = [];
  private currentStage: CurrentStage = "idle";

  // Streaming content 누적기
  private stage1StreamingContent: Record<string, string> = {};
  private stage2StreamingContent: Record<string, string> = {};
  private stage3StreamingContent = "";
  private stage3ReasoningContent = "";

  // rAF batching으로 streaming 업데이트 최적화
  private pendingStateUpdate: Partial<StreamState> = {};
  private rafId: number | null = null;

  constructor(callbacks: StreamEventCallbacks, options: StreamEventProcessorOptions = {}) {
    this.callbacks = callbacks;
    this.isReconnection = options.isReconnection ?? false;
  }

  /**
   * rAF batching으로 state 업데이트 스케줄링
   * 여러 chunk 업데이트를 한 프레임에 묶어서 성능 향상
   */
  private scheduleStateUpdate(partial: Partial<StreamState>): void {
    // Pending 업데이트 병합
    this.pendingStateUpdate = { ...this.pendingStateUpdate, ...partial };

    // 아직 스케줄되지 않았다면 rAF 스케줄
    if (!this.rafId) {
      this.rafId = requestAnimationFrame(() => {
        this.callbacks.onStateChange(this.pendingStateUpdate);
        this.pendingStateUpdate = {};
        this.rafId = null;
      });
    }
  }

  private flushPendingUpdates(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (Object.keys(this.pendingStateUpdate).length > 0) {
      this.callbacks.onStateChange(this.pendingStateUpdate);
      this.pendingStateUpdate = {};
    }
  }

  processEvent(event: SSEEvent): void {
    switch (event.type) {
      // Heartbeat - 무시 (연결 유지용, state 변경 불필요)
      case "heartbeat":
        break;

      // Stage 시작
      case "stage1_start":
        this.handleStage1Start();
        break;
      case "stage2_start":
        this.handleStage2Start();
        break;
      case "stage3_start":
        this.handleStage3Start();
        break;

      // Stage 1 event
      case "stage1_chunk":
        this.handleStage1Chunk(event);
        break;
      case "stage1_model_complete":
        // Metadata만 있음, content는 이미 누적됨
        break;
      case "stage1_response":
        this.handleStage1Response(event);
        break;
      case "stage1_complete":
        this.handleStage1Complete();
        break;

      // Stage 2 event
      case "stage2_chunk":
        this.handleStage2Chunk(event);
        break;
      case "stage2_model_complete":
        // Metadata만 있음
        break;
      case "stage2_response":
        this.handleStage2Response(event);
        break;
      case "stage2_complete":
        this.handleStage2Complete(event);
        break;

      // Stage 3 event
      case "stage3_reasoning_chunk":
        this.handleStage3ReasoningChunk(event);
        break;
      case "stage3_chunk":
        this.handleStage3Chunk(event);
        break;
      case "stage3_response":
        this.handleStage3Response(event);
        break;

      // 연결 event
      case "reconnected":
        this.handleReconnected(event);
        break;
      case "title_complete":
        if (event.data && typeof event.data === "object" && "title" in event.data) {
          this.callbacks.onTitleComplete((event.data as { title: string }).title);
        }
        break;
      case "complete":
        this.handleComplete();
        break;
      case "error":
        this.handleError(event);
        break;
    }
  }

  reset(): void {
    // Pending rAF 취소
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.pendingStateUpdate = {};

    this.tempStage1 = [];
    this.tempStage2 = [];
    this.tempStage3 = null;
    this.tempLabelToModel = {};
    this.tempAggregateRankings = [];
    this.currentStage = "idle";
    this.userMessageConfirmed = false;
    this.stage1StreamingContent = {};
    this.stage2StreamingContent = {};
    this.stage3StreamingContent = "";
    this.stage3ReasoningContent = "";
  }

  buildAssistantMessage(): CouncilAssistantMessage | null {
    if (!this.tempStage3) {
      return null;
    }

    return {
      role: "assistant",
      stage1: this.tempStage1,
      stage2: this.tempStage2,
      stage3: this.tempStage3,
      timestamp: new Date().toISOString(),
    };
  }

  /** abort 시 부분 결과용으로 현재 누적된 response 반환 */
  getPartialResults(): {
    stage1: Stage1Response[];
    stage2: Stage2Review[];
    stage3: Stage3Synthesis | null;
  } {
    return {
      stage1: this.tempStage1,
      stage2: this.tempStage2,
      stage3: this.tempStage3,
    };
  }

  // === Private handler ===

  private handleStage1Start(): void {
    this.currentStage = "stage1";
    this.callbacks.onStateChange({ currentStage: "stage1" });

    if (!this.userMessageConfirmed) {
      this.userMessageConfirmed = true;
      this.callbacks.onUserMessageConfirmed();
    }
  }

  private handleStage2Start(): void {
    this.currentStage = "stage2";
    this.callbacks.onStateChange({ currentStage: "stage2" });
  }

  private handleStage3Start(): void {
    this.currentStage = "stage3";
    this.callbacks.onStateChange({ currentStage: "stage3" });
  }

  private handleStage1Chunk(event: SSEEvent): void {
    // 재연결 중에는 chunk 무시
    if (this.isReconnection) return;

    if (event.model && event.delta) {
      this.stage1StreamingContent[event.model] =
        (this.stage1StreamingContent[event.model] || "") + event.delta;
      // Streaming chunk에 rAF batching 사용
      this.scheduleStateUpdate({
        stage1StreamingContent: { ...this.stage1StreamingContent },
      });
    }
  }

  private handleStage1Response(event: SSEEvent): void {
    if (event.data) {
      // Response 전에 pending streaming 업데이트 flush
      this.flushPendingUpdates();

      const response = event.data as Stage1Response;
      this.tempStage1 = [...this.tempStage1, response];

      // Streaming content에서 제거
      delete this.stage1StreamingContent[response.model];

      this.callbacks.onStateChange({
        stage1Responses: [...this.tempStage1],
        stage1StreamingContent: { ...this.stage1StreamingContent },
      });
    }
  }

  private handleStage1Complete(): void {
    this.stage1StreamingContent = {};
    this.callbacks.onStateChange({
      stage1StreamingContent: {},
    });
  }

  private handleStage2Chunk(event: SSEEvent): void {
    // 재연결 중에는 chunk 무시
    if (this.isReconnection) return;

    if (event.model && event.delta) {
      this.stage2StreamingContent[event.model] =
        (this.stage2StreamingContent[event.model] || "") + event.delta;
      // Streaming chunk에 rAF batching 사용
      this.scheduleStateUpdate({
        stage2StreamingContent: { ...this.stage2StreamingContent },
      });
    }
  }

  private handleStage2Response(event: SSEEvent): void {
    if (event.data) {
      // Response 전에 pending streaming 업데이트 flush
      this.flushPendingUpdates();

      const review = event.data as Stage2Review;
      this.tempStage2 = [...this.tempStage2, review];

      // Streaming content에서 제거
      delete this.stage2StreamingContent[review.model];

      this.callbacks.onStateChange({
        stage2Reviews: [...this.tempStage2],
        stage2StreamingContent: { ...this.stage2StreamingContent },
      });
    }
  }

  private handleStage2Complete(event: SSEEvent): void {
    this.stage2StreamingContent = {};

    // Backend 제공값 사용, 없으면 domain 함수로 계산
    const eventData = event.data as
      | { labelToModel?: Record<string, string>; aggregateRankings?: AggregateRanking[] }
      | undefined;

    this.tempLabelToModel =
      eventData?.labelToModel || buildLabelToModel(this.tempStage1);
    this.tempAggregateRankings =
      eventData?.aggregateRankings ||
      calculateAggregateRankings(this.tempStage2, this.tempLabelToModel);

    this.callbacks.onStateChange({
      stage2StreamingContent: {},
      labelToModel: this.tempLabelToModel,
      aggregateRankings: this.tempAggregateRankings,
    });
  }

  private handleStage3ReasoningChunk(event: SSEEvent): void {
    // 재연결 중에는 chunk 무시
    if (this.isReconnection) return;

    if (event.delta) {
      this.stage3ReasoningContent += event.delta;
      // Streaming chunk에 rAF batching 사용
      this.scheduleStateUpdate({
        stage3ReasoningContent: this.stage3ReasoningContent,
      });
    }
  }

  private handleStage3Chunk(event: SSEEvent): void {
    // 재연결 중에는 chunk 무시
    if (this.isReconnection) return;

    if (event.delta) {
      this.stage3StreamingContent += event.delta;
      // Streaming chunk에 rAF batching 사용
      this.scheduleStateUpdate({
        stage3StreamingContent: this.stage3StreamingContent,
      });
    }
  }

  private handleStage3Response(event: SSEEvent): void {
    // Response 전에 pending streaming 업데이트 flush
    this.flushPendingUpdates();

    this.stage3StreamingContent = "";
    this.stage3ReasoningContent = "";

    if (event.data) {
      this.tempStage3 = event.data as Stage3Synthesis;
      this.callbacks.onStateChange({
        stage3Synthesis: this.tempStage3,
        stage3StreamingContent: "",
        stage3ReasoningContent: "",
      });
    }
  }

  private handleReconnected(event: SSEEvent): void {
    const stage = (event.stage as CurrentStage) || "idle";
    this.currentStage = stage;
    this.callbacks.onReconnected(stage, event.userMessage);
  }

  private handleComplete(): void {
    // 완료 전에 pending 업데이트 flush
    this.flushPendingUpdates();

    this.currentStage = "idle";
    this.callbacks.onStateChange({ currentStage: "idle" });

    const assistantMessage = this.buildAssistantMessage();
    if (assistantMessage) {
      this.callbacks.onComplete(assistantMessage);
    }
  }

  private handleError(event: SSEEvent): void {
    this.currentStage = "idle";
    this.callbacks.onStateChange({ currentStage: "idle" });
    this.callbacks.onError(event.error || "An error occurred");
  }
}
