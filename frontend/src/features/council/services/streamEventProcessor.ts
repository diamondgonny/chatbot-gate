/**
 * Stream Event Processor for Council feature
 * Abstracts SSE event handling logic into a reusable, testable class
 */

import type {
  SSEEvent,
  Stage1Response,
  Stage2Review,
  Stage3Synthesis,
  AggregateRanking,
  CouncilAssistantMessage,
} from "../domain";
import type { CurrentStage, StreamState } from "../domain";
import { buildLabelToModel, calculateAggregateRankings } from "../domain";

/**
 * Callbacks for stream event processing
 */
export interface StreamEventCallbacks {
  /** Called when stream state changes */
  onStateChange: (partial: Partial<StreamState>) => void;
  /** Called when user message is confirmed (stage1_start received) */
  onUserMessageConfirmed: () => void;
  /** Called when processing completes with final assistant message */
  onComplete: (assistantMessage: CouncilAssistantMessage) => void;
  /** Called when an error occurs */
  onError: (error: string) => void;
  /** Called when title generation completes with the new title */
  onTitleComplete: (title: string) => void;
  /** Called when reconnection is established */
  onReconnected: (stage: CurrentStage, userMessage?: string) => void;
}

/**
 * Options for creating a StreamEventProcessor
 */
export interface StreamEventProcessorOptions {
  /** Whether this is a reconnection (ignores chunks) */
  isReconnection?: boolean;
}

/**
 * Stream Event Processor
 *
 * Processes SSE events and maintains accumulated state.
 * Decouples event handling logic from React state management.
 */
export class StreamEventProcessor {
  private callbacks: StreamEventCallbacks;
  private isReconnection: boolean;
  private userMessageConfirmed = false;

  // Accumulated state during processing
  private tempStage1: Stage1Response[] = [];
  private tempStage2: Stage2Review[] = [];
  private tempStage3: Stage3Synthesis | null = null;
  private tempLabelToModel: Record<string, string> = {};
  private tempAggregateRankings: AggregateRanking[] = [];
  private currentStage: CurrentStage = "idle";

  // Streaming content accumulators
  private stage1StreamingContent: Record<string, string> = {};
  private stage2StreamingContent: Record<string, string> = {};
  private stage3StreamingContent = "";
  private stage3ReasoningContent = "";

  // rAF batching for streaming updates
  private pendingStateUpdate: Partial<StreamState> = {};
  private rafId: number | null = null;

  constructor(callbacks: StreamEventCallbacks, options: StreamEventProcessorOptions = {}) {
    this.callbacks = callbacks;
    this.isReconnection = options.isReconnection ?? false;
  }

  /**
   * Schedule state update with rAF batching
   * Batches multiple chunk updates into a single frame for better performance
   */
  private scheduleStateUpdate(partial: Partial<StreamState>): void {
    // Merge pending updates
    this.pendingStateUpdate = { ...this.pendingStateUpdate, ...partial };

    // Schedule rAF if not already scheduled
    if (!this.rafId) {
      this.rafId = requestAnimationFrame(() => {
        this.callbacks.onStateChange(this.pendingStateUpdate);
        this.pendingStateUpdate = {};
        this.rafId = null;
      });
    }
  }

  /**
   * Flush any pending batched updates immediately
   */
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

  /**
   * Process a single SSE event
   */
  processEvent(event: SSEEvent): void {
    switch (event.type) {
      // Heartbeat - ignore (keeps connection alive, no state change needed)
      case "heartbeat":
        break;

      // Stage starts
      case "stage1_start":
        this.handleStage1Start();
        break;
      case "stage2_start":
        this.handleStage2Start();
        break;
      case "stage3_start":
        this.handleStage3Start();
        break;

      // Stage 1 events
      case "stage1_chunk":
        this.handleStage1Chunk(event);
        break;
      case "stage1_model_complete":
        // Metadata only, content already accumulated
        break;
      case "stage1_response":
        this.handleStage1Response(event);
        break;
      case "stage1_complete":
        this.handleStage1Complete();
        break;

      // Stage 2 events
      case "stage2_chunk":
        this.handleStage2Chunk(event);
        break;
      case "stage2_model_complete":
        // Metadata only
        break;
      case "stage2_response":
        this.handleStage2Response(event);
        break;
      case "stage2_complete":
        this.handleStage2Complete(event);
        break;

      // Stage 3 events
      case "stage3_reasoning_chunk":
        this.handleStage3ReasoningChunk(event);
        break;
      case "stage3_chunk":
        this.handleStage3Chunk(event);
        break;
      case "stage3_response":
        this.handleStage3Response(event);
        break;

      // Connection events
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

  /**
   * Reset processor state for a new message
   */
  reset(): void {
    // Cancel any pending rAF
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

  /**
   * Build the final assistant message from accumulated state
   */
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

  /**
   * Get current accumulated responses (for partial results on abort)
   */
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

  // === Private handlers ===

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
    // Ignore chunks during reconnection
    if (this.isReconnection) return;

    if (event.model && event.delta) {
      this.stage1StreamingContent[event.model] =
        (this.stage1StreamingContent[event.model] || "") + event.delta;
      // Use rAF batching for streaming chunks
      this.scheduleStateUpdate({
        stage1StreamingContent: { ...this.stage1StreamingContent },
      });
    }
  }

  private handleStage1Response(event: SSEEvent): void {
    if (event.data) {
      // Flush pending streaming updates before response
      this.flushPendingUpdates();

      const response = event.data as Stage1Response;
      this.tempStage1 = [...this.tempStage1, response];

      // Remove from streaming content
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
    // Ignore chunks during reconnection
    if (this.isReconnection) return;

    if (event.model && event.delta) {
      this.stage2StreamingContent[event.model] =
        (this.stage2StreamingContent[event.model] || "") + event.delta;
      // Use rAF batching for streaming chunks
      this.scheduleStateUpdate({
        stage2StreamingContent: { ...this.stage2StreamingContent },
      });
    }
  }

  private handleStage2Response(event: SSEEvent): void {
    if (event.data) {
      // Flush pending streaming updates before response
      this.flushPendingUpdates();

      const review = event.data as Stage2Review;
      this.tempStage2 = [...this.tempStage2, review];

      // Remove from streaming content
      delete this.stage2StreamingContent[review.model];

      this.callbacks.onStateChange({
        stage2Reviews: [...this.tempStage2],
        stage2StreamingContent: { ...this.stage2StreamingContent },
      });
    }
  }

  private handleStage2Complete(event: SSEEvent): void {
    this.stage2StreamingContent = {};

    // Use backend-provided values or compute locally via domain functions
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
    // Ignore chunks during reconnection
    if (this.isReconnection) return;

    if (event.delta) {
      this.stage3ReasoningContent += event.delta;
      // Use rAF batching for streaming chunks
      this.scheduleStateUpdate({
        stage3ReasoningContent: this.stage3ReasoningContent,
      });
    }
  }

  private handleStage3Chunk(event: SSEEvent): void {
    // Ignore chunks during reconnection
    if (this.isReconnection) return;

    if (event.delta) {
      this.stage3StreamingContent += event.delta;
      // Use rAF batching for streaming chunks
      this.scheduleStateUpdate({
        stage3StreamingContent: this.stage3StreamingContent,
      });
    }
  }

  private handleStage3Response(event: SSEEvent): void {
    // Flush pending streaming updates before response
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
    // Flush any pending updates before completing
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
